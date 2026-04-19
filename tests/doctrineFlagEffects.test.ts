import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combatActionSystem';
import { applyEnvironmentalDamage } from '../src/systems/simulation/environmentalEffects';
import { createResearchState } from '../src/systems/researchSystem';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { hexToKey } from '../src/core/grid';
import type { GameState } from '../src/game/types';

const registry = loadRulesRegistry();

function setupTwoUnits() {
  const state = buildMvpScenario(42);
  // Keep only jungle_clan (venom native) and savannah_lions (charge native)
  const jungleId = 'jungle_clan' as never;
  const lionsId = 'savannah_lions' as never;
  const jungleUnitId = state.factions.get(jungleId)!.unitIds[0];
  const lionsUnitId = state.factions.get(lionsId)!.unitIds[0];

  // Remove all other units
  const keep = new Set([jungleUnitId, lionsUnitId]);
  state.units = new Map(Array.from(state.units.entries()).filter(([id]) => keep.has(id)));
  for (const faction of state.factions.values()) {
    faction.unitIds = faction.unitIds.filter((id) => keep.has(id));
  }

  // Place adjacent
  const posA = { q: 8, r: 8 };
  const posB = { q: 9, r: 8 };
  state.units.set(jungleUnitId, {
    ...state.units.get(jungleUnitId)!,
    position: posA,
    status: 'ready',
    attacksRemaining: 1,
    movesRemaining: 1,
  });
  state.units.set(lionsUnitId, {
    ...state.units.get(lionsUnitId)!,
    position: posB,
    status: 'ready',
    attacksRemaining: 1,
    movesRemaining: 1,
  });

  // Set terrain
  if (state.map) {
    state.map.tiles.set(hexToKey(posA), { position: posA, terrain: 'plains' });
    state.map.tiles.set(hexToKey(posB), { position: posB, terrain: 'plains' });
  }

  state.activeFactionId = lionsId;
  return { state, jungleUnitId, lionsUnitId, jungleId, lionsId, posA, posB };
}

function addResearchNodes(state: GameState, factionId: string, nodes: string[]) {
  let research = state.research.get(factionId as never);
  if (!research) {
    research = createResearchState(factionId as never);
    state.research.set(factionId as never, research);
  }
  for (const node of nodes) {
    if (!research.completedNodes.includes(node as never)) {
      research.completedNodes.push(node as never);
    }
  }
}

function setTerrainAt(state: GameState, pos: { q: number; r: number }, terrain: string) {
  if (state.map) {
    state.map.tiles.set(hexToKey(pos), { position: pos, terrain: terrain as never });
  }
}

// ── R1: forcedMarchEnabled ──

describe('R1: forcedMarchEnabled — no cooldown on first charge', () => {
  it('grants charge bonus without movement when forcedMarchEnabled is true', () => {
    const { state, jungleUnitId, lionsUnitId, jungleId } = setupTwoUnits();

    // Use jungle_clan (nativeDomain=venom, NOT charge) as attacker so charge_t1
    // isn't auto-completed. We'll manually add charge_t1.
    state.activeFactionId = jungleId as never;

    // Make jungle_unit charge-capable (mounted/shock tag) and NOT moved
    const attacker = state.units.get(jungleUnitId)!;
    const proto = state.prototypes.get(attacker.prototypeId)!;
    state.prototypes.set(attacker.prototypeId, {
      ...proto,
      tags: [...(proto.tags ?? []), 'mounted'],
      derivedStats: { ...proto.derivedStats, role: 'mounted', range: 1 },
    });

    // Set movesRemaining === maxMoves (has NOT moved)
    state.units.set(jungleUnitId, {
      ...attacker,
      movesRemaining: attacker.maxMoves,
      attacksRemaining: 1,
    });

    // Without charge_t1, forcedMarchEnabled = false → charge should NOT trigger
    const doctrineBefore = resolveResearchDoctrine(
      state.research.get(jungleId as never),
      state.factions.get(jungleId as never),
    );
    expect(doctrineBefore.forcedMarchEnabled).toBe(false);

    const previewNoDoctrine = previewCombatAction(state, registry, jungleUnitId, lionsUnitId);
    expect(previewNoDoctrine).toBeTruthy();
    expect(previewNoDoctrine!.details.isChargeAttack).toBe(false);

    // Add charge_t1 research → forcedMarchEnabled = true
    addResearchNodes(state, jungleId, ['charge_t1']);
    const doctrineAfter = resolveResearchDoctrine(
      state.research.get(jungleId as never),
      state.factions.get(jungleId as never),
    );
    expect(doctrineAfter.forcedMarchEnabled).toBe(true);

    // With forcedMarchEnabled, charge should trigger even without movement
    const previewWithDoctrine = previewCombatAction(state, registry, jungleUnitId, lionsUnitId);
    expect(previewWithDoctrine).toBeTruthy();
    expect(previewWithDoctrine!.details.isChargeAttack).toBe(true);
  });
});

