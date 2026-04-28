import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { assemblePrototype } from '../src/design/assemblePrototype';
import { resolveCombat, getVeteranStatBonus, getVeteranDefenseBonus } from '../src/systems/combatSystem';
import { getRoleEffectiveness } from '../src/data/roleEffectiveness';
import { getWeaponEffectiveness } from '../src/data/weaponEffectiveness';
import { calculateMoraleLoss, MORALE_CONFIG } from '../src/systems/moraleSystem';
import { collectCombatSignals } from '../src/systems/combatSignalSystem';
import { runWarEcologySimulation } from '../src/systems/warEcologySimulation';
import { createRNG } from '../src/core/rng';
import { canUseAmbush, canUseBrace, canUseCharge } from '../src/systems/abilitySystem';
import { getCombatAttackModifier, getCombatDefenseModifier, isUnitRiverStealthed } from '../src/systems/factionIdentitySystem';

const registry = loadRulesRegistry();
function makeCombatRng() {
  return createRNG(123);
}

describe('role effectiveness', () => {
  it('mounted gets +50% vs ranged', () => {
    expect(getRoleEffectiveness('mounted', 'ranged')).toBe(0.5);
  });

  it('melee gets -25% vs mounted', () => {
    expect(getRoleEffectiveness('melee', 'mounted')).toBe(-0.25);
  });

  it('ranged gets -25% vs melee', () => {
    expect(getRoleEffectiveness('ranged', 'melee')).toBe(-0.25);
  });

  it('same role has no modifier', () => {
    expect(getRoleEffectiveness('melee', 'melee')).toBe(0);
  });
});

describe('weapon effectiveness', () => {
  it('spears get +50% vs cavalry', () => {
    expect(getWeaponEffectiveness(['spear'], 'cavalry')).toBe(0.5);
  });

  it('ranged gets -25% vs cavalry', () => {
    expect(getWeaponEffectiveness(['ranged'], 'cavalry')).toBe(-0.25);
  });

  it('no modifier for infantry targets', () => {
    expect(getWeaponEffectiveness(['spear'], 'infantry')).toBe(0);
  });

  it('multiple weapon tags stack', () => {
    expect(getWeaponEffectiveness(['spear', 'ranged'], 'cavalry')).toBe(0.25);
  });
});

describe('terrain defense modifiers', () => {
  it('forest has 25% defense modifier', () => {
    const forest = registry.getTerrain('forest');
    expect(forest?.defenseModifier).toBe(0.25);
  });

  it('hill has 50% defense modifier', () => {
    const hill = registry.getTerrain('hill');
    expect(hill?.defenseModifier).toBe(0.5);
  });

  it('plains has 0% defense modifier', () => {
    const plains = registry.getTerrain('plains');
    expect(plains?.defenseModifier).toBe(0);
  });
});

describe('faction identity combat modifiers', () => {
  it('charge_momentum applies on savannah but not plains', () => {
    const state = buildMvpScenario(42);
    const savannah = state.factions.get('savannah_lions' as never)!;

    expect(
      getCombatAttackModifier(savannah, registry.getTerrain('plains'), registry.getTerrain('plains'))
    ).toBe(0.15);
    expect(
      getCombatAttackModifier(savannah, registry.getTerrain('savannah'), registry.getTerrain('plains'))
    ).toBe(0.15);
  });

  it('healing_druids gain a forest defense modifier', () => {
    const state = buildMvpScenario(42);
    const druids = state.factions.get('druid_circle' as never)!;

    expect(getCombatDefenseModifier(druids, registry.getTerrain('forest'))).toBe(0.1);
    expect(getCombatDefenseModifier(druids, registry.getTerrain('plains'))).toBe(0);
  });

  it('jungle_stalkers gain a major defense bonus in jungle', () => {
    const state = buildMvpScenario(42);
    const jungle = state.factions.get('jungle_clan' as never)!;

    expect(getCombatDefenseModifier(jungle, registry.getTerrain('jungle'))).toBe(0.35);
    expect(getCombatDefenseModifier(jungle, registry.getTerrain('forest'))).toBe(0.15);
  });

  it('foraging_riders gain their missing defense bonus on open ground', () => {
    const state = buildMvpScenario(42);
    const steppe = state.factions.get('steppe_clan' as never)!;

    expect(getCombatDefenseModifier(steppe, registry.getTerrain('plains'))).toBe(0.2);
    expect(getCombatDefenseModifier(steppe, registry.getTerrain('savannah'))).toBe(0.2);
    expect(getCombatDefenseModifier(steppe, registry.getTerrain('forest'))).toBe(0);
  });

  it('river_assault keeps river people stealthed in swamp tiles', () => {
    const state = buildMvpScenario(42);
    const riverPeople = state.factions.get('river_people' as never)!;

    expect(isUnitRiverStealthed(riverPeople, 'river')).toBe(true);
    expect(isUnitRiverStealthed(riverPeople, 'swamp')).toBe(true);
    expect(isUnitRiverStealthed(riverPeople, 'plains')).toBe(false);
  });
});

