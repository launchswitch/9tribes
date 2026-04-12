import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { canProducePrototype, getAvailableProductionPrototypes } from '../src/systems/productionSystem';

const registry = loadRulesRegistry();

describe('production progression', () => {
  it('steppe starts with mounted progression unlocked for fresh-game cavalry production', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = 'steppe_clan' as never;
    const faction = state.factions.get(factionId)!;
    const research = state.research.get(factionId)!;
    const cavalryPrototype = Array.from(state.prototypes.values()).find(
      (prototype) => prototype.factionId === factionId && prototype.chassisId === 'cavalry_frame',
    );

    // Fresh starts only learn the native domain plus explicit startingLearnedDomains.
    // Capability seeds do not auto-add learned domains or completed research nodes.
    expect(faction.learnedDomains).toEqual(expect.arrayContaining(['hitrun']));
    expect(faction.learnedDomains).not.toContain('charge');
    expect(research.completedNodes).toContain('hitrun_t1');
    expect(research.completedNodes).not.toContain('charge_t1');
    expect(cavalryPrototype).toBeTruthy();
    expect(canProducePrototype(state, factionId, cavalryPrototype!.id, registry)).toBe(true);
  });

  it('fresh starts with special roster units can build those same units on turn 1', () => {
    const state = buildMvpScenario(42, { registry });
    const expectations = [
      {
        factionId: 'steppe_clan',
        chassisId: 'cavalry_frame',
        learnedDomains: ['hitrun'] as string[],
        missingLearnedDomains: ['charge'] as string[],
        completedNode: 'hitrun_t1',
      },
      {
        factionId: 'desert_nomads',
        chassisId: 'camel_frame',
        learnedDomains: ['camel_adaptation'] as string[],
        missingLearnedDomains: ['charge'] as string[],
        completedNode: 'camel_adaptation_t1',
      },
      {
        factionId: 'plains_riders',
        chassisId: 'naval_frame',
        learnedDomains: ['river_stealth'] as string[],
        missingLearnedDomains: ['tidal_warfare'] as string[],
        completedNode: 'river_stealth_t1',
      },
    ] as const;

    for (const expectation of expectations) {
      const faction = state.factions.get(expectation.factionId as never)!;
      const research = state.research.get(expectation.factionId as never)!;
      const prototype = Array.from(state.prototypes.values()).find(
        (entry) => entry.factionId === expectation.factionId && entry.chassisId === expectation.chassisId,
      );

      expect(faction.learnedDomains).toEqual(expect.arrayContaining(expectation.learnedDomains));
      for (const missingDomain of expectation.missingLearnedDomains) {
        expect(faction.learnedDomains).not.toContain(missingDomain);
      }
      expect(research.completedNodes).toContain(expectation.completedNode);
      expect(prototype).toBeTruthy();
      expect(canProducePrototype(state, expectation.factionId as never, prototype!.id, registry)).toBe(true);
    }
  });

  it('does not use faction.prototypeIds as a build allow-list', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = 'steppe_clan' as never;
    const faction = state.factions.get(factionId)!;
    const cavalryPrototype = Array.from(state.prototypes.values()).find(
      (prototype) => prototype.factionId === factionId && prototype.chassisId === 'cavalry_frame',
    );

    expect(cavalryPrototype).toBeTruthy();
    state.factions.set(factionId, {
      ...faction,
      prototypeIds: faction.prototypeIds.filter((prototypeId) => prototypeId !== cavalryPrototype!.id),
    });

    expect(canProducePrototype(state, factionId, cavalryPrototype!.id, registry)).toBe(true);
    expect(getAvailableProductionPrototypes(state, factionId, registry).map((entry) => entry.id)).toContain(cavalryPrototype!.id);
  });
});
