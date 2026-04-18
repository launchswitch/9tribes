import type { RulesRegistry, FactionAiBaseline, DomainAiDoctrine } from '../data/registry/types.js';
import type { GameState } from '../game/types.js';
import type { FactionId, HexCoord } from '../types.js';
import type { FactionPosture } from './factionStrategy.js';
import { hexDistance, hexToKey } from '../core/grid.js';
import { getSupplyDeficit } from './economySystem.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { getAiDifficultyProfile } from './aiDifficulty.js';
import { getVisibleEnemyUnits } from './fogSystem.js';

type ScalarKey =
  | 'aggression'
  | 'caution'
  | 'cohesion'
  | 'opportunism'
  | 'raidBias'
  | 'siegeBias'
  | 'defenseBias'
  | 'exploreBias'
  | 'captureBias'
  | 'stealthBias'
  | 'attritionBias'
  | 'mobilityBias';

type ThresholdKey = 'commitAdvantage' | 'retreatThreshold' | 'focusFireLimit' | 'squadSize';

const SCALAR_KEYS: ScalarKey[] = [
  'aggression',
  'caution',
  'cohesion',
  'opportunism',
  'raidBias',
  'siegeBias',
  'defenseBias',
  'exploreBias',
  'captureBias',
  'stealthBias',
  'attritionBias',
  'mobilityBias',
];

const THRESHOLD_KEYS: ThresholdKey[] = [
  'commitAdvantage',
  'retreatThreshold',
  'focusFireLimit',
  'squadSize',
];

const DEFAULT_BASELINE: FactionAiBaseline = {
  factionId: 'default',
  aggression: 0.5,
  caution: 0.5,
  cohesion: 0.5,
  opportunism: 0.5,
  raidBias: 0.25,
  siegeBias: 0.25,
  defenseBias: 0.25,
  exploreBias: 0.25,
  captureBias: 0.25,
  stealthBias: 0.25,
  attritionBias: 0.25,
  mobilityBias: 0.25,
  preferredTerrains: [],
  avoidedTerrains: [],
  desiredRoleRatios: { melee: 0.35, ranged: 0.25, mounted: 0.2, support: 0.05, siege: 0.05, naval: 0.1 },
  commitAdvantage: 1.15,
  retreatThreshold: 0.8,
  focusFireLimit: 2,
  squadSize: 3,
};

export interface AiPersonalitySnapshot {
  factionId: FactionId;
  round: number;
  scalars: Record<ScalarKey, number>;
  thresholds: Record<ThresholdKey, number>;
  terrainScores: Record<string, number>;
  desiredRoleRatios: Record<string, number>;
  targetWeights: Record<string, number>;
  moveWeights: Record<string, number>;
  assignmentWeights: Record<string, number>;
  productionWeights: Record<string, number>;
  researchWeights: Record<string, number>;
  activeDoctrines: string[];
  reasons: string[];
}

