import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { createSimulationTrace, runWarEcologySimulation } from '../src/systems/warEcologySimulation';
import { exportReplayBundle } from '../src/replay/exportReplay';

import { buildPendingCombat } from '../web/src/game/controller/combatSession';
import type { ReplayCombatEvent } from '../src/replay/types';
import type { TraceCombatEvent } from '../src/systems/simulation/traceTypes';

const registry = loadRulesRegistry();
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function keepOnlyUnits(state: ReturnType<typeof buildMvpScenario>, keptUnitIds: string[]) {
  const keep = new Set(keptUnitIds);
  state.units = new Map(Array.from(state.units.entries()).filter(([unitId]) => keep.has(unitId)));
  for (const faction of state.factions.values()) {
    faction.unitIds = faction.unitIds.filter((unitId) => keep.has(unitId));
  }
}

function setupTwoUnitCombat() {
  const state = buildMvpScenario(42);
  const jungleId = 'jungle_clan' as never;
  const steppeId = 'steppe_clan' as never;
  const jungleUnitId = state.factions.get(jungleId)!.unitIds[0];
  const steppeUnitId = state.factions.get(steppeId)!.unitIds[0];
  keepOnlyUnits(state, [jungleUnitId, steppeUnitId]);

  state.activeFactionId = jungleId;

  state.units.set(jungleUnitId, {
    ...state.units.get(jungleUnitId)!,
    position: { q: 8, r: 8 },
    status: 'ready',
    attacksRemaining: 1,
    movesRemaining: 1,
  });
  state.units.set(steppeUnitId, {
    ...state.units.get(steppeUnitId)!,
    position: { q: 9, r: 8 },
    status: 'ready',
  });
  return { state, jungleUnitId, steppeUnitId };
}

// ── Helpers for exhaustive field type checking ──

const REPLAY_COMBAT_EVENT_TOP_LEVEL: Record<keyof ReplayCombatEvent, 'number' | 'string' | 'boolean' | 'object'> = {
  round: 'number',
  attackerUnitId: 'string',
  defenderUnitId: 'string',
  attackerFactionId: 'string',
  defenderFactionId: 'string',
  attackerPrototypeId: 'string',
  defenderPrototypeId: 'string',
  attackerPrototypeName: 'string',
  defenderPrototypeName: 'string',
  attackerDamage: 'number',
  defenderDamage: 'number',
  attackerHpAfter: 'number',
  defenderHpAfter: 'number',
  attackerDestroyed: 'boolean',
  defenderDestroyed: 'boolean',
  attackerRouted: 'boolean',
  defenderRouted: 'boolean',
  attackerFled: 'boolean',
  defenderFled: 'boolean',
  summary: 'string',
  breakdown: 'object',
};

function assertReplayCombatEventShape(event: Record<string, unknown>, label: string): void {
  for (const [field, expectedType] of Object.entries(REPLAY_COMBAT_EVENT_TOP_LEVEL)) {
    expect(typeof event[field]).toBe(expectedType);
  }
}

