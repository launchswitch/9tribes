import type { GameState } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import type { Prototype } from '../features/prototypes/types.js';
import type { FactionStrategy, ProductionPriority } from './factionStrategy.js';
import { calculatePrototypeCost, getDomainIdsByTags } from './knowledgeSystem.js';
import {
  canPaySettlerVillageCost,
  getAvailableProductionPrototypes,
  getPrototypeCostType,
  getPrototypeQueueCost,
  getPrototypeEconomicProfile,
  getProjectedSupplyDemandWithPrototype,
  getUnitCost,
  isSettlerPrototype,
  SETTLER_VILLAGE_COST,
} from './productionSystem.js';
import { getSupplyDeficit } from './economySystem.js';
import { getVisibleEnemyUnits } from './fogSystem.js';
import { scoreProductionCandidate } from './aiPersonality.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { getAiDifficultyProfile, type AiDifficultyProfile } from './aiDifficulty.js';

export interface ProductionDecision {
  prototypeId: string;
  chassisId: string;
  cost: number;
  costType: 'production' | 'villages';
  reason: string;
}

interface ProductionScoringContext {
  supplyIncome: number;
  currentSupplyDemand: number;
  currentSupplyDeficit: number;
  supplyUtilizationRatio: number;
  totalFriendlyUnits: number;
  visibleEnemyPressure: number;
  highestAvailableMilitaryCost: number;
  highestFieldedMilitaryCost: number;
  averageFieldedMilitaryCost: number;
  targetArmySize: number;
}

function isMilitaryPrototype(
  prototype: Pick<Prototype, 'derivedStats' | 'tags'>,
): boolean {
  const tags = prototype.tags ?? [];
  return prototype.derivedStats.role !== 'support'
    && !tags.includes('transport')
    && !tags.includes('naval')
    && !tags.includes('settler');
}

function getSupplyUtilizationRatio(economy: { supplyIncome: number; supplyDemand: number }): number {
  if (economy.supplyIncome <= 0) {
    return economy.supplyDemand > 0 ? 1 : 0;
  }
  return Number((economy.supplyDemand / economy.supplyIncome).toFixed(3));
}

function getTargetArmySize(
  state: GameState,
  factionId: FactionId,
): number {
  const faction = state.factions.get(factionId);
  const cities = faction?.cityIds.length ?? 0;
  const villages = faction?.villageIds.length ?? 0;
  return Math.max(4, cities * 3 + Math.floor(villages / 2));
}

function getProductionCostForPrototype(
  prototype: Pick<Prototype, 'name' | 'chassisId' | 'tags' | 'sourceRecipeId'>,
  faction: NonNullable<GameState['factions'] extends Map<any, infer F> ? F : never>,
): number {
  if (getPrototypeCostType(prototype) === 'villages') {
    return prototype.sourceRecipeId === 'settler' ? 0 : getPrototypeQueueCost(prototype);
  }
  return calculatePrototypeCost(getUnitCost(prototype.chassisId), faction, getDomainIdsByTags(prototype.tags ?? []), prototype);
}

export function getSupplyMargin(economy: { supplyIncome: number; supplyDemand: number }): number {
  return Number((economy.supplyIncome - economy.supplyDemand).toFixed(2));
}

export function getProjectedSupplyMarginAfterBuild(
  state: GameState,
  factionId: FactionId,
  prototype: Pick<Prototype, 'chassisId'>,
  registry: RulesRegistry,
): number {
  const economy = state.economy.get(factionId) ?? { supplyIncome: 0, supplyDemand: 0 };
  const projectedDemand = getProjectedSupplyDemandWithPrototype(state, factionId, prototype, registry);
  return Number((economy.supplyIncome - projectedDemand).toFixed(2));
}

export function scoreSupplyEfficiency(prototype: Pick<Prototype, 'chassisId'> & {
  derivedStats: { attack: number; defense: number; hp: number; moves: number; range: number };
}, registry: RulesRegistry): number {
  const economic = getPrototypeEconomicProfile(prototype, registry);
  const combatValue =
    prototype.derivedStats.attack * 1.2 +
    prototype.derivedStats.defense * 1.1 +
    prototype.derivedStats.hp * 0.25 +
    prototype.derivedStats.moves * 0.6 +
    Math.max(0, prototype.derivedStats.range - 1) * 0.9;
  return combatValue / Math.max(0.25, economic.supplyCost);
}