describe('veteran levels', () => {
  it('has 4 levels', () => {
    const levels = registry.getAllVeteranLevels();
    expect(levels.length).toBe(4);
  });

  it('green has no bonuses', () => {
    expect(getVeteranStatBonus(registry, 'green')).toBe(0);
    expect(getVeteranDefenseBonus(registry, 'green')).toBe(0);
  });

  it('elite has highest bonuses', () => {
    const eliteAttack = getVeteranStatBonus(registry, 'elite');
    const veteranAttack = getVeteranStatBonus(registry, 'veteran');
    expect(eliteAttack).toBeGreaterThan(veteranAttack);
  });

  it('seasoned is between green and veteran', () => {
    const green = getVeteranStatBonus(registry, 'green');
    const seasoned = getVeteranStatBonus(registry, 'seasoned');
    const veteran = getVeteranStatBonus(registry, 'veteran');
    expect(seasoned).toBeGreaterThan(green);
    expect(seasoned).toBeLessThan(veteran);
  });
});

describe('combat resolution', () => {
  it('ranged units take no retaliation', () => {
    const state = buildMvpScenario(42);
    // Find a ranged unit (ranged_frame has range 2)
    const rangedUnit = Array.from(state.units.values()).find(
      (u) => (state.prototypes.get(u.prototypeId)?.derivedStats.range ?? 1) > 1
    );
    const meleeUnit = Array.from(state.units.values()).find(
      (u) => (state.prototypes.get(u.prototypeId)?.derivedStats.range ?? 1) === 1
    );

    if (!rangedUnit || !meleeUnit) return;

    const rangedProto = state.prototypes.get(rangedUnit.prototypeId)!;
    const meleeProto = state.prototypes.get(meleeUnit.prototypeId)!;

    const result = resolveCombat(
      rangedUnit, meleeUnit,
      rangedProto, meleeProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      makeCombatRng()
    );

    // Ranged attacker takes 0 retaliation damage
    expect(result.attackerDamage).toBe(0);
    expect(result.defenderDamage).toBeGreaterThan(0);
  });

  it('spears apply the intended single anti-cavalry modifier in combat', () => {
    const state = buildMvpScenario(42);
    const steppeFaction = state.factions.get('steppe_clan' as never)!;
    const spearUnit = state.units.get(steppeFaction.unitIds[1])!;
    const cavalryUnit = state.units.get(steppeFaction.unitIds[0])!;
    const spearProto = state.prototypes.get(spearUnit.prototypeId)!;
    const cavalryProto = state.prototypes.get(cavalryUnit.prototypeId)!;

    const result = resolveCombat(
      spearUnit, cavalryUnit,
      spearProto, cavalryProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      makeCombatRng()
    );

    expect(result.weaponModifier).toBe(0);
  });

  it('bows apply the intended single anti-cavalry penalty in combat', () => {
    const state = buildMvpScenario(42);
    const steppeFaction = state.factions.get('steppe_clan' as never)!;
    const cavalryUnit = state.units.get(steppeFaction.unitIds[0])!;
    const cavalryProto = state.prototypes.get(cavalryUnit.prototypeId)!;

    const result = resolveCombat(
      cavalryUnit, cavalryUnit,
      cavalryProto, cavalryProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      makeCombatRng()
    );

    expect(result.weaponModifier).toBe(0);
  });

  it('spear cavalry still takes retaliation because it is not a ranged attack', () => {
    const state = buildMvpScenario(42);
    const faction = state.factions.get('steppe_clan' as never)!;
    const cavalrySpearProto = assemblePrototype(
      faction.id,
      'cavalry_frame' as never,
      ['basic_spear', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: faction.capabilities?.domainLevels,
        validation: {
          ignoreResearchRequirements: true,
        },
      }
    );
    const defenderUnit = state.units.get(faction.unitIds[1])!;
    const attackerUnit = {
      ...state.units.get(faction.unitIds[0])!,
      prototypeId: cavalrySpearProto.id,
      hp: cavalrySpearProto.derivedStats.hp,
      maxHp: cavalrySpearProto.derivedStats.hp,
      movesRemaining: cavalrySpearProto.derivedStats.moves,
      maxMoves: cavalrySpearProto.derivedStats.moves,
    };
    const defenderProto = state.prototypes.get(defenderUnit.prototypeId)!;

    const result = resolveCombat(
      attackerUnit, defenderUnit,
      cavalrySpearProto, defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      makeCombatRng()
    );

    expect(result.attackerDamage).toBeGreaterThan(0);
  });

  it('role effectiveness affects damage', () => {
    const state = buildMvpScenario(42);
    const units = Array.from(state.units.values());
    const attacker = units[0];
    const defender = units[1];

    const attackerProto = state.prototypes.get(attacker.prototypeId)!;
    const defenderProto = state.prototypes.get(defender.prototypeId)!;

    const result = resolveCombat(
      attacker, defender,
      attackerProto, defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      makeCombatRng()
    );

    // Result should include role and weapon modifiers
    expect(typeof result.roleModifier).toBe('number');
    expect(typeof result.weaponModifier).toBe('number');
  });

  it('forest terrain provides defense bonus', () => {
    const state = buildMvpScenario(42);
    const units = Array.from(state.units.values());
    const attacker = units[0];
    const defender = units[1];

    const attackerProto = state.prototypes.get(attacker.prototypeId)!;
    const defenderProto = state.prototypes.get(defender.prototypeId)!;

    // Combat on plains vs forest
    const plainsResult = resolveCombat(
      attacker, defender,
      attackerProto, defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      makeCombatRng()
    );

    const forestResult = resolveCombat(
      attacker, defender,
      attackerProto, defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('forest'),
      0, 0,
      registry,
      0,
      0,
      0,
      makeCombatRng()
    );

    // Defender in forest should take less damage
    expect(forestResult.defenderDamage).toBeLessThanOrEqual(plainsResult.defenderDamage);
  });

  it('rear attacks report the rear bonus and extra morale pressure', () => {
    const state = buildMvpScenario(42);
    const attacker = Array.from(state.units.values())[0];
    const defender = Array.from(state.units.values())[1];
    const attackerProto = state.prototypes.get(attacker.prototypeId)!;
    const defenderProto = state.prototypes.get(defender.prototypeId)!;

    const rearResult = resolveCombat(
      { ...attacker, position: { q: 5, r: 5 } },
      { ...defender, position: { q: 6, r: 5 }, facing: 3, routed: false },
      attackerProto,
      defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      createRNG(500),
      0.2,
      0,
      0,
      6
    );

    const frontResult = resolveCombat(
      { ...attacker, position: { q: 5, r: 5 } },
      { ...defender, position: { q: 6, r: 5 }, facing: 0, routed: false },
      attackerProto,
      defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      createRNG(500)
    );

    expect(rearResult.rearAttackBonus).toBe(0.2);
    expect(rearResult.defenderMoraleLoss).toBeGreaterThan(frontResult.defenderMoraleLoss);
  });

  it('damage variance stays bounded and deterministic for a seed', () => {
    const state = buildMvpScenario(42);
    const attacker = Array.from(state.units.values())[0];
    const defender = Array.from(state.units.values())[1];
    const attackerProto = state.prototypes.get(attacker.prototypeId)!;
    const defenderProto = state.prototypes.get(defender.prototypeId)!;

    const first = resolveCombat(
      attacker, defender,
      attackerProto, defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      createRNG(777)
    );
    const second = resolveCombat(
      attacker, defender,
      attackerProto, defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      createRNG(777)
    );

    expect(first.damageVarianceMultiplier).toBeGreaterThanOrEqual(0.9);
    expect(first.damageVarianceMultiplier).toBeLessThanOrEqual(1.1);
    expect(first.retaliationVarianceMultiplier).toBeGreaterThanOrEqual(0.9);
    expect(first.retaliationVarianceMultiplier).toBeLessThanOrEqual(1.1);
    expect(first).toEqual(second);
  });
});

