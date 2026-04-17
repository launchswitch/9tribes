import type { GameState } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId, HexCoord, UnitId } from '../types.js';
import type {
  AbsorptionGoal,
  FactionPosture,
  FactionStrategy,
  HybridGoal,
  ThreatAssessment,
  UnitStrategicIntent,
} from './factionStrategy.js';
import { hexDistance, hexToKey } from '../core/grid.js';
import { getSupplyDeficit } from './economySystem.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { getAiDifficultyProfile } from './aiDifficulty.js';
import {
  computeAiPersonalitySnapshot,
  createEmptyAiPersonalitySnapshot,
} from './aiPersonality.js';
import { getExposureDetails } from './knowledgeSystem.js';
import { getTerrainPreferenceScore } from './factionIdentitySystem.js';

import { getLivingUnitsForFaction, getLivingEnemyUnits, assessThreatenedCities, detectFronts } from './strategic-ai/fronts.js';
import { determinePosture } from './strategic-ai/posture.js';
import {
  choosePrimaryEnemyFaction,
  choosePrimaryCityObjective,
  choosePrimaryFrontAnchor,
  chooseFocusTargets,
  buildRegroupAnchors,
  getFriendlyCityAnchors,
} from './strategic-ai/objectives.js';
import { assignUnitIntents } from './strategic-ai/assignments.js';
import { summarizePrimaryObjective, buildDebugReasons } from './strategic-ai/debugReasons.js';

export function computeFactionStrategy(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): FactionStrategy {
  const difficultyProfile = getAiDifficultyProfile(difficulty);
  const previousStrategy = state.factionStrategies.get(factionId);
  const faction = state.factions.get(factionId);
  if (!faction) {
    return createEmptyStrategy(state.round, factionId);
  }

  const friendlyUnits = getLivingUnitsForFaction(state, factionId);
  const enemyUnits = getLivingEnemyUnits(state, factionId, difficultyProfile);
  const threatenedCities = assessThreatenedCities(state, factionId, difficultyProfile);
  const fronts = detectFronts(state, factionId, threatenedCities, difficultyProfile);
  const personality = computeAiPersonalitySnapshot(state, factionId, registry, difficulty);
  const economy = state.economy.get(factionId);
  const supplyDeficit = economy ? getSupplyDeficit(economy) : 0;
  const exhaustion = state.warExhaustion.get(factionId)?.exhaustionPoints ?? 0;
  const postureDecision = determinePosture(
    friendlyUnits.length,
    enemyUnits.length,
    threatenedCities,
    exhaustion,
    supplyDeficit,
    fronts,
    personality,
    state.round,
    difficultyProfile,
    previousStrategy,
  );
  const posture = postureDecision.posture;
  const primaryEnemyFactionId = choosePrimaryEnemyFaction(fronts, enemyUnits);
  const primaryCityObjectiveId = choosePrimaryCityObjective(
    fronts,
    threatenedCities,
    posture,
    state,
    factionId,
    difficultyProfile,
  );
  const primaryFrontAnchor = choosePrimaryFrontAnchor(fronts, threatenedCities, posture);
  const focusTargetDecision = chooseFocusTargets(
    state,
    factionId,
    primaryCityObjectiveId,
    fronts,
    posture,
    personality,
    difficultyProfile,
  );
  const focusTargetUnitIds = focusTargetDecision.unitIds;
  const regroupAnchors = buildRegroupAnchors(state, factionId, fronts, threatenedCities);
  const retreatAnchors = getFriendlyCityAnchors(state, factionId);
  const hybridGoal = buildHybridGoal(state, factionId, registry);
  const absorptionGoal = buildAbsorptionGoal(state, factionId, enemyUnits, primaryEnemyFactionId);
  const assignmentDecision = assignUnitIntents(
    state,
    factionId,
    friendlyUnits,
    posture,
    personality,
    threatenedCities,
    primaryCityObjectiveId,
    primaryFrontAnchor,
    focusTargetDecision.candidates,
    regroupAnchors,
    retreatAnchors,
    difficultyProfile,
    previousStrategy,
  );
  const debugReasons = buildDebugReasons(
    posture,
    threatenedCities,
    fronts,
    supplyDeficit,
    exhaustion,
    hybridGoal,
    absorptionGoal,
    postureDecision.reasons,
    focusTargetDecision.reasons,
    assignmentDecision.reasons,
  );

  return {
    factionId,
    round: state.round,
    personality,
    posture,
    primaryEnemyFactionId,
    primaryObjective: summarizePrimaryObjective(posture, threatenedCities, primaryCityObjectiveId, primaryEnemyFactionId),
    primaryCityObjectiveId,
    primaryFrontAnchor,
    threatenedCities,
    fronts,
    focusTargetUnitIds,
    regroupAnchors,
    retreatAnchors,
    unitIntents: assignmentDecision.intents,
    productionPriorities: [],
    researchPriorities: [],
    hybridGoal,
    absorptionGoal,
    debugReasons,
  };
}

