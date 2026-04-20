import type { GameState, Unit } from '../../game/types.js';
import type { FactionId, HexCoord, PrototypeId, UnitId } from '../../types.js';
import { hexToKey, hexDistance, getNeighbors } from '../../core/grid.js';
import { resolveResearchDoctrine } from '../capabilityDoctrine.js';
import { getHealingBonus } from '../factionIdentitySystem.js';
import { getHexOwner } from '../territorySystem.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { pruneDeadUnits } from '../combatActionSystem.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { SimulationTrace } from './traceTypes.js';
import { log } from './traceRecorder.js';

export const HEALING_CONFIG = {
  OWNED_TERRITORY: 0.10,
  CITY_GARRISON: 0.50,
  VILLAGE: 0.50,
  FIELD: 0.05,
} as const;

export function getHealRate(unit: { position: HexCoord; maxHp: number }, state: GameState, factionId: FactionId): number {
  const faction = state.factions.get(factionId);
  const terrainId = getTerrainAt(state, unit.position);

  for (const [, city] of state.cities) {
    if (city.factionId !== factionId) continue;
    if (city.besieged) continue;
    const dist = hexDistance(unit.position, city.position);
    if (dist === 0) return Math.floor(unit.maxHp * HEALING_CONFIG.CITY_GARRISON) + getHealingBonus(faction, terrainId);
    if (dist === 1) {
      const hexOwner = getHexOwner(unit.position, state);
      if (hexOwner === factionId) return Math.floor(unit.maxHp * HEALING_CONFIG.OWNED_TERRITORY) + getHealingBonus(faction, terrainId);
    }
  }

  for (const [, village] of state.villages) {
    if (village.factionId !== factionId) continue;
    if (hexDistance(unit.position, village.position) === 0) {
      return Math.floor(unit.maxHp * HEALING_CONFIG.VILLAGE) + getHealingBonus(faction, terrainId);
    }
  }

  const hexOwner = getHexOwner(unit.position, state);
  if (hexOwner === factionId) {
    return Math.floor(unit.maxHp * HEALING_CONFIG.OWNED_TERRITORY) + getHealingBonus(faction, terrainId);
  }

  return Math.floor(unit.maxHp * HEALING_CONFIG.FIELD) + getHealingBonus(faction, terrainId);
}

export function getTerrainAt(state: GameState, pos: HexCoord): string {
  return state.map?.tiles.get(hexToKey(pos))?.terrain ?? 'plains';
}

