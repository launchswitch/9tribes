import { assemblePrototype } from '../src/design/assemblePrototype';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import type { GameState } from '../src/game/types';
import { applyCombatAction, previewCombatAction } from '../src/systems/combatActionSystem';
import { startResearch } from '../src/systems/researchSystem';
import { runFactionPhase } from '../src/systems/factionPhaseSystem';
import type { ActiveTripleStack, SynergyEffect } from '../src/systems/synergyEngine';
import { GameSession } from '../web/src/game/controller/GameSession';
import { deserializeGameState, serializeGameState } from '../web/src/game/types/playState';

const registry = loadRulesRegistry();

function cloneState(state: GameState): GameState {
  return deserializeGameState(serializeGameState(state));
}

function trimStateToFactions(state: GameState, factionIds: string[]) {
  const factionSet = new Set(factionIds);
  const unitEntries = Array.from(state.units.entries()).filter(([, unit]) => factionSet.has(unit.factionId));
  const cityEntries = Array.from(state.cities.entries()).filter(([, city]) => factionSet.has(city.factionId));
  const villageEntries = Array.from(state.villages.entries()).filter(([, village]) => factionSet.has(village.factionId));

  state.factions = new Map(
    Array.from(state.factions.entries())
      .filter(([id]) => factionSet.has(id))
      .map(([id, faction]) => [
        id,
        {
          ...faction,
          unitIds: faction.unitIds.filter((unitId) => unitEntries.some(([entryId]) => entryId === unitId)),
          cityIds: faction.cityIds.filter((cityId) => cityEntries.some(([entryId]) => entryId === cityId)),
          villageIds: faction.villageIds.filter((villageId) => villageEntries.some(([entryId]) => entryId === villageId)),
        },
      ]),
  );
  state.factionResearch = new Map(Array.from(state.factionResearch.entries()).filter(([id]) => factionSet.has(id)));
  state.units = new Map(unitEntries);
  state.cities = new Map(cityEntries);
  state.villages = new Map(villageEntries);
  state.economy = new Map(Array.from(state.economy.entries()).filter(([id]) => factionSet.has(id)));
  state.research = new Map(Array.from(state.research.entries()).filter(([id]) => factionSet.has(id)));
  state.warExhaustion = new Map(Array.from(state.warExhaustion.entries()).filter(([id]) => factionSet.has(id)));
  state.factionStrategies = new Map(Array.from(state.factionStrategies.entries()).filter(([id]) => factionSet.has(id)));
  state.fogState = new Map(Array.from(state.fogState.entries()).filter(([id]) => factionSet.has(id)));
}

function runLiveEndTurn(state: GameState, humanControlledFactionIds: string[]): GameState {
  const session = new GameSession(
    { type: 'serialized', payload: serializeGameState(state) },
    registry,
    { humanControlledFactionIds },
  );

  session.dispatch({ type: 'end_turn' });
  return session.getState();
}

function runSimFactionPhase(state: GameState, factionId: string): GameState {
  return runFactionPhase(cloneState(state), factionId as never, registry);
}

function runLiveCombat(state: GameState, attackerId: string, defenderId: string, humanControlledFactionIds: string[]) {
  const session = new GameSession(
    { type: 'serialized', payload: serializeGameState(state) },
    registry,
    { humanControlledFactionIds },
  );
  session.dispatch({ type: 'attack_unit', attackerId, defenderId });
  const pending = session.getPendingCombat();
  expect(pending).toBeTruthy();
  if (pending) {
    session.applyResolvedCombat(pending);
  }
  return session.getState();
}

function previewLiveCombat(state: GameState, attackerId: string, defenderId: string, humanControlledFactionIds: string[]) {
  const session = new GameSession(
    { type: 'serialized', payload: serializeGameState(state) },
    registry,
    { humanControlledFactionIds },
  );
  session.dispatch({ type: 'attack_unit', attackerId, defenderId });
  return session.getPendingCombat();
}

function runSharedCombat(state: GameState, attackerId: string, defenderId: string, humanControlledFactionIds: string[]) {
  const session = new GameSession(
    { type: 'serialized', payload: serializeGameState(state) },
    registry,
    { humanControlledFactionIds },
  );
  const preparedState = session.getState();
  const preview = previewCombatAction(preparedState, registry, attackerId as never, defenderId as never);
  expect(preview).toBeTruthy();
  if (!preview) {
    return preparedState;
  }
  return applyCombatAction(preparedState, registry, preview).state;
}

function addCompletedResearchNodes(state: GameState, factionId: string, nodeIds: string[]) {
  const research = state.research.get(factionId as never);
  expect(research).toBeTruthy();
  if (!research) {
    return;
  }

  for (const nodeId of nodeIds) {
    if (!research.completedNodes.includes(nodeId as never)) {
      research.completedNodes.push(nodeId as never);
    }
  }
}

