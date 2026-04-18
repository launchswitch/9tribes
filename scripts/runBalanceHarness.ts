import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry.js';
import {
  DEFAULT_HARNESS_TURNS,
  SMOKE_HARNESS_SEEDS,
  VALIDATION_HARNESS_SEEDS,
  runBalanceHarness,
  runPairedDifficultyBalanceHarness,
  runStratifiedBalanceHarness,
  runStratifiedPairedDifficultyBalanceHarness,
  runValidationComparison,
} from '../src/systems/balanceHarness.js';
import type { BalanceOverrides } from '../src/balance/types.js';
import type { DifficultyLevel } from '../src/systems/aiDifficulty.js';

const registry = loadRulesRegistry();
const mapMode = process.argv.includes('--random') ? 'randomClimateBands' : 'fixed';
const turnsIdx = process.argv.indexOf('--turns');
const maxTurns = turnsIdx !== -1 && process.argv[turnsIdx + 1] ? Number(process.argv[turnsIdx + 1]) : DEFAULT_HARNESS_TURNS;

const widthIdx = process.argv.indexOf('--width');
const heightIdx = process.argv.indexOf('--height');
const difficultyIdx = process.argv.indexOf('--difficulty');
const difficulty = (difficultyIdx !== -1 && process.argv[difficultyIdx + 1]
  ? process.argv[difficultyIdx + 1]
  : 'normal') as DifficultyLevel;
const overrides: BalanceOverrides | undefined =
  widthIdx !== -1 || heightIdx !== -1
    ? {
        scenario: {
          mapWidth: widthIdx !== -1 ? Number(process.argv[widthIdx + 1]) : undefined,
          mapHeight: heightIdx !== -1 ? Number(process.argv[heightIdx + 1]) : undefined,
        },
      }
    : undefined;

if (process.argv.includes('--validate')) {
  const seeds = process.argv.includes('--stratified')
    ? undefined // uses VALIDATION_HARNESS_SEEDS by default
    : VALIDATION_HARNESS_SEEDS;
  const result = runValidationComparison(registry, seeds, maxTurns, mapMode, overrides);

  console.log('=== Phase 4 Validation: Easy (before) vs Normal (after) ===\n');
  console.log(`Seeds: ${result.totalSeeds} games per difficulty\n`);

  for (const check of result.checks) {
    const status = check.pass ? 'PASS' : 'FAIL';
    const pctStr = check.deltaPercent != null ? ` (${check.deltaPercent >= 0 ? '+' : ''}${check.deltaPercent}%)` : '';
    console.log(`[${status}] ${check.metric}`);
    console.log(`  Before: ${check.before.toFixed(1)}  After: ${check.after.toFixed(1)}  Delta: ${check.delta >= 0 ? '+' : ''}${check.delta.toFixed(1)}${pctStr}`);
    console.log(`  Target: ${check.target}\n`);
  }

  console.log(`Overall: ${result.allPass ? 'ALL TARGETS MET' : 'SOME TARGETS NOT MET'}`);

  if (process.argv.includes('--verbose')) {
    console.log('\n=== Full Easy Results ===');
    console.log(JSON.stringify(result.easy, null, 2));
    console.log('\n=== Full Normal Results ===');
    console.log(JSON.stringify(result.normal, null, 2));
  }
} else {
  const summary = process.argv.includes('--paired')
    ? (
        process.argv.includes('--stratified')
          ? runStratifiedPairedDifficultyBalanceHarness(registry, maxTurns, mapMode, overrides)
          : runPairedDifficultyBalanceHarness(registry, SMOKE_HARNESS_SEEDS, maxTurns, mapMode, overrides)
      )
    : (
        process.argv.includes('--stratified')
          ? runStratifiedBalanceHarness(registry, maxTurns, mapMode, overrides, difficulty)
          : runBalanceHarness(registry, SMOKE_HARNESS_SEEDS, maxTurns, mapMode, overrides, difficulty)
      );

  console.log(JSON.stringify(summary, null, 2));
}