export interface AiDecisionContext {
  threatenedCities?: number;
  fronts?: number;
  localAdvantage?: number;
  supplyDeficit?: number;
  exhaustion?: number;
  targetDistance?: number;
  attackAdvantage?: number;
  retreatRisk?: number;
  origin?: HexCoord;
  targetHex?: HexCoord;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampScalar(value: number): number {
  return clamp(value, 0, 1);
}

function mergeDoctrineWeights(
  target: Record<string, number>,
  weights: Record<string, number> | undefined,
  factor: number,
): void {
  if (!weights) return;
  for (const [key, value] of Object.entries(weights)) {
    target[key] = (target[key] ?? 0) + value * factor;
  }
}

function buildTerrainScores(baseline: FactionAiBaseline): Record<string, number> {
  const terrainScores: Record<string, number> = {};
  for (const terrain of baseline.preferredTerrains) {
    terrainScores[terrain] = (terrainScores[terrain] ?? 0) + 1.5;
  }
  for (const terrain of baseline.avoidedTerrains) {
    terrainScores[terrain] = (terrainScores[terrain] ?? 0) - 1;
  }
  return terrainScores;
}

function applyDoctrine(
  snapshot: AiPersonalitySnapshot,
  doctrine: DomainAiDoctrine,
  factor: number,
): void {
  for (const key of SCALAR_KEYS) {
    const delta = doctrine.scalarMods?.[key] ?? 0;
    snapshot.scalars[key] = clampScalar(snapshot.scalars[key] + delta * factor);
  }

  for (const key of THRESHOLD_KEYS) {
    const delta = doctrine.thresholdMods?.[key] ?? 0;
    snapshot.thresholds[key] += delta * factor;
  }

  for (const terrain of doctrine.terrainBiasMods?.prefer ?? []) {
    snapshot.terrainScores[terrain] = (snapshot.terrainScores[terrain] ?? 0) + 1 * factor;
  }
  for (const terrain of doctrine.terrainBiasMods?.avoid ?? []) {
    snapshot.terrainScores[terrain] = (snapshot.terrainScores[terrain] ?? 0) - 1 * factor;
  }
  for (const [terrain, value] of Object.entries(doctrine.terrainBiasMods?.terrainScores ?? {})) {
    snapshot.terrainScores[terrain] = (snapshot.terrainScores[terrain] ?? 0) + value * factor;
  }

  mergeDoctrineWeights(snapshot.targetWeights, doctrine.targetRules, factor);
  mergeDoctrineWeights(snapshot.moveWeights, doctrine.moveRules, factor);
  mergeDoctrineWeights(snapshot.assignmentWeights, doctrine.assignmentRules, factor);
  mergeDoctrineWeights(snapshot.productionWeights, doctrine.productionRules, factor);
  mergeDoctrineWeights(snapshot.researchWeights, doctrine.researchRules, factor);
}

function applyStateModifiers(
  snapshot: AiPersonalitySnapshot,
  state: GameState,
  factionId: FactionId,
  difficulty?: DifficultyLevel,
): void {
  const profile = getAiDifficultyProfile(difficulty);
  const supplyDeficit = getSupplyDeficit(state.economy.get(factionId) ?? { factionId, productionPool: 0, supplyIncome: 0, supplyDemand: 0 });
  const exhaustion = state.warExhaustion.get(factionId)?.exhaustionPoints ?? 0;
  const cityIds = state.factions.get(factionId)?.cityIds ?? [];
  const threatenedCities = cityIds.filter((cityId) => {
    const city = state.cities.get(cityId);
    if (!city) return false;
    return Array.from(state.units.values()).some(
      (unit) => unit.hp > 0 && unit.factionId !== factionId && hexDistance(unit.position, city.position) <= 3,
    );
  }).length;

  if (exhaustion >= 8) {
    snapshot.scalars.aggression = clampScalar(snapshot.scalars.aggression - 0.15);
    snapshot.scalars.caution = clampScalar(snapshot.scalars.caution + 0.15);
    snapshot.thresholds.retreatThreshold = Math.min(1.25, snapshot.thresholds.retreatThreshold + 0.1);
    snapshot.reasons.push(`state: exhaustion=${exhaustion}`);
  }

  if (supplyDeficit > 0) {
    const pressure = Math.min(0.2, supplyDeficit * 0.05);
    snapshot.scalars.siegeBias = clampScalar(snapshot.scalars.siegeBias - pressure);
    snapshot.productionWeights.expensive = (snapshot.productionWeights.expensive ?? 0) - supplyDeficit;
    snapshot.productionWeights.low_supply = (snapshot.productionWeights.low_supply ?? 0) + supplyDeficit;
    snapshot.reasons.push(`state: supply_deficit=${supplyDeficit}`);
  }

  if (threatenedCities > 0) {
    snapshot.scalars.defenseBias = clampScalar(snapshot.scalars.defenseBias + Math.min(0.25, threatenedCities * 0.1));
    snapshot.assignmentWeights.defender = (snapshot.assignmentWeights.defender ?? 0) + threatenedCities;
    snapshot.reasons.push(`state: threatened_cities=${threatenedCities}`);
  }

  const visibleEnemySkirmishers = getVisibleEnemyUnits(state, factionId).filter(({ unit }) => {
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype) return false;
    return prototype.derivedStats.role === 'mounted'
      || prototype.derivedStats.range > 1
      || prototype.derivedStats.moves >= 3;
  }).length;
  if (visibleEnemySkirmishers > 0 && profile.personality.antiSkirmishResponseWeight > 0) {
    const responsePressure = Math.min(
      3,
      visibleEnemySkirmishers * profile.personality.antiSkirmishResponseWeight * 0.25,
    );
    snapshot.assignmentWeights.defender = (snapshot.assignmentWeights.defender ?? 0) + responsePressure;
    snapshot.assignmentWeights.reserve = (snapshot.assignmentWeights.reserve ?? 0) + responsePressure * 0.8;
    snapshot.productionWeights.ranged = (snapshot.productionWeights.ranged ?? 0) + responsePressure * 0.7;
    snapshot.productionWeights.melee = (snapshot.productionWeights.melee ?? 0) + responsePressure * 0.4;
    snapshot.reasons.push(`state: skirmisher_pressure=${visibleEnemySkirmishers}`);
  }

