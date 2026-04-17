import type { City, Prototype, Unit } from '../../game/types.js';
import type { CityId, FactionId, HexCoord } from '../../types.js';
import type { UnitStrategicIntent } from '../factionStrategy.js';
import { hexDistance, hexToKey } from '../../core/grid.js';
import type { UnitWithPrototype } from './types.js';

export function compareUnitEntries(left: UnitWithPrototype, right: UnitWithPrototype): number {
  return compareUnits(left.unit, right.unit, undefined, left.prototype.name, right.prototype.name);
}

export function compareUnits(
  left: Unit | undefined,
  right: Unit | undefined,
  state?: import('../../game/types.js').GameState,
  leftName?: string,
  rightName?: string,
): number {
  if (!left || !right) return 0;
  const leftPrototypeName = leftName ?? state?.prototypes.get(left.prototypeId)?.name ?? '';
  const rightPrototypeName = rightName ?? state?.prototypes.get(right.prototypeId)?.name ?? '';
  return (
    left.factionId.localeCompare(right.factionId)
    || compareHexes(left.position, right.position)
    || leftPrototypeName.localeCompare(rightPrototypeName)
    || left.maxHp - right.maxHp
    || left.maxMoves - right.maxMoves
    || left.hp - right.hp
  );
}

export function compareHexes(left?: HexCoord, right?: HexCoord): number {
  if (!left || !right) return 0;
  return left.q - right.q || left.r - right.r;
}

export function nearestHex(origin: HexCoord, anchors: HexCoord[]): HexCoord | null {
  let best: HexCoord | null = null;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const dist = hexDistance(origin, anchor);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = anchor;
    }
  }
  return best;
}

export function dedupeHexes(hexes: HexCoord[]): HexCoord[] {
  const map = new Map<string, HexCoord>();
  for (const hex of hexes) {
    map.set(hexToKey(hex), hex);
  }
  return Array.from(map.values());
}

export function centroidHex(points: HexCoord[]): HexCoord {
  if (points.length === 0) return { q: 0, r: 0 };
  const q = Math.round(points.reduce((sum, point) => sum + point.q, 0) / points.length);
  const r = Math.round(points.reduce((sum, point) => sum + point.r, 0) / points.length);
  return { q, r };
}

export function nearestEnemySupportDistance(state: import('../../game/types.js').GameState, unit: Unit): number {
  let nearest = Infinity;
  for (const other of state.units.values()) {
    if (other.id === unit.id || other.factionId !== unit.factionId || other.hp <= 0) continue;
    nearest = Math.min(nearest, hexDistance(unit.position, other.position));
  }
  return nearest === Infinity ? 99 : nearest;
}

export function nearestFriendlyDistance(state: import('../../game/types.js').GameState, unit: Unit, factionId: FactionId): number {
  let nearest = Infinity;
  for (const other of state.units.values()) {
    if (other.id === unit.id || other.factionId !== factionId || other.hp <= 0) continue;
    nearest = Math.min(nearest, hexDistance(unit.position, other.position));
  }
  return nearest === Infinity ? 99 : nearest;
}

export function buildHomeDefenseIntent(
  currentIntent: UnitStrategicIntent | undefined,
  homeCity: City,
  reason: string,
  threatenedCityId?: CityId,
): UnitStrategicIntent {
  return {
    assignment: 'defender',
    waypointKind: 'friendly_city',
    waypoint: homeCity.position,
    objectiveCityId: homeCity.id,
    objectiveUnitId: undefined,
    anchor: homeCity.position,
    threatenedCityId: threatenedCityId ?? currentIntent?.threatenedCityId,
    isolationScore: currentIntent?.isolationScore ?? 0,
    isolated: false,
    reason,
  };
}

export function buildStagingHex(origin: HexCoord, destination: HexCoord): HexCoord {
  return {
    q: Math.round((origin.q * 2 + destination.q) / 3),
    r: Math.round((origin.r * 2 + destination.r) / 3),
  };
}

export function isAggressiveAssignment(assignment: import('../factionStrategy.js').UnitAssignment): boolean {
  return assignment === 'main_army' || assignment === 'raider' || assignment === 'siege_force';
}

export function isSkirmisherPrototype(prototype: Prototype | undefined): boolean {
  if (!prototype) return false;
  return prototype.derivedStats.role === 'mounted'
    || prototype.derivedStats.range > 1
    || prototype.derivedStats.moves >= 3;
}
