import { describe, expect, it } from 'vitest';
import type { UnitView } from '../web/src/game/types/worldView';
import {
  buildCombatAnimationScript,
  type CombatAnimationOutcome,
} from '../web/src/game/phaser/systems/combatAnimationScript';

function makeUnitView(overrides: Partial<UnitView> = {}): UnitView {
  return {
    id: overrides.id ?? 'unit',
    factionId: overrides.factionId ?? 'faction',
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    hp: overrides.hp ?? 12,
    maxHp: overrides.maxHp ?? 12,
    attack: overrides.attack ?? 5,
    defense: overrides.defense ?? 4,
    effectiveDefense: overrides.effectiveDefense ?? overrides.defense ?? 4,
    range: overrides.range ?? 1,
    movesRemaining: overrides.movesRemaining ?? 2,
    movesMax: overrides.movesMax ?? 2,
    acted: overrides.acted ?? false,
    canAct: overrides.canAct ?? true,
    isActiveFaction: overrides.isActiveFaction ?? true,
    status: overrides.status ?? 'ready',
    prototypeId: overrides.prototypeId ?? 'proto',
    prototypeName: overrides.prototypeName ?? 'Prototype',
    chassisId: overrides.chassisId ?? 'infantry_frame',
    movementClass: overrides.movementClass ?? 'infantry',
    role: overrides.role ?? 'melee',
    spriteKey: overrides.spriteKey ?? 'test_sprite',
    facing: overrides.facing ?? 0,
    visible: overrides.visible ?? true,
    veteranLevel: overrides.veteranLevel,
    xp: overrides.xp,
    nativeDomain: overrides.nativeDomain,
    learnedAbilities: overrides.learnedAbilities,
    isStealthed: overrides.isStealthed,
    poisoned: overrides.poisoned,
    routed: overrides.routed,
    preparedAbility: overrides.preparedAbility,
    isSettler: overrides.isSettler,
  };
}

function sumDamage(
  outcome: CombatAnimationOutcome,
  attacker: UnitView,
  defender: UnitView,
) {
  const script = buildCombatAnimationScript(outcome, attacker, defender);
  return {
    script,
    attackerDamageTaken: attacker.hp - script.attackerEndHp,
    defenderDamageTaken: defender.hp - script.defenderEndHp,
    defenderHitDamage: script.beats
      .filter((beat) => beat.actor === 'attacker' && beat.kind === 'hit')
      .reduce((total, beat) => total + beat.damage, 0),
    attackerHitDamage: script.beats
      .filter((beat) => beat.actor === 'defender' && beat.kind === 'hit')
      .reduce((total, beat) => total + beat.damage, 0),
  };
}

describe('combatAnimationScript', () => {
  it('preserves the authoritative combat totals', () => {
    const attacker = makeUnitView({ id: 'attacker', hp: 14, maxHp: 14, attack: 7, defense: 5, effectiveDefense: 5 });
    const defender = makeUnitView({ id: 'defender', hp: 13, maxHp: 13, attack: 5, defense: 6, effectiveDefense: 6 });
    const outcome: CombatAnimationOutcome = {
      attackerDamage: 3,
      defenderDamage: 8,
      attackerDestroyed: false,
      defenderDestroyed: false,
      attackerRouted: false,
      defenderRouted: false,
      attackerFled: false,
      defenderFled: false,
    };

    const result = sumDamage(outcome, attacker, defender);

    expect(result.attackerDamageTaken).toBe(outcome.attackerDamage);
    expect(result.defenderDamageTaken).toBe(outcome.defenderDamage);
    expect(result.attackerHitDamage).toBe(outcome.attackerDamage);
    expect(result.defenderHitDamage).toBe(outcome.defenderDamage);
  });

  it('starts with attacker initiative and keeps retaliation beats when the defender hits back', () => {
    const attacker = makeUnitView({ id: 'attacker', attack: 8, effectiveDefense: 5 });
    const defender = makeUnitView({ id: 'defender', attack: 6, effectiveDefense: 6 });
    const outcome: CombatAnimationOutcome = {
      attackerDamage: 4,
      defenderDamage: 7,
      attackerDestroyed: false,
      defenderDestroyed: false,
      attackerRouted: false,
      defenderRouted: false,
      attackerFled: false,
      defenderFled: false,
    };

    const { script } = sumDamage(outcome, attacker, defender);

    expect(script.beats[0]?.actor).toBe('attacker');
    expect(script.beats.some((beat) => beat.actor === 'defender' && beat.kind === 'hit')).toBe(true);
  });

  it('shows a failed opening swing before defender-only damage lands', () => {
    const attacker = makeUnitView({ id: 'attacker', attack: 5, effectiveDefense: 4 });
    const defender = makeUnitView({ id: 'defender', attack: 7, effectiveDefense: 7 });
    const outcome: CombatAnimationOutcome = {
      attackerDamage: 5,
      defenderDamage: 0,
      attackerDestroyed: false,
      defenderDestroyed: false,
      attackerRouted: false,
      defenderRouted: false,
      attackerFled: false,
      defenderFled: false,
    };

    const { script, attackerHitDamage, defenderHitDamage } = sumDamage(outcome, attacker, defender);

    expect(script.beats[0]).toMatchObject({ actor: 'attacker', kind: 'glance', damage: 0 });
    expect(attackerHitDamage).toBe(outcome.attackerDamage);
    expect(defenderHitDamage).toBe(0);
  });

  it('pads close melee duels with glance beats to keep the exchange readable', () => {
    const attacker = makeUnitView({ id: 'attacker', attack: 6, defense: 5, effectiveDefense: 5, range: 1 });
    const defender = makeUnitView({ id: 'defender', attack: 6, defense: 5, effectiveDefense: 5, range: 1 });
    const outcome: CombatAnimationOutcome = {
      attackerDamage: 2,
      defenderDamage: 2,
      attackerDestroyed: false,
      defenderDestroyed: false,
      attackerRouted: false,
      defenderRouted: false,
      attackerFled: false,
      defenderFled: false,
    };

    const { script } = sumDamage(outcome, attacker, defender);

    expect(script.beats.length).toBeGreaterThanOrEqual(4);
    expect(script.beats.some((beat) => beat.kind === 'glance')).toBe(true);
  });
});
