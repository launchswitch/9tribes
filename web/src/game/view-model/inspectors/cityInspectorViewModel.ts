/**
 * City inspector view model extracted from worldViewModel.
 */

import type { GameState } from '../../../../../src/game/types.js';
import type { RulesRegistry } from '../../../../../src/data/registry/types.js';
import type { CitySiteBonuses, CitySiteTrait } from '../../../../../src/features/cities/types.js';
import {
  evaluateCitySiteBonuses,
  formatSettlementOccupancyBlocker,
  getCitySiteBonuses,
  getSettlementOccupancyBlocker,
} from '../../../../../src/systems/citySiteSystem.js';
import { deriveResourceIncome, getCaptureRampMultiplier, getSupplyDeficit } from '../../../../../src/systems/economySystem.js';
import { getVillageSpawnReadinessWithRegistry } from '../../../../../src/systems/villageSystem.js';
import { getFactionCityIds } from '../../../../../src/systems/factionOwnershipSystem.js';
import {
  canPaySettlerVillageCost,
  getAvailableProductionPrototypes,
  getPrototypeCostType,
  getPrototypeQueueCost,
  getUnitCost,
  SETTLER_VILLAGE_COST,
} from '../../../../../src/systems/productionSystem.js';
import { calculatePrototypeCost, getDomainIdsByTags, getPrototypeCostModifier, isUnlockPrototype } from '../../../../../src/systems/knowledgeSystem.js';
import { getUnitSupplyCost } from '../../../../../src/systems/productionSystem.js';
import { calculateProductionPenalty, calculateMoralePenalty } from '../../../../../src/systems/warExhaustionSystem.js';
import { hexDistance, hexToKey } from '../../../../../src/core/grid.js';
import type {
  CityInspectorViewModel,
  ClientSelection,
  SettlementBonusSummaryViewModel,
  SettlementPreviewViewModel,
} from '../../types/clientState';
import type { WorldViewModel } from '../../types/worldView';

// Derive CAPTURE_RAMP_TURNS from getCaptureRampMultiplier behavior
function deriveCaptureRampTurns(): number {
  for (let turns = 0; turns < 50; turns++) {
    if (getCaptureRampMultiplier(turns) > 0) {
      return turns;
    }
  }
  return 6;
}
const CAPTURE_RAMP_TURNS = deriveCaptureRampTurns() - 1;