export function occupiesFriendlySettlement(state: GameState, unit: Unit): boolean {
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

function isJungleImmune(state: GameState, unit: Unit): boolean {
  const faction = state.factions.get(unit.factionId);
  return faction?.identityProfile.passiveTrait === 'jungle_stalkers';
}

function canInflictPoison(state: GameState, unit: Unit): boolean {
  const prototype = state.prototypes.get(unit.prototypeId);
  return Boolean(prototype?.tags?.includes('poison'));
}

export function applyEnvironmentalDamage(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return state;
  }

  const units = new Map(state.units);
  let current = state;
  const factionResearch = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(factionResearch, faction);

  for (const unitId of faction.unitIds) {
    const unit = units.get(unitId);
    if (!unit || unit.hp <= 0) {
      continue;
    }

    const safeInSettlement = occupiesFriendlySettlement(current, unit);
    let updatedUnit = unit;
    let died = false;

    if (unit.poisoned && safeInSettlement) {
      updatedUnit = { ...updatedUnit, poisoned: false, poisonedBy: undefined, poisonSourcePrototypeId: undefined, poisonStacks: 0, poisonTurnsRemaining: 0 };
    }

    if (unit.poisoned && !safeInSettlement) {
      // Serpent God (serpent_frame) deals 3 poison dmg/turn; other jungle units use faction's venomDamagePerTurn
      const isSerpentGod = unit.poisonSourcePrototypeId
        && current.prototypes.get(unit.poisonSourcePrototypeId as PrototypeId)?.chassisId === 'serpent_frame';
      const basePoisonDamage = unit.poisonStacks > 0 ? unit.poisonStacks * doctrine.poisonDamagePerStack : (
        isSerpentGod
          ? 3
          : unit.poisonedBy
            ? registry.getSignatureAbility(unit.poisonedBy)?.venomDamagePerTurn ?? 1
            : 1
      );
      const poisonDamage = doctrine.poisonBonusEnabled ? Math.round(basePoisonDamage * 1.5) : basePoisonDamage;
      updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - poisonDamage) };
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers poison (${poisonDamage} dmg, ${unit.poisonStacks} stacks)`);

      // Decrement poison duration (unless persistence enabled via venom_t1)
      if (!doctrine.poisonPersistenceEnabled) {
        const remaining = (updatedUnit.poisonTurnsRemaining ?? 1) - 1;
        if (remaining <= 0) {
          updatedUnit = { ...updatedUnit, poisoned: false, poisonedBy: undefined, poisonSourcePrototypeId: undefined, poisonStacks: 0, poisonTurnsRemaining: 0 };
        } else {
          updatedUnit = { ...updatedUnit, poisonTurnsRemaining: remaining };
        }
      }

      died = updatedUnit.hp <= 0;
    }

    const terrainId = getTerrainAt(current, unit.position);
    if (!died && terrainId === 'jungle' && !safeInSettlement && !isJungleImmune(current, updatedUnit)) {
      updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - 1) };
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers jungle attrition`);
      died = updatedUnit.hp <= 0;
    }

    if (!died && !safeInSettlement && current.contaminatedHexes.has(hexToKey(unit.position))) {
      updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - 1) };
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers contamination (1 dmg)`);
      died = updatedUnit.hp <= 0;
    }

    if (!died && updatedUnit.frozen && (updatedUnit.frostbiteDoTDuration ?? 0) > 0 && (updatedUnit.frostbiteStacks ?? 0) > 0) {
      updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - (updatedUnit.frostbiteStacks ?? 0)) };
      const newDuration = (updatedUnit.frostbiteDoTDuration ?? 0) - 1;
      if (newDuration <= 0) {
        updatedUnit = { ...updatedUnit, frozen: false, frostbiteStacks: 0, frostbiteDoTDuration: 0 };
      } else {
        updatedUnit = { ...updatedUnit, frostbiteDoTDuration: newDuration };
      }
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers frostbite (${updatedUnit.frostbiteStacks ?? 0} dmg)`);
      died = updatedUnit.hp <= 0;
    }

    if (died) {
      units.delete(unitId);
      current = removeUnitFromFaction({ ...current, units }, factionId, unitId);
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} succumbed to attrition`);
      continue;
    }

    units.set(unitId, updatedUnit);
  }

  if (doctrine.toxicBulwarkEnabled) {
    for (const unitIdStr of faction.unitIds) {
      const bulwarkUnit = units.get(unitIdStr as UnitId);
      if (!bulwarkUnit || bulwarkUnit.hp <= 0) continue;
      for (const neighbor of getNeighbors(bulwarkUnit.position)) {
        const neighborId = getUnitAtHex({ ...current, units }, neighbor);
        if (!neighborId) continue;
        const neighborUnit = units.get(neighborId) ?? current.units.get(neighborId);
        if (!neighborUnit || neighborUnit.factionId === factionId || neighborUnit.hp <= 0) continue;
        units.set(neighborId, {
          ...neighborUnit,
          hp: Math.max(0, neighborUnit.hp - 1),
        });
      }
    }
  }

  return pruneDeadUnits({ ...current, units });
}

function removeUnitFromFaction(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return state;
  }

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    unitIds: faction.unitIds.filter((id) => id !== unitId),
  });

  return { ...state, factions };
}
