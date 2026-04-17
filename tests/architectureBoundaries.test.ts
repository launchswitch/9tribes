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
const unitActivationSource = readRepoFile('src/systems/unit-activation/activateUnit.ts');
const warEcologySource = readRepoFile('src/systems/warEcologySimulation.ts');
const webReplayTypesSource = readRepoFile('web/src/game/types/replay.ts');
const combatSessionSource = readRepoFile('web/src/game/controller/combatSession.ts');
const combatDetailModalSource = readRepoFile('web/src/ui/CombatDetailModal.tsx');
const combatLogPanelSource = readRepoFile('web/src/ui/CombatLogPanel.tsx');

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

    expectHasImport(imports, '../combatActionSystem.js');
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

  // ── Phase 7: Contract drift guardrails ──

  it('web replay types re-export from canonical source without local type definitions', () => {
    // Must reference the canonical engine source
    expect(webReplayTypesSource).toContain("'../../../../src/replay/types.js'");

    // Must NOT define local interfaces or type aliases with body
    expect(webReplayTypesSource).not.toMatch(/\binterface\s+\w+\s*\{/);
    expect(webReplayTypesSource).not.toMatch(/export\s+type\s+\w+\s*=\s*\{/);

    // All export statements must be re-exports, not fresh definitions.
    // Permitted forms:
    //   export type { ... } from '...'     (re-export block)
    //   export type X = import('...').Y     (alias re-export)
    const exportLines = webReplayTypesSource
      .split('\n')
      .filter((l) => l.trim().startsWith('export'));

    for (const line of exportLines) {
      const startsReExportBlock = /export\s+type\s+\{/.test(line);
      const isAliasReExport = /export\s+type\s+\w+\s*=\s*import\s*\(/.test(line);
      expect(startsReExportBlock || isAliasReExport).toBe(true);
    }
  });

  it('combatSession builder constructs all required ReplayCombatEvent fields', () => {
    // Verify the builder assigns every top-level field of ReplayCombatEvent
    const requiredTopLevelFields = [
      'round',
      'attackerUnitId',
      'defenderUnitId',
      'attackerFactionId',
      'defenderFactionId',
      'attackerPrototypeId',
      'defenderPrototypeId',
      'attackerPrototypeName',
      'defenderPrototypeName',
      'attackerDamage',
      'defenderDamage',
      'attackerHpAfter',
      'defenderHpAfter',
      'attackerDestroyed',
      'defenderDestroyed',
      'attackerRouted',
      'defenderRouted',
      'attackerFled',
      'defenderFled',
      'summary',
      'breakdown',
    ];

    for (const field of requiredTopLevelFields) {
      // Match both `field:` (explicit value) and `field,` or `field }` (shorthand)
      expect(combatSessionSource).toMatch(new RegExp(`\\b${field}\\s*[:\\,]|\\b${field}\\s*\\}`));
    }

    // Verify breakdown sub-objects exist
    const requiredBreakdownKeys = ['attacker', 'defender', 'modifiers', 'morale', 'outcome', 'triggeredEffects'];
    for (const key of requiredBreakdownKeys) {
      expect(combatSessionSource).toMatch(new RegExp(`\\b${key}\\s*:\\s*[{\\[]`));
    }
  });

  it('GameSession applyResolvedCombat patches post-apply fields on the combat event', () => {
    // After applying combat, GameSession must overwrite these fields from live state
    // Top-level overwrites use explicit key assignment
    expect(gameSessionSource).toMatch(/\battackerHpAfter\s*:/);
    expect(gameSessionSource).toMatch(/\bdefenderHpAfter\s*:/);

    // Nested breakdown patches: spread + hpAfter override for attacker/defender
    expect(gameSessionSource).toMatch(/\.\.\.\s*combatEvent\.breakdown\.attacker/);
    expect(gameSessionSource).toMatch(/\.\.\.\s*combatEvent\.breakdown\.defender/);

    // Triggered effects overwrite from applied feedback
    expect(gameSessionSource).toMatch(/triggeredEffects:\s*applied\.feedback\.resolution\.triggeredEffects/);

    // Must spread the preview-phase combatEvent, then overwrite
    expect(gameSessionSource).toMatch(/\.\.\.\s*combatEvent[,\s}]/);
  });

  it('CombatDetailModal and CombatLogPanel import ReplayCombatEvent from canonical re-export', () => {
    const modalImports = getImports(combatDetailModalSource);
    const logImports = getImports(combatLogPanelSource);

    // Both must import from the web re-export barrel (which re-exports from canonical source)
    expectHasImport(modalImports, '../game/types/replay');
    expectHasImport(logImports, '../game/types/replay');

    // Must NOT import directly from engine replay types
    expect(
      modalImports.some((entry) => entry.specifier.includes('src/replay/types')),
    ).toBe(false);
    expect(
      logImports.some((entry) => entry.specifier.includes('src/replay/types')),
    ).toBe(false);
  });
});