export function buildCityInspectorViewModel(state: GameState, cityId: string, registry: RulesRegistry): CityInspectorViewModel | null {
  const city = state.cities.get(cityId as never);
  if (!city) {
    return null;
  }

  const faction = state.factions.get(city.factionId);
  const economy = deriveResourceIncome(state, city.factionId, registry);
  const exhaustion = state.warExhaustion.get(city.factionId);
  const isFriendly = city.factionId === state.activeFactionId;
  const canManageProduction = isFriendly && !city.besieged;
  const cityCount = Math.max(1, getFactionCityIds(state, city.factionId).length);
  const perTurnIncome = Number((economy.productionPool / cityCount).toFixed(2));
  const readiness = getVillageSpawnReadinessWithRegistry(state, city.id as never, registry);
  const currentItem = city.currentProduction
    ? state.prototypes.get(city.currentProduction.item.id as never)
    : null;
  const currentCostType = city.currentProduction?.costType ?? city.currentProduction?.item.costType ?? 'production';
  const currentVillageCount = faction?.villageIds.length ?? 0;
  const currentProgress = city.currentProduction
    ? currentCostType === 'villages'
      ? Math.min(city.currentProduction.cost, currentVillageCount)
      : Number(city.currentProduction.progress.toFixed(2))
    : 0;
  const currentRemaining = city.currentProduction
    ? currentCostType === 'villages'
      ? Math.max(0, city.currentProduction.cost - currentVillageCount)
      : Number(Math.max(0, city.currentProduction.cost - city.currentProduction.progress).toFixed(2))
    : 0;

  return {
    cityId: city.id,
    cityName: city.name,
    factionId: city.factionId,
    factionName: faction?.name ?? city.factionId,
    isFriendly,
    isActiveFaction: city.factionId === state.activeFactionId,
    canManageProduction,
    production: {
      status: city.currentProduction ? 'producing' : 'idle',
      current: city.currentProduction ? (() => {
        const baseCost = currentItem ? getUnitCost(currentItem.chassisId) : undefined;
        let costModifier: number | undefined;
        let costModifierReason: string | undefined;
        if (currentItem && faction && isUnlockPrototype(currentItem) && currentCostType === 'production') {
          const domainIds = getDomainIdsByTags(currentItem.tags ?? []);
          const maxModifier = domainIds.reduce((max: number, d: string) => Math.max(max, getPrototypeCostModifier(faction, d)), 1.0);
          if (maxModifier > 1.0) {
            costModifier = maxModifier;
            costModifierReason = maxModifier >= 2.0 ? 'Culture Shock' : 'Integrating';
          }
        }
        return {
          id: city.currentProduction!.item.id,
          name: currentItem?.name ?? city.currentProduction!.item.id,
          type: city.currentProduction!.item.type,
          cost: city.currentProduction!.cost,
          costType: currentCostType,
          costLabel: currentCostType === 'villages'
            ? `${city.currentProduction!.cost} villages`
            : `${city.currentProduction!.cost} production`,
          baseCost: costModifier ? baseCost : undefined,
          costModifier,
          costModifierReason,
          progress: currentProgress,
          remaining: currentRemaining,
          turnsRemaining: currentCostType === 'villages'
            ? null
            : perTurnIncome > 0
              ? Math.ceil(Math.max(0, city.currentProduction!.cost - city.currentProduction!.progress) / perTurnIncome)
              : null,
        };
      })() : null,
      queue: city.productionQueue.map((item) => {
        const prototype = state.prototypes.get(item.id as never);
        const costType = item.costType ?? 'production';
        let baseCost: number | undefined;
        let costModifier: number | undefined;
        let costModifierReason: string | undefined;
        if (prototype && faction && isUnlockPrototype(prototype) && costType === 'production') {
          const rawBase = getUnitCost(prototype.chassisId);
          const domainIds = getDomainIdsByTags(prototype.tags ?? []);
          const maxModifier = domainIds.reduce((max: number, d: string) => Math.max(max, getPrototypeCostModifier(faction, d)), 1.0);
          if (maxModifier > 1.0) {
            baseCost = rawBase;
            costModifier = maxModifier;
            costModifierReason = maxModifier >= 2.0 ? 'Culture Shock' : 'Integrating';
          }
        }
        return {
          id: item.id,
          name: prototype?.name ?? item.id,
          type: item.type,
          cost: item.cost,
          costType,
          costLabel: costType === 'villages' ? `${item.cost} villages` : `${item.cost} production`,
          baseCost,
          costModifier,
          costModifierReason,
        };
      }),
      perTurnIncome,
    },
    productionOptions: (!faction ? [] : getAvailableProductionPrototypes(state, city.factionId, registry))
      .map((prototype) => {
        const costType = getPrototypeCostType(prototype);
        const baseRawCost = prototype.productionCost ?? getUnitCost(prototype.chassisId);
        let cost = prototype.productionCost ?? getPrototypeQueueCost(prototype);
        let baseCost: number | undefined;
        let costModifier: number | undefined;
        let costModifierReason: string | undefined;
        if (isUnlockPrototype(prototype) && costType === 'production' && faction) {
          const domainIds = getDomainIdsByTags(prototype.tags ?? []);
          const maxModifier = domainIds.reduce((max: number, d: string) => Math.max(max, getPrototypeCostModifier(faction, d)), 1.0);
          cost = calculatePrototypeCost(baseRawCost, faction, domainIds, prototype);
          if (maxModifier > 1.0) {
            baseCost = baseRawCost;
            costModifier = maxModifier;
            costModifierReason = maxModifier >= 2.0 ? 'Culture Shock' : 'Integrating';
          }
        }
        const villageCount = faction?.villageIds.length ?? 0;
        const disabledReason = !canManageProduction
          ? city.besieged
            ? 'Cannot change production while besieged.'
            : 'Only the active friendly city can change production.'
          : costType === 'villages' && !canPaySettlerVillageCost(state, city.factionId, SETTLER_VILLAGE_COST)
            ? `Requires ${SETTLER_VILLAGE_COST} villages (${villageCount} available).`
            : undefined;
        return {
          prototypeId: prototype.id,
          name: prototype.name,
          cost,
          costType,
          costLabel: costType === 'villages' ? `${cost} villages` : `${cost} production`,
          baseCost,
          costModifier,
          costModifierReason,
          chassisId: prototype.chassisId,
          supplyCost: getUnitSupplyCost(prototype, registry),
          isPrototype: isUnlockPrototype(prototype),
          attack: prototype.derivedStats.attack,
          defense: prototype.derivedStats.defense,
          hp: prototype.derivedStats.hp,
          moves: prototype.derivedStats.moves,
          range: prototype.derivedStats.range,
          disabled: disabledReason !== undefined,
          disabledReason,
        };
      }),
    supply: {
      income: economy.supplyIncome,
      used: economy.supplyDemand,
      demand: economy.supplyDemand,
      balance: Number((economy.supplyIncome - economy.supplyDemand).toFixed(2)),
      deficit: getSupplyDeficit(economy),
    },
    turnsUntilNextVillage: readiness.roundsUntilCooldownReady,
    exhaustion: {
      points: exhaustion?.exhaustionPoints ?? 0,
      productionPenalty: calculateProductionPenalty(exhaustion?.exhaustionPoints ?? 0),
      moralePenalty: calculateMoralePenalty(exhaustion?.exhaustionPoints ?? 0),
    },
    villageReadiness: {
      eligible: readiness.eligible,
      latestVillageRound: readiness.latestVillageRound ?? 0,
      checklist: [
        {
          key: 'city',
          label: 'City can host villages',
          met: readiness.cityExists,
        },
        {
          key: 'cooldown',
          label: 'Village cooldown ready',
          met: readiness.cooldownMet,
          detail: readiness.cooldownMet ? undefined : `${readiness.roundsUntilCooldownReady} round(s) remaining`,
        },
        {
          key: 'hex',
          label: 'Valid spawn hex available',
          met: readiness.validSpawnHex,
        },
      ],
    },
    siteBonuses: buildSettlementBonusSummary(getCitySiteBonuses(city, state.map)),
    walls: {
      wallHp: city.wallHP,
      maxWallHp: city.maxWallHP,
      besieged: city.besieged,
    },
    captureRamp: (() => {
      if (city.turnsSinceCapture === undefined) {
        return undefined;
      }
      const rampMultiplier = getCaptureRampMultiplier(city.turnsSinceCapture);
      if (rampMultiplier >= 1) {
        return undefined;
      }
      const turnsUntilOutput = rampMultiplier <= 0
        ? CAPTURE_RAMP_TURNS - city.turnsSinceCapture + 1
        : 0;
      const turnsUntilFull = rampMultiplier < 1
        ? CAPTURE_RAMP_TURNS * 2 - city.turnsSinceCapture
        : 0;
      return {
        turnsSinceCapture: city.turnsSinceCapture,
        rampMultiplier,
        turnsUntilOutput: Math.max(0, turnsUntilOutput),
        turnsUntilFull: Math.max(0, turnsUntilFull),
      };
    })(),
  };
}