describe('R5: stealthCloakAuraEnabled - stealthed units cloak adjacent allies', () => {
  it('lets an adjacent ally attack as cloaked and gain the stealth ambush bonus', () => {
    const { state, lionsUnitId, jungleUnitId, lionsId } = setupTwoUnits();

    const baselinePreview = previewCombatAction(state, registry, lionsUnitId, jungleUnitId);
    expect(baselinePreview).toBeTruthy();
    expect(baselinePreview!.attackerWasStealthed).toBe(false);

    state.factions.set(lionsId as never, {
      ...state.factions.get(lionsId as never)!,
      nativeDomain: 'river_stealth',
      learnedDomains: ['river_stealth'],
    });
    addResearchNodes(state, lionsId, ['river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3']);

    const attackerBase = state.units.get(lionsUnitId)!;
    const attackerPrototype = state.prototypes.get(attackerBase.prototypeId as never)!;
    const sourcePrototypeId = 'cloak_source_proto' as never;
    state.prototypes.set(sourcePrototypeId, {
      ...attackerPrototype,
      id: sourcePrototypeId,
      tags: [...new Set([...(attackerPrototype.tags ?? []), 'stealth'])],
    });

    const sourceUnitId = 'cloak_source_unit' as never;
    state.units.set(sourceUnitId, {
      ...attackerBase,
      id: sourceUnitId,
      prototypeId: sourcePrototypeId,
      position: { q: 10, r: 8 },
      isStealthed: true,
      turnsSinceStealthBreak: 0,
      attacksRemaining: 1,
      movesRemaining: 1,
    });
    state.factions.set(lionsId as never, {
      ...state.factions.get(lionsId as never)!,
      unitIds: [...state.factions.get(lionsId as never)!.unitIds, sourceUnitId],
    });

    const cloakedPreview = previewCombatAction(state, registry, lionsUnitId, jungleUnitId);
    expect(cloakedPreview).toBeTruthy();
    expect(cloakedPreview!.attackerWasStealthed).toBe(true);
    expect(cloakedPreview!.result.defenderDamage).toBeGreaterThan(baselinePreview!.result.defenderDamage);

    const result = applyCombatAction(state, registry, cloakedPreview!);
    const attackerAfter = result.state.units.get(lionsUnitId)!;
    expect(attackerAfter.isStealthed).toBe(false);
    expect(attackerAfter.turnsSinceStealthBreak).toBe(0);
  });
});

describe('combat cleanup', () => {
  it('removes defenders that hit zero hp from pursuit aftermath damage', () => {
    const { state, lionsUnitId, jungleUnitId, lionsId } = setupTwoUnits();

    state.factions.set(lionsId as never, {
      ...state.factions.get(lionsId as never)!,
      nativeDomain: 'hitrun',
      learnedDomains: ['hitrun'],
    });
    state.units.set(jungleUnitId, {
      ...state.units.get(jungleUnitId)!,
      hp: 3,
    });

    const preview = previewCombatAction(state, registry, lionsUnitId, jungleUnitId);
    expect(preview).toBeTruthy();

    const result = applyCombatAction(state, registry, {
      ...preview!,
      result: {
        ...preview!.result,
        attackerDamage: 0,
        defenderDamage: 1,
        attackerDestroyed: false,
        defenderDestroyed: false,
      },
    });

    expect(result.feedback.resolution.pursuitDamageApplied).toBe(2);
    expect(result.state.units.has(jungleUnitId)).toBe(false);
    expect(result.state.factions.get('jungle_clan' as never)?.unitIds).not.toContain(jungleUnitId);
  });
});

// ── R2: poisonBonusEnabled ──

