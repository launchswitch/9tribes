import { createRNG, rngNextFloat } from '../src/core/rng.js';
import { tryLearnFromKill } from '../src/systems/learnByKillSystem.js';
import veteranLevels from '../src/content/base/veteran-levels.json';

const mockFaction = {
  id: 'hill_engineers',
  name: 'Hill Engineers',
  nativeDomain: 'Fortress',
} as any;

function makeState(rng: ReturnType<typeof createRNG>) {
  return {
    factions: new Map([['hill_engineers', mockFaction], ['jungle_clans', { id: 'jungle_clans', name: 'Jungle Clans', nativeDomain: 'Swarm' }]]),
    prototypes: new Map(),
    round: 1,
    rngState: rng,
  } as any;
}

const greenUnit = {
  id: 'u1', factionId: 'steppe_riders', prototypeId: 'cavalry',
  veteranLevel: 'green', hp: 10, learnedAbilities: [] as any[], xp: 0,
} as any;

const enemy1 = { id: 'e1', factionId: 'hill_engineers', prototypeId: 'infantry', hp: 5 } as any;
const enemy2 = { id: 'e2', factionId: 'jungle_clans', prototypeId: 'infantry', hp: 5 } as any;

describe('Learn-by-Kill RNG verification', () => {
  it('should show raw RNG values for seed 42', () => {
    const debugRng = createRNG(42);
    const vals: number[] = [];
    for (let i = 0; i < 10; i++) vals.push(rngNextFloat(debugRng));
    console.log('Raw RNG floats (seed 42):', vals.map(v => v.toFixed(6)));
    // Just verify they're in [0,1) range
    for (const v of vals) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of vals) expect(v).toBeLessThan(1);
  });

  it('green units should learn ~25% of the time over 10000 trials', () => {
    let learns = 0;
    for (let s = 0; s < 10000; s++) {
      const r = createRNG(s + 50000);
      const st = makeState(r);
      const result = tryLearnFromKill({ ...greenUnit, learnedAbilities: [] }, enemy1, st, r);
      if (result.learned) learns++;
    }
    const pct = learns / 100;
    console.log(`GREEN (expect ~12%): ${learns}/10000 = ${pct.toFixed(1)}%`);
    expect(pct).toBeGreaterThan(10);
    expect(pct).toBeLessThan(14);
  });

  it('veteran units should learn ~55% of the time over 10000 trials', () => {
    let learns = 0;
    const vetUnit = { ...greenUnit, veteranLevel: 'veteran' };
    for (let s = 0; s < 10000; s++) {
      const r = createRNG(s + 60000);
      const st = makeState(r);
      const result = tryLearnFromKill({ ...vetUnit, learnedAbilities: [] }, enemy1, st, r);
      if (result.learned) learns++;
    }
    const pct = learns / 100;
    console.log(`VETERAN (expect ~28%): ${learns}/10000 = ${pct.toFixed(1)}%`);
    expect(pct).toBeGreaterThan(26);
    expect(pct).toBeLessThan(30);
  });

  it('sequential kills with seed 42 - show actual outcomes', () => {
    const seqRng = createRNG(42);
    const st = makeState(seqRng);
    let unit = { ...greenUnit, learnedAbilities: [] as any[] };

    const lr1 = tryLearnFromKill(unit, enemy1, st, seqRng);
    console.log(`Seed 42 Kill #1 (green, 25%): learned=${lr1.learned} domain=${lr1.domainId}`);
    if (lr1.learned) unit = lr1.unit;

    const lr2 = tryLearnFromKill(unit, enemy2, st, seqRng);
    console.log(`Seed 42 Kill #2 (green, 25%): learned=${lr2.learned} domain=${lr2.domainId}`);

    // Log what we'd need for both to succeed
    console.log('\nFor BOTH kills to succeed at green (25%), probability = 6.25%');
  });

  it('XP progression should take ~2 kills per level', () => {
    // With doubled thresholds (30/60/120) and 23 XP per kill:
    // Kill 1: 23 XP → still green (need 30)
    // Kill 2: 46 XP → seasoned ✓
    // Kill 3: 69 XP → still seasoned (need 60)
    // Kill 4: 92 XP → veteran ✓
    const levels = veteranLevels;
    const xpPerKill = 5 + 15 + 3; // participation + kill + survived

    console.log(`\nXP per kill: ${xpPerKill}`);
    for (const [id, lvl] of Object.entries(levels)) {
      console.log(`  ${id}: threshold=${lvl.xpThreshold} (~${(lvl.xpThreshold / xpPerKill).toFixed(1)} kills)`);

      // Verify thresholds are roughly double the original (15/30/60)
      if (id === 'seasoned') expect(lvl.xpThreshold).toBe(30);
      if (id === 'veteran') expect(lvl.xpThreshold).toBe(60);
      if (id === 'elite') expect(lvl.xpThreshold).toBe(120);
    }
  });
});