  const friendlyUnits = Array.from(state.units.values()).filter((unit) => unit.hp > 0 && unit.factionId === factionId).length;
  const visibleEnemies = Array.from(state.units.values()).filter((unit) => unit.hp > 0 && unit.factionId !== factionId).length;
  if (friendlyUnits >= visibleEnemies + 2 && visibleEnemies > 0) {
    snapshot.scalars.aggression = clampScalar(snapshot.scalars.aggression + 0.1);
    snapshot.scalars.siegeBias = clampScalar(snapshot.scalars.siegeBias + 0.1);
    snapshot.reasons.push('state: local_superiority');
  } else if (friendlyUnits <= Math.max(1, visibleEnemies - 1)) {
    snapshot.scalars.cohesion = clampScalar(snapshot.scalars.cohesion + 0.1);
    snapshot.assignmentWeights.reserve = (snapshot.assignmentWeights.reserve ?? 0) + 1;
    snapshot.reasons.push('state: strategic_pressure');
  }

  snapshot.thresholds.commitAdvantage = clamp(snapshot.thresholds.commitAdvantage, 0.85, 1.75);
  snapshot.thresholds.retreatThreshold = clamp(snapshot.thresholds.retreatThreshold, 0.4, 1.25);
  snapshot.thresholds.focusFireLimit = Math.round(clamp(snapshot.thresholds.focusFireLimit, 1, 5));
  snapshot.thresholds.squadSize = Math.round(clamp(snapshot.thresholds.squadSize, 1, 6));
}

function createBaseSnapshot(
  state: GameState,
  factionId: FactionId,
  baseline: FactionAiBaseline,
): AiPersonalitySnapshot {
  return {
    factionId,
    round: state.round,
    scalars: {
      aggression: baseline.aggression,
      caution: baseline.caution,
      cohesion: baseline.cohesion,
      opportunism: baseline.opportunism,
      raidBias: baseline.raidBias,
      siegeBias: baseline.siegeBias,
      defenseBias: baseline.defenseBias,
      exploreBias: baseline.exploreBias,
      captureBias: baseline.captureBias,
      stealthBias: baseline.stealthBias,
      attritionBias: baseline.attritionBias,
      mobilityBias: baseline.mobilityBias,
    },
    thresholds: {
      commitAdvantage: baseline.commitAdvantage,
      retreatThreshold: baseline.retreatThreshold,
      focusFireLimit: baseline.focusFireLimit,
      squadSize: baseline.squadSize,
    },
    terrainScores: buildTerrainScores(baseline),
    desiredRoleRatios: { ...DEFAULT_BASELINE.desiredRoleRatios, ...baseline.desiredRoleRatios },
    targetWeights: {
      city: baseline.siegeBias * 2,
      isolated: baseline.opportunism * 2,
      capturable: baseline.captureBias * 2,
      wounded: baseline.attritionBias * 1.5,
      coastalCity: baseline.raidBias * 2,
    },
    moveWeights: {
      flanking: baseline.mobilityBias * 2,
      rearAttack: baseline.opportunism * 2,
      ambush: baseline.stealthBias * 2,
      retreatPath: baseline.caution * 2,
      avoidExposure: baseline.caution * 2,
      captureOpportunity: baseline.captureBias * 2,
      corridorFit: baseline.mobilityBias * 1.5,
    },
    assignmentWeights: {
      main_army: baseline.cohesion * 2,
      raider: baseline.raidBias * 2,
      defender: baseline.defenseBias * 2,
      siege_force: baseline.siegeBias * 2,
      reserve: baseline.caution * 1.5,
      recovery: baseline.attritionBias * 1.5,
    },
    productionWeights: {
      melee: (baseline.desiredRoleRatios.melee ?? 0) * 4,
      ranged: (baseline.desiredRoleRatios.ranged ?? 0) * 4,
      mounted: (baseline.desiredRoleRatios.mounted ?? 0) * 4,
      support: (baseline.desiredRoleRatios.support ?? 0) * 4,
      siege: (baseline.desiredRoleRatios.siege ?? 0) * 4,
      naval: (baseline.desiredRoleRatios.naval ?? 0) * 4,
    },
    researchWeights: {
      aggression: baseline.aggression,
      defense: baseline.defenseBias,
      mobility: baseline.mobilityBias,
      siege: baseline.siegeBias,
      stealth: baseline.stealthBias,
      sustain: baseline.attritionBias,
    },
    activeDoctrines: [],
    reasons: [`baseline=${baseline.factionId}`],
  };
}