export function scoreForceProjectionValue(
  prototype: {
    tags?: string[];
    derivedStats: { role: string; attack: number; moves: number; range: number };
  },
  strategy: FactionStrategy,
): number {
  const tags = prototype.tags ?? [];
  let score = prototype.derivedStats.attack * 1.1 + prototype.derivedStats.moves * 1.2;

  if (prototype.derivedStats.role === 'mounted') {
    score +=
      strategy.personality.scalars.mobilityBias * 5 +
      strategy.personality.scalars.aggression * 4 +
      strategy.personality.scalars.opportunism * 2;
  }
  if (prototype.derivedStats.role === 'siege' || tags.includes('siege')) {
    score += strategy.personality.scalars.siegeBias * 3;
  }
  if (tags.includes('naval') || tags.includes('transport')) {
    score += strategy.personality.scalars.raidBias * 2;
  }
  if (prototype.derivedStats.range > 1) {
    score += strategy.personality.scalars.caution * 1.5;
  }

  return score;
}

/**
 * Score a prototype's value as a priest/summoner unit.
 * Priests enable the faction's most powerful unit (the summon), so they warrant
 * a dedicated bonus proportional to summon readiness and difficulty weight.
 * Returns 0 if the prototype is not a priest or the faction has no summon ability.
 */
function scorePriestSummonValue(
  state: GameState,
  factionId: FactionId,
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
  registry: RulesRegistry,
  weight: number,
): number {
  if (weight <= 0) return 0;
  const tags = prototype.tags ?? [];
  if (!tags.includes('priest') && !tags.includes('engineer')) return 0;

  const abilities = registry.getSignatureAbility(factionId);
  if (!abilities?.summon) return 0;

  // Don't build a second priest while the first is alive
  const existingPriest = Array.from(state.units.values()).find((u) => {
    if (u.factionId !== factionId || u.hp <= 0) return false;
    const proto = state.prototypes.get(u.prototypeId);
    return proto?.tags?.includes('priest') || proto?.tags?.includes('engineer');
  });
  if (existingPriest) return 0;

  const summonState = state.factions.get(factionId)?.summonState;

  // Biggest bonus when summon is off cooldown and ready to use immediately
  if (!summonState || summonState.cooldownRemaining === 0) return weight * 1.5;

  // Moderate bonus when summon is active (need priest ready for next cooldown cycle)
  if (summonState.summoned) return weight * 0.8;

  // Standard bonus while cooldown is counting down
  return weight;
}

