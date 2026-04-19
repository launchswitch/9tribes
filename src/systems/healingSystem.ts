// Healing system — applies per-turn unit healing based on location, faction, and synergies
import type { GameState } from '../game/types.js';
import type { UnitId, FactionId } from '../types.js';
import type { Unit } from '../features/units/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { hexDistance, hexToKey, getNeighbors } from '../core/grid.js';
import { getHealingBonus } from './factionIdentitySystem.js';
import { getHexOwner } from './territorySystem.js';
import { getUnitAtHex } from './occupancySystem.js';
import { recoverMorale } from './moraleSystem.js';
import { resolveCapabilityDoctrine } from './capabilityDoctrine.js';
import {
  applyHealingSynergies,
  type HealingContext,
} from './synergyEffects.js';
import { getNatureHealingAura } from './signatureAbilitySystem.js';
import { SynergyEngine } from './synergyEngine.js';
import pairSynergiesData from '../content/base/pair-synergies.json' assert { type: 'json' };
import abilityDomainsData from '../content/base/ability-domains.json' assert { type: 'json' };
import emergentRulesData from '../content/base/emergent-rules.json' assert { type: 'json' };

const HEALING_CONFIG = {
  OWNED_TERRITORY: 0.10,
  CITY_GARRISON: 0.50,
  VILLAGE: 0.50,
  FIELD: 0.05,
} as const;

// Lazily initialized synergy engine (same pattern as warEcologySimulation)
let synergyEngine: SynergyEngine | null = null;
function getSynergyEngine(): SynergyEngine {
  if (!synergyEngine) {
    synergyEngine = new SynergyEngine(
      pairSynergiesData.pairSynergies as import('./synergyEngine.js').PairSynergyConfig[],
      emergentRulesData.rules as import('./synergyEngine.js').EmergentRuleConfig[],
      Object.values(abilityDomainsData.domains) as import('./synergyEngine.js').DomainConfig[],
    );
  }
  return synergyEngine;
}

function getTerrainAt(state: GameState, pos: { q: number; r: number }): string {
  return state.map?.tiles.get(hexToKey(pos))?.terrain ?? 'plains';
}

/** Determine base heal amount per turn based on unit location */
function getHealRate(
  unit: { position: { q: number; r: number }; maxHp: number },
  state: GameState,
  factionId: FactionId,
): number {
  const faction = state.factions.get(factionId);
  const terrainId = getTerrainAt(state, unit.position);

  // City healing
  for (const [, city] of state.cities) {
    if (city.factionId !== factionId) continue;
    if (city.besieged) continue;
    const dist = hexDistance(unit.position, city.position);
    if (dist === 0)
      return Math.floor(unit.maxHp * HEALING_CONFIG.CITY_GARRISON) + getHealingBonus(faction, terrainId);
    if (dist === 1) {
      const hexOwner = getHexOwner(unit.position, state);
      if (hexOwner === factionId)
        return Math.floor(unit.maxHp * HEALING_CONFIG.OWNED_TERRITORY) + getHealingBonus(faction, terrainId);
    }
  }

  // Village healing
  for (const [, village] of state.villages) {
    if (village.factionId !== factionId) continue;
    if (hexDistance(unit.position, village.position) === 0) {
      return Math.floor(unit.maxHp * HEALING_CONFIG.VILLAGE) + getHealingBonus(faction, terrainId);
    }
  }

  // Owned territory
  const hexOwner = getHexOwner(unit.position, state);
  if (hexOwner === factionId) {
    return Math.floor(unit.maxHp * HEALING_CONFIG.OWNED_TERRITORY) + getHealingBonus(faction, terrainId);
  }

  return Math.floor(unit.maxHp * HEALING_CONFIG.FIELD) + getHealingBonus(faction, terrainId);
}

/** Check if a unit stands on a friendly city or village */
function occupiesFriendlySettlement(state: GameState, unit: Unit): boolean {
  for (const city of state.cities.values()) {
    if (
      city.factionId === unit.factionId &&
      city.position.q === unit.position.q &&
      city.position.r === unit.position.r
    ) {
      return true;
    }
  }
  for (const village of state.villages.values()) {
    if (
      village.factionId === unit.factionId &&
      village.position.q === unit.position.q &&
      village.position.r === unit.position.r
    ) {
      return true;
    }
  }
  return false;
}

function hasFriendlyNatureHealingAura(
  state: GameState,
  factionId: FactionId,
  unit: Unit,
  radius: number,
): Unit | null {
  for (const [, neighborUnit] of state.units) {
    if (neighborUnit.id === unit.id || neighborUnit.factionId !== factionId || neighborUnit.hp <= 0) {
      continue;
    }
    if (hexDistance(unit.position, neighborUnit.position) > radius) {
      continue;
    }

    const neighborProto = state.prototypes.get(neighborUnit.prototypeId);
    const neighborTags = neighborProto?.tags ?? [];
    if (neighborTags.includes('druid') || neighborTags.includes('healing')) {
      return neighborUnit;
    }
  }

  return null;
}