describe('combat event contract guardrails', () => {
  it('simulation trace combat events have all required fields with correct types', () => {
    const { state } = setupTwoUnitCombat();
    const trace = createSimulationTrace(true);
    runWarEcologySimulation(state, registry, 1, trace);

    const combatEvents = trace.combatEvents ?? [];
    expect(combatEvents.length).toBeGreaterThan(0);

    const event = combatEvents[0] as unknown as Record<string, unknown>;
    assertReplayCombatEventShape(event, 'trace combat event');

    // Verify breakdown sub-structure
    const bd = event.breakdown as Record<string, unknown>;
    expect(typeof bd).toBe('object');

    // breakdown.attacker / defender
    for (const side of ['attacker', 'defender']) {
      const unit = bd[side] as Record<string, unknown>;
      expect(typeof unit.unitId).toBe('string');
      expect(typeof unit.factionId).toBe('string');
      expect(typeof unit.prototypeId).toBe('string');
      expect(typeof unit.prototypeName).toBe('string');
      expect(typeof unit.terrain).toBe('string');
      expect(typeof unit.hpBefore).toBe('number');
      expect(typeof unit.hpAfter).toBe('number');
      expect(typeof unit.maxHp).toBe('number');
      expect(typeof unit.baseStat).toBe('number');
      expect(typeof (unit.position as Record<string, unknown>)?.q).toBe('number');
      expect(typeof (unit.position as Record<string, unknown>)?.r).toBe('number');
    }

    // breakdown.modifiers — all numeric
    const mods = bd.modifiers as Record<string, unknown>;
    for (const [key, val] of Object.entries(mods)) {
      expect(typeof val).toBe('number');
    }
    // Must contain all expected modifier fields
    expect(mods).toHaveProperty('roleModifier');
    expect(mods).toHaveProperty('weaponModifier');
    expect(mods).toHaveProperty('flankingBonus');
    expect(mods).toHaveProperty('finalAttackStrength');
    expect(mods).toHaveProperty('finalDefenseStrength');
    expect(mods).toHaveProperty('damageVarianceMultiplier');
    expect(mods).toHaveProperty('retaliationVarianceMultiplier');

    // breakdown.morale
    const morale = bd.morale as Record<string, unknown>;
    expect(typeof morale.attackerLoss).toBe('number');
    expect(typeof morale.defenderLoss).toBe('number');
    expect(typeof morale.attackerRouted).toBe('boolean');
    expect(typeof morale.defenderRouted).toBe('boolean');
    expect(typeof morale.attackerFled).toBe('boolean');
    expect(typeof morale.defenderFled).toBe('boolean');

    // breakdown.outcome
    const outcome = bd.outcome as Record<string, unknown>;
    expect(typeof outcome.attackerDamage).toBe('number');
    expect(typeof outcome.defenderDamage).toBe('number');
    expect(typeof outcome.attackerDestroyed).toBe('boolean');
    expect(typeof outcome.defenderDestroyed).toBe('boolean');
    expect(typeof outcome.defenderKnockedBack).toBe('boolean');
    expect(typeof outcome.knockbackDistance).toBe('number');

    // breakdown.triggeredEffects
    const effects = bd.triggeredEffects as Record<string, unknown>[];
    expect(Array.isArray(effects)).toBe(true);
    if (effects.length > 0) {
      const fx = effects[0];
      expect(typeof fx.label).toBe('string');
      expect(typeof fx.detail).toBe('string');
      expect(['positioning', 'ability', 'synergy', 'aftermath']).toContain(fx.category);
    }
  });

  it('exported replay combat events match trace combat events structurally', () => {
    const { state } = setupTwoUnitCombat();
    const trace = createSimulationTrace(true);
    const finalState = runWarEcologySimulation(state, registry, 1, trace);
    const replay = exportReplayBundle(finalState, trace, 1);

    const replayEvents = replay.turns.flatMap((t) => t.combatEvents);
    const traceEvents = trace.combatEvents ?? [];

    expect(replayEvents.length).toBe(traceEvents.length);

    if (replayEvents.length > 0) {
      // Every replay combat event should have the same shape as a trace combat event
      const replayEvent = replayEvents[0] as unknown as Record<string, unknown>;
      assertReplayCombatEventShape(replayEvent, 'replay combat event');
    }
  });

  it('buildPendingCombat produces a valid ReplayCombatEvent', () => {
    const { state, jungleUnitId, steppeUnitId } = setupTwoUnitCombat();

    const preview = previewCombatAction(state, registry, jungleUnitId, steppeUnitId);
    expect(preview).not.toBeNull();

    const pending = buildPendingCombat(state, registry, preview!);

    // The combatEvent field must satisfy the full ReplayCombatEvent contract
    const event = pending.combatEvent as unknown as Record<string, unknown>;
    assertReplayCombatEventShape(event, 'buildPendingCombat output');

    // Verify it produces the correct typed value
    const typed: ReplayCombatEvent = pending.combatEvent;
    expect(typed.round).toBeGreaterThanOrEqual(0);
    expect(typed.summary.length).toBeGreaterThan(0);

    // PendingCombat interface fields
    expect(pending.attackerId).toBe(jungleUnitId);
    expect(pending.defenderId).toBe(steppeUnitId);
    expect(pending.preview).toBe(preview);
    expect(pending.result).toBe(preview!.result);
  });
});

describe('trace–replay type parity guardrail', () => {
  it('TraceCombatEvent and ReplayCombatEvent have the same top-level field names', () => {
    // Read both type definition files and compare the exported field names
    const traceTypesSource = readFileSync(join(repoRoot, 'src/systems/simulation/traceTypes.ts'), 'utf8');
    const replayTypesSource = readFileSync(join(repoRoot, 'src/replay/types.ts'), 'utf8');

    // Extract field names from TraceCombatEvent and ReplayCombatEvent interfaces
    const traceFields = extractInterfaceFields(traceTypesSource, 'TraceCombatEvent');
    const replayFields = extractInterfaceFields(replayTypesSource, 'ReplayCombatEvent');

    expect(traceFields).toEqual(replayFields);
  });

  it('TraceCombatBreakdown and ReplayCombatBreakdown have the same field names', () => {
    const traceTypesSource = readFileSync(join(repoRoot, 'src/systems/simulation/traceTypes.ts'), 'utf8');
    const replayTypesSource = readFileSync(join(repoRoot, 'src/replay/types.ts'), 'utf8');

    const traceFields = extractInterfaceFields(traceTypesSource, 'TraceCombatBreakdown');
    const replayFields = extractInterfaceFields(replayTypesSource, 'ReplayCombatBreakdown');

    expect(traceFields).toEqual(replayFields);
  });

  it('TraceCombatModifiers and ReplayCombatModifiers have the same field names', () => {
    const traceTypesSource = readFileSync(join(repoRoot, 'src/systems/simulation/traceTypes.ts'), 'utf8');
    const replayTypesSource = readFileSync(join(repoRoot, 'src/replay/types.ts'), 'utf8');

    const traceFields = extractInterfaceFields(traceTypesSource, 'TraceCombatModifiers');
    const replayFields = extractInterfaceFields(replayTypesSource, 'ReplayCombatModifiers');

    expect(traceFields).toEqual(replayFields);
  });
});

/**
 * Extract field names from a TypeScript interface in source text.
 * Matches `fieldName:` or `fieldName?:` within the named interface block.
 */
function extractInterfaceFields(source: string, interfaceName: string): string[] {
  // Find the interface block
  const ifaceRegex = new RegExp(
    `export\\s+interface\\s+${interfaceName}\\s*\\{([^}]*)\\}`,
    's',
  );
  const match = source.match(ifaceRegex);
  if (!match) {
    throw new Error(`Could not find interface ${interfaceName} in source`);
  }

  const body = match[1];
  const fields: string[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    // Match `fieldName:` or `fieldName?:` patterns
    const fieldMatch = trimmed.match(/^(\w+)\s*[\?:]/);
    if (fieldMatch) {
      fields.push(fieldMatch[1]);
    }
  }

  return fields.sort();
}
