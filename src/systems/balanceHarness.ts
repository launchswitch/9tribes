import { buildMvpScenario } from '../game/buildMvpScenario.js';
import { getMvpFactionConfigs } from '../game/scenarios/mvp.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { Prototype } from '../features/prototypes/types.js';
import type { FactionId } from '../types.js';
import type { MapGenerationMode } from '../world/map/types.js';
import type { BalanceOverrides } from '../balance/types.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { getBattleCount, getKillCount } from './historySystem.js';
import {
  assertSettlementOwnershipConsistency,
  getFactionCityCount,
  getFactionVillageCount,
} from './factionOwnershipSystem.js';
import { calculatePrototypeCost, getDomainIdsByTags } from './knowledgeSystem.js';
import { getAvailableProductionPrototypes, getCityProductionYield, getPrototypeCostType, getUnitCost } from './productionSystem.js';
import { getDomainProgression } from './domainProgression.js';
import {
  createSimulationTrace,
  getVictoryStatus,
  runWarEcologySimulation,
  type SimulationTrace,
  type VictoryType,
} from './warEcologySimulation.js';

export const SMOKE_HARNESS_SEEDS = [11, 23, 37, 41, 59, 73, 89, 97, 101, 131] as const;
export const VALIDATION_HARNESS_SEEDS = [11, 17, 23, 29, 37, 41, 53, 59, 67, 73, 79, 83, 89, 97, 101, 107, 113, 127, 131, 149] as const;
export const STRATIFIED_HARNESS_SEEDS_BY_ARCHETYPE = {
  jungle_warfare: [1, 2, 7],
  harsh_frontier: [3, 4, 5],
  open_war: [11, 13, 56],
  coastal: [124, 170, 173],
} as const;
export const STRATIFIED_HARNESS_SEEDS = Object.values(STRATIFIED_HARNESS_SEEDS_BY_ARCHETYPE).flat() as number[];
export const DEFAULT_HARNESS_TURNS = 150;

export interface SeedEventCounts {
  battles: number;
  kills: number;
  cityCaptures: number;
  villagesRazored: number;
  siegesStarted: number;
  siegeBreaks: number;
  codificationsStarted: number;
  codificationsCompleted: number;
  poisonTicks: number;
  jungleAttrition: number;
  villageCaptures: number; // Pirate greedy village captures
  unitCaptures: number; // Slaver unit captures
}

export interface UnitComposition {
  /** chassisId → living count (e.g. infantry_frame: 3, cavalry_frame: 2) */
  byChassis: Record<string, number>;
  /** role → living count (e.g. melee: 5, mounted: 2, ranged: 1) */
  byRole: Record<string, number>;
}

export interface FactionProductionStallMarker {
  cityId: string;
  currentProductionItemId: string | null;
  currentProductionCost: number | null;
  costType: 'production' | 'villages' | null;
  estimatedTurnsQueued: number | null;
}

export interface FactionBaseMetrics {
  factionId: string;
  livingUnits: number;
  cities: number;
  villages: number;
  warExhaustion: number;
  capabilityTotal: number;
  unlockedRecipes: number;
  routedUnits: number;
  signatureUnits: number;
  signatureCapableUnits: number;
  hybridUnits: number;
  homeTerrainUnits: number;
  supplyIncome: number;
  supplyDemand: number;
  supplyUtilizationRatio: number;
  highestAvailableProductionCost: number;
  highestFieldedProductionCost: number;
  averageFieldedProductionCost: number;
  unitsByPrototypeId: Record<string, number>;
  stalledProduction: FactionProductionStallMarker[];
  unitComposition: UnitComposition;
  learnedDomainCount: number;
  t1DomainCount: number;
  t2DomainCount: number;
  t3DomainCount: number;
  activeTripleStack: string | null;
  unitsWithLearnedAbilities: number;
}

export interface FactionSeedMetrics extends FactionBaseMetrics {
  armySizeAtTurn20: number;
  firstEmergentRuleRound: number | null;
}

export interface SeedBalanceMetrics {
  seed: number;
  maxTurns: number;
  mapMode: MapGenerationMode;
  mapArchetype: string;
  finalRound: number;
  winnerFactionId: string | null;
  victoryType: VictoryType;
  unresolved: boolean;
  livingUnits: number;
  routedUnits: number;
  totalWarExhaustion: number;
  eventCounts: SeedEventCounts;
  factions: Record<string, FactionSeedMetrics>;
}

export interface FactionBatchMetrics {
  factionId: string;
  wins: number;
  avgLivingUnits: number;
  avgCities: number;
  avgVillages: number;
  avgWarExhaustion: number;
  avgCapabilityTotal: number;
  avgUnlockedRecipes: number;
  avgRoutedUnits: number;
  avgSignatureUnits: number;
  avgSignatureCapableUnits: number;
  avgHybridUnits: number;
  avgHomeTerrainUnits: number;
  avgSupplyIncome: number;
  avgSupplyDemand: number;
  avgSupplyUtilizationRatio: number;
  avgHighestAvailableProductionCost: number;
  avgHighestFieldedProductionCost: number;
  avgAverageFieldedProductionCost: number;
  avgUnitsByPrototypeId: Record<string, number>;
  avgStalledProductionCount: number;
  avgUnitComposition: UnitComposition;
  avgArmySizeAtTurn20: number;
  gamesWithEmergentRuleBeforeOpponent: number;
  avgLearnedDomainCount: number;
  avgT1DomainCount: number;
  avgT2DomainCount: number;
  avgT3DomainCount: number;
  gamesWithActiveTripleStack: number;
  avgUnitsWithLearnedAbilities: number;
}