export function rankProductionPriorities(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ProductionPriority[] {
  const difficultyProfile = getAiDifficultyProfile(difficulty);
  const faction = state.factions.get(factionId);
  if (!faction) return [];

  const enemyUnits = difficultyProfile.strategy.strategicFogCheat
    ? Array.from(state.units.values()).filter((unit) => unit.factionId !== factionId && unit.hp > 0)
    : getVisibleEnemyUnits(state, factionId).map((entry) => entry.unit);
  const currentRoles = new Map<string, number>();
  let totalFriendlyUnits = 0;
  const fieldedMilitaryCosts: number[] = [];
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype) continue;
    totalFriendlyUnits += 1;
    currentRoles.set(prototype.derivedStats.role, (currentRoles.get(prototype.derivedStats.role) ?? 0) + 1);
    if (isMilitaryPrototype(prototype)) {
      fieldedMilitaryCosts.push(getProductionCostForPrototype(prototype, faction));
    }
  }

  const factionEconomy = state.economy.get(factionId) ?? { factionId, productionPool: 0, supplyIncome: 0, supplyDemand: 0 };
  const currentSupplyDeficit = getSupplyDeficit(factionEconomy);
  const supplyUtilizationRatio = getSupplyUtilizationRatio(factionEconomy);
  const targetArmySize = getTargetArmySize(state, factionId);
  const scoringContext: ProductionScoringContext = {
    supplyIncome: factionEconomy.supplyIncome,
    currentSupplyDemand: factionEconomy.supplyDemand,
    currentSupplyDeficit,
    supplyUtilizationRatio,
    totalFriendlyUnits,
    visibleEnemyPressure: enemyUnits.length,
    highestAvailableMilitaryCost: 0,
    highestFieldedMilitaryCost: fieldedMilitaryCosts.length > 0 ? Math.max(...fieldedMilitaryCosts) : 0,
    averageFieldedMilitaryCost: fieldedMilitaryCosts.length > 0
      ? Number((fieldedMilitaryCosts.reduce((sum, cost) => sum + cost, 0) / fieldedMilitaryCosts.length).toFixed(3))
      : 0,
    targetArmySize,
  };

  const availablePrototypes = getAvailableProductionPrototypes(state, factionId, registry)
    .filter((prototype) => {
      if (!isSettlerPrototype(prototype)) {
        return true;
      }
      if (difficulty === 'easy') {
        return false;
      }
      const cityCount = state.factions.get(factionId)?.cityIds.length ?? 0;
      const effectiveCost = cityCount >= 3 ? SETTLER_VILLAGE_COST : difficultyProfile.production.settlerVillageCost;
      return canPaySettlerVillageCost(state, factionId, effectiveCost);
    });
  const availableMilitaryCosts = availablePrototypes
    .filter((prototype) => isMilitaryPrototype(prototype))
    .map((prototype) => getProductionCostForPrototype(prototype, faction));
  scoringContext.highestAvailableMilitaryCost = availableMilitaryCosts.length > 0
    ? Math.max(...availableMilitaryCosts)
    : 0;
  if (difficultyProfile.adaptiveAi && state.round <= difficultyProfile.production.rushTurns) {
    return rankRushProductionPriorities(state, factionId, strategy, registry, availablePrototypes, enemyUnits);
  }
  const researchState = state.research.get(factionId);
  const recentCodifiedDomains =
    difficultyProfile.adaptiveAi
    && researchState?.recentCodifiedRound !== undefined
    && state.round - researchState.recentCodifiedRound <= difficultyProfile.production.codifiedPivotDuration
      ? new Set(researchState.recentCodifiedDomainIds ?? [])
      : undefined;

  return availablePrototypes
    .map((prototype) => {
      const role = prototype.derivedStats.role;
      const myRoleCount = currentRoles.get(role) ?? 0;
      const enemyCounterPressure = scoreEnemyCounterPressure(enemyUnits, state, role);
      const counterCompositionScore = scoreCounterCompositionPivot(
        enemyUnits,
        state,
        role,
        difficultyProfile,
      );
      const desiredRatio = strategy.personality.desiredRoleRatios[role] ?? 0;
      const currentRatio = totalFriendlyUnits > 0 ? myRoleCount / totalFriendlyUnits : 0;
      const roleNeed = Math.max(0, desiredRatio - currentRatio) * 10;
      const postureScore = scorePostureFit(strategy.posture, prototype.tags ?? [], role);
      const identityScore =
        scoreIdentityFit(faction.identityProfile.signatureUnit, faction.identityProfile.economyAngle, prototype)
        + scoreFactionSignatureExploit(faction, prototype, difficultyProfile);
      const hybridScore = scoreHybridFit(strategy, prototype);
      const catapultScore = scoreCatapultPreference(factionId, state, strategy, prototype);
      const domains = getDomainIdsByTags(prototype.tags ?? []);
      const emergentRuleCompletionScore = scoreEmergentRuleCompletionFit(
        domains,
        faction.activeTripleStack?.domains,
        difficultyProfile,
      );
      const codifiedPivotScore = scoreRecentCodifiedDomainPivot(
        domains,
        recentCodifiedDomains,
        difficultyProfile.production.codifiedPivotScoringBonus,
      );
      const settlerScore = scoreSettlerExpansionValue(state, factionId, strategy, prototype, difficultyProfile, difficulty);
      const baseCost = getUnitCost(prototype.chassisId);
      const totalCost = calculatePrototypeCost(baseCost, faction, domains);
      const economic = getPrototypeEconomicProfile(prototype, registry);
      const projectedSupplyMargin = getProjectedSupplyMarginAfterBuild(state, factionId, prototype, registry);
      const projectedDeficitPenalty = projectedSupplyMargin >= 0 ? 0 : Math.abs(projectedSupplyMargin) * 12;
      const supplyCostPenalty = economic.supplyCost * (2 + scoringContext.currentSupplyDeficit * 1.4);
      const productionCostPenalty = totalCost * 0.18;
      const supplyEfficiencyScore =
        scoreSupplyEfficiency(prototype, registry) * difficultyProfile.production.supplyEfficiencyWeight;
      const forceProjectionScore =
        scoreForceProjectionValue(prototype, strategy) * difficultyProfile.production.forceProjectionWeight;
      const underCapScore = scoreUnderCapPressure(
        prototype,
        totalCost,
        economic.supplyCost,
        scoringContext,
        difficultyProfile,
      );
      const aggressiveFillScore = scoreAggressiveSupplyFill(
        prototype,
        economic.supplyCost,
        scoringContext,
        difficultyProfile,
      );
      const armySizePressure = scoreArmySizePressure(
        prototype,
        totalFriendlyUnits,
        targetArmySize,
        difficultyProfile,
      );
      const qualityLagScore = scoreArmyQualityLag(
        prototype,
        totalCost,
        scoringContext,
        difficultyProfile,
      );
      const doctrineScore = scoreProductionCandidate(
        strategy.personality,
        { supplyDeficit: currentSupplyDeficit },
        {
          role,
          tags: prototype.tags ?? [],
          supplyCost: economic.supplyCost,
          productionCost: totalCost,
        },
      );
      const priestScore = scorePriestSummonValue(
        state,
        factionId,
        prototype,
        registry,
        difficultyProfile.production.priestSummonWeight,
      );
      const score =
        postureScore +
        enemyCounterPressure +
        counterCompositionScore +
        roleNeed +
        identityScore +
        hybridScore +
        catapultScore +
        emergentRuleCompletionScore +
        codifiedPivotScore +
        settlerScore +
        doctrineScore +
        supplyEfficiencyScore +
        underCapScore +
        aggressiveFillScore +
        armySizePressure +
        qualityLagScore +
        forceProjectionScore +
        priestScore -
        productionCostPenalty -
        supplyCostPenalty -
        projectedDeficitPenalty;
      const reason = buildProductionReason(
        strategy.posture,
        role,
        totalCost,
        hybridScore,
        enemyCounterPressure + counterCompositionScore,
        roleNeed,
        projectedSupplyMargin,
        codifiedPivotScore,
        settlerScore,
        underCapScore,
        aggressiveFillScore,
        armySizePressure,
        qualityLagScore,
      );
      return {
        prototypeId: prototype.id,
        chassisId: prototype.chassisId,
        prototypeName: prototype.name,
        score,
        reason,
      };
    })
    .sort((left, right) =>
      right.score - left.score
      || left.chassisId.localeCompare(right.chassisId)
      || left.prototypeName.localeCompare(right.prototypeName)
    )
    .map(({ prototypeId, score, reason }) => ({ prototypeId, score, reason }));
}