/**
 * Apply healing for all units of a faction at turn end.
 * Handles: location-based rates, faction passive bonuses, synergy effects,
 * nature healing aura, withering reduction, morale recovery, poison cure in settlements.
 */
export function applyHealingForFaction(
  gameState: GameState,
  factionId: FactionId,
  _registry: RulesRegistry,
): GameState {
  const faction = gameState.factions.get(factionId);
  if (!faction) return gameState;
  const doctrine = resolveCapabilityDoctrine(gameState.research.get(factionId), faction);

  const unitsMap = new Map(gameState.units);
  let changed = false;

  for (const unitIdStr of faction.unitIds) {
    const unit = unitsMap.get(unitIdStr as UnitId);
    if (!unit || unit.hp <= 0) continue;

    // Base heal rate from location
    const terrainId = getTerrainAt(gameState, unit.position);
    let healRate = getHealRate(unit, gameState, factionId);
    healRate += doctrine.natureHealingRegenBonus;

    // Synergy healing effects
    const prototype = gameState.prototypes.get(unit.prototypeId);
    const tags = prototype?.tags ?? [];
    const engine = getSynergyEngine();
    const unitSynergies = engine.resolveUnitPairs(tags);

    const healingContext: HealingContext = {
      unitId: unitIdStr,
      unitTags: tags,
      baseHeal: healRate,
      position: unit.position as unknown as { x: number; y: number },
      adjacentAllies: [],
      isStealthed: unit.isStealthed,
    };

    const synergyHealRate = applyHealingSynergies(healingContext, unitSynergies);

    // Nature's Blessing aura for druid/healing-tagged units
    if (tags.includes('druid') || tags.includes('healing')) {
      healRate = Math.max(healRate, synergyHealRate);
    } else {
      // Non-healing units benefit from adjacent druid/healer allies
      const auraSource = hasFriendlyNatureHealingAura(
        gameState,
        factionId,
        unit,
        doctrine.healingAuraUpgradeEnabled ? 2 : 1,
      );
      if (auraSource) {
        const neighborProto = gameState.prototypes.get(auraSource.prototypeId);
        const neighborTags = neighborProto?.tags ?? [];
        const aura = getNatureHealingAura();
        healRate += aura.allyHeal;
        const neighborSynergies = engine.resolveUnitPairs(neighborTags);
        const neighborHealContext: HealingContext = {
          unitId: auraSource.id,
          unitTags: neighborTags,
          baseHeal: aura.allyHeal,
          position: auraSource.position as unknown as { x: number; y: number },
          adjacentAllies: [],
          isStealthed: auraSource.isStealthed,
        };
        const extendedHeal = applyHealingSynergies(neighborHealContext, neighborSynergies);
        healRate = Math.max(healRate, extendedHeal);
      }
    }

    // E1 — Anchor emergent: faction units gain healPerTurn bonus from the anchor aura
    const tripleStack = faction.activeTripleStack;
    if (tripleStack?.emergentRule.effect.type === 'zone_of_control') {
      const anchorEffect = tripleStack.emergentRule.effect as import('./synergyEngine.js').EmergentEffect & { type: 'zone_of_control' };
      healRate += anchorEffect.healPerTurn;
    }

    // Withering: nearby enemies reduce healing
    const healNeighbors = getNeighbors(unit.position);
    for (const hex of healNeighbors) {
      const neighborUnitId = getUnitAtHex(gameState, hex);
      if (neighborUnitId) {
        const neighborUnit = gameState.units.get(neighborUnitId);
        if (neighborUnit && neighborUnit.factionId !== factionId && neighborUnit.hp > 0) {
          const neighborProto = gameState.prototypes.get(neighborUnit.prototypeId);
          const neighborTags = neighborProto?.tags ?? [];
          const neighborSynergies = engine.resolveUnitPairs(neighborTags);
          for (const syn of neighborSynergies) {
            if (syn.effect.type === 'withering') {
              const reduction = (syn.effect as { healingReduction: number }).healingReduction;
              healRate = Math.floor(healRate * (1 - reduction));
              break;
            }
          }
        }
      }
    }

    const safeInSettlement = occupiesFriendlySettlement(gameState, unit);

    const refreshedUnit: Unit = {
      ...unit,
      hp: Math.min(unit.maxHp, unit.hp + healRate),
      morale: recoverMorale(unit),
      poisoned: safeInSettlement ? false : unit.poisoned,
      poisonStacks: safeInSettlement ? 0 : unit.poisonStacks,
      poisonTurnsRemaining: safeInSettlement ? 0 : unit.poisonTurnsRemaining,
    };

    unitsMap.set(unitIdStr as UnitId, refreshedUnit);
    changed = true;
  }

  return changed ? { ...gameState, units: unitsMap } : gameState;
}