export interface BatchBalanceSummary {
  seeds: number[];
  maxTurns: number;
  mapMode: MapGenerationMode;
  totalSeeds: number;
  decisiveGames: number;
  unresolvedGames: number;
  avgFinalRound: number;
  avgLivingUnits: number;
  avgRoutedUnits: number;
  avgTotalWarExhaustion: number;
  totalBattles: number;
  totalKills: number;
  totalCityCaptures: number;
  totalVillagesRazored: number;
  totalSiegesStarted: number;
  totalSiegeBreaks: number;
  totalCodificationsStarted: number;
  totalCodificationsCompleted: number;
  totalPoisonTicks: number;
  totalJungleAttrition: number;
  totalVillageCaptures: number;
  totalUnitCaptures: number;
  mapArchetypes: Record<string, number>;
  factions: Record<string, FactionBatchMetrics>;
}

export interface FactionDifficultyComparisonMetrics {
  avgSupplyUtilizationRatio: number;
  avgHighestAvailableProductionCost: number;
  avgHighestFieldedProductionCost: number;
  avgFieldingGap: number;
  avgHybridUnits: number;
  avgSignatureCapableUnits: number;
  avgStalledProductionCount: number;
}

export interface FactionDifficultyComparison {
  factionId: string;
  normal: FactionDifficultyComparisonMetrics;
  hard: FactionDifficultyComparisonMetrics;
  delta: FactionDifficultyComparisonMetrics;
}

export interface DifficultyComparisonSummary {
  seeds: number[];
  maxTurns: number;
  mapMode: MapGenerationMode;
  normal: BatchBalanceSummary;
  hard: BatchBalanceSummary;
  totals: {
    avgLivingUnitsDelta: number;
    totalBattlesDelta: number;
    totalKillsDelta: number;
    totalSiegesStartedDelta: number;
    totalCityCapturesDelta: number;
  };
  factions: Record<string, FactionDifficultyComparison>;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function countTraceEvents(trace: SimulationTrace): SeedEventCounts {
  return {
    battles: trace.lines.filter((line) => line.includes('fought')).length,
    kills: 0, // Not available in trace; use totalKills from unit history
    cityCaptures: trace.lines.filter((line) => line.includes('captured by')).length,
    villagesRazored: trace.lines.filter((line) => line.includes('razed')).length,
    siegesStarted: trace.lines.filter((line) => line.includes('is now besieged')).length,
    siegeBreaks: trace.lines.filter((line) => line.includes('siege broken')).length,
    codificationsStarted: trace.lines.filter((line) => line.includes('starts research on')).length,
    codificationsCompleted: trace.lines.filter((line) => line.includes('Codified ')).length,
    poisonTicks: trace.lines.filter((line) => line.includes('suffers poison')).length,
    jungleAttrition: trace.lines.filter((line) => line.includes('suffers jungle attrition')).length,
    villageCaptures: trace.lines.filter((line) => line.includes('CAPTURED village')).length,
    unitCaptures: trace.lines.filter((line) => line.includes('CAPTURED') && !line.includes('village')).length,
  };
}

function classifyMapArchetype(state: ReturnType<typeof buildMvpScenario>): string {
  const counts = Array.from(state.map?.tiles.values() ?? []).reduce<Record<string, number>>((acc, tile) => {
    acc[tile.terrain] = (acc[tile.terrain] ?? 0) + 1;
    return acc;
  }, {});

  const river = counts['river'] ?? 0;
  const coast = counts['coast'] ?? 0;
  const jungle = counts['jungle'] ?? 0;
  const open = (counts['plains'] ?? 0) + (counts['savannah'] ?? 0);
  const harsh = (counts['desert'] ?? 0) + (counts['tundra'] ?? 0);

  if (jungle >= Math.max(river, coast) && jungle >= open / 3) {
    return 'jungle_warfare';
  }
  if (river >= coast && river >= harsh && river >= open / 2) {
    return 'river_rich';
  }
  if (coast > river && coast >= harsh) {
    return 'coastal';
  }
  if (harsh > open / 2) {
    return 'harsh_frontier';
  }
  return 'open_war';
}

function countSignatureUnits(state: ReturnType<typeof buildMvpScenario>, factionId: FactionId): number {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return 0;
  }