function setActiveTripleStack(
  state: GameState,
  factionId: string,
  effects: Array<{ id: string; name: string; effect: SynergyEffect }>,
  emergentMultiplier?: number,
) {
  const faction = state.factions.get(factionId as never);
  expect(faction).toBeTruthy();
  if (!faction) {
    return;
  }

  const tripleStack = {
    domains: ['venom', 'hitrun', 'fortress'],
    name: 'Parity Triple',
    pairs: effects.map(({ id, name, effect }) => ({
      pairId: id,
      name,
      domains: ['venom', 'hitrun'],
      effect,
    })),
    emergentRule: emergentMultiplier
      ? {
          id: 'parity-multiplier',
          name: 'Parity Multiplier',
          condition: 'synthetic',
          effect: {
            type: 'multiplier',
            pairSynergyMultiplier: emergentMultiplier,
            description: 'Synthetic parity triple multiplier',
          },
        }
      : {
          id: 'parity-noop',
          name: 'Parity Noop',
          condition: 'synthetic',
          effect: {
            type: 'combat_unit',
            scope: 'unit_only',
            doubleCombatBonuses: false,
            description: 'Synthetic parity triple placeholder',
          },
        },
  } as unknown as ActiveTripleStack;

  state.factions.set(factionId as never, {
    ...faction,
    activeTripleStack: tripleStack,
  });
}

function sortRecord(record: Record<string, number>) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeTransportMap(state: GameState) {
  return Array.from(state.transportMap.entries())
    .map(([transportId, transportState]) => ({
      transportId,
      embarkedUnitIds: [...transportState.embarkedUnitIds].sort(),
    }))
    .sort((left, right) => left.transportId.localeCompare(right.transportId));
}

function normalizePoisonTraps(state: GameState) {
  return Array.from(state.poisonTraps.entries())
    .map(([hex, trap]) => ({
      hex,
      damage: trap.damage,
      slow: trap.slow,
      ownerFactionId: trap.ownerFactionId,
    }))
    .sort((left, right) => left.hex.localeCompare(right.hex));
}

function normalizeUnit(state: GameState, unitId: string) {
  const unit = state.units.get(unitId as never);
  if (!unit) {
    return null;
  }

  return {
    hp: unit.hp,
    morale: unit.morale,
    routed: unit.routed,
    preparedAbility: unit.preparedAbility ?? null,
    isStealthed: unit.isStealthed ?? false,
    poisoned: unit.poisoned ?? false,
    poisonStacks: unit.poisonStacks ?? 0,
    frostbiteStacks: unit.frostbiteStacks ?? 0,
    frostbiteDoTDuration: unit.frostbiteDoTDuration ?? 0,
    position: { q: unit.position.q, r: unit.position.r },
  };
}

function normalizeCity(state: GameState, cityId: string) {
  const city = state.cities.get(cityId as never);
  if (!city) {
    return null;
  }

  return {
    factionId: city.factionId,
    besieged: city.besieged,
    wallHP: city.wallHP,
    maxWallHP: city.maxWallHP,
    turnsUnderSiege: city.turnsUnderSiege,
  };
}

function buildParitySlice(
  state: GameState,
  options: {
    factionIds: string[];
    unitIds?: string[];
    cityIds?: string[];
  },
) {
  const units = Object.fromEntries((options.unitIds ?? []).map((unitId) => [unitId, normalizeUnit(state, unitId)]));
  const cities = Object.fromEntries((options.cityIds ?? []).map((cityId) => [cityId, normalizeCity(state, cityId)]));
  const factions = Object.fromEntries(
    options.factionIds.map((factionId) => {
      const faction = state.factions.get(factionId as never);
      const research = state.research.get(factionId as never);
      const warExhaustion = state.warExhaustion.get(factionId as never);
      return [
        factionId,
        {
          learnedDomains: [...(faction?.learnedDomains ?? [])].sort(),
          unlockedRecipeIds: [...(faction?.capabilities?.unlockedRecipeIds ?? [])].sort(),
          research: research
            ? {
                activeNodeId: research.activeNodeId,
                completedNodes: [...research.completedNodes].sort(),
                progressByNodeId: sortRecord({ ...research.progressByNodeId } as Record<string, number>),
              }
            : null,
          warExhaustion: warExhaustion
            ? {
                exhaustionPoints: warExhaustion.exhaustionPoints,
                turnsWithoutLoss: warExhaustion.turnsWithoutLoss,
              }
            : null,
        },
      ];
    }),
  );

  return {
    units,
    cities,
    factions,
    transportMap: normalizeTransportMap(state),
    poisonTraps: normalizePoisonTraps(state),
    contaminatedHexes: [...state.contaminatedHexes].sort(),
  };
}