describe('R2: poisonBonusEnabled — +50% poison damage multiplier', () => {
  it('applies 1.5x poison tick damage when poisonBonusEnabled is true', () => {
    const { state, jungleUnitId, jungleId } = setupTwoUnits();

    // Set up research: venom_t1 + venom_t2 for base stacks=2, damagePerStack=4
    addResearchNodes(state, jungleId, ['venom_t1', 'venom_t2']);

    // Make this a foreign T3 for venom to enable poisonBonusEnabled
    const faction = state.factions.get(jungleId as never)!;
    // jungle_clan has nativeDomain=venom, so native T3 would give toxicBulwarkEnabled.
    // For foreign test, change native domain to something else
    state.factions.set(jungleId as never, {
      ...faction,
      nativeDomain: 'fortress',
      learnedDomains: ['fortress', 'venom'],
    });
    addResearchNodes(state, jungleId, ['venom_t3']);

    const doctrine = resolveResearchDoctrine(
      state.research.get(jungleId as never),
      state.factions.get(jungleId as never),
    );
    expect(doctrine.poisonBonusEnabled).toBe(true);
    expect(doctrine.poisonDamagePerStack).toBe(2); // venom_t2

    // Poison a unit: 2 stacks × 2 dmg/stack = 4 base, × 1.5 = 6
    const unit = state.units.get(jungleUnitId)!;
    const hpBefore = 50;
    state.units.set(jungleUnitId, {
      ...unit,
      hp: hpBefore,
      poisoned: true,
      poisonStacks: 2,
      poisonedBy: jungleId,
    });

    const newState = applyEnvironmentalDamage(state, jungleId as never, registry);
    const updatedUnit = newState.units.get(jungleUnitId)!;
    // 2 stacks × 2 dmgPerStack = 4, × 1.5 = Math.round(6) = 6
    expect(updatedUnit.hp).toBe(hpBefore - 6);
  });

  it('applies normal poison tick damage when poisonBonusEnabled is false', () => {
    const { state, jungleUnitId, jungleId } = setupTwoUnits();

    // Only venom_t1 + venom_t2, no T3 → poisonBonusEnabled = false
    addResearchNodes(state, jungleId, ['venom_t1', 'venom_t2']);

    const unit = state.units.get(jungleUnitId)!;
    const hpBefore = 50;
    state.units.set(jungleUnitId, {
      ...unit,
      hp: hpBefore,
      poisoned: true,
      poisonStacks: 2,
      poisonedBy: jungleId,
    });

    const newState = applyEnvironmentalDamage(state, jungleId as never, registry);
    const updatedUnit = newState.units.get(jungleUnitId)!;
    // 2 stacks × 2 dmgPerStack = 4, no multiplier
    expect(updatedUnit.hp).toBe(hpBefore - 4);
  });
});

// ── R3: toxicBulwarkEnabled ──

describe('R3: toxicBulwarkEnabled — all units apply poison on hit', () => {
  it('applies poison from non-poison unit when toxicBulwarkEnabled is true', () => {
    const { state, lionsUnitId, jungleUnitId, lionsId } = setupTwoUnits();

    // Make attacker NOT have poison tag (remove any poison tags)
    const attacker = state.units.get(lionsUnitId)!;
    const proto = state.prototypes.get(attacker.prototypeId)!;
    state.prototypes.set(attacker.prototypeId, {
      ...proto,
      tags: (proto.tags ?? []).filter((t) => t !== 'poison'),
    });

    // Set up native venom T3 for lions → toxicBulwarkEnabled = true
    const faction = state.factions.get(lionsId as never)!;
    state.factions.set(lionsId as never, {
      ...faction,
      nativeDomain: 'venom',
      learnedDomains: ['venom'],
    });
    addResearchNodes(state, lionsId, ['venom_t1', 'venom_t2', 'venom_t3']);

    const doctrine = resolveResearchDoctrine(
      state.research.get(lionsId as never),
      state.factions.get(lionsId as never),
    );
    expect(doctrine.toxicBulwarkEnabled).toBe(true);

    // Verify defender starts not poisoned
    const defenderBefore = state.units.get(jungleUnitId)!;
    expect(defenderBefore.poisoned).toBeFalsy();

    // Run combat
    const preview = previewCombatAction(state, registry, lionsUnitId, jungleUnitId);
    expect(preview).toBeTruthy();
    const result = applyCombatAction(state, registry, preview!);

    // Defender should now be poisoned (via toxicBulwark, not via poison tag)
    const defenderAfter = result.state.units.get(jungleUnitId)!;
    if (!preview!.result.defenderDestroyed && preview!.result.defenderDamage > 0) {
      expect(defenderAfter.poisoned).toBe(true);
      expect(defenderAfter.poisonStacks).toBeGreaterThan(0);
    }
  });

  it('does not apply poison without poison tag when toxicBulwarkEnabled is false', () => {
    const { state, lionsUnitId, jungleUnitId, lionsId } = setupTwoUnits();

    // Remove poison tag from attacker
    const attacker = state.units.get(lionsUnitId)!;
    const proto = state.prototypes.get(attacker.prototypeId)!;
    state.prototypes.set(attacker.prototypeId, {
      ...proto,
      tags: (proto.tags ?? []).filter((t) => t !== 'poison'),
    });

    // No venom research → toxicBulwarkEnabled = false
    const doctrine = resolveResearchDoctrine(
      state.research.get(lionsId as never),
      state.factions.get(lionsId as never),
    );
    expect(doctrine.toxicBulwarkEnabled).toBe(false);

    const preview = previewCombatAction(state, registry, lionsUnitId, jungleUnitId);
    expect(preview).toBeTruthy();
    const result = applyCombatAction(state, registry, preview!);

    const defenderAfter = result.state.units.get(jungleUnitId)!;
    // Should NOT be poisoned (no poison tag, no toxicBulwark)
    expect(defenderAfter.poisoned).toBeFalsy();
  });
});