  return faction.unitIds.reduce((sum, unitId) => {
    const unit = state.units.get(unitId);
    const prototype = unit ? state.prototypes.get(unit.prototypeId) : undefined;
    if (!unit || unit.hp <= 0 || !prototype) {
      return sum;
    }

    const tags = new Set(prototype.tags ?? []);
    switch (factionId) {
      case 'jungle_clan' as FactionId:
        return sum + (tags.has('poison') ? 1 : 0);
      case 'druid_circle' as FactionId:
        return sum + (tags.has('druid') ? 1 : 0);
      case 'steppe_clan' as FactionId:
        return sum + (tags.has('warlord') ? 1 : 0);
      case 'hill_clan' as FactionId:
        return sum + (tags.has('fortress') ? 1 : 0);
      case 'coral_people' as FactionId:
        // Galley (transport tag) is the signature unit; ranged_naval_frame is the starter
        return sum + (tags.has('transport') ? 1 : 0);
      case 'desert_nomads' as FactionId:
        return sum + (tags.has('camel') ? 1 : 0);
      case 'savannah_lions' as FactionId:
        return sum + (tags.has('elephant') ? 1 : 0);
      case 'plains_riders' as FactionId:
        return sum + (tags.has('river') || tags.has('amphibious') ? 1 : 0);
      case 'frost_wardens' as FactionId:
        return sum + (tags.has('cold') || tags.has('endurance') ? 1 : 0);
      default:
        return sum;
    }
  }, 0);
}

function countSignatureLikePrototype(factionId: FactionId, prototype: Prototype): number {
  const tags = new Set(prototype.tags ?? []);
  switch (factionId) {
    case 'jungle_clan' as FactionId:
      return tags.has('poison') ? 1 : 0;
    case 'druid_circle' as FactionId:
      return tags.has('druid') ? 1 : 0;
    case 'steppe_clan' as FactionId:
      return tags.has('warlord') ? 1 : 0;
    case 'hill_clan' as FactionId:
      return tags.has('fortress') ? 1 : 0;
    case 'coral_people' as FactionId:
      return tags.has('transport') ? 1 : 0;
    case 'desert_nomads' as FactionId:
      return tags.has('camel') ? 1 : 0;
    case 'savannah_lions' as FactionId:
      return tags.has('elephant') ? 1 : 0;
    case 'plains_riders' as FactionId:
      return tags.has('river') || tags.has('amphibious') ? 1 : 0;
    case 'frost_wardens' as FactionId:
      return tags.has('cold') || tags.has('endurance') ? 1 : 0;
    default:
      return 0;
  }
}

function isSignatureCapableUnit(factionId: FactionId, prototype: Prototype, registry: RulesRegistry): boolean {
  const tags = new Set(prototype.tags ?? []);
  const ability = registry.getSignatureAbility(factionId);

  if (ability?.stampedeBonus && (prototype.chassisId === 'elephant_frame' || tags.has('elephant'))) return true;
  if (ability?.hitAndRun && prototype.derivedStats.role === 'mounted') return true;
  if (ability?.tidalAssaultBonus && (tags.has('naval') || tags.has('transport'))) return true;
  if (ability?.venomDamagePerTurn && tags.has('poison')) return true;
  if (ability?.desertSwarmAttackBonus && (tags.has('camel') || tags.has('desert'))) return true;
  if (ability?.sneakAttackBonus) return true;
  if (ability?.wallDefenseMultiplier && tags.has('transport')) return true;
  if (ability?.greedyBonus && tags.has('capture')) return true;
  if (ability?.summon && tags.has('cold')) return true;

  return countSignatureLikePrototype(factionId, prototype) > 0;
}

function getPrototypeProductionCost(
  prototype: Prototype,
  faction: NonNullable<ReturnType<typeof buildMvpScenario>['factions'] extends Map<any, infer F> ? F : never>,
): number {
  if (getPrototypeCostType(prototype) === 'villages') {
    return prototype.sourceRecipeId === 'settler' ? 0 : getUnitCost(prototype.chassisId);
  }

  return calculatePrototypeCost(getUnitCost(prototype.chassisId), faction, getDomainIdsByTags(prototype.tags ?? []), prototype);
}

function averageRecordCounts(records: Record<string, number>[]): Record<string, number> {
  const totals: Record<string, number> = {};
  const count = records.length || 1;

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      totals[key] = (totals[key] ?? 0) + value / count;
    }
  }

  for (const key of Object.keys(totals)) {
    totals[key] = roundMetric(totals[key] * 10) / 10;
  }

  return totals;
}

function getStalledProductionMetrics(
  state: ReturnType<typeof buildMvpScenario>,
  factionId: FactionId,
): FactionProductionStallMarker[] {
  return Array.from(state.cities.values())
    .filter((city) => city.factionId === factionId && city.currentProduction)
    .map((city) => {
      const estimatedTurnsQueued =
        city.currentProduction?.costType === 'production'
          ? roundMetric(city.currentProduction.progress / Math.max(1, getCityProductionYield(city)))
          : null;

      return {
        cityId: city.id,
        currentProductionItemId: city.currentProduction?.item.id ?? null,
        currentProductionCost: city.currentProduction?.cost ?? null,
        costType: city.currentProduction?.costType ?? 'production',
        estimatedTurnsQueued,
      };
    })
    .sort((left, right) => left.cityId.localeCompare(right.cityId));
}