export function buildSettlementBonusSummary(bonuses: CitySiteBonuses): SettlementBonusSummaryViewModel {
  return {
    productionBonus: bonuses.productionBonus,
    supplyBonus: bonuses.supplyBonus,
    villageCooldownReduction: bonuses.villageCooldownReduction,
    researchBonus: bonuses.researchBonus,
    traits: bonuses.traits.map((trait: CitySiteTrait) => ({ ...trait })),
  };
}

export function buildSettlementPreview(
  state: GameState,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
): SettlementPreviewViewModel | null {
  if (!state.map || selected?.type !== 'unit') {
    return null;
  }

  const unit = state.units.get(selected.unitId as never);
  const prototype = unit ? state.prototypes.get(unit.prototypeId as never) : null;
  if (!unit || !prototype?.tags?.includes('settler')) {
    return null;
  }

  const currentKey = hexToKey(unit.position);
  const reachableKeys = new Set(world.overlays.reachableHexes.map((entry: { key: string }) => entry.key));
  const previewKey = hoveredKey && (hoveredKey === currentKey || reachableKeys.has(hoveredKey))
    ? hoveredKey
    : currentKey;
  const previewTile = state.map.tiles.get(previewKey);
  if (!previewTile) {
    return null;
  }

  const position = { q: previewTile.position.q, r: previewTile.position.r };
  const bonuses = evaluateCitySiteBonuses(state.map, position, 2);
  const requiresMove = previewKey !== currentKey;
  const blocker = getSettlementOccupancyBlocker(state, position);
  const tooCloseToCity = Array.from(state.cities.values())
    .some(city => hexDistance(position, city.position) < 3);
  const unitCanFoundNow = unit.factionId === state.activeFactionId
    && unit.status === 'ready'
    && unit.movesRemaining === unit.maxMoves;
  const canFoundNow = !requiresMove && unitCanFoundNow && !blocker && !tooCloseToCity;

  let blockedReason: string | undefined;
  if (requiresMove) {
    blockedReason = 'Move the settler here to found a city.';
  } else if (blocker) {
    blockedReason = formatSettlementOccupancyBlocker(blocker);
  } else if (tooCloseToCity) {
    blockedReason = 'Too close to an existing city (minimum 3 hex spacing).';
  } else if (unit.factionId !== state.activeFactionId) {
    blockedReason = 'Only the active faction can found a city.';
  } else if (unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
    blockedReason = 'Settlers need full moves to found a city.';
  }

  return {
    q: position.q,
    r: position.r,
    terrain: previewTile.terrain,
    canFoundNow,
    requiresMove,
    blockedReason,
    ...buildSettlementBonusSummary(bonuses),
  };
}
