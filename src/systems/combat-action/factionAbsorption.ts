import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { applyContactTransfer } from '../capabilitySystem.js';
import { updateCombatRecordOnElimination } from '../historySystem.js';
import { autoCompleteResearchForDomains } from '../sacrificeSystem.js';
import { getDomainProgression } from '../domainProgression.js';
import { MAX_LEARNED_DOMAINS } from '../knowledgeSystem.js';
import { getSynergyEngine } from '../synergyRuntime.js';
import { getFactionCityIds, syncAllFactionSettlementIds } from '../factionOwnershipSystem.js';

export function maybeAbsorbFaction(
  state: GameState,
  victorFactionId: FactionId,
  defeatedFactionId: FactionId,
  registry: RulesRegistry,
): { state: GameState; absorbedDomains: string[] } {
  const stillAlive = Array.from(state.units.values()).some(
    (unit) => unit.factionId === defeatedFactionId && unit.hp > 0,
  );
  if (stillAlive) {
    return { state, absorbedDomains: [] };
  }

  const defeatedFaction = state.factions.get(defeatedFactionId);
  const victorFaction = state.factions.get(victorFactionId);
  if (!defeatedFaction || !victorFaction) {
    return { state, absorbedDomains: [] };
  }

  let current = applyContactTransfer(state, victorFactionId, defeatedFactionId, 'absorption');
  current = updateCombatRecordOnElimination(current, victorFactionId);

  // Conqueror learns the defeated tribe's native domain and any learned domains
  // Respect the MAX_LEARNED_DOMAINS cap (learnedDomains excludes native, so max slots = MAX - 1)
  const remainingSlots = MAX_LEARNED_DOMAINS - 1 - victorFaction.learnedDomains.length;
  const domainsToAbsorb = [
    defeatedFaction.nativeDomain,
    ...defeatedFaction.learnedDomains,
  ];
  const newlyLearned = domainsToAbsorb.filter(
    (d) =>
      d !== victorFaction.nativeDomain &&
      !victorFaction.learnedDomains.includes(d) &&
      domainsToAbsorb.indexOf(d) === domainsToAbsorb.lastIndexOf(d),
  ).slice(0, Math.max(0, remainingSlots));

  let absorbedDomains: string[] = [];
  if (newlyLearned.length > 0) {
    absorbedDomains = newlyLearned;
    const newLearnedDomains = [...victorFaction.learnedDomains, ...newlyLearned];

    // Auto-complete T1 research nodes for the newly learned domains
    current = autoCompleteResearchForDomains(current, victorFactionId, newlyLearned, registry);

    // Re-evaluate domain progression and triple synergy
    const updatedFaction = current.factions.get(victorFactionId);
    if (updatedFaction) {
      const refreshedResearch = current.research.get(victorFactionId);
      const progression = getDomainProgression(
        { nativeDomain: updatedFaction.nativeDomain, learnedDomains: newLearnedDomains },
        refreshedResearch,
      );
      const tripleStack = getSynergyEngine().resolveFactionTriple(
        progression.pairEligibleDomains,
        progression.emergentEligibleDomains,
      );
      const newFactions = new Map(current.factions);
      newFactions.set(victorFactionId, {
        ...updatedFaction,
        learnedDomains: newLearnedDomains,
        activeTripleStack: tripleStack ?? undefined,
      });
      current = { ...current, factions: newFactions };

      // Set recentCodifiedDomainIds so AI strategy can react
      const updatedResearch = current.research.get(victorFactionId);
      if (updatedResearch) {
        const researchMap = new Map(current.research);
        researchMap.set(victorFactionId, {
          ...updatedResearch,
          recentCodifiedDomainIds: newlyLearned,
          recentCodifiedRound: current.round,
        });
        current = { ...current, research: researchMap };
      }
    }
  }

  const newCities = new Map(current.cities);
  for (const cityId of getFactionCityIds(current, defeatedFactionId)) {
    const city = current.cities.get(cityId);
    if (city) {
      newCities.set(cityId, { ...city, factionId: victorFactionId, turnsSinceCapture: 0 });
    }
  }

  const newVillages = new Map(current.villages);
  for (const village of current.villages.values()) {
    if (village.factionId === defeatedFactionId) {
      newVillages.set(village.id, { ...village, factionId: victorFactionId });
    }
  }

  const newFactions = new Map(current.factions);
  newFactions.set(defeatedFactionId, {
    ...defeatedFaction,
    cityIds: [],
    villageIds: [],
  });

  return {
    state: syncAllFactionSettlementIds({
      ...current,
      cities: newCities,
      villages: newVillages,
      factions: newFactions,
    }),
    absorbedDomains,
  };
}