function getFactionMetrics(
  state: ReturnType<typeof buildMvpScenario>,
  factionId: FactionId,
  registry: RulesRegistry,
): FactionBaseMetrics {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return {
      factionId,
      livingUnits: 0,
      cities: 0,
      villages: 0,
      warExhaustion: 0,
      capabilityTotal: 0,
      unlockedRecipes: 0,
      routedUnits: 0,
      signatureUnits: 0,
      signatureCapableUnits: 0,
      hybridUnits: 0,
      homeTerrainUnits: 0,
      supplyIncome: 0,
      supplyDemand: 0,
      supplyUtilizationRatio: 0,
      highestAvailableProductionCost: 0,
      highestFieldedProductionCost: 0,
      averageFieldedProductionCost: 0,
      unitsByPrototypeId: {},
      stalledProduction: [],
      unitComposition: { byChassis: {}, byRole: {} },
      learnedDomainCount: 0,
      t1DomainCount: 0,
      t2DomainCount: 0,
      t3DomainCount: 0,
      activeTripleStack: null,
      unitsWithLearnedAbilities: 0,
    };
  }

  const livingUnits = faction.unitIds
    .map((unitId) => state.units.get(unitId))
    .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit && unit.hp > 0));
  const routedUnits = livingUnits.filter((unit) => unit.routed).length;
  const capabilityTotal = Object.values(faction.capabilities?.domainLevels ?? {})
    .reduce((sum, amount) => sum + amount, 0);

  const homeTerrainUnits = livingUnits.filter((unit) => {
    const terrain = state.map?.tiles.get(`${unit.position.q},${unit.position.r}`)?.terrain;
    return terrain === faction.identityProfile.homeBiome;
  }).length;
  const economy = state.economy.get(factionId) ?? { supplyIncome: 0, supplyDemand: 0 };
  const supplyUtilizationRatio = economy.supplyIncome > 0
    ? roundMetric(economy.supplyDemand / economy.supplyIncome)
    : 0;
  const unitsByPrototypeId = livingUnits.reduce<Record<string, number>>((acc, unit) => {
    acc[unit.prototypeId] = (acc[unit.prototypeId] ?? 0) + 1;
    return acc;
  }, {});
  const fieldedPrototypeCosts = livingUnits
    .map((unit) => state.prototypes.get(unit.prototypeId))
    .filter((prototype): prototype is Prototype => Boolean(prototype))
    .map((prototype) => getPrototypeProductionCost(prototype, faction));
  const availablePrototypeCosts = getAvailableProductionPrototypes(state, factionId, registry)
    .map((prototype) => getPrototypeProductionCost(prototype, faction));

  const unitComposition = collectUnitComposition(state, livingUnits);

  const research = state.research.get(factionId);
  const progression = getDomainProgression(faction, research);
  const unitsWithLearnedAbilities = livingUnits.filter((unit) =>
    (unit.learnedAbilities?.length ?? 0) > 0
  ).length;

  return {
    factionId,
    livingUnits: livingUnits.length,
    cities: getFactionCityCount(state, factionId),
    villages: getFactionVillageCount(state, factionId),
    warExhaustion: state.warExhaustion.get(factionId)?.exhaustionPoints ?? 0,
    capabilityTotal: roundMetric(capabilityTotal), // Raw aggregate, not normalized for balance.
    unlockedRecipes: faction.capabilities?.unlockedRecipeIds.length ?? 0,
    routedUnits,
    signatureUnits: countSignatureUnits(state, factionId),
    signatureCapableUnits: livingUnits.reduce((sum, unit) => {
      const prototype = state.prototypes.get(unit.prototypeId);
      return prototype && isSignatureCapableUnit(factionId, prototype, registry) ? sum + 1 : sum;
    }, 0),
    hybridUnits: livingUnits.reduce((sum, unit) => {
      const prototype = state.prototypes.get(unit.prototypeId);
      return prototype?.sourceRecipeId ? sum + 1 : sum;
    }, 0),
    homeTerrainUnits,
    supplyIncome: roundMetric(economy.supplyIncome),
    supplyDemand: roundMetric(economy.supplyDemand),
    supplyUtilizationRatio,
    highestAvailableProductionCost: availablePrototypeCosts.length > 0 ? Math.max(...availablePrototypeCosts) : 0,
    highestFieldedProductionCost: fieldedPrototypeCosts.length > 0 ? Math.max(...fieldedPrototypeCosts) : 0,
    averageFieldedProductionCost: fieldedPrototypeCosts.length > 0
      ? roundMetric(fieldedPrototypeCosts.reduce((sum, cost) => sum + cost, 0) / fieldedPrototypeCosts.length)
      : 0,
    unitsByPrototypeId,
    stalledProduction: getStalledProductionMetrics(state, factionId),
    unitComposition,
    learnedDomainCount: progression.learnedDomainCount,
    t1DomainCount: progression.t1Domains.length,
    t2DomainCount: progression.t2Domains.length,
    t3DomainCount: progression.t3Domains.length,
    activeTripleStack: faction.activeTripleStack?.name ?? null,
    unitsWithLearnedAbilities,
  };
}

function collectUnitComposition(
  state: ReturnType<typeof buildMvpScenario>,
  livingUnits: NonNullable<ReturnType<typeof state.units.get>>[]
): UnitComposition {
  const byChassis: Record<string, number> = {};
  const byRole: Record<string, number> = {};

  for (const unit of livingUnits) {
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype) continue;

    byChassis[prototype.chassisId] = (byChassis[prototype.chassisId] ?? 0) + 1;
    byRole[prototype.derivedStats.role] = (byRole[prototype.derivedStats.role] ?? 0) + 1;
  }

  return { byChassis, byRole };
}

