import { getNeighbors, hexDistance, hexToKey } from '../../core/grid.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { Unit } from '../../features/units/types.js';
import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import { resolveCapabilityDoctrine } from '../capabilityDoctrine.js';
import { clearPreparedAbility } from '../abilitySystem.js';
import { applyCombatSignals } from '../combatSignalSystem.js';
import { unlockHybridRecipes } from '../hybridSystem.js';
import { awardCombatXP } from '../xpSystem.js';
import { tryPromoteUnit } from '../veterancySystem.js';
import { tryLearnFromKill } from '../learnByKillSystem.js';
import { attemptCapture, attemptNonCombatCapture, hasCaptureAbility } from '../captureSystem.js';
import { addExhaustion, EXHAUSTION_CONFIG } from '../warExhaustionSystem.js';
import { applyContactTransfer } from '../capabilitySystem.js';
import { applyPoisonDoT, enterStealth, findRetreatHex } from '../signatureAbilitySystem.js';
import { getUnitAtHex } from '../occupancySystem.js';
import {
  recordBattleFought,
  recordEnemyKilled,
  recordPromotion,
  updateCombatRecordOnLoss,
  updateCombatRecordOnWin,
} from '../historySystem.js';

import type {
  CombatActionApplyResult,
  CombatActionFeedback,
  CombatActionPreview,
  CombatActionResolution,
} from './types.js';
import { pushCombatEffect } from './labeling.js';
import {
  WATER_TERRAIN,
  pruneDeadUnits,
  removeDeadUnitsFromFactions,
  rotateUnitToward,
  writeUnitToState,
  applyKnockbackDistance,
  destroyTransportIfApplicable,
} from './helpers.js';
import { maybeAbsorbFaction } from './factionAbsorption.js';

