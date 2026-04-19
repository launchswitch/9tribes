import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { assemblePrototype } from '../src/design/assemblePrototype';
import { previewMove, canMoveTo, moveUnit, getValidMoves } from '../src/systems/movementSystem';
import { hexToKey, getNeighbors } from '../src/core/grid';
import { createUnitId } from '../src/core/ids';

const registry = loadRulesRegistry();

function getFactionUnitByMovementClass(
  state: ReturnType<typeof buildMvpScenario>,
  factionId: string,
  movementClass: string,
) {
  const faction = state.factions.get(factionId as never)!;
  const unitId = faction.unitIds.find((candidateId) => {
    const unit = state.units.get(candidateId)!;
    const prototype = state.prototypes.get(unit.prototypeId)!;
    return registry.getChassis(prototype.chassisId)?.movementClass === movementClass;
  });

  if (unitId) return state.units.get(unitId)!;

  // No unit with that movement class — assemble one from the faction's city
  const chassisEntry = Array.from(registry.getAllChassis?.() ?? []).find(
    (c: any) => c.movementClass === movementClass,
  );
  if (!chassisEntry) {
    expect(unitId).toBeTruthy();
    return null as never;
  }
  const city = state.cities.get(faction.cityIds[0]!);
  const prototype = assemblePrototype(factionId as any, chassisEntry.id, [] as any, registry);
  state.prototypes.set(prototype.id, prototype);
  const unitId2 = createUnitId();
  const unit = {
    id: unitId2,
    factionId,
    position: city?.position ?? { q: 0, r: 0 },
    facing: 0,
    hp: prototype.derivedStats.hp,
    maxHp: prototype.derivedStats.hp,
    movesRemaining: prototype.derivedStats.moves,
    maxMoves: prototype.derivedStats.moves,
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green' as const,
    status: 'ready' as const,
    prototypeId: prototype.id,
    history: [],
    morale: 100,
    routed: false,
    poisoned: false,
    enteredZoCThisActivation: false,
    poisonStacks: 0,
    poisonTurnsRemaining: 0,
    isStealthed: false,
    turnsSinceStealthBreak: 0,
    learnedAbilities: [],
  };
  state.units.set(unitId2, unit);
  faction.unitIds.push(unitId2);
  return unit;
}

describe('movementSystem', () => {
  it('keeps foraging riders at 1-cost movement on open ground', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const cavalry = getFactionUnitByMovementClass(state, 'steppe_clan', 'cavalry');

    state.units = new Map([[cavalry.id, cavalry]]);
    state.cities = new Map();

    const targetHex = { q: cavalry.position.q + 1, r: cavalry.position.r };
    const tile = state.map!.tiles.get(hexToKey(targetHex));
    expect(tile).toBeTruthy();
    tile!.terrain = 'plains';

    const preview = previewMove(state, cavalry.id, targetHex, state.map!, registry);
    expect(preview?.totalCost).toBe(1);
  });

  it('allows river assault naval units to move through rivers at 0.5 cost', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const navalUnit = getFactionUnitByMovementClass(state, 'plains_riders', 'naval');

    state.units = new Map([[navalUnit.id, navalUnit]]);
    state.cities = new Map();

    const targetHex = { q: navalUnit.position.q - 1, r: navalUnit.position.r };
    const tile = state.map!.tiles.get(hexToKey(targetHex));
    expect(tile).toBeTruthy();
    tile!.terrain = 'river';

    const preview = previewMove(state, navalUnit.id, targetHex, state.map!, registry);
    expect(preview?.totalCost).toBe(0.5);
  });

  it('allows entry into swamp but consumes all remaining moves', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    // Get a 2-move infantry unit
    const unit = getFactionUnitByMovementClass(state, 'druid_circle', 'infantry');

    state.units = new Map([[unit.id, unit]]);
    state.cities = new Map();

    // Place a swamp tile adjacent to the unit
    const neighbors = getNeighbors(unit.position);
    const swampHex = neighbors[0];
    const tile = state.map!.tiles.get(hexToKey(swampHex));
    expect(tile).toBeTruthy();
    tile!.terrain = 'swamp';

    // Preview should show consumesAllMoves
    const preview = previewMove(state, unit.id, swampHex, state.map!, registry);
    expect(preview).not.toBeNull();
    expect(preview!.consumesAllMoves).toBe(true);

    // 2-move unit should be able to enter (consumesAllMoves bypasses cost check)
    expect(canMoveTo(state, unit.id, swampHex, state.map!, registry)).toBe(true);

    // After moving into swamp, all moves consumed
    const newState = moveUnit(state, unit.id, swampHex, state.map!, registry);
    const movedUnit = newState.units.get(unit.id)!;
    expect(movedUnit.movesRemaining).toBe(0);

    // No further moves possible from swamp
    const nextMoves = getValidMoves(newState, unit.id, newState.map!, registry);
    expect(nextMoves).toHaveLength(0);
  });

  it('blocks entry into swamp when unit has 0 moves remaining', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const unit = getFactionUnitByMovementClass(state, 'druid_circle', 'infantry');

    state.units = new Map([[unit.id, unit]]);
    state.cities = new Map();

    // Exhaust all moves
    unit.movesRemaining = 0;

    const neighbors = getNeighbors(unit.position);
    const swampHex = neighbors[0];
    const tile = state.map!.tiles.get(hexToKey(swampHex));
    expect(tile).toBeTruthy();
    tile!.terrain = 'swamp';

    expect(canMoveTo(state, unit.id, swampHex, state.map!, registry)).toBe(false);
  });
});
