import replay from '../web/public/replays/mvp-seed-42.json';
import { GameController } from '../web/src/game/controller/GameController';
import { GameSession } from '../web/src/game/controller/GameSession';
import { createCuratedPlaytestPayload } from '../web/src/game/fixtures/curatedPlaytest';

describe('GameController', () => {
  it('routes replay actions to the replay timeline', () => {
    const controller = new GameController({ mode: 'replay', replay });

    controller.dispatch({ type: 'set_replay_turn', turnIndex: 1 });
    expect(controller.getState().turnIndex).toBe(1);

    controller.dispatch({ type: 'end_turn' });
    expect(controller.getState().turnIndex).toBe(2);
  });

  it('routes play actions to the live session', () => {
    const controller = new GameController({
      mode: 'play',
      session: new GameSession({ type: 'serialized', payload: createCuratedPlaytestPayload() }),
    });

    const initial = controller.getState();
    const unit = initial.world.units.find((entry) =>
      entry.isActiveFaction && initial.actions.legalMoves.length === 0
        ? false
        : entry.isActiveFaction && controller.getState().actions.selectedUnitId === null,
    ) ?? initial.world.units.find((entry) => entry.isActiveFaction && entry.canAct);

    expect(unit).toBeTruthy();
    controller.dispatch({ type: 'select_unit', unitId: unit!.id });

    const selected = controller.getState();
    expect(selected.actions.selectedUnitId).toBe(unit!.id);
    expect(selected.actions.legalMoves.length).toBeGreaterThan(0);

    const target = selected.actions.legalMoves[0];
    controller.dispatch({
      type: 'move_unit',
      unitId: unit!.id,
      destination: { q: target.q, r: target.r },
    });

    const afterMove = controller.getState();
    const movedUnit = afterMove.world.units.find((entry) => entry.id === unit!.id);
    expect(movedUnit?.q).toBe(target.q);
    expect(movedUnit?.r).toBe(target.r);

    const activeFactionBeforeEndTurn = afterMove.activeFactionId;
    controller.dispatch({ type: 'end_turn' });
    expect(controller.getState().activeFactionId).not.toBe(activeFactionBeforeEndTurn);
  });

  it('uses the curated two-faction slice for playtesting', () => {
    const controller = new GameController({
      mode: 'play',
      session: new GameSession({ type: 'serialized', payload: createCuratedPlaytestPayload() }),
    });

    const state = controller.getState();
    expect(state.world.factions.map((faction) => faction.id)).toEqual(['druid_circle', 'steppe_clan']);
    expect(state.world.units).toHaveLength(4);
  });
});