function buildPreviewSlice(preview: ReturnType<typeof previewCombatAction>) {
  if (!preview) {
    return null;
  }

  return {
    attackerId: preview.attackerId,
    defenderId: preview.defenderId,
    round: preview.round,
    braceTriggered: preview.braceTriggered,
    attackerWasStealthed: preview.attackerWasStealthed,
    details: preview.details,
    triggeredEffects: preview.triggeredEffects,
    result: {
      attackerDamage: preview.result.attackerDamage,
      defenderDamage: preview.result.defenderDamage,
      attackerDestroyed: preview.result.attackerDestroyed,
      defenderDestroyed: preview.result.defenderDestroyed,
      attackerFled: preview.result.attackerFled,
      defenderFled: preview.result.defenderFled,
      attackerRouted: preview.result.attackerRouted,
      defenderRouted: preview.result.defenderRouted,
      attackStrength: preview.result.attackStrength,
      defenseStrength: preview.result.defenseStrength,
      roleModifier: preview.result.roleModifier,
      weaponModifier: preview.result.weaponModifier,
      situationalAttackModifier: preview.result.situationalAttackModifier,
      situationalDefenseModifier: preview.result.situationalDefenseModifier,
      flankingBonus: preview.result.flankingBonus,
      rearAttackBonus: preview.result.rearAttackBonus,
      defenderKnockedBack: preview.result.defenderKnockedBack,
      knockbackDistance: preview.result.knockbackDistance,
    },
  };
}