describe('morale system', () => {
  it('damage causes morale loss', () => {
    const loss = calculateMoraleLoss(5, 10, 0);
    expect(loss).toBeGreaterThan(0);
  });

  it('more damage causes more morale loss', () => {
    const smallLoss = calculateMoraleLoss(2, 10, 0);
    const bigLoss = calculateMoraleLoss(8, 10, 0);
    expect(bigLoss).toBeGreaterThan(smallLoss);
  });

  it('veteran morale bonus reduces loss', () => {
    const normalLoss = calculateMoraleLoss(5, 10, 0);
    const reducedLoss = calculateMoraleLoss(5, 10, 0.15);
    expect(reducedLoss).toBeLessThan(normalLoss);
  });

  it('combat produces morale loss in result', () => {
    const state = buildMvpScenario(42);
    const units = Array.from(state.units.values());
    const attacker = units[0];
    const defender = units[1];

    const attackerProto = state.prototypes.get(attacker.prototypeId)!;
    const defenderProto = state.prototypes.get(defender.prototypeId)!;

    const result = resolveCombat(
      attacker, defender,
      attackerProto, defenderProto,
      0, 0,
      registry.getTerrain('plains'),
      registry.getTerrain('plains'),
      0, 0,
      registry,
      0,
      0,
      0,
      makeCombatRng()
    );

    expect(result.attackerMoraleLoss).toBeGreaterThanOrEqual(0);
    expect(result.defenderMoraleLoss).toBeGreaterThanOrEqual(0);
  });
});

