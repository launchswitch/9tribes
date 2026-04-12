import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { evaluateBalanceRequest } from '../src/balance/evaluate';
import { scoreBalanceSummary } from '../src/balance/objective';
import type { BatchBalanceSummary } from '../src/systems/balanceHarness';
import type { BalanceOverrides } from '../src/balance/types';

const repoRoot = process.cwd();
const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function runCommand(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, {
    cwd: repoRoot,
    input,
    encoding: 'utf8',
  });
}

function findPythonCommand(): string | null {
  for (const candidate of ['python', 'py']) {
    try {
      execFileSync(candidate, ['--version'], { cwd: repoRoot, stdio: 'ignore' });
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

describe('balance optimization overrides', () => {
  it('applies terrain, chassis, and component overrides without mutating defaults', () => {
    const overrides: BalanceOverrides = {
      terrainYields: {
        desert: { productionYield: 0.9 },
      },
      chassis: {
        cavalry_frame: { baseHp: 12, baseMoves: 5 },
      },
      components: {
        basic_spear: { attackBonus: 4 },
      },
    };

    const baseline = loadRulesRegistry();
    const overridden = loadRulesRegistry(overrides);

    expect(baseline.getTerrainYield('desert')?.productionYield).not.toBe(0.9);
    expect(overridden.getTerrainYield('desert')?.productionYield).toBe(0.9);
    expect(overridden.getChassis('cavalry_frame')?.baseHp).toBe(12);
    expect(overridden.getChassis('cavalry_frame')?.baseMoves).toBe(5);
    expect(overridden.getComponent('basic_spear')?.attackBonus).toBe(4);
  });

  it('applies faction capability seed and scenario size overrides through scenario construction', () => {
    const overrides: BalanceOverrides = {
      factions: {
        steppe_clan: {
          capabilitySeeds: { horsemanship: 5.5 },
        },
      },
      scenario: {
        mapWidth: 18,
        mapHeight: 12,
      },
    };

    const registry = loadRulesRegistry(overrides);
    const state = buildMvpScenario(42, { registry, balanceOverrides: overrides, rerollCap: 20 });

    expect(state.map?.width).toBe(18);
    expect(state.map?.height).toBe(12);
    expect(state.factions.get('steppe_clan' as never)?.capabilities?.domainLevels.horsemanship).toBe(5.5);
  });

  it('rejects unknown override keys', () => {
    expect(() => loadRulesRegistry({
      chassis: {
        cavalry_frame: {
          nonsense: 1,
        } as never,
      },
    })).toThrow(/Unknown chassis\.cavalry_frame key "nonsense"/);
  });
});

describe('balance evaluation', () => {
  it('produces deterministic objective scores for identical overrides', () => {
    const request = {
      overrides: {
        terrainYields: {
          jungle: { productionYield: 0.8 },
          coast: { productionYield: 0.7 },
        },
      },
      seeds: [11, 23],
      maxTurns: 10,
    };

    const first = evaluateBalanceRequest(request);
    const second = evaluateBalanceRequest(request);

    expect(first.summary).toEqual(second.summary);
    expect(first.objective).toEqual(second.objective);
  });

  it('penalizes zero-win and inactive summaries harder than healthy ones', () => {
    const healthy: BatchBalanceSummary = {
      seeds: [1, 2, 3, 4],
      maxTurns: 50,
      mapMode: 'fixed',
      totalSeeds: 4,
      decisiveGames: 3,
      unresolvedGames: 1,
      avgFinalRound: 41,
      avgLivingUnits: 15,
      avgRoutedUnits: 2,
      avgTotalWarExhaustion: 7,
      totalBattles: 64,
      totalKills: 28,
      totalCityCaptures: 5,
      totalVillagesRazored: 4,
      totalSiegesStarted: 6,
      totalSiegeBreaks: 3,
      totalCodificationsStarted: 8,
      totalCodificationsCompleted: 5,
      totalPoisonTicks: 2,
      totalJungleAttrition: 3,
      totalVillageCaptures: 0,
      totalUnitCaptures: 0,
      mapArchetypes: { open_war: 4 },
      factions: {
        a: { factionId: 'a', wins: 1, avgLivingUnits: 4, avgCities: 1.5, avgVillages: 1, avgWarExhaustion: 1, avgCapabilityTotal: 6, avgUnlockedRecipes: 1, avgRoutedUnits: 0.5, avgSignatureUnits: 1, avgHomeTerrainUnits: 1.5, avgUnitComposition: { byChassis: {}, byRole: { melee: 2, ranged: 1, mounted: 1 } } },
        b: { factionId: 'b', wins: 1, avgLivingUnits: 4.2, avgCities: 1.3, avgVillages: 1.1, avgWarExhaustion: 1.1, avgCapabilityTotal: 6.2, avgUnlockedRecipes: 1, avgRoutedUnits: 0.6, avgSignatureUnits: 1, avgHomeTerrainUnits: 1.4, avgUnitComposition: { byChassis: {}, byRole: { melee: 2, mounted: 2 } } },
        c: { factionId: 'c', wins: 1, avgLivingUnits: 3.8, avgCities: 1.1, avgVillages: 1.2, avgWarExhaustion: 1.4, avgCapabilityTotal: 5.8, avgUnlockedRecipes: 1, avgRoutedUnits: 0.7, avgSignatureUnits: 0.8, avgHomeTerrainUnits: 1.2, avgUnitComposition: { byChassis: {}, byRole: { melee: 2, ranged: 1, mounted: 1 } } },
        d: { factionId: 'd', wins: 0, avgLivingUnits: 3.9, avgCities: 1.1, avgVillages: 0.9, avgWarExhaustion: 1.3, avgCapabilityTotal: 6.1, avgUnlockedRecipes: 1, avgRoutedUnits: 0.6, avgSignatureUnits: 0.8, avgHomeTerrainUnits: 1.1, avgUnitComposition: { byChassis: {}, byRole: { melee: 2, mounted: 1 } } },
      },
    };
    const unhealthy: BatchBalanceSummary = {
      ...healthy,
      decisiveGames: 0,
      unresolvedGames: 4,
      totalBattles: 4,
      totalKills: 0,
      totalSiegesStarted: 0,
      totalCodificationsCompleted: 0,
      factions: {
        ...healthy.factions,
        a: { ...healthy.factions.a, wins: 4, avgLivingUnits: 8, avgCities: 3 },
        b: { ...healthy.factions.b, wins: 0, avgLivingUnits: 1.5, avgCities: 0.2 },
        c: { ...healthy.factions.c, wins: 0, avgLivingUnits: 1.2, avgCities: 0.1 },
        d: { ...healthy.factions.d, wins: 0, avgLivingUnits: 1.1, avgCities: 0.1 },
      },
    };

    expect(scoreBalanceSummary(unhealthy).score).toBeGreaterThan(scoreBalanceSummary(healthy).score);
  });
});

describe('balance CLI', () => {
  it('evaluates JSON input and returns objective plus summary', () => {
    const output = runCommand(process.execPath, [tsxCli, 'scripts/evaluateBalance.ts'], JSON.stringify({
      overrides: {
        terrainYields: {
          desert: { productionYield: 0.85 },
        },
      },
      seeds: [11, 23],
      maxTurns: 8,
    }));
    const parsed = JSON.parse(output);

    expect(parsed.objective.score).toEqual(expect.any(Number));
    expect(parsed.summary.totalSeeds).toBe(2);
    expect(parsed.summary.maxTurns).toBe(8);
  });

  it('fails cleanly on malformed input', () => {
    expect(() => runCommand(process.execPath, [tsxCli, 'scripts/evaluateBalance.ts'], '{"bad":')).toThrow();
  });

  it('validates a candidate over a larger seed set', () => {
    const output = runCommand(process.execPath, [tsxCli, 'scripts/validateBalanceCandidate.ts', '--seeds', '11,23,37'], JSON.stringify({
      overrides: {
        terrainYields: {
          jungle: { productionYield: 0.75 },
        },
      },
      maxTurns: 8,
    }));
    const parsed = JSON.parse(output);

    expect(parsed.validationSeeds).toEqual([11, 23, 37]);
    expect(parsed.unresolvedRate.rate).toEqual(expect.any(Number));
    expect(parsed.factions.steppe_clan.winRate.low).toEqual(expect.any(Number));
  });
});

describe('optuna driver', () => {
  it('shows help without importing optuna eagerly', () => {
    const python = findPythonCommand();
    if (!python) {
      return;
    }

    const output = runCommand(python, ['scripts/optuna_optimize.py', '--help']);
    expect(output).toContain('Run Optuna balance search');
  });

  it('can run a one-trial study when optuna is available', () => {
    const python = findPythonCommand();
    if (!python) {
      return;
    }

    try {
      execFileSync(python, ['-c', 'import optuna'], { cwd: repoRoot, stdio: 'ignore' });
    } catch {
      return;
    }

    const outputDir = mkdtempSync(join(tmpdir(), 'war-civ-optuna-'));
    try {
      const output = runCommand(python, ['scripts/optuna_optimize.py', '--trials', '1', '--turns', '8', '--output-dir', outputDir]);
      const parsed = JSON.parse(output);
      expect(parsed.bestValue).toEqual(expect.any(Number));
      expect(parsed.outputDir).toBe(outputDir);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