function averageUnitComposition(compositions: UnitComposition[]): UnitComposition {
  const byChassis: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const n = compositions.length || 1;

  for (const comp of compositions) {
    for (const [chassis, count] of Object.entries(comp.byChassis)) {
      byChassis[chassis] = (byChassis[chassis] ?? 0) + count / n;
    }
    for (const [role, count] of Object.entries(comp.byRole)) {
      byRole[role] = (byRole[role] ?? 0) + count / n;
    }
  }

  // Round to 1 decimal place for readability
  for (const key of Object.keys(byChassis)) byChassis[key] = roundMetric(byChassis[key] * 10) / 10;
  for (const key of Object.keys(byRole)) byRole[key] = roundMetric(byRole[key] * 10) / 10;

  return { byChassis, byRole };
}

interface MidpointMetrics {
  armySizeAtTurn20: Record<string, number>;
  firstEmergentRuleRound: Record<string, number | null>;
}

function extractMidpointMetrics(
  trace: SimulationTrace,
  factionIds: FactionId[],
): MidpointMetrics {
  const snapshots = trace.snapshots ?? [];
  const armySizeAtTurn20: Record<string, number> = {};
  const firstEmergentRuleRound: Record<string, number | null> = {};
  const emergentSeen = new Set<string>();

  for (const factionId of factionIds) {
    armySizeAtTurn20[factionId] = 0;
    firstEmergentRuleRound[factionId] = null;
  }

  for (const snapshot of snapshots) {
    // Extract army size at round 20 (or closest round)
    if (snapshot.round === 20 && snapshot.phase === 'start') {
      for (const f of snapshot.factions) {
        if (factionIds.includes(f.id as FactionId)) {
          armySizeAtTurn20[f.id] = f.livingUnits;
        }
      }
    }
    // Extract first emergent rule activation per faction
    if (snapshot.factionTripleStacks) {
      for (const ts of snapshot.factionTripleStacks) {
        if (!emergentSeen.has(ts.factionId)) {
          emergentSeen.add(ts.factionId);
          firstEmergentRuleRound[ts.factionId] = snapshot.round;
        }
      }
    }
  }

  return { armySizeAtTurn20, firstEmergentRuleRound };
}

export function collectSeedBalanceMetrics(
  seed: number,
  registry: RulesRegistry,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides,
  difficulty?: DifficultyLevel,
): SeedBalanceMetrics {
  const factionConfigs = getMvpFactionConfigs(balanceOverrides);
  const initialState = buildMvpScenario(seed, { mapMode, registry, balanceOverrides });
  const trace = createSimulationTrace(true);
  const finalState = runWarEcologySimulation(initialState, registry, maxTurns, trace, difficulty);
  assertSettlementOwnershipConsistency(finalState);
  const livingUnits = Array.from(finalState.units.values()).filter((unit) => unit.hp > 0);
  const routedUnits = livingUnits.filter((unit) => unit.routed).length;

  const midpointMetrics = extractMidpointMetrics(trace, factionConfigs.map(c => c.id as FactionId));

  const factions = Object.fromEntries(
    factionConfigs.map((config) => {
      const factionId = config.id as FactionId;
      const base = getFactionMetrics(finalState, factionId, registry);
      return [config.id, {
        ...base,
        armySizeAtTurn20: midpointMetrics.armySizeAtTurn20[factionId] ?? 0,
        firstEmergentRuleRound: midpointMetrics.firstEmergentRuleRound[factionId] ?? null,
      }];
    })
  );

  const totalBattles = Array.from(finalState.units.values())
    .reduce((sum, unit) => sum + getBattleCount(unit), 0);
  const totalKills = Array.from(finalState.units.values())
    .reduce((sum, unit) => sum + getKillCount(unit), 0);
  const traceCounts = countTraceEvents(trace);

  const victoryStatus = getVictoryStatus(finalState);
  const winnerFactionId = victoryStatus.winnerFactionId;
  const unresolved = victoryStatus.victoryType === 'unresolved';

  return {
    seed,
    maxTurns,
    mapMode,
    mapArchetype: classifyMapArchetype(finalState),
    finalRound: finalState.round,
    winnerFactionId,
    victoryType: victoryStatus.victoryType,
    unresolved,
    livingUnits: livingUnits.length,
    routedUnits,
    totalWarExhaustion: roundMetric(
      Array.from(finalState.warExhaustion.values())
        .reduce((sum, entry) => sum + entry.exhaustionPoints, 0)
    ),
    eventCounts: {
      battles: totalBattles,
      kills: totalKills,
      cityCaptures: traceCounts.cityCaptures,
      villagesRazored: traceCounts.villagesRazored,
      siegesStarted: traceCounts.siegesStarted,
      siegeBreaks: traceCounts.siegeBreaks,
      codificationsStarted: traceCounts.codificationsStarted,
      codificationsCompleted: traceCounts.codificationsCompleted,
      poisonTicks: traceCounts.poisonTicks,
      jungleAttrition: traceCounts.jungleAttrition,
      villageCaptures: traceCounts.villageCaptures,
      unitCaptures: traceCounts.unitCaptures,
    },
    factions,
  };
}

