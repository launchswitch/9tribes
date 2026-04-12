import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ImportRecord = {
  specifier: string;
  typeOnly: boolean;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function getImports(source: string): ImportRecord[] {
  return Array.from(
    source.matchAll(/import\s+(type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g),
    (match) => ({
      specifier: match[2],
      typeOnly: Boolean(match[1]),
    }),
  );
}

function expectNoCalls(source: string, forbiddenCalls: string[]): void {
  for (const callName of forbiddenCalls) {
    expect(source).not.toMatch(new RegExp(`\\b${callName}\\s*\\(`));
  }
}

function expectHasImport(imports: ImportRecord[], specifier: string): void {
  expect(imports.some((entry) => entry.specifier === specifier)).toBe(true);
}

function expectNoRuntimeImports(imports: ImportRecord[], specifiers: string[]): void {
  for (const specifier of specifiers) {
    expect(imports.some((entry) => entry.specifier === specifier && !entry.typeOnly)).toBe(false);
  }
}

const gameSessionSource = readRepoFile('web/src/game/controller/GameSession.ts');
const unitActivationSource = readRepoFile('src/systems/unitActivationSystem.ts');
const warEcologySource = readRepoFile('src/systems/warEcologySimulation.ts');

const GAME_SESSION_RUNTIME_IMPORT_BANLIST = [
  '../../../../src/systems/combatSystem.js',
  '../../../../src/systems/captureSystem.js',
  '../../../../src/systems/historySystem.js',
  '../../../../src/systems/combatSignalSystem.js',
  '../../../../src/systems/warExhaustionSystem.js',
  '../../../../src/systems/siegeSystem.js',
  '../../../../src/systems/signatureAbilitySystem.js',
  '../../../../src/systems/learnByKillSystem.js',
  '../../../../src/systems/moraleSystem.js',
];

const DIRECT_COMBAT_RULE_CALL_BANLIST = [
  'resolveCombat',
  'attemptCapture',
  'applyPoisonDoT',
  'applyCombatSignals',
  'recordBattleFought',
  'recordEnemyKilled',
  'recordPromotion',
  'awardCombatXP',
];

describe('architecture boundaries', () => {
  it('GameSession delegates combat and faction-phase gameplay rules to shared systems', () => {
    const imports = getImports(gameSessionSource);

    expectHasImport(imports, '../../../../src/systems/combatActionSystem.js');
    expectHasImport(imports, '../../../../src/systems/factionPhaseSystem.js');
    expectHasImport(imports, '../../../../src/systems/unitActivationSystem.js');
    expectNoRuntimeImports(imports, GAME_SESSION_RUNTIME_IMPORT_BANLIST);

    expectNoCalls(gameSessionSource, [
      'resolveCombat',
      'attemptCapture',
      'applyPoisonDoT',
      'applyCombatSignals',
      'recordBattleFought',
      'recordEnemyKilled',
      'recordPromotion',
      'tickWarExhaustion',
      'applySupplyDeficitPenalties',
      'degradeWalls',
      'repairWalls',
      'captureCity',
      'processFactionPhases',
    ]);
  });

  it('unitActivationSystem routes combat outcomes through combatActionSystem', () => {
    const imports = getImports(unitActivationSource);

    expectHasImport(imports, './combatActionSystem.js');
    expect(unitActivationSource).toMatch(/\bpreviewCombatAction\s*\(/);
    expect(unitActivationSource).toMatch(/\bapplyCombatAction\s*\(/);

    expectNoCalls(unitActivationSource, [
      ...DIRECT_COMBAT_RULE_CALL_BANLIST,
      'unlockHybridRecipes',
    ]);
  });

  it('warEcologySimulation delegates combat execution to shared activation and combat systems', () => {
    const imports = getImports(warEcologySource);

    expectHasImport(imports, './unitActivationSystem.js');
    expect(warEcologySource).toMatch(/\bactivateUnit\s*\(/);

    expectNoCalls(warEcologySource, [
      ...DIRECT_COMBAT_RULE_CALL_BANLIST,
      'attemptNonCombatCapture',
    ]);
  });
});