describe('live session parity harness', () => {
  it('matches the shared faction phase for poison and environmental upkeep', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const steppeId = 'steppe_clan';
    trimStateToFactions(state, [steppeId]);

    const unitId = state.factions.get(steppeId as never)!.unitIds[0];
    state.activeFactionId = steppeId as never;
    state.units.set(unitId as never, {
      ...state.units.get(unitId as never)!,
      position: { q: 14, r: 5 },
      hp: 6,
      poisoned: true,
      poisonStacks: 1,
      morale: 80,
      status: 'spent',
      movesRemaining: 0,
      attacksRemaining: 0,
    });

    const live = runLiveEndTurn(cloneState(state), [steppeId]);
    const sim = runSimFactionPhase(state, steppeId);

    expect(
      buildParitySlice(live, { factionIds: [steppeId], unitIds: [unitId] }),
    ).toEqual(
      buildParitySlice(sim, { factionIds: [steppeId], unitIds: [unitId] }),
    );
  });

  it('matches the shared faction phase for research progress and unlock refresh', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const steppeId = 'steppe_clan';
    trimStateToFactions(state, [steppeId]);

    const faction = state.factions.get(steppeId as never)!;
    const research = state.research.get(steppeId as never)!;
    const nodeDef = registry.getResearchNode('charge', 'charge_t2');
    expect(nodeDef).toBeTruthy();

    research.completedNodes.push('charge_t1' as never);
    state.research.set(
      steppeId as never,
      startResearch(research, 'charge_t2' as never, nodeDef!.prerequisites, faction.learnedDomains),
    );
    state.activeFactionId = steppeId as never;

    const live = runLiveEndTurn(cloneState(state), [steppeId]);
    const sim = runSimFactionPhase(state, steppeId);

    expect(
      buildParitySlice(live, { factionIds: [steppeId] }),
    ).toEqual(
      buildParitySlice(sim, { factionIds: [steppeId] }),
    );
  });

  it('matches the shared faction phase for war-exhaustion ticking and morale penalties', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const steppeId = 'steppe_clan';
    trimStateToFactions(state, [steppeId]);

    const unitId = state.factions.get(steppeId as never)!.unitIds[0];
    state.activeFactionId = steppeId as never;
    state.warExhaustion.set(steppeId as never, {
      factionId: steppeId as never,
      exhaustionPoints: 12,
      turnsWithoutLoss: 0,
    });
    state.units.set(unitId as never, {
      ...state.units.get(unitId as never)!,
      morale: 100,
      status: 'spent',
      movesRemaining: 0,
      attacksRemaining: 0,
    });

    const live = runLiveEndTurn(cloneState(state), [steppeId]);
    const sim = runSimFactionPhase(state, steppeId);

    expect(
      buildParitySlice(live, { factionIds: [steppeId], unitIds: [unitId] }),
    ).toEqual(
      buildParitySlice(sim, { factionIds: [steppeId], unitIds: [unitId] }),
    );
  });

  it('matches the shared faction phase for siege start on an encircled city', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const attackerId = 'steppe_clan';
    const defenderId = 'hill_clan';
    trimStateToFactions(state, [attackerId, defenderId]);

    const attackerFaction = state.factions.get(attackerId as never)!;
    const defenderFaction = state.factions.get(defenderId as never)!;
    const cityId = defenderFaction.cityIds[0];
    const city = state.cities.get(cityId as never)!;
    const defenderCityPosition = { q: 8, r: 6 };
    const baseUnits = attackerFaction.unitIds.map((unitId) => state.units.get(unitId as never)!);
    const siegeUnits = [
      {
        ...baseUnits[0],
        position: { q: 9, r: 6 },
      },
      {
        ...baseUnits[1],
        position: { q: 9, r: 5 },
      },
      {
        ...baseUnits[0],
        id: 'parity_siege_attacker_3' as never,
        position: { q: 8, r: 5 },
      },
      {
        ...baseUnits[1],
        id: 'parity_siege_attacker_4' as never,
        position: { q: 7, r: 6 },
      },
    ];

    state.cities.set(cityId as never, {
      ...city,
      position: defenderCityPosition,
      besieged: false,
      turnsUnderSiege: 0,
    });
    state.units = new Map([
      ...siegeUnits.map((unit) => [unit.id, {
        ...unit,
        status: 'ready' as const,
        attacksRemaining: 1,
        movesRemaining: unit.maxMoves,
      }]),
    ]);
    state.factions.set(attackerId as never, {
      ...attackerFaction,
      unitIds: siegeUnits.map((unit) => unit.id),
    });
    state.factions.set(defenderId as never, {
      ...defenderFaction,
      unitIds: [],
      cityIds: [cityId],
    });
    state.activeFactionId = defenderId as never;

    const live = runLiveEndTurn(cloneState(state), [attackerId, defenderId]);
    const sim = runSimFactionPhase(state, defenderId);

    expect(
      buildParitySlice(live, { factionIds: [defenderId], cityIds: [cityId] }),
    ).toEqual(
      buildParitySlice(sim, { factionIds: [defenderId], cityIds: [cityId] }),
    );
  });

  it('matches the shared combat application for kill-capture resolution', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const attackerId = 'coral_people';
    const defenderId = 'druid_circle';
    trimStateToFactions(state, [attackerId, defenderId]);

    const attackerFaction = state.factions.get(attackerId as never)!;
    const defenderFaction = state.factions.get(defenderId as never)!;
    const slaverProto = assemblePrototype(
      attackerFaction.id,
      'infantry_frame' as never,
      ['slaver_net', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        id: 'parity_elephant_proto' as never,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(slaverProto.id, slaverProto);

    const combatAttackerId = 'parity_kill_capture_attacker';
    const combatDefenderId = defenderFaction.unitIds[0];
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderBase = state.units.get(combatDefenderId as never)!;

    state.units = new Map([
      [
        combatAttackerId as never,
        {
          ...attackerBase,
          id: combatAttackerId as never,
          factionId: attackerFaction.id,
          prototypeId: slaverProto.id,
          position: { q: 10, r: 10 },
          hp: slaverProto.derivedStats.hp,
          maxHp: slaverProto.derivedStats.hp,
          movesRemaining: slaverProto.derivedStats.moves,
          maxMoves: slaverProto.derivedStats.moves,
          attacksRemaining: 1,
          status: 'ready' as const,
          history: [],
          poisonStacks: 0,
          isStealthed: false,
          turnsSinceStealthBreak: 0,
          learnedAbilities: [],
        },
      ],
      [
        combatDefenderId as never,
        {
          ...defenderBase,
          position: { q: 11, r: 10 },
          hp: 3,
          morale: 60,
          routed: false,
          attacksRemaining: 1,
          movesRemaining: defenderBase.maxMoves,
          maxMoves: defenderBase.maxMoves,
          status: 'ready' as const,
          history: [],
          poisonStacks: 0,
          isStealthed: false,
          turnsSinceStealthBreak: 0,
          learnedAbilities: [],
        },
      ],
    ]);
    state.factions.set(attackerFaction.id, {
      ...attackerFaction,
      unitIds: [combatAttackerId],
      cityIds: [],
      villageIds: [],
    });
    state.factions.set(defenderFaction.id, {
      ...defenderFaction,
      unitIds: [combatDefenderId],
      cityIds: [],
      villageIds: [],
    });
    state.cities = new Map();
    state.villages = new Map();
    state.improvements = new Map();
    state.activeFactionId = attackerFaction.id;
    state.rngState = { seed: 3, state: 3 };

    const live = runLiveCombat(cloneState(state), combatAttackerId, combatDefenderId, [attackerFaction.id]);
    const shared = runSharedCombat(state, combatAttackerId, combatDefenderId, [attackerFaction.id]);

    expect(
      buildParitySlice(live, { factionIds: [attackerId, defenderId], unitIds: [combatAttackerId, combatDefenderId] }),
    ).toEqual(
      buildParitySlice(shared, { factionIds: [attackerId, defenderId], unitIds: [combatAttackerId, combatDefenderId] }),
    );
  });

  it('matches the shared combat preview for fortified cover, stampede, and triple-stack knockback pressure', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['savannah_lions', 'druid_circle']);

    const attackerFaction = state.factions.get('savannah_lions' as never)!;
    const defenderFaction = state.factions.get('druid_circle' as never)!;
    const attackerProto = assemblePrototype(
      attackerFaction.id,
      'elephant_frame' as never,
      ['basic_spear', 'simple_armor', 'elephant_harness'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    const defenderProto = assemblePrototype(
      defenderFaction.id,
      'ranged_frame' as never,
      ['basic_bow', 'simple_armor', 'fortress_training'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: defenderFaction.capabilities?.domainLevels,
        id: 'parity_fortified_ranged_proto' as never,
        validation: { ignoreResearchRequirements: true },
      },
    );
    const supportProto = assemblePrototype(
      defenderFaction.id,
      'infantry_frame' as never,
      ['basic_spear', 'simple_armor', 'fortress_training'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: defenderFaction.capabilities?.domainLevels,
        id: 'parity_bulwark_support_proto' as never,
        validation: { ignoreResearchRequirements: true },
      },
    );

    state.prototypes.set(attackerProto.id, attackerProto);
    state.prototypes.set(defenderProto.id, defenderProto);
    state.prototypes.set(supportProto.id, supportProto);
    addCompletedResearchNodes(state, attackerFaction.id, ['charge_t1', 'charge_t2']);
    addCompletedResearchNodes(state, defenderFaction.id, ['nature_healing_t2']);
    setActiveTripleStack(
      state,
      attackerFaction.id,
      [
        {
          id: 'parity-poison-stack',
          name: 'Parity Poison Stack',
          effect: { type: 'multiplier_stack', multiplier: 3 },
        },
        {
          id: 'parity-ram',
          name: 'Parity Ram',
          effect: { type: 'ram_attack', knockbackDistance: 1 },
        },
      ],
      1.5,
    );

    const attackerId = 'parity_preview_elephant' as never;
    const defenderId = 'parity_preview_archer' as never;
    const supportId = 'parity_preview_bulwark' as never;
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderBase = state.units.get(defenderFaction.unitIds[0] as never)!;

    state.map!.tiles.get('10,10')!.terrain = 'plains';
    state.map!.tiles.get('11,10')!.terrain = 'forest';
    state.map!.tiles.get('11,11')!.terrain = 'forest';
    state.cities = new Map([
      ['parity_preview_city' as never, {
        ...state.cities.get(defenderFaction.cityIds[0] as never)!,
        id: 'parity_preview_city' as never,
        factionId: defenderFaction.id,
        position: { q: 11, r: 10 },
        besieged: false,
        turnsUnderSiege: 0,
      }],
    ]);
    state.villages = new Map();
    state.improvements = new Map();
    state.units = new Map([
      [attackerId, {
        ...attackerBase,
        id: attackerId,
        factionId: attackerFaction.id,
        prototypeId: attackerProto.id,
        position: { q: 10, r: 10 },
        hp: attackerProto.derivedStats.hp,
        maxHp: attackerProto.derivedStats.hp,
        movesRemaining: Math.max(0, attackerProto.derivedStats.moves - 1),
        maxMoves: attackerProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready' as const,
        history: [],
      }],
      [defenderId, {
        ...defenderBase,
        id: defenderId,
        factionId: defenderFaction.id,
        prototypeId: defenderProto.id,
        position: { q: 11, r: 10 },
        hp: defenderProto.derivedStats.hp + 4,
        maxHp: defenderProto.derivedStats.hp + 4,
        movesRemaining: defenderProto.derivedStats.moves,
        maxMoves: defenderProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready' as const,
        history: [],
      }],
      [supportId, {
        ...defenderBase,
        id: supportId,
        factionId: defenderFaction.id,
        prototypeId: supportProto.id,
        position: { q: 11, r: 11 },
        hp: supportProto.derivedStats.hp,
        maxHp: supportProto.derivedStats.hp,
        movesRemaining: supportProto.derivedStats.moves,
        maxMoves: supportProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready' as const,
        history: [],
      }],
    ]);
    state.factions.set(attackerFaction.id, {
      ...state.factions.get(attackerFaction.id as never)!,
      unitIds: [attackerId],
      cityIds: [],
      villageIds: [],
    });
    state.factions.set(defenderFaction.id, {
      ...state.factions.get(defenderFaction.id as never)!,
      unitIds: [defenderId, supportId],
      cityIds: ['parity_preview_city' as never],
      villageIds: [],
    });
    state.activeFactionId = attackerFaction.id;
    state.rngState = { seed: 9, state: 9 };

    const livePreview = previewLiveCombat(cloneState(state), attackerId, defenderId, [attackerFaction.id]);
    const sharedPreview = previewCombatAction(state, registry, attackerId as never, defenderId as never);

    expect(sharedPreview).toBeTruthy();
    expect(buildPreviewSlice(livePreview?.preview ?? null)).toEqual(buildPreviewSlice(sharedPreview));
    expect(sharedPreview?.details.synergyAttackModifier).toBeGreaterThan(0);
    expect(sharedPreview?.details.stampedeTriggered).toBe(true);
    expect(sharedPreview?.details.totalKnockbackDistance).toBeGreaterThan(0);
    expect(sharedPreview?.triggeredEffects.map((effect) => effect.label)).toEqual(
      expect.arrayContaining(['Fortified Cover', 'Bulwark', 'Stampede', 'Synergy Attack Bonus']),
    );
  });

  it('matches the shared combat preview for naval coastal assault modifiers', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['coral_people', 'hill_clan']);

    const attackerFaction = state.factions.get('coral_people' as never)!;
    const defenderFaction = state.factions.get('hill_clan' as never)!;
    const attackerProto = assemblePrototype(
      attackerFaction.id,
      'naval_frame' as never,
      ['ship_cannon', 'simple_armor', 'tidal_drill'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        id: 'parity_naval_proto' as never,
        validation: { ignoreResearchRequirements: true },
      },
    );

    state.prototypes.set(attackerProto.id, attackerProto);
    attackerFaction.learnedDomains = [...new Set([...(attackerFaction.learnedDomains ?? []), 'tidal_warfare'])];
    addCompletedResearchNodes(state, attackerFaction.id, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);

    const attackerId = 'parity_preview_naval' as never;
    const defenderId = defenderFaction.unitIds[0];
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderBase = state.units.get(defenderId as never)!;

    state.map!.tiles.get('10,10')!.terrain = 'coast';
    state.map!.tiles.get('11,10')!.terrain = 'plains';
    state.units = new Map([
      [attackerId, {
        ...attackerBase,
        id: attackerId,
        factionId: attackerFaction.id,
        prototypeId: attackerProto.id,
        position: { q: 10, r: 10 },
        hp: attackerProto.derivedStats.hp,
        maxHp: attackerProto.derivedStats.hp,
        movesRemaining: attackerProto.derivedStats.moves,
        maxMoves: attackerProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready' as const,
      }],
      [defenderId as never, {
        ...defenderBase,
        position: { q: 11, r: 10 },
        hp: Math.max(defenderBase.hp, 10),
        maxHp: Math.max(defenderBase.maxHp, 10),
        movesRemaining: defenderBase.maxMoves,
        maxMoves: defenderBase.maxMoves,
        attacksRemaining: 1,
        status: 'ready' as const,
      }],
    ]);
    state.factions.set(attackerFaction.id, {
      ...state.factions.get(attackerFaction.id as never)!,
      unitIds: [attackerId],
      cityIds: [],
      villageIds: [],
    });
    state.factions.set(defenderFaction.id, {
      ...state.factions.get(defenderFaction.id as never)!,
      unitIds: [defenderId],
      cityIds: [],
      villageIds: [],
    });
    state.cities = new Map();
    state.villages = new Map();
    state.improvements = new Map();
    state.activeFactionId = attackerFaction.id;
    state.rngState = { seed: 11, state: 11 };

    const livePreview = previewLiveCombat(cloneState(state), attackerId, defenderId, [attackerFaction.id]);
    const sharedPreview = previewCombatAction(state, registry, attackerId as never, defenderId as never);

    expect(sharedPreview).toBeTruthy();
    expect(buildPreviewSlice(livePreview?.preview ?? null)).toEqual(buildPreviewSlice(sharedPreview));
    expect(sharedPreview?.result.situationalAttackModifier).toBeGreaterThan(0.4);
    expect(sharedPreview?.triggeredEffects.map((effect) => effect.label)).toContain('Tidal Assault');
  });

  it('matches the shared combat application for poison on hit and contamination on kill', () => {
    const poisonState = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(poisonState, ['jungle_clan', 'hill_clan']);

    const attackerFaction = poisonState.factions.get('jungle_clan' as never)!;
    const defenderFaction = poisonState.factions.get('hill_clan' as never)!;
    const poisonProto = assemblePrototype(
      attackerFaction.id,
      'ranged_frame' as never,
      ['blowgun', 'simple_armor', 'venom_rites'] as never,
      registry,
      Array.from(poisonState.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        id: 'parity_poison_proto' as never,
        validation: { ignoreResearchRequirements: true },
      },
    );

    poisonState.prototypes.set(poisonProto.id, poisonProto);
    addCompletedResearchNodes(poisonState, attackerFaction.id, ['venom_t1']);

    const attackerId = 'parity_poison_attacker' as never;
    const defenderId = defenderFaction.unitIds[0];
    const attackerBase = poisonState.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderBase = poisonState.units.get(defenderId as never)!;

    poisonState.units = new Map([
      [attackerId, {
        ...attackerBase,
        id: attackerId,
        factionId: attackerFaction.id,
        prototypeId: poisonProto.id,
        position: { q: 10, r: 10 },
        hp: poisonProto.derivedStats.hp,
        maxHp: poisonProto.derivedStats.hp,
        movesRemaining: poisonProto.derivedStats.moves,
        maxMoves: poisonProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready' as const,
      }],
      [defenderId as never, {
        ...defenderBase,
        position: { q: 11, r: 10 },
        hp: Math.max(defenderBase.hp, 12),
        maxHp: Math.max(defenderBase.maxHp, 12),
        movesRemaining: defenderBase.maxMoves,
        maxMoves: defenderBase.maxMoves,
        attacksRemaining: 1,
        status: 'ready' as const,
      }],
    ]);
    poisonState.factions.set(attackerFaction.id, { ...attackerFaction, unitIds: [attackerId], cityIds: [], villageIds: [] });
    poisonState.factions.set(defenderFaction.id, { ...defenderFaction, unitIds: [defenderId], cityIds: [], villageIds: [] });
    poisonState.cities = new Map();
    poisonState.villages = new Map();
    poisonState.improvements = new Map();
    poisonState.activeFactionId = attackerFaction.id;
    poisonState.rngState = { seed: 13, state: 13 };

    const livePoison = runLiveCombat(cloneState(poisonState), attackerId, defenderId, [attackerFaction.id]);
    const sharedPoison = runSharedCombat(poisonState, attackerId, defenderId, [attackerFaction.id]);

    expect(
      buildParitySlice(livePoison, { factionIds: [attackerFaction.id, defenderFaction.id], unitIds: [attackerId, defenderId] }),
    ).toEqual(
      buildParitySlice(sharedPoison, { factionIds: [attackerFaction.id, defenderFaction.id], unitIds: [attackerId, defenderId] }),
    );
    expect(sharedPoison.units.get(defenderId as never)?.poisoned).toBe(true);
    expect(sharedPoison.units.get(defenderId as never)?.poisonStacks).toBeGreaterThan(1);

    const contaminateState = cloneState(poisonState);
    addCompletedResearchNodes(contaminateState, attackerFaction.id, ['venom_t2']);
    contaminateState.units.set(defenderId as never, {
      ...contaminateState.units.get(defenderId as never)!,
      hp: 3,
      maxHp: Math.max(contaminateState.units.get(defenderId as never)!.maxHp, 12),
    });
    contaminateState.rngState = { seed: 15, state: 15 };

    const liveContaminate = runLiveCombat(cloneState(contaminateState), attackerId, defenderId, [attackerFaction.id]);
    const sharedContaminate = runSharedCombat(contaminateState, attackerId, defenderId, [attackerFaction.id]);

    expect(
      buildParitySlice(liveContaminate, { factionIds: [attackerFaction.id, defenderFaction.id], unitIds: [attackerId, defenderId] }),
    ).toEqual(
      buildParitySlice(sharedContaminate, { factionIds: [attackerFaction.id, defenderFaction.id], unitIds: [attackerId, defenderId] }),
    );
    expect(sharedContaminate.contaminatedHexes.size).toBeGreaterThan(0);
  });

  it('matches the shared combat application for reflection, re-stealth, retreat healing, and synthetic aftermath effects', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['steppe_clan', 'frost_wardens']);

    const attackerFaction = state.factions.get('steppe_clan' as never)!;
    const defenderFaction = state.factions.get('frost_wardens' as never)!;
    const attackerProto = assemblePrototype(
      attackerFaction.id,
      'ranged_frame' as never,
      ['blowgun', 'simple_armor', 'skirmish_drill'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        id: 'parity_aftermath_attacker_proto' as never,
        validation: { ignoreResearchRequirements: true },
      },
    );
    const defenderProto = assemblePrototype(
      defenderFaction.id,
      'infantry_frame' as never,
      ['basic_spear', 'simple_armor', 'fortress_training'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: defenderFaction.capabilities?.domainLevels,
        id: 'parity_aftermath_defender_proto' as never,
        validation: { ignoreResearchRequirements: true },
      },
    );

    state.prototypes.set(attackerProto.id, attackerProto);
    state.prototypes.set(defenderProto.id, defenderProto);
    addCompletedResearchNodes(state, attackerFaction.id, ['hitrun_t1', 'hitrun_t2', 'hitrun_t3', 'river_stealth_t2']);
    addCompletedResearchNodes(state, defenderFaction.id, ['heavy_hitter_t2']);
    setActiveTripleStack(state, attackerFaction.id, [
      {
        id: 'parity-heal-retreat',
        name: 'Parity Heal Retreat',
        effect: { type: 'heal_on_retreat', healAmount: 3 },
      },
      {
        id: 'parity-stealth-recharge',
        name: 'Parity Stealth Recharge',
        effect: { type: 'stealth_recharge' },
      },
      {
        id: 'parity-poison-trap',
        name: 'Parity Poison Trap',
        effect: { type: 'poison_trap', damagePerTurn: 2, slowAmount: 1 },
      },
      {
        id: 'parity-sandstorm',
        name: 'Parity Sandstorm',
        effect: { type: 'sandstorm', aoeDamage: 2, accuracyDebuff: 0.25 },
      },
      {
        id: 'parity-frostbite',
        name: 'Parity Frostbite',
        effect: { type: 'frostbite', coldDamagePerTurn: 2, slowAmount: 1 },
      },
      {
        id: 'parity-combat-heal',
        name: 'Parity Combat Heal',
        effect: { type: 'combat_healing', healPercent: 1 },
      },
      {
        id: 'parity-contaminate',
        name: 'Parity Contaminate',
        effect: { type: 'contaminate', coastalDamage: 2 },
      },
    ]);

    const attackerId = 'parity_aftermath_attacker' as never;
    const defenderId = 'parity_aftermath_defender' as never;
    const splashId = 'parity_aftermath_splash' as never;
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderBase = state.units.get(defenderFaction.unitIds[0] as never)!;

    state.units = new Map([
      [attackerId, {
        ...attackerBase,
        id: attackerId,
        factionId: attackerFaction.id,
        prototypeId: attackerProto.id,
        position: { q: 10, r: 10 },
        hp: attackerProto.derivedStats.hp - 2,
        maxHp: attackerProto.derivedStats.hp,
        movesRemaining: attackerProto.derivedStats.moves,
        maxMoves: attackerProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready' as const,
        isStealthed: true,
        turnsSinceStealthBreak: 0,
      }],
      [defenderId, {
        ...defenderBase,
        id: defenderId,
        factionId: defenderFaction.id,
        prototypeId: defenderProto.id,
        position: { q: 12, r: 10 },
        hp: Math.max(defenderBase.hp, 11),
        maxHp: Math.max(defenderBase.maxHp, 11),
        movesRemaining: defenderProto.derivedStats.moves,
        maxMoves: defenderProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready' as const,
      }],
      [splashId, {
        ...defenderBase,
        id: splashId,
        factionId: defenderFaction.id,
        prototypeId: defenderProto.id,
        position: { q: 12, r: 10 },
        hp: Math.max(defenderBase.hp, 8),
        maxHp: Math.max(defenderBase.maxHp, 8),
        movesRemaining: defenderProto.derivedStats.moves,
        maxMoves: defenderProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready' as const,
      }],
    ]);
    state.factions.set(attackerFaction.id, {
      ...state.factions.get(attackerFaction.id as never)!,
      unitIds: [attackerId],
      cityIds: [],
      villageIds: [],
    });
    state.factions.set(defenderFaction.id, {
      ...state.factions.get(defenderFaction.id as never)!,
      unitIds: [defenderId, splashId],
      cityIds: [],
      villageIds: [],
    });
    state.cities = new Map();
    state.villages = new Map();
    state.improvements = new Map();
    state.activeFactionId = attackerFaction.id;
    state.rngState = { seed: 17, state: 17 };

    const live = runLiveCombat(cloneState(state), attackerId, defenderId, [attackerFaction.id]);
    const shared = runSharedCombat(state, attackerId, defenderId, [attackerFaction.id]);

    expect(
      buildParitySlice(live, { factionIds: [attackerFaction.id, defenderFaction.id], unitIds: [attackerId, defenderId, splashId] }),
    ).toEqual(
      buildParitySlice(shared, { factionIds: [attackerFaction.id, defenderFaction.id], unitIds: [attackerId, defenderId, splashId] }),
    );
    expect(shared.units.get(attackerId)?.isStealthed).toBe(true);
    expect(shared.contaminatedHexes.size).toBeGreaterThan(0);
    expect(shared.units.get(defenderId)?.frostbiteStacks ?? 0).toBeGreaterThan(0);
    expect(shared.poisonTraps.size).toBeGreaterThan(0);
    expect(shared.units.get(splashId)?.hp).toBeLessThan(state.units.get(splashId)?.hp ?? Infinity);
    expect(shared.units.get(attackerId)?.hp).toBeGreaterThanOrEqual(state.units.get(attackerId)?.hp ?? 0);
  });

});