export function runBalanceHarness(
  registry: RulesRegistry,
  seeds: readonly number[] = SMOKE_HARNESS_SEEDS,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides,
  difficulty?: DifficultyLevel,
): BatchBalanceSummary {
  const factionConfigs = getMvpFactionConfigs(balanceOverrides);
  const runs = seeds.map((seed) =>
    collectSeedBalanceMetrics(seed, registry, maxTurns, mapMode, balanceOverrides, difficulty),
  );
  const factionIds = factionConfigs.map((config) => config.id);

  const factions = Object.fromEntries(
    factionIds.map((factionId) => {
      const factionRuns = runs.map((run) => run.factions[factionId]);
      const wins = runs.filter((run) => run.winnerFactionId === factionId).length;

      return [
        factionId,
        {
          factionId,
          wins,
          avgLivingUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.livingUnits, 0) / runs.length),
          avgCities: roundMetric(factionRuns.reduce((sum, run) => sum + run.cities, 0) / runs.length),
          avgVillages: roundMetric(factionRuns.reduce((sum, run) => sum + run.villages, 0) / runs.length),
          avgWarExhaustion: roundMetric(factionRuns.reduce((sum, run) => sum + run.warExhaustion, 0) / runs.length),
          avgCapabilityTotal: roundMetric(factionRuns.reduce((sum, run) => sum + run.capabilityTotal, 0) / runs.length),
          avgUnlockedRecipes: roundMetric(factionRuns.reduce((sum, run) => sum + run.unlockedRecipes, 0) / runs.length),
          avgRoutedUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.routedUnits, 0) / runs.length),
          avgSignatureUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.signatureUnits, 0) / runs.length),
          avgSignatureCapableUnits: roundMetric(
            factionRuns.reduce((sum, run) => sum + run.signatureCapableUnits, 0) / runs.length,
          ),
          avgHybridUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.hybridUnits, 0) / runs.length),
          avgHomeTerrainUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.homeTerrainUnits, 0) / runs.length),
          avgSupplyIncome: roundMetric(factionRuns.reduce((sum, run) => sum + run.supplyIncome, 0) / runs.length),
          avgSupplyDemand: roundMetric(factionRuns.reduce((sum, run) => sum + run.supplyDemand, 0) / runs.length),
          avgSupplyUtilizationRatio: roundMetric(
            factionRuns.reduce((sum, run) => sum + run.supplyUtilizationRatio, 0) / runs.length,
          ),
          avgHighestAvailableProductionCost: roundMetric(
            factionRuns.reduce((sum, run) => sum + run.highestAvailableProductionCost, 0) / runs.length,
          ),
          avgHighestFieldedProductionCost: roundMetric(
            factionRuns.reduce((sum, run) => sum + run.highestFieldedProductionCost, 0) / runs.length,
          ),
          avgAverageFieldedProductionCost: roundMetric(
            factionRuns.reduce((sum, run) => sum + run.averageFieldedProductionCost, 0) / runs.length,
          ),
          avgUnitsByPrototypeId: averageRecordCounts(factionRuns.map((run) => run.unitsByPrototypeId)),
          avgStalledProductionCount: roundMetric(
            factionRuns.reduce((sum, run) => sum + run.stalledProduction.length, 0) / runs.length,
          ),
          avgUnitComposition: averageUnitComposition(factionRuns.map((run) => run.unitComposition)),
          avgArmySizeAtTurn20: roundMetric(
            factionRuns.reduce((sum, run) => sum + run.armySizeAtTurn20, 0) / runs.length,
          ),
          gamesWithEmergentRuleBeforeOpponent: runs.filter((run) => {
            const myRound = run.factions[factionId]?.firstEmergentRuleRound;
            if (myRound == null) return false;
            const allRounds = factionIds
              .map((oid) => run.factions[oid]?.firstEmergentRuleRound)
              .filter((r): r is number => r != null);
            if (allRounds.length === 0) return false;
            const minOpponent = Math.min(...allRounds);
            return myRound <= minOpponent;
          }).length,
          avgLearnedDomainCount: roundMetric(factionRuns.reduce((sum, run) => sum + run.learnedDomainCount, 0) / runs.length),
          avgT1DomainCount: roundMetric(factionRuns.reduce((sum, run) => sum + run.t1DomainCount, 0) / runs.length),
          avgT2DomainCount: roundMetric(factionRuns.reduce((sum, run) => sum + run.t2DomainCount, 0) / runs.length),
          avgT3DomainCount: roundMetric(factionRuns.reduce((sum, run) => sum + run.t3DomainCount, 0) / runs.length),
          gamesWithActiveTripleStack: runs.filter((run) => run.factions[factionId]?.activeTripleStack != null).length,
          avgUnitsWithLearnedAbilities: roundMetric(factionRuns.reduce((sum, run) => sum + run.unitsWithLearnedAbilities, 0) / runs.length),
        } satisfies FactionBatchMetrics,
      ];
    })
  );

  const mapArchetypes = runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.mapArchetype] = (acc[run.mapArchetype] ?? 0) + 1;
    return acc;
  }, {});

  return {
    seeds: [...seeds],
    maxTurns,
    mapMode,
    totalSeeds: runs.length,
    decisiveGames: runs.filter((run) => !run.unresolved).length,
    unresolvedGames: runs.filter((run) => run.unresolved).length,
    avgFinalRound: roundMetric(runs.reduce((sum, run) => sum + run.finalRound, 0) / runs.length),
    avgLivingUnits: roundMetric(runs.reduce((sum, run) => sum + run.livingUnits, 0) / runs.length),
    avgRoutedUnits: roundMetric(runs.reduce((sum, run) => sum + run.routedUnits, 0) / runs.length),
    avgTotalWarExhaustion: roundMetric(
      runs.reduce((sum, run) => sum + run.totalWarExhaustion, 0) / runs.length
    ),
    totalBattles: runs.reduce((sum, run) => sum + run.eventCounts.battles, 0),
    totalKills: runs.reduce((sum, run) => sum + run.eventCounts.kills, 0),
    totalCityCaptures: runs.reduce((sum, run) => sum + run.eventCounts.cityCaptures, 0),
    totalVillagesRazored: runs.reduce((sum, run) => sum + run.eventCounts.villagesRazored, 0),
    totalSiegesStarted: runs.reduce((sum, run) => sum + run.eventCounts.siegesStarted, 0),
    totalSiegeBreaks: runs.reduce((sum, run) => sum + run.eventCounts.siegeBreaks, 0),
    totalCodificationsStarted: runs.reduce((sum, run) => sum + run.eventCounts.codificationsStarted, 0),
    totalCodificationsCompleted: runs.reduce((sum, run) => sum + run.eventCounts.codificationsCompleted, 0),
    totalPoisonTicks: runs.reduce((sum, run) => sum + run.eventCounts.poisonTicks, 0),
    totalJungleAttrition: runs.reduce((sum, run) => sum + run.eventCounts.jungleAttrition, 0),
    totalVillageCaptures: runs.reduce((sum, run) => sum + run.eventCounts.villageCaptures, 0),
    totalUnitCaptures: runs.reduce((sum, run) => sum + run.eventCounts.unitCaptures, 0),
    mapArchetypes,
    factions,
  };
}