export function applyCombatAction(
  state: GameState,
  registry: RulesRegistry,
  preview: CombatActionPreview,
): CombatActionApplyResult {
  const baseResolution: CombatActionResolution = {
    triggeredEffects: [...preview.triggeredEffects],
    capturedOnKill: false,
    retreatCaptured: false,
    poisonApplied: false,
    reStealthTriggered: false,
    reflectionDamageApplied: 0,
    combatHealingApplied: 0,
    sandstormTargetsHit: 0,
    contaminatedHexApplied: false,
    frostbiteApplied: false,
    hitAndRunTriggered: false,
    healOnRetreatApplied: 0,
    totalKnockbackDistance: 0,
    pursuitDamageApplied: 0,
    emergentSustainHealApplied: 0,
    emergentSustainMinHpSaved: false,
  };

  const attacker = state.units.get(preview.attackerId);
  const defender = state.units.get(preview.defenderId);
  if (!attacker || !defender) {
    return {
      state,
      feedback: {
        lastLearnedDomain: null,
        hitAndRunRetreat: null,
        absorbedDomains: [],
        resolution: baseResolution,
      },
    };
  }

  const attackerPrototype = state.prototypes.get(attacker.prototypeId as never);
  const defenderPrototype = state.prototypes.get(defender.prototypeId as never);
  if (!attackerPrototype || !defenderPrototype) {
    return {
      state,
      feedback: {
        lastLearnedDomain: null,
        hitAndRunRetreat: null,
        absorbedDomains: [],
        resolution: baseResolution,
      },
    };
  }

  const attackerIsRanged = attackerPrototype.derivedStats.role === 'ranged' || (attackerPrototype.derivedStats.range ?? 1) > 1;

  const attackerFactionForDoctrine = state.factions.get(attacker.factionId);
  const attackerDoctrine = attackerFactionForDoctrine
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), attackerFactionForDoctrine)
    : undefined;

  // E5 — Paladin minHp: can't drop below threshold from a single hit
  const rawAttackerHp = attacker.hp - preview.result.attackerDamage;
  const minHpFloor = preview.details.emergentSustainMinHp;
  let attackerHp = Math.max(0, rawAttackerHp);
  if (minHpFloor > 0 && rawAttackerHp <= 0 && attacker.hp > 0) {
    attackerHp = Math.min(minHpFloor, attacker.hp);
    baseResolution.emergentSustainMinHpSaved = true;
  }

  let nextAttacker: Unit = {
    ...attacker,
    hp: attackerHp,
    morale: Math.max(0, attacker.morale - preview.result.attackerMoraleLoss),
    routed: preview.result.attackerRouted || preview.result.attackerFled,
    hillDugIn: false,
    attacksRemaining: 0,
    movesRemaining: 0,
    activatedThisRound: true,
    status: 'spent',
  };
  let nextDefender: Unit = {
    ...defender,
    hp: Math.max(0, defender.hp - preview.result.defenderDamage),
    morale: Math.max(0, defender.morale - preview.result.defenderMoraleLoss),
    routed: preview.result.defenderRouted || preview.result.defenderFled,
    hillDugIn: false,
    status: preview.result.defenderDestroyed ? 'spent' : defender.status,
  };

  if (preview.attackerWasStealthed && attacker.isStealthed && nextAttacker.hp > 0) {
    const isDesertStealth = attackerDoctrine?.permanentStealthEnabled === true
      && preview.details.attackerTerrainId === 'desert';
    const isEmergentTerrainStealth = preview.details.emergentPermanentStealthTerrains.length > 0
      && preview.details.emergentPermanentStealthTerrains.includes(preview.details.attackerTerrainId);
    if (!isDesertStealth && !isEmergentTerrainStealth) {
      nextAttacker = { ...nextAttacker, isStealthed: false, turnsSinceStealthBreak: 1 };
    }
  }
  if (nextAttacker.preparedAbility) {
    nextAttacker = clearPreparedAbility(nextAttacker);
  }
  if (preview.braceTriggered && nextDefender.preparedAbility) {
    nextDefender = clearPreparedAbility(nextDefender);
  }

  let feedback: CombatActionFeedback = {
    lastLearnedDomain: null,
    hitAndRunRetreat: null,
    absorbedDomains: [],
    resolution: baseResolution,
  };

  if (preview.result.defenderDestroyed && !preview.result.attackerDestroyed && nextAttacker.hp > 0) {
    const learnResult = tryLearnFromKill(nextAttacker, defender, state, state.rngState);
    nextAttacker = learnResult.unit;
    if (learnResult.learned && learnResult.domainId) {
      feedback = {
        ...feedback,
        lastLearnedDomain: {
          unitId: nextAttacker.id,
          domainId: learnResult.domainId,
        },
      };
    }
  }

  if (nextAttacker.hp > 0) {
    nextAttacker = awardCombatXP(nextAttacker, preview.result.defenderDestroyed, !preview.result.attackerDestroyed);
    nextAttacker = tryPromoteUnit(nextAttacker, registry);
  }

  const nextUnits = new Map(state.units);
  if (nextAttacker.hp > 0) {
    nextUnits.set(preview.attackerId, nextAttacker);
  } else {
    nextUnits.delete(preview.attackerId);
  }
  if (nextDefender.hp > 0) {
    nextUnits.set(preview.defenderId, nextDefender);
  } else {
    nextUnits.delete(preview.defenderId);
  }

  let current: GameState = {
    ...state,
    units: nextUnits,
    factions: removeDeadUnitsFromFactions(state.factions, nextUnits),
    rngState: preview.result.rngState,
  };

  const attackerFaction = current.factions.get(attacker.factionId);
  const defenderFaction = current.factions.get(defender.factionId);
  const defenderDoctrine = defenderFaction
    ? resolveCapabilityDoctrine(current.research.get(defender.factionId), defenderFaction)
    : undefined;

  // E5 — Paladin sustain: heal for % of damage dealt
  let emergentSustainHealApplied = 0;
  if (preview.details.emergentSustainHealPercent > 0 && nextAttacker.hp > 0 && preview.result.defenderDamage > 0) {
    const sustainHeal = Math.floor(preview.result.defenderDamage * preview.details.emergentSustainHealPercent);
    if (sustainHeal > 0) {
      const sustainUnit = current.units.get(preview.attackerId);
      if (sustainUnit && sustainUnit.hp > 0) {
        const healedHp = Math.min(sustainUnit.maxHp, sustainUnit.hp + sustainHeal);
        const afterSustain = new Map(current.units);
        afterSustain.set(preview.attackerId, { ...sustainUnit, hp: healedHp });
        current = { ...current, units: afterSustain };
        emergentSustainHealApplied = sustainHeal;
        baseResolution.emergentSustainHealApplied = sustainHeal;
      }
    }
  }

  // Pursuit bonus: hitrun domain units press their advantage when winning the exchange
  const hasHitrunDomain = attackerFaction && (
    attackerFaction.nativeDomain === 'hitrun'
    || attackerFaction.learnedDomains?.includes('hitrun')
  );
  let pursuitDamageApplied = 0;
  if (
    hasHitrunDomain
    && nextAttacker.hp > 0
    && nextDefender.hp > 0
    && preview.result.defenderDamage > preview.result.attackerDamage
  ) {
    const PURSUIT_BONUS = 2;
    const pursuedDefender = current.units.get(preview.defenderId);
    if (pursuedDefender && pursuedDefender.hp > 0) {
      const newHp = Math.max(0, pursuedDefender.hp - PURSUIT_BONUS);
      const unitsAfterPursuit = new Map(current.units);
      unitsAfterPursuit.set(preview.defenderId, { ...pursuedDefender, hp: newHp });
      current = { ...current, units: unitsAfterPursuit };
      pursuitDamageApplied = PURSUIT_BONUS;
    }
  }
  const attackerTerrainId = current.map?.tiles.get(hexToKey(attacker.position))?.terrain ?? '';
  const isGreedyCoastal = attackerFaction?.identityProfile.passiveTrait === 'greedy'
    && WATER_TERRAIN.has(attackerTerrainId);
  const autoCaptureAbility = attackerDoctrine?.autoCaptureEnabled && defender.hp <= defender.maxHp * 0.25
    ? {
        greedyCaptureChance: 1,
        greedyCaptureCooldown: 0,
        greedyCaptureHpFraction: 0.25,
      }
    : null;
  // E3/E4 — emergent capture bonus from Slave Empire (+0.20) and Desert Raider (+0.30 in desert)
  const emergentCaptureBonus = preview.details.emergentCaptureBonus
    + (preview.details.defenderTerrainId === 'desert' ? preview.details.emergentDesertCaptureBonus : 0);

  // E5 — Paladin sustain overrides attackerDestroyed when minHp saved the unit
  const attackerActuallyDestroyed = preview.result.attackerDestroyed && !baseResolution.emergentSustainMinHpSaved;

  let capturedOnKill = false;
  let retreatCaptured = false;
  if (
    preview.result.defenderDestroyed
    && nextAttacker.hp > 0
    && (hasCaptureAbility(attackerPrototype, registry) || isGreedyCoastal || autoCaptureAbility)
  ) {
    const captureResult = attemptCapture(
      current,
      nextAttacker,
      defender,
      registry,
      autoCaptureAbility
        ?? (isGreedyCoastal && !hasCaptureAbility(attackerPrototype, registry)
          ? registry.getSignatureAbility(attacker.factionId)
          : null),
      current.rngState,
      emergentCaptureBonus > 0 ? emergentCaptureBonus : undefined,
    );
    current = captureResult.state;
    capturedOnKill = captureResult.captured;
  }

  // Melee advance: melee attacker occupies defender's hex on kill (not capture)
  if (
    preview.result.defenderDestroyed
    && !attackerActuallyDestroyed
    && !capturedOnKill
    && !attackerIsRanged
  ) {
    const advancingUnit = current.units.get(preview.attackerId);
    if (advancingUnit) {
      const advancedUnits = new Map(current.units);
      advancedUnits.set(preview.attackerId, {
        ...advancingUnit,
        position: defender.position,
      });
      current = { ...current, units: advancedUnits };
    }
  }

  if (!preview.result.defenderDestroyed && preview.result.defenderFled && nextAttacker.hp > 0 && attackerDoctrine?.captureRetreatEnabled) {
    const retreatCapture = attemptNonCombatCapture(
      current,
      preview.attackerId,
      preview.defenderId,
      registry,
      0.15,
      0.25,
      0,
      current.rngState,
    );
    current = retreatCapture.state;
    retreatCaptured = retreatCapture.captured;
  }

  let totalKnockbackDistance = 0;
  if (preview.details.totalKnockbackDistance > 0 && !preview.result.defenderDestroyed && !retreatCaptured) {
    const knockbackResult = applyKnockbackDistance(current, preview.attackerId, preview.defenderId, preview.details.totalKnockbackDistance);
    current = knockbackResult.state;
    totalKnockbackDistance = knockbackResult.appliedDistance;
  }

  if (preview.result.defenderDestroyed && !capturedOnKill) {
    current = destroyTransportIfApplicable(current, preview.defenderId, registry);
  }
  if (attackerActuallyDestroyed) {
    current = destroyTransportIfApplicable(current, preview.attackerId, registry);
  }

  current = applyCombatSignals(current, attacker.factionId, preview.result.signals);
  current = applyContactTransfer(current, attacker.factionId, defender.factionId, 'contact');
  const absorbResult = maybeAbsorbFaction(current, attacker.factionId as FactionId, defender.factionId as FactionId, registry);
  current = absorbResult.state;
  if (absorbResult.absorbedDomains.length > 0) {
    feedback = { ...feedback, absorbedDomains: absorbResult.absorbedDomains };
  }
  current = unlockHybridRecipes(current, attacker.factionId, registry);

  if (preview.result.defenderDestroyed && !capturedOnKill) {
    current = updateCombatRecordOnWin(current, attacker.factionId as FactionId, current.round);
    current = updateCombatRecordOnLoss(current, defender.factionId as FactionId, current.round);
  } else if (attackerActuallyDestroyed) {
    current = updateCombatRecordOnLoss(current, attacker.factionId as FactionId, current.round);
    current = updateCombatRecordOnWin(current, defender.factionId as FactionId, current.round);
  }

  const attackerWarExhaustion = current.warExhaustion.get(attacker.factionId);
  const defenderWarExhaustion = current.warExhaustion.get(defender.factionId);
  if (preview.result.defenderDestroyed && attackerWarExhaustion) {
    current = {
      ...current,
      warExhaustion: new Map(current.warExhaustion).set(
        attacker.factionId,
        addExhaustion(attackerWarExhaustion, EXHAUSTION_CONFIG.UNIT_KILLED),
      ),
    };
  }
  if (attackerActuallyDestroyed && defenderWarExhaustion) {
    current = {
      ...current,
      warExhaustion: new Map(current.warExhaustion).set(
        defender.factionId,
        addExhaustion(defenderWarExhaustion, EXHAUSTION_CONFIG.UNIT_KILLED),
      ),
    };
  }

  const hitAndRunEligible =
    attackerDoctrine?.universalHitAndRunEnabled
    || (attackerDoctrine?.hitAndRunEnabled && attackerPrototype.tags?.includes('cavalry') && attackerPrototype.tags?.includes('skirmish'));
  if (hitAndRunEligible) {
    const retreatingAttacker = current.units.get(preview.attackerId);
    if (retreatingAttacker && retreatingAttacker.hp > 0) {
      const retreatHex = findRetreatHex(retreatingAttacker, current);
      if (retreatHex) {
        const unitsAfterRetreat = new Map(current.units);
        unitsAfterRetreat.set(retreatingAttacker.id, {
          ...retreatingAttacker,
          position: retreatHex,
          status: 'ready',
          movesRemaining: Math.max(0, retreatingAttacker.movesRemaining - 1),
        });
        current = { ...current, units: unitsAfterRetreat };
        feedback = {
          ...feedback,
          hitAndRunRetreat: { unitId: retreatingAttacker.id, to: retreatHex },
        };
      }
    }
  }

  let updatedAttacker = current.units.get(preview.attackerId);
  let updatedDefender = current.units.get(preview.defenderId);

  if (updatedAttacker) {
    updatedAttacker = recordBattleFought(
      updatedAttacker,
      defender.id,
      preview.result.defenderDestroyed,
      preview.result.attackerDamage,
      preview.result.defenderDamage,
    );
    if (preview.result.defenderDestroyed) {
      updatedAttacker = recordEnemyKilled(updatedAttacker, defender.id);
    }
    if (updatedAttacker.veteranLevel !== attacker.veteranLevel) {
      updatedAttacker = recordPromotion(updatedAttacker, attacker.veteranLevel, updatedAttacker.veteranLevel);
    }
    current = writeUnitToState(current, updatedAttacker);
  }

  updatedAttacker = current.units.get(preview.attackerId);
  updatedDefender = current.units.get(preview.defenderId);

  const canInflictPoison = (attackerPrototype.tags?.includes('poison') ?? false)
    || (attackerDoctrine?.toxicBulwarkEnabled === true);
  let poisonApplied = false;
  if (!preview.result.defenderDestroyed && preview.result.defenderDamage > 0 && canInflictPoison && updatedDefender) {
    const extraStacks = attackerDoctrine?.poisonPersistenceEnabled ? 1 : 0;
    updatedDefender = applyPoisonDoT(
      updatedDefender,
      (attackerDoctrine?.poisonStacksOnHit ?? 1) + extraStacks,
      attackerDoctrine?.poisonDamagePerStack ?? 1,
      3,
    );
    updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId } as Unit;
    current = writeUnitToState(current, updatedDefender);
    poisonApplied = true;
  }

  let contaminatedHexApplied = false;
  if (preview.result.defenderDestroyed && attackerDoctrine?.contaminateTerrainEnabled && canInflictPoison) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(defender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }

  updatedAttacker = current.units.get(preview.attackerId);
  updatedDefender = current.units.get(preview.defenderId);

  if (updatedAttacker) {
    current = writeUnitToState(current, rotateUnitToward(updatedAttacker, defender.position));
  }
  updatedAttacker = current.units.get(preview.attackerId);
  if (updatedDefender && !preview.result.defenderDestroyed) {
    current = writeUnitToState(
      current,
      rotateUnitToward(updatedDefender, updatedAttacker?.position ?? attacker.position),
    );
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let reflectionDamageApplied = 0;
  if (defenderDoctrine?.damageReflectionEnabled && preview.result.defenderDamage > 0 && updatedAttacker) {
    reflectionDamageApplied = Math.max(1, Math.floor(preview.result.defenderDamage * 0.25));
    updatedAttacker = {
      ...updatedAttacker,
      hp: Math.max(0, updatedAttacker.hp - reflectionDamageApplied),
    };
    current = writeUnitToState(current, updatedAttacker);
  }

  updatedAttacker = current.units.get(preview.attackerId);
  if (preview.details.stampedeTriggered && updatedAttacker) {
    current = writeUnitToState(current, {
      ...updatedAttacker,
      movesRemaining: updatedAttacker.movesRemaining + 1,
    });
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let reStealthTriggered = false;
  if (
    updatedAttacker
    && (
      preview.details.attackerSynergyEffects.includes('stealth_recharge')
      || (attackerDoctrine?.stealthRechargeEnabled && attackerPrototype.tags?.includes('stealth'))
    )
  ) {
    const hasAdjacentEnemy = getNeighbors(updatedAttacker.position).some((hex) => {
      const neighborUnitId = getUnitAtHex(current, hex);
      if (!neighborUnitId) {
        return false;
      }
      const neighbor = current.units.get(neighborUnitId);
      return Boolean(neighbor && neighbor.hp > 0 && neighbor.factionId !== updatedAttacker!.factionId);
    });
    if (!hasAdjacentEnemy) {
      updatedAttacker = enterStealth(
        {
          ...updatedAttacker,
          turnsSinceStealthBreak: 0,
        },
        attackerPrototype.tags ?? [],
      );
      current = writeUnitToState(current, updatedAttacker);
      reStealthTriggered = updatedAttacker.isStealthed ?? false;
    }
  }

  const hitAndRunTriggered = feedback.hitAndRunRetreat !== null;
  if (hitAndRunTriggered && preview.details.poisonTrapPositions.length > 0) {
    const poisonTraps = new Map(current.poisonTraps);
    for (const position of preview.details.poisonTrapPositions) {
      poisonTraps.set(hexToKey(position), {
        damage: preview.details.poisonTrapDamage,
        slow: preview.details.poisonTrapSlow,
        ownerFactionId: attacker.factionId,
      });
    }
    current = { ...current, poisonTraps };
  }
  updatedAttacker = current.units.get(preview.attackerId);
  let healOnRetreatApplied = 0;
  if (hitAndRunTriggered && preview.details.healOnRetreatAmount > 0 && updatedAttacker) {
    healOnRetreatApplied = preview.details.healOnRetreatAmount;
    current = writeUnitToState(current, {
      ...updatedAttacker,
      hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + healOnRetreatApplied),
    });
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let combatHealingApplied = 0;
  const combatHealingEffect = preview.details.attackerSynergyEffects.find((effectCode) => effectCode.includes('combat_healing'));
  if (combatHealingEffect && updatedAttacker) {
    const healMatch = combatHealingEffect.match(/combat_healing_(\d+)%/);
    if (healMatch) {
      const healPercent = parseInt(healMatch[1], 10) / 100;
      const healAmount = Math.floor(preview.result.defenderDamage * healPercent);
      if (healAmount > 0) {
        combatHealingApplied = healAmount;
        current = writeUnitToState(current, {
          ...updatedAttacker,
          hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + healAmount),
        });
      }
    }
  }

  updatedDefender = current.units.get(preview.defenderId);
  let sandstormTargetsHit = 0;
  if (preview.details.sandstormDamage > 0 && updatedDefender && !preview.result.defenderDestroyed && !retreatCaptured) {
    const sandstormUnits = new Map(current.units);
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) {
        continue;
      }
      const adjUnit = sandstormUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        sandstormUnits.set(adjUnitId, {
          ...adjUnit,
          hp: Math.max(0, adjUnit.hp - preview.details.sandstormDamage),
        });
        sandstormTargetsHit += 1;
      }
    }
    current = { ...current, units: sandstormUnits };
  }

  updatedDefender = current.units.get(preview.defenderId);
  if (preview.details.contaminateActive && updatedDefender && !preview.result.defenderDestroyed && !retreatCaptured) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(updatedDefender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }

  updatedDefender = current.units.get(preview.defenderId);
  let frostbiteApplied = false;
  if (preview.details.frostbiteColdDoT > 0 && updatedDefender && !preview.result.defenderDestroyed && !retreatCaptured) {
    frostbiteApplied = true;
    current = writeUnitToState(current, {
      ...updatedDefender,
      frozen: true,
      frostbiteStacks: preview.details.frostbiteColdDoT,
      frostbiteDoTDuration: 3,
      movesRemaining: Math.max(0, updatedDefender.movesRemaining - preview.details.frostbiteSlow),
    });
  }

  updatedDefender = current.units.get(preview.defenderId);
  const triggeredEffects = [...preview.triggeredEffects];
  if (poisonApplied && updatedDefender) {
    pushCombatEffect(triggeredEffects, 'Poisoned', `Defender was poisoned for ${updatedDefender.poisonStacks} stack damage over time.`, 'aftermath');
  }
  if (reflectionDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Reflection', `Defender reflected ${reflectionDamageApplied} damage back to the attacker.`, 'aftermath');
  }
  if (totalKnockbackDistance > 0 && !preview.result.defenderDestroyed) {
    pushCombatEffect(triggeredEffects, 'Knockback', `Defender was displaced ${totalKnockbackDistance} hex${totalKnockbackDistance === 1 ? '' : 'es'}.`, 'aftermath');
  }
  if (reStealthTriggered) {
    pushCombatEffect(triggeredEffects, 'Stealth Recharge', 'Attacker slipped back into stealth after the exchange.', 'aftermath');
  }
  if (combatHealingApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Combat Healing', `Attacker recovered ${combatHealingApplied} HP from dealt damage.`, 'aftermath');
  }
  if (sandstormTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Sandstorm Splash', `Area damage hit ${sandstormTargetsHit} nearby unit${sandstormTargetsHit === 1 ? '' : 's'}.`, 'aftermath');
  }
  if (contaminatedHexApplied) {
    pushCombatEffect(triggeredEffects, 'Contamination', 'The defender hex became contaminated after the strike.', 'aftermath');
  }
  if (frostbiteApplied) {
    pushCombatEffect(triggeredEffects, 'Frostbite', `Defender took ${preview.details.frostbiteColdDoT} cold DoT and ${preview.details.frostbiteSlow} slow.`, 'aftermath');
  }
  if (hitAndRunTriggered && preview.details.poisonTrapPositions.length > 0) {
    pushCombatEffect(triggeredEffects, 'Poison Trap', 'Attacker left a poison trap on the retreat path.', 'aftermath');
  }
  if (hitAndRunTriggered) {
    pushCombatEffect(triggeredEffects, 'Hit And Run', 'Attacker disengaged after combat to avoid being pinned.', 'aftermath');
  }
  if (healOnRetreatApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Retreat Heal', `Attacker recovered ${healOnRetreatApplied} HP while withdrawing.`, 'aftermath');
  }
  if (pursuitDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Pursuit', `Skirmisher pressed the advantage for +${pursuitDamageApplied} bonus damage.`, 'aftermath');
  }
  if (emergentSustainHealApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Paladin Sustain', `Attacker recovered ${emergentSustainHealApplied} HP from damage dealt.`, 'aftermath');
  }
  if (baseResolution.emergentSustainMinHpSaved) {
    pushCombatEffect(triggeredEffects, 'Undying Will', `Attacker survived a lethal blow at ${preview.details.emergentSustainMinHp} HP.`, 'aftermath');
  }

  feedback = {
    ...feedback,
    resolution: {
      triggeredEffects,
      capturedOnKill,
      retreatCaptured,
      poisonApplied,
      reStealthTriggered,
      reflectionDamageApplied,
      combatHealingApplied,
      sandstormTargetsHit,
      contaminatedHexApplied,
      frostbiteApplied,
      hitAndRunTriggered,
      healOnRetreatApplied,
      totalKnockbackDistance,
      pursuitDamageApplied,
      emergentSustainHealApplied: baseResolution.emergentSustainHealApplied,
      emergentSustainMinHpSaved: baseResolution.emergentSustainMinHpSaved,
    },
  };

  return { state: pruneDeadUnits(current), feedback };
}
