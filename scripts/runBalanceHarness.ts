import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry.js';
import {
  DEFAULT_HARNESS_TURNS,
  SMOKE_HARNESS_SEEDS,
  runBalanceHarness,
  runStratifiedBalanceHarness,
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

const summary = process.argv.includes('--stratified')
  ? runStratifiedBalanceHarness(registry, maxTurns, mapMode, overrides, difficulty)
  : runBalanceHarness(registry, SMOKE_HARNESS_SEEDS, maxTurns, mapMode, overrides, difficulty);

console.log(JSON.stringify(summary, null, 2));
