import { getDirectionIndex, hexDistance, hexToKey } from '../../core/grid.js';
import type { GameState, Unit } from '../../game/types.js';
import type { FactionId, HexCoord, UnitId } from '../../types.js';
import { getTerrainAt as getAbilityTerrainAt, hasAdjacentEnemy } from '../abilitySystem.js';

export function getTerrainAt(state: GameState, pos: HexCoord): string {
  return getAbilityTerrainAt(state, pos);
}

export function describeCombatOutcome(result: {
  defenderDestroyed: boolean;
  attackerDestroyed: boolean;
  defenderFled: boolean;
  attackerFled: boolean;
  defenderRouted: boolean;
  attackerRouted: boolean;
}): string {
  if (result.defenderDestroyed) return 'Defender destroyed';
  if (result.attackerDestroyed) return 'Attacker destroyed';
  if (result.defenderFled) return 'Defender fled';
  if (result.defenderRouted) return 'Defender routed';
  if (result.attackerFled) return 'Attacker fled';
  if (result.attackerRouted) return 'Attacker routed';
  return 'Exchange';
}

export function formatCombatSummary(
  attackerName: string,
  defenderName: string,
  defenderDamage: number,
  attackerDamage: number,
  outcome: string,
  effects: import('./types.js').TraceCombatEffect[]
): string {
  const highlights = effects.slice(0, 3).map((effect) => effect.label.toLowerCase());
  const highlightText = highlights.length > 0 ? `; ${highlights.join(', ')}` : '';
  return `${attackerName} dealt ${defenderDamage}, took ${attackerDamage}. ${outcome}${highlightText}.`;
}

export function rotateUnitToward(unit: Unit, target: HexCoord): Unit {
  const facing = getDirectionIndex(unit.position, target);
  if (facing === null) {
    return unit;
  }
  return { ...unit, facing };
}

export function getImprovementBonus(state: GameState, pos: HexCoord): number {
  // Check improvements first (e.g. field forts)
  for (const [, improvement] of state.improvements) {
    if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
      return improvement.defenseBonus ?? 0;
    }
  }
  // Cities give +100% defense
  for (const [, city] of state.cities) {
    if (city.position.q === pos.q && city.position.r === pos.r) {
      return 1;
    }
  }
  // Villages give +50% defense
  for (const [, village] of state.villages) {
    if (village.position.q === pos.q && village.position.r === pos.r) {
      return 0.5;
    }
  }
  return 0;
}

export function getImprovementAtHex(state: GameState, pos: HexCoord) {
  for (const [, improvement] of state.improvements) {
    if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
      return improvement;
    }
  }
  return null;
}

export function isFortificationHex(state: GameState, pos: HexCoord): boolean {
  return getImprovementAtHex(state, pos)?.type === 'fortification';
}

export function countFriendlyUnitsNearHex(
  state: GameState,
  factionId: FactionId,
  pos: HexCoord,
  radius: number,
  excludedUnitId?: UnitId,
): number {
  let count = 0;
  for (const unit of state.units.values()) {
    if (unit.hp <= 0 || unit.factionId !== factionId) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    if (hexDistance(pos, unit.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

export function countEnemyUnitsNearHex(
  state: GameState,
  friendlyFactionId: FactionId,
  pos: HexCoord,
  radius: number,
  excludedUnitId?: UnitId,
): number {
  let count = 0;
  for (const unit of state.units.values()) {
    if (unit.hp <= 0 || unit.factionId === friendlyFactionId) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    if (hexDistance(pos, unit.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

export function countFortificationsNearHex(state: GameState, pos: HexCoord, radius: number): number {
  let count = 0;
  for (const improvement of state.improvements.values()) {
    if (improvement.type !== 'fortification') continue;
    if (hexDistance(pos, improvement.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

export function countUnitsNearHex(
  state: GameState,
  pos: HexCoord,
  radius: number,
  predicate: (unit: Unit) => boolean,
): number {
  let count = 0;
  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (!predicate(unit)) continue;
    if (hexDistance(pos, unit.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

export function getNearestFriendlyDistanceToHex(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord,
  excludedUnitId?: UnitId,
): number {
  let nearest = Infinity;
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    nearest = Math.min(nearest, hexDistance(unit.position, hex));
  }
  return nearest === Infinity ? 99 : nearest;
}

export function countNearbyUnitPressure(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord,
  excludedUnitId?: UnitId,
): { nearbyEnemies: number; nearbyFriendlies: number } {
  let nearbyEnemies = 0;
  let nearbyFriendlies = 0;

  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    if (hexDistance(hex, unit.position) > 2) continue;

    if (unit.factionId === factionId) {
      nearbyFriendlies += 1;
    } else {
      nearbyEnemies += 1;
    }
  }

  return { nearbyEnemies, nearbyFriendlies };
}

export function getAliveFactions(state: GameState): Set<FactionId> {
  const factionsWithUnits = new Set(
    Array.from(state.units.values())
      .filter((u) => u.hp > 0)
      .map((unit) => unit.factionId)
  );
  const factionsWithCities = new Set(
    Array.from(state.cities.values())
      .filter((city) => !city.besieged)
      .map((city) => city.factionId)
  );

  return new Set([...factionsWithUnits, ...factionsWithCities]);
}

export function removeUnitFromFaction(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId
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

export function setUnitActivated(state: GameState, unitId: UnitId): GameState {
  const unit = state.units.get(unitId);
  if (!unit) {
    return state;
  }

  const units = new Map(state.units);
  units.set(unitId, {
    ...unit,
    activatedThisRound: true,
    status: 'spent',
  });

  return { ...state, units };
}

export function mapAssignmentToIntent(intent: import('../factionStrategy.js').UnitStrategicIntent): import('./types.js').TraceAiIntentEvent['intent'] {
  if (intent.assignment === 'recovery') return 'retreat';
  if (intent.assignment === 'defender' || intent.assignment === 'reserve') return 'regroup';
  if (intent.assignment === 'siege_force') return 'siege';
  if (intent.assignment === 'raider') return 'support';
  return 'advance';
}