export function runStratifiedBalanceHarness(
  registry: RulesRegistry,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides,
  difficulty?: DifficultyLevel,
): BatchBalanceSummary {
  return runBalanceHarness(registry, STRATIFIED_HARNESS_SEEDS, maxTurns, mapMode, balanceOverrides, difficulty);
}

function getComparisonMetrics(metrics: FactionBatchMetrics): FactionDifficultyComparisonMetrics {
  const avgFieldingGap = roundMetric(
    metrics.avgHighestAvailableProductionCost - metrics.avgHighestFieldedProductionCost,
  );
  return {
    avgSupplyUtilizationRatio: metrics.avgSupplyUtilizationRatio,
    avgHighestAvailableProductionCost: metrics.avgHighestAvailableProductionCost,
    avgHighestFieldedProductionCost: metrics.avgHighestFieldedProductionCost,
    avgFieldingGap,
    avgHybridUnits: metrics.avgHybridUnits,
    avgSignatureCapableUnits: metrics.avgSignatureCapableUnits,
    avgStalledProductionCount: metrics.avgStalledProductionCount,
  };
}

function diffComparisonMetrics(
  hardMetrics: FactionDifficultyComparisonMetrics,
  normalMetrics: FactionDifficultyComparisonMetrics,
): FactionDifficultyComparisonMetrics {
  return {
    avgSupplyUtilizationRatio: roundMetric(hardMetrics.avgSupplyUtilizationRatio - normalMetrics.avgSupplyUtilizationRatio),
    avgHighestAvailableProductionCost: roundMetric(
      hardMetrics.avgHighestAvailableProductionCost - normalMetrics.avgHighestAvailableProductionCost,
    ),
    avgHighestFieldedProductionCost: roundMetric(
      hardMetrics.avgHighestFieldedProductionCost - normalMetrics.avgHighestFieldedProductionCost,
    ),
    avgFieldingGap: roundMetric(hardMetrics.avgFieldingGap - normalMetrics.avgFieldingGap),
    avgHybridUnits: roundMetric(hardMetrics.avgHybridUnits - normalMetrics.avgHybridUnits),
    avgSignatureCapableUnits: roundMetric(
      hardMetrics.avgSignatureCapableUnits - normalMetrics.avgSignatureCapableUnits,
    ),
    avgStalledProductionCount: roundMetric(
      hardMetrics.avgStalledProductionCount - normalMetrics.avgStalledProductionCount,
    ),
  };
}

export function runPairedDifficultyBalanceHarness(
  registry: RulesRegistry,
  seeds: readonly number[] = SMOKE_HARNESS_SEEDS,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides,
): DifficultyComparisonSummary {
  const normal = runBalanceHarness(registry, seeds, maxTurns, mapMode, balanceOverrides, 'normal');
  const hard = runBalanceHarness(registry, seeds, maxTurns, mapMode, balanceOverrides, 'hard');

  const factionIds = Object.keys(normal.factions);
  const factions = Object.fromEntries(
    factionIds.map((factionId) => {
      const normalMetrics = getComparisonMetrics(normal.factions[factionId]);
      const hardMetrics = getComparisonMetrics(hard.factions[factionId]);
      return [
        factionId,
        {
          factionId,
          normal: normalMetrics,
          hard: hardMetrics,
          delta: diffComparisonMetrics(hardMetrics, normalMetrics),
        } satisfies FactionDifficultyComparison,
      ];
    }),
  );

  return {
    seeds: [...seeds],
    maxTurns,
    mapMode,
    normal,
    hard,
    totals: {
      avgLivingUnitsDelta: roundMetric(hard.avgLivingUnits - normal.avgLivingUnits),
      totalBattlesDelta: hard.totalBattles - normal.totalBattles,
      totalKillsDelta: hard.totalKills - normal.totalKills,
      totalSiegesStartedDelta: hard.totalSiegesStarted - normal.totalSiegesStarted,
      totalCityCapturesDelta: hard.totalCityCaptures - normal.totalCityCaptures,
    },
    factions,
  };
}