export function chooseStrategicProduction(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ProductionDecision | null {
  const priorities = rankProductionPriorities(state, factionId, strategy, registry, difficulty);
  strategy.productionPriorities = priorities;
  const best = priorities[0];
  if (!best) return null;

  const prototype = state.prototypes.get(best.prototypeId as never);
  const faction = state.factions.get(factionId);
  if (!prototype || !faction) return null;

  const cost = calculatePrototypeCost(
    getUnitCost(prototype.chassisId),
    faction,
    getDomainIdsByTags(prototype.tags ?? []),
    prototype,
  );
  const difficultyProfile = getAiDifficultyProfile(difficulty);
  const cityCount = faction.cityIds.length;
  return {
    prototypeId: prototype.id,
    chassisId: prototype.chassisId,
    cost: getPrototypeCostType(prototype) === 'villages'
      ? (cityCount >= 3 ? SETTLER_VILLAGE_COST : difficultyProfile.production.settlerVillageCost)
      : cost,
    costType: getPrototypeCostType(prototype),
    reason: best.reason,
  };
}

function scoreUnderCapPressure(
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
  totalCost: number,
  supplyCost: number,
  context: ProductionScoringContext,
  difficultyProfile: AiDifficultyProfile,
): number {
  if (!difficultyProfile.adaptiveAi) return 0;
  if (!isMilitaryPrototype(prototype)) return 0;
  if (context.supplyUtilizationRatio >= difficultyProfile.production.underCapUtilizationFloor) return 0;

  const armyShortfall = Math.max(0, context.targetArmySize - context.totalFriendlyUnits);
  const unusedSupplyPressure = Math.max(
    0,
    difficultyProfile.production.underCapTargetUtilization - context.supplyUtilizationRatio,
  );
  const cheapSupplyBonus = Math.max(0, 3 - supplyCost) * difficultyProfile.production.underCapCheapSupplyWeight;
  const cheapProductionBonus =
    Math.max(0, 42 - totalCost) * difficultyProfile.production.underCapCheapProductionWeight;

  return (
    unusedSupplyPressure * difficultyProfile.production.underCapPressureWeight
    + Math.min(
      difficultyProfile.production.underCapArmyShortfallCap,
      armyShortfall * difficultyProfile.production.underCapArmyShortfallWeight,
    )
    + cheapSupplyBonus
    + cheapProductionBonus
  );
}

function scoreArmySizePressure(
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
  totalFriendlyUnits: number,
  targetArmySize: number,
  difficultyProfile: AiDifficultyProfile,
): number {
  if (!isMilitaryPrototype(prototype)) return 0;
  const shortfall = Math.max(0, targetArmySize - totalFriendlyUnits);
  if (shortfall <= 0) return 0;
  // Scale pressure by shortfall — enough to compete with settler expansion score (~15-25)
  // but decay as army approaches target so it doesn't over-militarize late game
  const basePressure = shortfall * 5;
  // Adaptive AI gets a stronger push; non-adaptive (easy) gets a gentler nudge
  const multiplier = difficultyProfile.adaptiveAi ? 1.8 : 1.0;
  return basePressure * multiplier;
}

function scoreArmyQualityLag(
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
  totalCost: number,
  context: ProductionScoringContext,
  difficultyProfile: AiDifficultyProfile,
): number {
  if (!difficultyProfile.adaptiveAi) return 0;
  if (!isMilitaryPrototype(prototype)) return 0;

  const highestLag = Math.max(0, context.highestAvailableMilitaryCost - context.highestFieldedMilitaryCost);
  const averageLag = Math.max(0, totalCost - context.averageFieldedMilitaryCost);
  if (highestLag <= 0 && averageLag <= 0) return 0;

  let score = 0;
  if (
    context.highestAvailableMilitaryCost > 0
    && totalCost >= context.highestAvailableMilitaryCost - difficultyProfile.production.armyQualityNearTopWindow
  ) {
    score += highestLag * difficultyProfile.production.armyQualityHighestLagWeight;
  }
  if (averageLag > 0) {
    score += averageLag * difficultyProfile.production.armyQualityAverageLagWeight;
  }
  return score;
}

function scoreAggressiveSupplyFill(
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
  supplyCost: number,
  context: ProductionScoringContext,
  difficultyProfile: AiDifficultyProfile,
): number {
  const margin = difficultyProfile.production.aggressiveFillMargin;
  const weight = difficultyProfile.production.aggressiveFillWeight;
  if (margin === null || margin === undefined || weight <= 0) return 0;
  if (!isMilitaryPrototype(prototype)) return 0;

  const currentMargin = context.supplyIncome - context.currentSupplyDemand;
  if (currentMargin <= margin) return 0;

  const projectedMargin = currentMargin - supplyCost;
  if (projectedMargin < 0) return 0;

  const distanceFromLimit = currentMargin - margin;
  return distanceFromLimit * weight;
}

function rankRushProductionPriorities(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  prototypes: ReturnType<typeof getAvailableProductionPrototypes>,
  enemyUnits: GameState['units'] extends Map<any, infer U> ? U[] : never,
): ProductionPriority[] {
  const militaryPrototypes = prototypes.filter((prototype) => isRushMilitaryPrototype(prototype));
  const candidates = militaryPrototypes.length > 0 ? militaryPrototypes : prototypes;
  const faction = state.factions.get(factionId);
  if (!faction) {
    return [];
  }

  return candidates
    .map((prototype) => {
      const domains = getDomainIdsByTags(prototype.tags ?? []);
      const baseCost = getUnitCost(prototype.chassisId);
      const totalCost = calculatePrototypeCost(baseCost, faction, domains);
      const supplyEfficiency = scoreSupplyEfficiency(prototype, registry);
      const forceProjection = scoreForceProjectionValue(prototype, strategy);
      const role = prototype.derivedStats.role ?? 'melee';
      const enemyCounterPressure = scoreEnemyCounterPressure(enemyUnits, state, role);
      const score = 1000 - totalCost * 100 + supplyEfficiency * 10 + forceProjection * 0.25 + enemyCounterPressure * 0.3;
      return {
        prototypeId: prototype.id,
        score,
        reason: `rush phase, cheapest military push, cost ${totalCost}, efficiency ${supplyEfficiency.toFixed(2)}`,
      };
    })
    .sort((left, right) => right.score - left.score || left.prototypeId.localeCompare(right.prototypeId));
}

function isRushMilitaryPrototype(
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
): boolean {
  return isMilitaryPrototype(prototype);
}

function scoreSettlerExpansionValue(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
  difficultyProfile: AiDifficultyProfile,
  difficulty?: DifficultyLevel,
): number {
  if (!isSettlerPrototype(prototype)) {
    return 0;
  }
  if (difficulty === 'easy') {
    return Number.NEGATIVE_INFINITY;
  }

  const villageCount = state.factions.get(factionId)?.villageIds.length ?? 0;
  const cityCount = state.factions.get(factionId)?.cityIds.length ?? 0;
  const effectiveCost = cityCount >= 3 ? SETTLER_VILLAGE_COST : difficultyProfile.production.settlerVillageCost;
  if (villageCount < effectiveCost) {
    return Number.NEGATIVE_INFINITY;
  }
  const economy = state.economy.get(factionId) ?? { supplyIncome: 0, supplyDemand: 0 };
  const supplyUtilizationRatio = getSupplyUtilizationRatio(economy);
  const visibleEnemyPressure = getVisibleEnemyUnits(state, factionId).length;
  const totalFriendlyUnits = Array.from(state.units.values()).filter(
    (unit) => unit.factionId === factionId && unit.hp > 0,
  ).length;
  const targetArmySize = getTargetArmySize(state, factionId);
  const reserveThreshold = Math.max(
    difficultyProfile.production.settlerReserveFloor,
    cityCount * difficultyProfile.production.settlerReservePerCity,
  );
  const gateStrength = difficultyProfile.production.settlerGateStrength;

  const postureBonus =
    strategy.posture === 'defensive' ? 6
    : strategy.posture === 'recovery' ? 5
    : strategy.posture === 'balanced' ? 4
    : strategy.posture === 'exploration' ? 3
    : strategy.posture === 'offensive' ? 2
    : 3;

  const armyShortfallPenalty =
    Math.max(0, targetArmySize - totalFriendlyUnits)
    * difficultyProfile.production.settlerArmyShortfallWeight
    * gateStrength;
  const lowUtilizationPenalty =
    supplyUtilizationRatio < difficultyProfile.production.settlerUtilizationFloor
      ? (
          difficultyProfile.production.settlerUtilizationFloor - supplyUtilizationRatio
        ) * difficultyProfile.production.settlerUtilizationPenaltyWeight * gateStrength
      : 0;
  const pressurePenalty =
    visibleEnemyPressure > 0
      ? (
          difficultyProfile.production.settlerVisibleEnemyBasePenalty
          + visibleEnemyPressure * difficultyProfile.production.settlerVisibleEnemyPerUnitPenalty
        ) * gateStrength
      : 0;
  const reservePenalty =
    totalFriendlyUnits < reserveThreshold
      ? (
          reserveThreshold - totalFriendlyUnits
        ) * difficultyProfile.production.settlerReservePenaltyWeight * gateStrength
      : 0;

  return (
    strategy.personality.scalars.defenseBias * 14 +
    strategy.personality.scalars.caution * 8 +
    Math.max(0, villageCount - effectiveCost) * 1.5 +
    postureBonus +
    (cityCount <= 1 ? 15 : 0) +
    (cityCount <= 1 ? 8 : 0) -
    armyShortfallPenalty -
    lowUtilizationPenalty -
    pressurePenalty -
    reservePenalty -
    strategy.personality.scalars.aggression * 4 -
    strategy.personality.scalars.siegeBias * 4
  );
}

function scoreCatapultPreference(
  factionId: FactionId,
  state: GameState,
  strategy: FactionStrategy,
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>
): number {
  if (!(prototype.tags ?? []).includes('siege')) return 0;
  const posture = strategy.posture;
  // Hill Clan strongly prefers catapults regardless of posture
  if (factionId === 'hill_clan') {
    const myUnitCount = Array.from(state.units.values()).filter(
      (u) => u.factionId === factionId && u.hp > 0
    ).length;
    const myCityCount = Array.from(state.cities.values()).filter(
      (c) => c.factionId === factionId
    ).length;
    if (myUnitCount >= 2 && myCityCount >= 1) return 6;
    if (myUnitCount >= 2) return 3;
  }
  // All factions get siege bias when in siege or offensive posture
  if (posture === 'siege' || posture === 'offensive') {
    const myUnitCount = Array.from(state.units.values()).filter(
      (u) => u.factionId === factionId && u.hp > 0
    ).length;
    if (myUnitCount >= 3) return 4;
    if (myUnitCount >= 2) return 2;
  }
  return 0;
}

function scoreEnemyCounterPressure(enemyUnits: GameState['units'] extends Map<any, infer U> ? U[] : never, state: GameState, role: string): number {
  let score = 0;
  for (const enemy of enemyUnits) {
    const prototype = state.prototypes.get(enemy.prototypeId);
    const enemyRole = prototype?.derivedStats.role;
    if (!enemyRole) continue;
    if (enemyRole === 'mounted' && role === 'melee') score += 1.5;
    if (enemyRole === 'ranged' && role === 'mounted') score += 1.25;
    if (enemyRole === 'melee' && role === 'ranged') score += 0.75;
    if (enemyRole === 'support' && role !== 'support') score += 0.5;
  }
  return score;
}

function scoreCounterCompositionPivot(
  enemyUnits: GameState['units'] extends Map<any, infer U> ? U[] : never,
  state: GameState,
  role: string,
  difficultyProfile: AiDifficultyProfile,
): number {
  const threshold = difficultyProfile.production.counterCompositionThreshold;
  const weight = difficultyProfile.production.counterCompositionWeight;
  if (weight <= 0 || enemyUnits.length === 0) {
    return 0;
  }

  const roleCounts = new Map<string, number>();
  for (const enemy of enemyUnits) {
    const prototype = state.prototypes.get(enemy.prototypeId);
    const enemyRole = prototype?.derivedStats.role;
    if (!enemyRole) continue;
    roleCounts.set(enemyRole, (roleCounts.get(enemyRole) ?? 0) + 1);
  }

  const share = (enemyRole: string) => (roleCounts.get(enemyRole) ?? 0) / Math.max(1, enemyUnits.length);
  let score = 0;

  const mountedShare = share('mounted');
  if (mountedShare >= threshold && role === 'melee') {
    score += mountedShare * weight * 5;
  }

  const rangedShare = share('ranged');
  if (rangedShare >= threshold && role === 'mounted') {
    score += rangedShare * weight * 5;
  }

  const meleeShare = share('melee');
  if (meleeShare >= threshold && role === 'ranged') {
    score += meleeShare * weight * 3;
  }

  const siegeShare = share('siege');
  if (siegeShare >= threshold && role === 'mounted') {
    score += siegeShare * weight * 2.5;
  }

  return score;
}

function scorePostureFit(posture: FactionStrategy['posture'], tags: string[], role: string): number {
  if (posture === 'recovery' || posture === 'defensive') {
    if (tags.includes('fortress') || role === 'melee') return 5;
    if (role === 'ranged') return 3;
    return 1;
  }
  if (posture === 'siege') {
    if (tags.includes('siege')) return 5;
    if (role === 'melee') return 4;
    if (tags.includes('shock')) return 3;
    return 2;
  }
  if (posture === 'offensive') {
    if (role === 'mounted') return 4;
    if (role === 'ranged') return 3;
    // Bias toward siege units when pushing aggressively to take territory
    if (tags.includes('siege')) return 3;
    if (role === 'melee') return 2;
  }
  if (posture === 'exploration') {
    // Exploration still needs military units for scouting safety and early contact
    if (role === 'mounted') return 4;
    if (role === 'melee') return 3;
    if (role === 'ranged') return 3;
    if (role === 'siege') return 1;
    return 1;
  }
  return 2;
}

function scoreIdentityFit(signatureUnit: string, economyAngle: string, prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>): number {
  let score = 0;
  const signature = signatureUnit.toLowerCase();
  const name = prototype.name.toLowerCase();
  const tags = prototype.tags ?? [];
  if (signature.includes('cavalry') && prototype.derivedStats.role === 'mounted') score += 2;
  if (signature.includes('archer') && prototype.derivedStats.role === 'ranged') score += 2;
  if (signature.includes('catapult') && tags.includes('siege')) score += 2;
  if (signature.includes('elephant') && name.includes('elephant')) score += 2;
  if (signature.includes('immortal') && tags.includes('camel')) score += 2;
  if (signature.includes('bear') && name.includes('bear')) score += 2;
  if (signature.includes('galley') && tags.includes('naval')) score += 2;
  if (signature.includes('ship') && tags.includes('naval')) score += 2;
  if (economyAngle.includes('attritional') && tags.includes('poison')) score += 1.5;
  if (economyAngle.includes('mobile') && prototype.derivedStats.moves >= 3) score += 1.5;
  if (economyAngle.includes('siege') && prototype.derivedStats.role === 'melee') score += 1;
  if (economyAngle.includes('raiding') && tags.includes('naval')) score += 1.5;
  if (economyAngle.includes('coastal') && tags.includes('naval')) score += 1.5;
  if (economyAngle.includes('ocean') && tags.includes('transport')) score += 1.5;
  return score;
}

function scoreFactionSignatureExploit(
  faction: NonNullable<GameState['factions'] extends Map<any, infer F> ? F : never>,
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
  difficultyProfile: AiDifficultyProfile,
): number {
  const weight = difficultyProfile.production.signatureExploitWeight;
  if (weight <= 0) {
    return 0;
  }

  const name = prototype.name.toLowerCase();
  const tags = prototype.tags ?? [];
  const role = prototype.derivedStats.role;
  let score = 0;

  switch (faction.id) {
    case 'steppe_clan':
      if (role === 'mounted') score += 2.5;
      if (prototype.derivedStats.moves >= 3) score += 1.5;
      if (tags.includes('skirmish')) score += 1.5;
      break;
    case 'coral_people':
      if (tags.includes('naval') || tags.includes('transport')) score += 2.5;
      if (tags.includes('capture') || tags.includes('slave')) score += 2;
      if (prototype.derivedStats.moves >= 3) score += 0.75;
      break;
    case 'frost_wardens':
      if (name.includes('bear')) score += 4;
      if (tags.includes('frost')) score += 2.5;
      if (role === 'melee' || role === 'ranged') score += 0.75;
      break;
    case 'desert_nomads':
      if (tags.includes('camel') || tags.includes('desert')) score += 3;
      if (prototype.derivedStats.moves >= 3) score += 1.25;
      break;
    default:
      break;
  }

  return score * weight;
}

function scoreHybridFit(strategy: FactionStrategy, prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>): number {
  if (!prototype.sourceRecipeId) return 0;
  let score = strategy.hybridGoal.pursueHybridProduction ? 2.5 : 0.5;
  if (strategy.hybridGoal.preferredRecipeIds.includes(prototype.sourceRecipeId)) {
    score += 3;
  }
  return score;
}

function scoreRecentCodifiedDomainPivot(
  domains: string[],
  recentCodifiedDomains: Set<string> | undefined,
  scoringBonus: number,
): number {
  if (!recentCodifiedDomains || recentCodifiedDomains.size === 0) {
    return 0;
  }
  const matches = domains.filter((domainId) => recentCodifiedDomains.has(domainId)).length;
  return matches > 0 ? scoringBonus + (matches - 1) * 2 : 0;
}

function scoreEmergentRuleCompletionFit(
  prototypeDomainIds: string[],
  activeTripleStackDomains: readonly string[] | undefined,
  difficultyProfile: AiDifficultyProfile,
): number {
  if ((activeTripleStackDomains?.length ?? 0) === 0) {
    return 0;
  }
  return prototypeDomainIds.some((domainId) => activeTripleStackDomains?.includes(domainId))
    ? difficultyProfile.research.emergentRuleCompletionBonus
    : 0;
}

function buildProductionReason(
  posture: FactionStrategy['posture'],
  role: string,
  cost: number,
  hybridScore: number,
  enemyCounterPressure: number,
  roleNeed: number,
  projectedSupplyMargin: number,
  codifiedPivotScore: number,
  settlerScore: number,
  underCapScore: number,
  aggressiveFillScore: number,
  armySizePressure: number,
  qualityLagScore: number,
): string {
  if (settlerScore > 0) {
    return `${posture} settler expansion, village-funded growth, score ${settlerScore.toFixed(1)}`;
  }
  const parts = [`${posture} posture`, `${role} role`];
  if (roleNeed > 0.5) parts.push('fills role gap');
  if (enemyCounterPressure > 1) parts.push('counters enemy composition');
  if (hybridScore >= 3) parts.push('hybrid synergy payoff');
  if (codifiedPivotScore > 0) parts.push('recent codified domain pivot');
  if (underCapScore > 0) parts.push('under supply cap pressure');
  if (aggressiveFillScore > 0) parts.push('aggressive supply fill');
  if (armySizePressure > 0) parts.push('army below target size');
  if (qualityLagScore > 0) parts.push('closes army quality gap');
  if (projectedSupplyMargin < 0) {
    parts.push(`projects supply deficit ${Math.abs(projectedSupplyMargin).toFixed(2)}`);
  } else {
    parts.push(`projects supply margin ${projectedSupplyMargin.toFixed(2)}`);
  }
  parts.push(`cost ${cost}`);
  return parts.join(', ');
}
