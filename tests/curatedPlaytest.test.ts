import { deserializeGameState } from '../web/src/game/types/playState';
import { createCuratedPlaytestPayload } from '../web/src/game/fixtures/curatedPlaytest';

describe('curated playtest payload', () => {
  it('contains only druid and steppe factions', () => {
    const state = deserializeGameState(createCuratedPlaytestPayload());

    expect(Array.from(state.factions.keys())).toEqual(['druid_circle', 'steppe_clan']);
    expect(Array.from(state.villages.values())).toHaveLength(0);
    expect(Array.from(state.improvements.values())).toHaveLength(0);
  });

  it('positions the curated opening around the central frontline', () => {
    const state = deserializeGameState(createCuratedPlaytestPayload());
    const units = Array.from(state.units.values());

    expect(units).toHaveLength(4);
    expect(units.some((unit) => unit.factionId === 'druid_circle' && unit.position.q === 10 && unit.position.r === 10)).toBe(true);
    expect(units.some((unit) => unit.factionId === 'steppe_clan' && unit.position.q === 13 && unit.position.r === 10)).toBe(true);

    const druidCity = Array.from(state.cities.values()).find((city) => city.factionId === 'druid_circle');
    const steppeCity = Array.from(state.cities.values()).find((city) => city.factionId === 'steppe_clan');
    expect(druidCity?.name).toBe('Elder Grove');
    expect(steppeCity?.name).toBe('Windscar Camp');
  });
});