function createEmptyStrategy(round: number, factionId: FactionId): FactionStrategy {
  return {
    factionId,
    round,
    personality: createEmptyAiPersonalitySnapshot(factionId, round),
    posture: 'balanced',
    primaryObjective: 'hold position',
    threatenedCities: [],
    fronts: [],
    focusTargetUnitIds: [],
    regroupAnchors: [],
    retreatAnchors: [],
    unitIntents: {},
    productionPriorities: [],
    researchPriorities: [],
    hybridGoal: {
      preferredRecipeIds: [],
      pursueHybridProduction: false,
      desiredDomainIds: [],
    },
    absorptionGoal: {
      desiredDomainIds: [],
      nearExposureDomainIds: [],
      finishOffPriority: false,
    },
    debugReasons: [],
  };
}

function buildHybridGoal(state: GameState, factionId: FactionId, registry: RulesRegistry): HybridGoal {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return { preferredRecipeIds: [], pursueHybridProduction: false, desiredDomainIds: [] };
  }

  const recipes = registry.getAllHybridRecipes()
    .filter((recipe) => faction.capabilities?.unlockedRecipeIds.includes(recipe.id) && (!recipe.nativeFaction || recipe.nativeFaction === factionId))
    .map((recipe) => {
      const synergyScore = recipe.tags?.reduce(
        (sum, tag) => sum + (faction.learnedDomains.includes(tag) ? 1 : 0),
        0
      ) ?? 0;
      return { recipeId: recipe.id, score: synergyScore + recipe.componentIds.length * 0.5 };
    })
    .sort((left, right) => right.score - left.score || left.recipeId.localeCompare(right.recipeId));

  const desiredDomainIds = faction.learnedDomains.slice(1);
  return {
    preferredRecipeIds: recipes.slice(0, 3).map((recipe) => recipe.recipeId),
    pursueHybridProduction: recipes.length > 0 && (faction.learnedDomains.length >= 2),
    desiredDomainIds,
  };
}

function buildAbsorptionGoal(
  state: GameState,
  factionId: FactionId,
  _enemyUnits: unknown[],
  primaryEnemyFactionId: FactionId | undefined,
): AbsorptionGoal {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return { desiredDomainIds: [], nearExposureDomainIds: [], finishOffPriority: false };
  }

  const exposureCandidates = Object.keys(faction.exposureProgress)
    .map((domainId) => ({
      domainId,
      details: getExposureDetails(faction, domainId),
    }))
    .filter((entry) => entry.details && entry.details.progress >= 0.75)
    .sort((left, right) => (right.details?.progress ?? 0) - (left.details?.progress ?? 0));

  const weakEnemyFactionCounts = new Map<FactionId, number>();
  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (unit.factionId === factionId) continue;
    weakEnemyFactionCounts.set(unit.factionId, (weakEnemyFactionCounts.get(unit.factionId) ?? 0) + 1);
  }
  const weakEnemyTarget = Array.from(weakEnemyFactionCounts.entries())
    .sort(
      (left, right) =>
        left[1] - right[1] || String(left[0] ?? '').localeCompare(String(right[0] ?? '')),
    )[0]?.[0];

  return {
    targetFactionId: primaryEnemyFactionId ?? weakEnemyTarget,
    desiredDomainIds: exposureCandidates.map((entry) => entry.domainId),
    nearExposureDomainIds: exposureCandidates.map((entry) => entry.domainId),
    finishOffPriority: Boolean(weakEnemyTarget && weakEnemyFactionCounts.get(weakEnemyTarget)! <= 1),
  };
}

// Re-export public helpers used by other modules

export function getUnitIntent(strategy: FactionStrategy | undefined, unitId: UnitId): UnitStrategicIntent | undefined {
  return strategy?.unitIntents[unitId];
}

export function scoreStrategicTerrain(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord,
): number {
  const faction = state.factions.get(factionId);
  const terrainId = state.map?.tiles.get(hexToKey(hex))?.terrain ?? 'plains';
  return getTerrainPreferenceScore(faction, terrainId);
}

export function getNearbySupportScore(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord,
): number {
  let support = 0;
  for (const unit of state.units.values()) {
    if (unit.factionId === factionId && unit.hp > 0 && hexDistance(unit.position, hex) <= 2) {
      support += 1;
    }
  }
  return support;
}

export function isThreatenedCityHex(
  state: GameState,
  strategy: FactionStrategy | undefined,
  hex: HexCoord,
): boolean {
  if (!strategy) return false;
  return strategy.threatenedCities.some((threat) => {
    const city = state.cities.get(threat.cityId);
    return city && city.position.q === hex.q && city.position.r === hex.r;
  });
}

export function getNearestFriendlyCity(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord,
) {
  let best: import('../game/types.js').City | undefined;
  let bestDist = Infinity;
  for (const city of state.cities.values()) {
    if (city.factionId !== factionId) continue;
    const dist = hexDistance(origin, city.position);
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }
  return best;
}