function applyDifficultyBaselineOverrides(
  baseline: FactionAiBaseline,
  difficulty?: DifficultyLevel,
): FactionAiBaseline {
  const profile = getAiDifficultyProfile(difficulty);
  if (!profile.adaptiveAi) {
    return baseline;
  }

  return {
    ...baseline,
    aggression: Math.max(baseline.aggression, profile.personality.aggressionFloor),
    siegeBias: Math.max(baseline.siegeBias, profile.personality.siegeBiasFloor),
    raidBias: Math.max(baseline.raidBias, profile.personality.raidBiasFloor),
    focusFireLimit: baseline.focusFireLimit + profile.personality.focusFireLimitBonus,
    squadSize: baseline.squadSize + profile.personality.squadSizeBonus,
    commitAdvantage: baseline.commitAdvantage + profile.personality.commitAdvantageOffset,
    retreatThreshold: baseline.retreatThreshold + profile.personality.retreatThresholdOffset,
  };
}

export function createEmptyAiPersonalitySnapshot(
  factionId: FactionId,
  round = 0,
): AiPersonalitySnapshot {
  return {
    ...createBaseSnapshot({ round } as GameState, factionId, DEFAULT_BASELINE),
    round,
    reasons: ['baseline=default'],
  };
}

export function computeAiPersonalitySnapshot(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): AiPersonalitySnapshot {
  const profile = getAiDifficultyProfile(difficulty);
  const faction = state.factions.get(factionId);
  const baseline = applyDifficultyBaselineOverrides(
    registry.getFactionAiBaseline(factionId) ?? DEFAULT_BASELINE,
    difficulty,
  );
  const snapshot = createBaseSnapshot(state, factionId, baseline);
  snapshot.reasons.push(`difficulty=${profile.difficulty}`);
  if (!faction) {
    snapshot.reasons.push('fallback: missing faction');
    return snapshot;
  }

  const activeDoctrines = Array.from(new Set([faction.nativeDomain, ...faction.learnedDomains].filter(Boolean)));
  snapshot.activeDoctrines = activeDoctrines;

  for (const doctrineId of activeDoctrines) {
    const doctrine = registry.getDomainAiDoctrine(doctrineId);
    if (!doctrine) continue;
    const factor = doctrineId === faction.nativeDomain ? 1 : 0.6;
    applyDoctrine(snapshot, doctrine, factor);
    snapshot.reasons.push(`${doctrineId}@${factor}`);
  }

  applyStateModifiers(snapshot, state, factionId, difficulty);
  return snapshot;
}