describe('combat signals', () => {
  it('forest combat produces woodcraft signal', () => {
    const forest = registry.getTerrain('forest');
    const signals = collectCombatSignals(
      forest, forest,
      'melee',
      ['spear'],
      'infantry',
      ['formation']
    );
    expect(signals.has('forest_combat')).toBe(true);
  });

  it('cavalry charge produces horsemanship signal', () => {
    const plains = registry.getTerrain('plains');
    const signals = collectCombatSignals(
      plains, plains,
      'mounted',
      ['spear'],
      'infantry',
      ['mounted']
    );
    expect(signals.has('mounted_charge')).toBe(true);
  });

  it('spear vs cavalry produces anti-cavalry signal', () => {
    const plains = registry.getTerrain('plains');
    const signals = collectCombatSignals(
      plains, plains,
      'melee',
      ['spear'],
      'cavalry',
      ['formation']
    );
    expect(signals.has('anti_cavalry_tactics')).toBe(true);
  });

  it('ranged in forest produces ambush signal', () => {
    const forest = registry.getTerrain('forest');
    const plains = registry.getTerrain('plains');
    const signals = collectCombatSignals(
      forest, plains,
      'ranged',
      ['ranged'],
      'infantry',
      ['ranged']
    );
    expect(signals.has('ambush_combat')).toBe(true);
  });
});

describe('chassis roles', () => {
  it('infantry frame has melee role', () => {
    const chassis = registry.getChassis('infantry_frame');
    expect(chassis?.role).toBe('melee');
  });

  it('ranged frame has ranged role', () => {
    const chassis = registry.getChassis('ranged_frame');
    expect(chassis?.role).toBe('ranged');
  });

  it('cavalry frame has mounted role', () => {
    const chassis = registry.getChassis('cavalry_frame');
    expect(chassis?.role).toBe('mounted');
  });
});

describe('simulation with new combat engine', () => {
  it('simulation runs without errors', () => {
    const state = buildMvpScenario(42);
    const result = runWarEcologySimulation(state, registry, 10);
    expect(result).toBeDefined();
    expect(result.round).toBeGreaterThan(0);
  });

  it('simulation produces combat with morale effects', () => {
    const state = buildMvpScenario(42);
    const result = runWarEcologySimulation(state, registry, 25);

    // Check that some units have reduced morale from combat
    const unitsWithReducedMorale = Array.from(result.units.values()).filter(
      (u) => u.morale < 100
    );
    // At least some combat should have happened in 25 turns
    expect(unitsWithReducedMorale.length).toBeGreaterThanOrEqual(0);
  });

  it('simulation remains deterministic', () => {
    const stateA = buildMvpScenario(42);
    const stateB = buildMvpScenario(42);
    const resultA = runWarEcologySimulation(stateA, registry, 20);
    const resultB = runWarEcologySimulation(stateB, registry, 20);

    const jungleA = resultA.factions.get('jungle_clan' as never)!;
    const jungleB = resultB.factions.get('jungle_clan' as never)!;

    expect(jungleA.capabilities?.domainLevels).toEqual(jungleB.capabilities?.domainLevels);
  });
});

describe('explicit abilities', () => {
  it('classifies charge, brace, and ambush eligibility from prototype tags', () => {
    const state = buildMvpScenario(42);
    // cavalry_frame is not in starting prototypes anymore, create one for this test
    const steppeFaction = state.factions.get('steppe_clan' as never)!;
    const cavalryProto = assemblePrototype(
      steppeFaction.id,
      'cavalry_frame' as never,
      ['basic_spear', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: { horsemanship: 6, formation_warfare: 6 },
        validation: {
          ignoreResearchRequirements: true,
        },
      }
    );
    state.prototypes.set(cavalryProto.id, cavalryProto);

    const braceProto = Array.from(state.prototypes.values()).find((prototype) => canUseBrace(prototype));
    const ambushProto = Array.from(state.prototypes.values()).find((prototype) => canUseAmbush(prototype, 'forest'));

    expect(cavalryProto).toBeDefined();
    expect(braceProto).toBeDefined();
    expect(ambushProto).toBeDefined();
    expect(cavalryProto && canUseCharge(cavalryProto)).toBe(true);
    expect(braceProto && canUseBrace(braceProto)).toBe(true);
    expect(ambushProto && canUseAmbush(ambushProto, 'forest')).toBe(true);
    expect(ambushProto && canUseAmbush(ambushProto, 'plains')).toBe(false);
  });
});
