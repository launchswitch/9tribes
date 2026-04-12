import { assemblePrototype } from '../src/design/assemblePrototype';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { updateFogState } from '../src/systems/fogSystem';
import { boardTransport } from '../src/systems/transportSystem';
import { GameSession } from '../web/src/game/controller/GameSession';
import { buildWorldViewModel } from '../web/src/game/view-model/worldViewModel';

describe('worldViewModel play derivation', () => {
  it('includes active faction, reachable tiles, and unit action state', () => {
    const session = new GameSession({ type: 'fresh', seed: 42 });
    const state = session.getState();
    const activeUnit = Array.from(state.units.values()).find((unit) =>
      unit.factionId === state.activeFactionId && session.getLegalMoves(unit.id).length > 0,
    );

    expect(activeUnit).toBeTruthy();
    const legalMoves = session.getLegalMoves(activeUnit!.id);

    const world = buildWorldViewModel({
      kind: 'play',
      state,
      registry: session.getRegistry(),
      reachableHexes: legalMoves,
      pathPreview: legalMoves.length > 0
        ? [
            { key: `${activeUnit!.position.q},${activeUnit!.position.r}`, q: activeUnit!.position.q, r: activeUnit!.position.r, step: 0 },
            { key: legalMoves[0].key, q: legalMoves[0].q, r: legalMoves[0].r, step: 1 },
          ]
        : [],
    });

    expect(world.activeFactionId).toBe(state.activeFactionId);
    expect(world.overlays.reachableHexes).toHaveLength(legalMoves.length);

    const worldUnit = world.units.find((unit) => unit.id === activeUnit!.id);
    expect(worldUnit?.movesRemaining).toBe(activeUnit!.movesRemaining);
    expect(worldUnit?.isActiveFaction).toBe(true);
    expect(worldUnit?.acted).toBe(false);
  });

  it('marks a unit as acted once it is spent', () => {
    const session = new GameSession({ type: 'fresh', seed: 42 });
    const state = session.getState();
    const activeUnit = Array.from(state.units.values()).find((unit) =>
      unit.factionId === state.activeFactionId && session.getLegalMoves(unit.id).length > 0,
    );

    expect(activeUnit).toBeTruthy();
    const exhaustedState = {
      ...state,
      units: new Map(state.units).set(activeUnit!.id, {
        ...activeUnit!,
        movesRemaining: 0,
        status: 'spent',
      }),
    };
    const world = buildWorldViewModel({
      kind: 'play',
      state: exhaustedState,
      registry: session.getRegistry(),
      reachableHexes: [],
      pathPreview: [],
    });

    const exhaustedUnit = world.units.find((unit) => unit.id === activeUnit!.id);
    expect(exhaustedUnit?.acted).toBe(true);
  });

  it('exposes ambush affordances for playable units', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });

    const steppeFaction = state.factions.get('steppe_clan' as never)!;
    const druidFaction = state.factions.get('druid_circle' as never)!;
    const braceProto = assemblePrototype(
      steppeFaction.id,
      'infantry_frame' as never,
      ['basic_spear', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: steppeFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    const rangedProto = assemblePrototype(
      steppeFaction.id,
      'ranged_frame' as never,
      ['basic_bow', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: steppeFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(braceProto.id, braceProto);
    state.prototypes.set(rangedProto.id, rangedProto);

    const braceUnitId = 'world_brace_unit' as never;
    const ambushUnitId = 'world_ambush_unit' as never;
    const enemyId = druidFaction.unitIds[0];
    const braceBase = state.units.get(steppeFaction.unitIds[0] as never)!;
    const ambushBase = state.units.get(steppeFaction.unitIds[1] as never)!;

    state.map!.tiles.get('10,10')!.terrain = 'plains';
    state.map!.tiles.get('13,10')!.terrain = 'forest';
    state.units.set(braceUnitId as never, {
      ...braceBase,
      id: braceUnitId,
      prototypeId: braceProto.id,
      position: { q: 10, r: 10 },
      status: 'ready',
      attacksRemaining: 1,
      movesRemaining: braceProto.derivedStats.moves,
      maxMoves: braceProto.derivedStats.moves,
    });
    state.units.set(ambushUnitId, {
      ...ambushBase,
      id: ambushUnitId,
      prototypeId: rangedProto.id,
      position: { q: 13, r: 10 },
      status: 'ready',
      attacksRemaining: 1,
      movesRemaining: rangedProto.derivedStats.moves,
      maxMoves: rangedProto.derivedStats.moves,
    });
    state.units.set(enemyId as never, {
      ...state.units.get(enemyId as never)!,
      position: { q: 11, r: 10 },
      status: 'ready',
      attacksRemaining: 1,
      movesRemaining: state.units.get(enemyId as never)!.maxMoves,
    });
    state.factions.set(steppeFaction.id, {
      ...steppeFaction,
      unitIds: [braceUnitId, ambushUnitId],
    });
    state.factions.set(druidFaction.id, {
      ...druidFaction,
      unitIds: [enemyId],
    });
    state.activeFactionId = steppeFaction.id;

    const foggedState = updateFogState(updateFogState(state, steppeFaction.id), druidFaction.id);
    const world = buildWorldViewModel({
      kind: 'play',
      state: foggedState,
      registry,
      reachableHexes: [],
      attackHexes: [],
      pathPreview: [],
      lastMove: null,
    });

    expect(world.units.find((unit) => unit.id === ambushUnitId)?.canAmbush).toBe(true);
  });

  it('exposes boardable transports and valid disembark hexes', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const faction = state.factions.get('coral_people' as never)!;
    const transportProto = assemblePrototype(
      faction.id,
      'galley_frame' as never,
      ['slaver_net', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: faction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(transportProto.id, transportProto);

    const unitId = faction.unitIds[0];
    const unitBase = state.units.get(unitId as never)!;
    const transportId = 'world_transport' as never;
    state.map!.tiles.get('10,10')!.terrain = 'plains';
    state.map!.tiles.get('11,10')!.terrain = 'coast';
    state.map!.tiles.get('12,10')!.terrain = 'plains';
    state.units.set(unitId as never, {
      ...unitBase,
      position: { q: 10, r: 10 },
      status: 'ready',
      attacksRemaining: 1,
      movesRemaining: unitBase.maxMoves,
    });
    state.units.set(transportId, {
      ...unitBase,
      id: transportId,
      prototypeId: transportProto.id,
      position: { q: 11, r: 10 },
      hp: transportProto.derivedStats.hp,
      maxHp: transportProto.derivedStats.hp,
      status: 'ready',
      attacksRemaining: 1,
      movesRemaining: transportProto.derivedStats.moves,
      maxMoves: transportProto.derivedStats.moves,
    });
    state.factions.set(faction.id, {
      ...faction,
      unitIds: [unitId, transportId],
    });
    state.activeFactionId = faction.id;

    const preBoardWorld = buildWorldViewModel({
      kind: 'play',
      state,
      registry,
      reachableHexes: [],
      attackHexes: [],
      pathPreview: [],
      lastMove: null,
    });
    expect(preBoardWorld.units.find((unit) => unit.id === unitId)?.boardableTransportIds).toContain(transportId);

    const boarded = boardTransport(state, unitId as never, transportId, state.transportMap);
    const boardedState = {
      ...boarded.state,
      transportMap: boarded.transportMap,
    };
    const postBoardWorld = buildWorldViewModel({
      kind: 'play',
      state: boardedState,
      registry,
      reachableHexes: [],
      attackHexes: [],
      pathPreview: [],
      lastMove: null,
    });
    const embarkedUnit = postBoardWorld.units.find((unit) => unit.id === unitId);
    expect(embarkedUnit?.isEmbarked).toBe(true);
    expect(embarkedUnit?.transportId).toBe(transportId);
    expect(embarkedUnit?.validDisembarkHexes?.some((hex) => hex.q === 12 && hex.r === 10)).toBe(true);
  });
});
