import { getDestroyedPlayerVillages } from '../web/src/app/audio/sfxManager';

function makePlayState(options: {
  villages: Array<{ id: string; factionId: string; name: string }>;
  playerFactionId?: string | null;
  lastSettlerVillageSpend?: { factionId: string; villageIds: string[] } | null;
}) {
  return {
    mode: 'play',
    world: {
      cities: [],
      units: [],
      villages: options.villages,
    },
    playFeedback: {
      eventSequence: 0,
      moveCount: 0,
      endTurnCount: 0,
      isDirty: false,
      playerFactionId: options.playerFactionId ?? 'alpha',
      lastMove: null,
      lastTurnChange: null,
      lastSacrifice: null,
      lastLearnedDomain: null,
      lastResearchCompletion: null,
      hitAndRunRetreat: null,
      lastSettlerVillageSpend: options.lastSettlerVillageSpend ?? null,
      victory: null,
    },
  } as any;
}

describe('sfxManager village destruction feedback', () => {
  it('suppresses player village-loss alerts when villages were spent on settlers', () => {
    const prevState = makePlayState({
      villages: [
        { id: 'v1', factionId: 'alpha', name: 'Alpha Outpost' },
        { id: 'v2', factionId: 'alpha', name: 'Beta Outpost' },
      ],
    });
    const nextState = makePlayState({
      villages: [],
      lastSettlerVillageSpend: {
        factionId: 'alpha',
        villageIds: ['v1', 'v2'],
      },
    });

    expect(getDestroyedPlayerVillages(prevState, nextState)).toEqual([]);
  });

  it('still reports actual player village losses that were not spent on settlers', () => {
    const prevState = makePlayState({
      villages: [
        { id: 'v1', factionId: 'alpha', name: 'Alpha Outpost' },
        { id: 'v2', factionId: 'alpha', name: 'Beta Outpost' },
      ],
    });
    const nextState = makePlayState({
      villages: [{ id: 'v2', factionId: 'alpha', name: 'Beta Outpost' }],
      lastSettlerVillageSpend: {
        factionId: 'alpha',
        villageIds: ['v2'],
      },
    });

    expect(getDestroyedPlayerVillages(prevState, nextState)).toEqual(['Alpha Outpost']);
  });
});
