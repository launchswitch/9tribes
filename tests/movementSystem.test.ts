import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewMove } from '../src/systems/movementSystem';
import { hexToKey } from '../src/core/grid';

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

  expect(unitId).toBeTruthy();
  return state.units.get(unitId!)!;
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
});
