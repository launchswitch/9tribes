// Sacrifice System - Units can sacrifice learned abilities at the home city
// Part of the Learn by Killing + Sacrifice to Codify mechanic

import type { GameState } from '../game/types.js';
import type { Unit } from '../features/units/types.js';
import type { Faction, FactionId } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { SimulationTrace } from './warEcologySimulation.js';
import type { UnitId, ResearchNodeId } from '../types.js';
import { hexDistance } from '../core/grid.js';
import { SynergyEngine } from './synergyEngine.js';
import { getDomainProgression } from './domainProgression.js';
import pairSynergiesData from '../content/base/pair-synergies.json' assert { type: 'json' };
import emergentRulesData from '../content/base/emergent-rules.json' assert { type: 'json' };
import abilityDomainsData from '../content/base/ability-domains.json' assert { type: 'json' };
import type { PairSynergyConfig, EmergentRuleConfig, DomainConfig } from './synergyEngine.js';

let sacrificeSynergyEngine: SynergyEngine | null = null;

function getSacrificeSynergyEngine(): SynergyEngine {
  if (!sacrificeSynergyEngine) {
    sacrificeSynergyEngine = new SynergyEngine(
      pairSynergiesData.pairSynergies as PairSynergyConfig[],
      emergentRulesData.rules as EmergentRuleConfig[],
      Object.values(abilityDomainsData.domains) as DomainConfig[],
    );
  }
  return sacrificeSynergyEngine;
}

/**
 * Check if a unit can be sacrificed at the home city.
 * 
 * Conditions:
 * - Unit has at least one learned ability
 * - Unit is standing on the faction's home city hex
 * - Home city exists and belongs to this faction
 * - Home city is not besieged
 */
export function canSacrifice(unit: Unit, faction: Faction, state: GameState): boolean {
  // Unit must have learned abilities to sacrifice
  if ((unit.learnedAbilities?.length ?? 0) === 0) {
    return false;
  }

  // Get the home city
  const homeCity = faction.homeCityId ? state.cities.get(faction.homeCityId) : undefined;
  if (!homeCity) {
    return false;
  }

  // Home city must belong to this faction
  if (homeCity.factionId !== faction.id) {
    return false;
  }

  // Unit must be within hex distance 1 of home city
  if (hexDistance(unit.position, homeCity.position) > 1) {
    return false;
  }

  // Home city must not be besieged
  if (homeCity.besieged) {
    return false;
  }

  return true;
}

/**
 * Perform the sacrifice: remove the unit and transfer learned abilities to the faction.
 * 
 * Effects:
 * 1. Remove unit from game (units map and faction.unitIds)
 * 2. Add all learned domains to faction.learnedDomains (if not already present)
 * 3. Auto-complete the corresponding research nodes for each domain
 * 4. Trigger synergy engine re-evaluation
 * 5. Log the sacrifice event
 */
export function performSacrifice(
  unitId: UnitId,
  factionId: FactionId,
  state: GameState,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const unit = state.units.get(unitId);
  const faction = state.factions.get(factionId);
  
  if (!unit || !faction) {
    log(trace, `Sacrifice failed: unit or faction not found`);
    return state;
  }

  if (!canSacrifice(unit, faction, state)) {
    log(trace, `Sacrifice failed: conditions not met for ${getUnitName(unit, state)}`);
    return state;
  }

  const learnedAbilities = unit.learnedAbilities;
  const learnedDomains = learnedAbilities.map(a => a.domainId);
  const newlyUnlockedDomains = learnedDomains.filter((domainId, index) =>
    !faction.learnedDomains.includes(domainId) && learnedDomains.indexOf(domainId) === index
  );
  
  log(trace, `${getUnitName(unit, state)} SACRIFICED at ${faction.name} capital!`);
  log(trace, `  Transferred domains: ${learnedDomains.join(', ')}`);

  // Step 1: Keep unit but strip learned abilities (non-destructive sacrifice)
  const units = new Map(state.units);
  units.set(unitId, {
    ...unit,
    learnedAbilities: [],
  });
  let current: GameState = { ...state, units };

  // Step 2: Add learned domains to faction (if not already present)
  const newLearnedDomains = [...faction.learnedDomains];
  for (const domainId of learnedDomains) {
    if (!newLearnedDomains.includes(domainId)) {
      newLearnedDomains.push(domainId);
    }
  }

  // Step 3: Auto-complete research nodes for each learned domain
  current = autoCompleteResearchForDomains(current, factionId, learnedDomains, registry, trace);

  // Step 4: Update faction with new learned domains and re-evaluate triple synergy immediately
  const updatedFaction = current.factions.get(factionId);
  if (!updatedFaction) {
    return current;
  }

  const refreshedResearch = current.research.get(factionId);
  const progression = getDomainProgression(
    { nativeDomain: updatedFaction.nativeDomain, learnedDomains: newLearnedDomains },
    refreshedResearch,
  );
  const tripleStack = getSacrificeSynergyEngine().resolveFactionTriple(
    progression.pairEligibleDomains,
    progression.emergentEligibleDomains,
  );
  const factions = new Map(current.factions);
  factions.set(factionId, {
    ...updatedFaction,
    learnedDomains: newLearnedDomains,
    activeTripleStack: tripleStack ?? undefined,
  });
  current = { ...current, factions };

  if (newlyUnlockedDomains.length > 0) {
    const currentResearch = current.research.get(factionId);
    if (currentResearch) {
      const researchMap = new Map(current.research);
      researchMap.set(factionId, {
        ...currentResearch,
        recentCodifiedDomainIds: newlyUnlockedDomains,
        recentCodifiedRound: state.round,
      });
      current = { ...current, research: researchMap };
    }
  }

  // Log to trace
  if (trace) {
    trace.lines.push(`[SACRIFICE] ${getUnitName(unit, state)} sacrificed at ${faction.name} capital`);
    trace.lines.push(`  Learned abilities lost: ${learnedDomains.join(', ')}`);
    trace.lines.push(`  Faction now knows domains: ${newLearnedDomains.join(', ')}`);
    if (newlyUnlockedDomains.length > 0) {
      trace.lines.push(`  Recent codified domains: ${newlyUnlockedDomains.join(', ')}`);
    }
    if (tripleStack) {
      trace.lines.push(`  Triple synergy activated: ${tripleStack.name}`);
    }
  }

  return current;
}