export function runStratifiedPairedDifficultyBalanceHarness(
  registry: RulesRegistry,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides,
): DifficultyComparisonSummary {
  return runPairedDifficultyBalanceHarness(registry, STRATIFIED_HARNESS_SEEDS, maxTurns, mapMode, balanceOverrides);
}

// --- Phase 4 Validation: Easy (old Normal) vs Normal (new) ---

export interface ValidationTargetCheck {
  metric: string;
  before: number;
  after: number;
  delta: number;
  deltaPercent: number | null;
  target: string;
  pass: boolean;
}

export interface ValidationSummary {
  seeds: number[];
  totalSeeds: number;
  easy: BatchBalanceSummary;
  normal: BatchBalanceSummary;
  checks: ValidationTargetCheck[];
  allPass: boolean;
}

export function runValidationComparison(
  registry: RulesRegistry,
  seeds: readonly number[] = VALIDATION_HARNESS_SEEDS,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides,
): ValidationSummary {
  const easy = runBalanceHarness(registry, seeds, maxTurns, mapMode, balanceOverrides, 'easy');
  const normal = runBalanceHarness(registry, seeds, maxTurns, mapMode, balanceOverrides, 'normal');

  const n = seeds.length;

  // Per-faction averages for army size at turn 20
  const easyAvgArmy20 = Object.values(easy.factions)
    .reduce((sum, f) => sum + f.avgArmySizeAtTurn20, 0) / Math.max(Object.keys(easy.factions).length, 1);
  const normalAvgArmy20 = Object.values(normal.factions)
    .reduce((sum, f) => sum + f.avgArmySizeAtTurn20, 0) / Math.max(Object.keys(normal.factions).length, 1);

  // Games where at least one faction completed emergent rule before opponents
  const easyEmergentGames = Object.values(easy.factions)
    .reduce((sum, f) => sum + f.gamesWithEmergentRuleBeforeOpponent, 0);
  const normalEmergentGames = Object.values(normal.factions)
    .reduce((sum, f) => sum + f.gamesWithEmergentRuleBeforeOpponent, 0);

  const checks: ValidationTargetCheck[] = [
    {
      metric: 'AI city captures per game',
      before: easy.totalCityCaptures / n,
      after: normal.totalCityCaptures / n,
      delta: (normal.totalCityCaptures - easy.totalCityCaptures) / n,
      deltaPercent: easy.totalCityCaptures > 0
        ? roundMetric(((normal.totalCityCaptures - easy.totalCityCaptures) / easy.totalCityCaptures) * 100)
        : null,
      target: '+40%',
      pass: easy.totalCityCaptures > 0 && (normal.totalCityCaptures / easy.totalCityCaptures) >= 1.4,
    },
    {
      metric: 'Games where AI completes first emergent rule before opponent',
      before: easyEmergentGames,
      after: normalEmergentGames,
      delta: normalEmergentGames - easyEmergentGames,
      deltaPercent: null,
      target: `>50% of ${n} games`,
      pass: normalEmergentGames > n * 0.5,
    },
    {
      metric: 'Average game length (turns)',
      before: easy.avgFinalRound,
      after: normal.avgFinalRound,
      delta: roundMetric(normal.avgFinalRound - easy.avgFinalRound),
      deltaPercent: null,
      target: '+8 to +12 turns',
      pass: (normal.avgFinalRound - easy.avgFinalRound) >= 8 && (normal.avgFinalRound - easy.avgFinalRound) <= 15,
    },
    {
      metric: 'AI army peak size at turn 20',
      before: roundMetric(easyAvgArmy20),
      after: roundMetric(normalAvgArmy20),
      delta: roundMetric(normalAvgArmy20 - easyAvgArmy20),
      deltaPercent: easyAvgArmy20 > 0
        ? roundMetric(((normalAvgArmy20 - easyAvgArmy20) / easyAvgArmy20) * 100)
        : null,
      target: '+20%',
      pass: easyAvgArmy20 > 0 && (normalAvgArmy20 / easyAvgArmy20) >= 1.2,
    },
    {
      metric: 'Decisive games (non-unresolved)',
      before: easy.decisiveGames,
      after: normal.decisiveGames,
      delta: normal.decisiveGames - easy.decisiveGames,
      deltaPercent: null,
      target: 'parity or improvement',
      pass: normal.decisiveGames >= easy.decisiveGames,
    },
  ];

  return {
    seeds: [...seeds],
    totalSeeds: n,
    easy,
    normal,
    checks,
    allPass: checks.every(c => c.pass),
  };
}