// ── R4: permanentStealthEnabled ──

describe('R4: permanentStealthEnabled — permanent stealth in desert', () => {
  it('preserves stealth after attacking from desert with permanentStealthEnabled', () => {
    const { state, lionsUnitId, jungleUnitId, lionsId, posB } = setupTwoUnits();

    // Put attacker on desert terrain (attacker=lions is at posB)
    setTerrainAt(state, posB, 'desert');

    // Give attacker stealth tag and make them stealthed
    const attacker = state.units.get(lionsUnitId)!;
    const proto = state.prototypes.get(attacker.prototypeId)!;
    state.prototypes.set(attacker.prototypeId, {
      ...proto,
      tags: [...(proto.tags ?? []), 'stealth'],
    });
    state.units.set(lionsUnitId, {
      ...attacker,
      isStealthed: true,
      turnsSinceStealthBreak: 0,
    });

    // Add camel_adaptation_t2 research → permanentStealthEnabled = true
    addResearchNodes(state, lionsId, ['camel_adaptation_t2']);

    const doctrine = resolveResearchDoctrine(
      state.research.get(lionsId as never),
      state.factions.get(lionsId as never),
    );
    expect(doctrine.permanentStealthEnabled).toBe(true);

    const preview = previewCombatAction(state, registry, lionsUnitId, jungleUnitId);
    expect(preview).toBeTruthy();
    expect(preview!.attackerWasStealthed).toBe(true);

    const result = applyCombatAction(state, registry, preview!);
    const attackerAfter = result.state.units.get(lionsUnitId)!;

    // Attacker should REMAIN stealthed (desert + permanentStealthEnabled)
    if (attackerAfter.hp > 0) {
      expect(attackerAfter.isStealthed).toBe(true);
    }
  });

  it('breaks stealth after attacking from non-desert terrain even with permanentStealthEnabled', () => {
    const { state, lionsUnitId, jungleUnitId, lionsId, posB } = setupTwoUnits();

    // Put attacker on plains (not desert); attacker=lions is at posB
    setTerrainAt(state, posB, 'plains');

    const attacker = state.units.get(lionsUnitId)!;
    const proto = state.prototypes.get(attacker.prototypeId)!;
    state.prototypes.set(attacker.prototypeId, {
      ...proto,
      tags: [...(proto.tags ?? []), 'stealth'],
    });
    state.units.set(lionsUnitId, {
      ...attacker,
      isStealthed: true,
      turnsSinceStealthBreak: 0,
    });

    addResearchNodes(state, lionsId, ['camel_adaptation_t2']);

    const preview = previewCombatAction(state, registry, lionsUnitId, jungleUnitId);
    expect(preview).toBeTruthy();
    expect(preview!.attackerWasStealthed).toBe(true);

    const result = applyCombatAction(state, registry, preview!);
    const attackerAfter = result.state.units.get(lionsUnitId)!;

    // Should break stealth (not on desert)
    if (attackerAfter.hp > 0) {
      expect(attackerAfter.isStealthed).toBe(false);
      expect(attackerAfter.turnsSinceStealthBreak).toBe(1);
    }
  });

  it('breaks stealth on desert without permanentStealthEnabled', () => {
    const { state, lionsUnitId, jungleUnitId, lionsId, posB } = setupTwoUnits();

    setTerrainAt(state, posB, 'desert');

    const attacker = state.units.get(lionsUnitId)!;
    const proto = state.prototypes.get(attacker.prototypeId)!;
    state.prototypes.set(attacker.prototypeId, {
      ...proto,
      tags: [...(proto.tags ?? []), 'stealth'],
    });
    state.units.set(lionsUnitId, {
      ...attacker,
      isStealthed: true,
      turnsSinceStealthBreak: 0,
    });

    // No camel_adaptation_t2 → permanentStealthEnabled = false
    const doctrine = resolveResearchDoctrine(
      state.research.get(lionsId as never),
      state.factions.get(lionsId as never),
    );
    expect(doctrine.permanentStealthEnabled).toBe(false);

    const preview = previewCombatAction(state, registry, lionsUnitId, jungleUnitId);
    expect(preview).toBeTruthy();
    expect(preview!.attackerWasStealthed).toBe(true);

    const result = applyCombatAction(state, registry, preview!);
    const attackerAfter = result.state.units.get(lionsUnitId)!;

    if (attackerAfter.hp > 0) {
      expect(attackerAfter.isStealthed).toBe(false);
    }
  });
});