/**
 * Remove a unit from the game state.
 */
function removeUnit(state: GameState, unitId: UnitId, factionId: FactionId): GameState {
  // Remove from units map
  const units = new Map(state.units);
  units.delete(unitId);

  // Remove from faction's unitIds
  const faction = state.factions.get(factionId);
  if (!faction) {
    return { ...state, units };
  }

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    unitIds: faction.unitIds.filter(id => id !== unitId),
  });

  return { ...state, units, factions };
}

/**
 * Auto-complete research nodes for the given domains.
 * For each domain, finds the T1 research node that codifies it and marks it complete.
 * Only T1 nodes can be auto-completed via sacrifice — T2/T3 require research.
 */
export function autoCompleteResearchForDomains(
  state: GameState,
  factionId: FactionId,
  domainIds: string[],
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const research = state.research.get(factionId);
  if (!research) {
    return state;
  }

  const currentResearch = research;
  const completedNodesSet = new Set(currentResearch.completedNodes);

  for (const domainId of domainIds) {
    // Find research nodes that codify this domain (only T1 nodes have codifies)
    const allDomains = registry.getAllResearchDomains();
    for (const domain of allDomains) {
      for (const [nodeId, node] of Object.entries(domain.nodes)) {
        // Only auto-complete Tier 1 nodes (foundation tier)
        if ((node.tier ?? 1) !== 1) continue;
        
        if (node.codifies?.includes(domainId)) {
          const researchNodeId = nodeId as ResearchNodeId;
          // If this node's prerequisites are met, complete it
          const prerequisitesMet = (node.prerequisites ?? []).every(
            (prereqId: string) => completedNodesSet.has(prereqId as ResearchNodeId)
          );
          
          if (prerequisitesMet && !completedNodesSet.has(researchNodeId)) {
            completedNodesSet.add(researchNodeId);
            log(trace, `  Codified ${node.name} (codifies ${domainId})`);
          }
        }
      }
    }
  }

  // Update research state
  const completedNodes = Array.from(completedNodesSet) as ResearchNodeId[];
  const researchMap = new Map(state.research);
  researchMap.set(factionId, {
    ...currentResearch,
    completedNodes,
    // Clear active node if it was completed
    activeNodeId: completedNodes.includes(currentResearch.activeNodeId as ResearchNodeId) ? null : currentResearch.activeNodeId,
  });

  return { ...state, research: researchMap };
}

/**
 * Get a human-readable name for a unit.
 */
function getUnitName(unit: Unit, state: GameState): string {
  const prototype = state.prototypes.get(unit.prototypeId);
  const faction = state.factions.get(unit.factionId);
  return `${faction?.name ?? 'Unknown'} ${prototype?.name ?? 'unit'}`;
}

/**
 * Log a message to the trace if trace is provided.
 */
function log(trace: SimulationTrace | undefined, message: string): void {
  if (trace) {
    trace.lines.push(message);
  }
}