export function scorePosture(
  snapshot: AiPersonalitySnapshot,
  context: AiDecisionContext,
  posture: FactionPosture,
): number {
  const threatenedCities = context.threatenedCities ?? 0;
  const fronts = context.fronts ?? 0;
  const localAdvantage = context.localAdvantage ?? 0;
  const supplyDeficit = context.supplyDeficit ?? 0;

  switch (posture) {
    case 'offensive':
      return snapshot.scalars.aggression * 4 + snapshot.scalars.mobilityBias * 2 + localAdvantage - supplyDeficit;
    case 'defensive':
      return snapshot.scalars.defenseBias * 4 + threatenedCities * 2 + snapshot.scalars.caution * 2;
    case 'recovery':
      return snapshot.scalars.caution * 3 + snapshot.scalars.attritionBias * 2 + supplyDeficit * 1.5;
    case 'siege':
      return snapshot.scalars.siegeBias * 4 + localAdvantage * 1.5 - threatenedCities;
    case 'exploration':
      return snapshot.scalars.exploreBias * 4 + snapshot.scalars.mobilityBias * 2 - fronts;
    case 'last_stand':
      return snapshot.scalars.defenseBias * 5 + snapshot.scalars.caution * 3 + threatenedCities * 3;
    case 'balanced':
    default:
      return snapshot.scalars.cohesion * 3 + snapshot.scalars.opportunism * 1.5;
  }
}

export function scoreFocusTarget(
  snapshot: AiPersonalitySnapshot,
  context: AiDecisionContext,
  target: { isolated?: boolean; capturable?: boolean; wounded?: boolean; isCity?: boolean; terrainId?: string },
): number {
  let score = 0;
  if (target.isolated) score += snapshot.targetWeights.isolated ?? 0;
  if (target.capturable) score += snapshot.targetWeights.capturable ?? 0;
  if (target.wounded) score += snapshot.targetWeights.wounded ?? 0;
  if (target.isCity) score += snapshot.targetWeights.city ?? 0;
  if (target.terrainId) score += snapshot.terrainScores[target.terrainId] ?? 0;
  score -= (context.targetDistance ?? 0) * 0.1;
  return score;
}

export function scoreProductionCandidate(
  snapshot: AiPersonalitySnapshot,
  context: AiDecisionContext,
  prototype: { role?: string; tags?: string[]; supplyCost?: number; productionCost?: number },
): number {
  const roleScore = prototype.role ? (snapshot.productionWeights[prototype.role] ?? 0) : 0;
  const navalScore = prototype.tags?.includes('naval') ? (snapshot.productionWeights.naval ?? 0) : 0;
  const siegeScore = prototype.tags?.includes('siege') ? (snapshot.productionWeights.siege ?? 0) : 0;
  const supplyPenalty = (prototype.supplyCost ?? 0) * Math.max(0, context.supplyDeficit ?? 0);
  const productionPenalty = (prototype.productionCost ?? 0) * 0.1;
  return roleScore + navalScore + siegeScore - supplyPenalty - productionPenalty;
}

export function scoreResearchCandidate(
  snapshot: AiPersonalitySnapshot,
  _context: AiDecisionContext,
  node: { codifies?: string[]; domainId?: string },
): number {
  let score = 0;
  if (node.domainId) score += snapshot.researchWeights[node.domainId] ?? 0;
  for (const codified of node.codifies ?? []) {
    score += snapshot.researchWeights[codified] ?? 0;
  }
  return score;
}

export function shouldCommitAttack(snapshot: AiPersonalitySnapshot, context: AiDecisionContext): boolean {
  return (context.attackAdvantage ?? 0) >= snapshot.thresholds.commitAdvantage;
}

export function shouldRetreat(snapshot: AiPersonalitySnapshot, context: AiDecisionContext): boolean {
  return (context.retreatRisk ?? 0) >= snapshot.thresholds.retreatThreshold;
}

export function getTerrainFitScore(snapshot: AiPersonalitySnapshot, state: GameState, hex: HexCoord): number {
  const terrainId = state.map?.tiles.get(hexToKey(hex))?.terrain;
  if (!terrainId) return 0;
  return snapshot.terrainScores[terrainId] ?? 0;
}
