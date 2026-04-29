import { hexDistance } from '../../core/grid.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { GameState, Unit } from '../../game/types.js';
import type { HexCoord, UnitId } from '../../types.js';
import {
  canUseAmbush,
  canUseCharge,
  clearPreparedAbility,
  getTerrainAt as getAbilityTerrainAt,
  hasAdjacentEnemy,
  prepareAbility,
  shouldClearAmbush,
} from '../abilitySystem.js';
import { applyCombatAction, previewCombatAction } from '../combatActionSystem.js';
import type { CombatActionPreview } from '../combat-action/types.js';
import { resolveResearchDoctrine } from '../capabilityDoctrine.js';
import { describeCapabilityLevels } from '../capabilitySystem.js';
import { findFleeHex } from '../moraleSystem.js';
import { moveUnit, canMoveTo, getValidMoves } from '../movementSystem.js';
import { isTransportUnit, updateEmbarkedPositions } from '../transportSystem.js';
import { getUnitIntent } from '../strategicAi.js';
import { computeRetreatRisk, shouldEngageTarget } from '../aiTactics.js';
import { attemptNonCombatCapture, getCaptureParams, hasCaptureAbility } from '../captureSystem.js';
import {
  log,
  recordCombatEvent,
} from '../warEcologySimulation.js';

import type { UnitActivationOptions, UnitActivationResult } from './types.js';
import {
  describeCombatOutcome,
  formatCombatSummary,
  countNearbyUnitPressure,
  getNearestFriendlyDistanceToHex,
  countEnemyUnitsNearHex,
  setUnitActivated,
  mapAssignmentToIntent,
} from './helpers.js';
import {
  shouldBrace,
  getFieldFortOpportunity,
  buildFieldFortIfEligible,
  applyHillDugInIfEligible,
  FIELD_FORT_DECISION_SCORE,
  FIELD_FORT_ATTACK_MARGIN,
} from './fieldFort.js';
import { findBestTargetChoice, findBestRangedTarget } from './targeting.js';
import { performStrategicMovement } from './movement.js';
import { RENDEZVOUS_READY_DISTANCE } from '../strategic-ai/rendezvous.js';
import { isSettlerPrototype, getAvailableProductionPrototypes, getPrototypeQueueCost, queueUnit } from '../productionSystem.js';
import { createCityId } from '../../core/ids.js';
import { createCitySiteBonuses, findBestCitySiteForFaction, getSettlementOccupancyBlocker } from '../citySiteSystem.js';
import { syncFactionSettlementIds } from '../factionOwnershipSystem.js';

const HIGH_VALUE_ATTACK_SCORE = 10;

export function maybeExpirePreparedAbility(unit: Unit, round: number, state: GameState): Unit {
  if (!unit.preparedAbility) {
    return unit;
  }

  if ((unit.preparedAbilityExpiresOnRound ?? round) < round) {
    return clearPreparedAbility(unit);
  }

  if (shouldClearAmbush(unit, state)) {
    return clearPreparedAbility(unit);
  }

  return unit;
}

export function activateUnit(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  options: UnitActivationOptions = {},
): UnitActivationResult {
  const { trace, fortsBuiltThisRound, combatMode = 'apply' } = options;
  const unit = state.units.get(unitId);
  if (!unit || unit.hp <= 0 || !state.map) {
    return { state, pendingCombat: null };
  }

  const factionId = unit.factionId;
  const faction = state.factions.get(factionId);
  const prototype = state.prototypes.get(unit.prototypeId);
  if (!faction || !prototype) {
    return { state: setUnitActivated(state, unitId), pendingCombat: null };
  }

  let current: GameState = {
    ...state,
    activeFactionId: factionId,
    turnNumber: state.turnNumber + 1,
  };

  const map = current.map!;
  const actingUnit = current.units.get(unitId);
  if (!actingUnit || actingUnit.hp <= 0) {
    return { state: current, pendingCombat: null };
  }

  // --- Settler expansion: navigate to quality city site, then found ---
  if (isSettlerPrototype(prototype) && actingUnit.status === 'ready') {
    // Gate 1: must be at least 3 hexes from any existing city (minimum spacing)
    let tooCloseToCity = false;
    for (const city of current.cities.values()) {
      if (hexDistance(actingUnit.position, city.position) < 3) {
        tooCloseToCity = true;
        break;
      }
    }

    if (!tooCloseToCity) {
      // Gate 2: compute best city site and only found if within 1 hex of it
      const targetSite = findBestCitySiteForFaction(current, factionId, actingUnit.position);
      const distToTarget = targetSite ? hexDistance(actingUnit.position, targetSite) : Infinity;

      if (targetSite && distToTarget <= 1) {
        // Close enough to target site — found the city
        const blocker = getSettlementOccupancyBlocker(current, actingUnit.position);
        if (blocker === null) {
          const cityId = createCityId();
          const cityName = faction.homeCityId ? `${faction.name} Settlement` : `${faction.name} Capital`;
          const cities = new Map(current.cities);
          cities.set(cityId, {
            id: cityId,
            factionId,
            position: { ...actingUnit.position },
            name: cityName,
            productionQueue: [],
            productionProgress: 0,
            territoryRadius: 2,
            wallHP: 100,
            maxWallHP: 100,
            besieged: false,
            turnsUnderSiege: 0,
            isCapital: !faction.homeCityId,
            siteBonuses: createCitySiteBonuses(current.map, actingUnit.position, 2),
            foundedRound: current.round,
          });

          // Set default production to cheapest available prototype
          const availableProtos = getAvailableProductionPrototypes(current, factionId, registry);
          if (availableProtos.length > 0) {
            const firstProto = availableProtos[0];
            const cost = getPrototypeQueueCost(firstProto);
            let updatedCity = cities.get(cityId)!;
            updatedCity = queueUnit(updatedCity, firstProto.id, firstProto.chassisId, cost);
            cities.set(cityId, updatedCity);
          }

          const units = new Map(current.units);
          units.delete(unitId);
          const factions = new Map(current.factions);
          factions.set(factionId, {
            ...faction,
            unitIds: faction.unitIds.filter((id) => id !== unitId),
            cityIds: [...new Set([...faction.cityIds, cityId])],
            homeCityId: faction.homeCityId ?? cityId,
          });

          current = syncFactionSettlementIds({
            ...current,
            cities,
            units,
            factions,
          }, factionId);

          log(trace, `${faction.name} founded ${cityName} at ${actingUnit.position.q},${actingUnit.position.r}`);
          return { state: setUnitActivated(current, unitId), pendingCombat: null };
        }
      }
    }

    // Not ready to found — inject synthetic intent so performStrategicMovement navigates
    // the settler toward the best city site
    const targetSite = findBestCitySiteForFaction(current, factionId, actingUnit.position);
    if (targetSite) {
      const strategy = current.factionStrategies.get(factionId);
      if (strategy) {
        const updatedIntents = {
          ...strategy.unitIntents,
          [unitId]: {
            assignment: 'reserve' as const,
            waypointKind: 'front_anchor' as const,
            waypoint: targetSite,
            objectiveCityId: undefined,
            objectiveUnitId: undefined,
            anchor: actingUnit.position,
            isolationScore: 0,
            isolated: false,
            reason: `settler navigating to city site at ${targetSite.q},${targetSite.r}`,
          },
        };
        const updatedStrategies = new Map(current.factionStrategies);
        updatedStrategies.set(factionId, { ...strategy, unitIntents: updatedIntents });
        current = { ...current, factionStrategies: updatedStrategies };
      }
    }
    // Fall through to movement (performStrategicMovement at line 521)
  }

  if (actingUnit.preparedAbility === 'ambush' && hasAdjacentEnemy(current, actingUnit)) {
    const units = new Map(current.units);
    units.set(unitId, clearPreparedAbility(actingUnit));
    current = { ...current, units };
  }

  if (actingUnit.routed) {
    const fleeHex = findFleeHex(actingUnit, current);
    if (fleeHex && canMoveTo(current, unitId, fleeHex, map, registry)) {
      current = moveUnit(current, unitId, fleeHex, map, registry);
      // Update embarked unit positions if moving unit is a transport
      const movedUnit = current.units.get(unitId);
      if (movedUnit) {
        const movedProto = current.prototypes.get(movedUnit.prototypeId);
        if (movedProto && isTransportUnit(movedProto, registry)) {
          current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
        }
      }
      log(trace, `${faction.name} ${prototype.name} routed and fled`);
    }
    return { state: setUnitActivated(current, unitId), pendingCombat: null };
  }

  let activeUnit = current.units.get(unitId)!;
  const baseRange = prototype.derivedStats.range ?? 1;
  const unitRange = baseRange + (prototype.rangeBonus ?? 0);
  const factionDoctrine = resolveResearchDoctrine(current.research.get(factionId), faction);
  const canChargeAttack =
    unitRange <= 1 && (canUseCharge(prototype) || factionDoctrine.chargeTranscendenceEnabled);
  const strategy = current.factionStrategies.get(factionId);
  const unitIntent = getUnitIntent(strategy, unitId);
  const holdingAtRendezvous = !!(
    unitIntent?.squadId
    && unitIntent.rendezvousHex
    && hexDistance(activeUnit.position, unitIntent.rendezvousHex) <= RENDEZVOUS_READY_DISTANCE
  );
  // For defender units: get the threatened city position for engagement scoring
  const threatenedCityForUnit = unitIntent?.threatenedCityId
    ? current.cities.get(unitIntent.threatenedCityId)
    : undefined;
  const threatenedCityPosition = threatenedCityForUnit?.position;
  const shouldEngageFromPosition = (unitAtPosition: Unit, attackScore: number, targetPos?: HexCoord): boolean => {
    const strategy = current.factionStrategies.get(factionId);
    const unitIntent = getUnitIntent(strategy, unitId);
    const nearestFriendlyDist = getNearestFriendlyDistanceToHex(current, factionId, unitAtPosition.position);
    const nearbyPressure = countNearbyUnitPressure(current, factionId, unitAtPosition.position, unitId);
    const anchorDistance = unitIntent ? hexDistance(unitAtPosition.position, unitIntent.anchor) : 0;
    // Count enemy support near the target (units within 2 hexes that can reinforce/counterattack)
    let targetEnemySupport = 0;
    let targetInCity = false;
    if (targetPos) {
      targetEnemySupport = countEnemyUnitsNearHex(current, factionId, targetPos, 2, unitId);
      targetInCity = Array.from(current.cities.values()).some(
        (city) => city.position.q === targetPos.q && city.position.r === targetPos.r,
      );
    }
    const retreatRisk = computeRetreatRisk({
      hpRatio: unitAtPosition.hp / Math.max(1, unitAtPosition.maxHp),
      nearbyEnemies: nearbyPressure.nearbyEnemies,
      nearbyFriendlies: nearbyPressure.nearbyFriendlies,
      nearestFriendlyDistance: nearestFriendlyDist,
      anchorDistance,
      targetEnemySupport,
      targetInCity,
      assignment: unitIntent?.assignment,
    });
    return shouldEngageTarget(strategy?.personality, { attackScore, retreatRisk });
  };

  let enemyChoice = unitRange > 1
    ? findBestRangedTarget(current, unitId, activeUnit.position, factionId, prototype as any, registry, unitRange, threatenedCityPosition)
    : findBestTargetChoice(current, unitId, activeUnit.position, factionId, prototype as any, registry, threatenedCityPosition);
  let enemy: typeof enemyChoice.target | undefined = enemyChoice.target;
  const forceAttack = enemyChoice.score >= HIGH_VALUE_ATTACK_SCORE;
  if (enemy && !forceAttack && !shouldEngageFromPosition(activeUnit, enemyChoice.score, enemy.position)) {
    enemy = undefined;
  }

  // Ranged units (range > 1) attack from their current position — no need to charge/move adjacent
  let chargeMove: HexCoord | null = null;
  let bestChargeScore = -Infinity;

  if (!enemy && activeUnit.movesRemaining > 0 && canChargeAttack && !holdingAtRendezvous) {
    for (const move of getValidMoves(current, unitId, map, registry)) {
      const choice = findBestTargetChoice(current, unitId, move, factionId, prototype as any, registry, threatenedCityPosition);
      if (!choice.target) continue;
      const score = choice.score + (registry.getTerrain(getAbilityTerrainAt(current, move))?.defenseModifier ?? 0);
      if (score > bestChargeScore) {
        bestChargeScore = score;
        chargeMove = move;
      }
    }
  }

  const fieldFortOpportunity = getFieldFortOpportunity(current, factionId, unitId, registry, fortsBuiltThisRound);
  const bestImmediateAttackScore = Math.max(
    enemy && activeUnit.attacksRemaining > 0 ? enemyChoice.score : -Infinity,
    bestChargeScore,
  );
  if (
    fieldFortOpportunity
    && fieldFortOpportunity.score >= FIELD_FORT_DECISION_SCORE
    && bestImmediateAttackScore < FIELD_FORT_ATTACK_MARGIN
  ) {
    const improvementCount = current.improvements.size;
    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    if (current.improvements.size > improvementCount) {
      log(trace, `${faction.name} ${prototype.name} built a field fort (${fieldFortOpportunity.reason})`);
      current = applyHillDugInIfEligible(current, factionId, unitId);
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }
  }

  if (!enemy && activeUnit.movesRemaining > 0 && canChargeAttack && chargeMove && bestChargeScore > 0) {
    current = moveUnit(current, unitId, chargeMove, map, registry);
    // Update embarked unit positions if moving unit is a transport
    const movedUnit = current.units.get(unitId);
    if (movedUnit) {
      const movedProto = current.prototypes.get(movedUnit.prototypeId);
      if (movedProto && isTransportUnit(movedProto, registry)) {
        current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
      }
    }
    activeUnit = current.units.get(unitId)!;
    // Unit may have been destroyed by an opportunity attack during the charge move.
    if (!activeUnit) {
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }
    enemyChoice = findBestTargetChoice(current, unitId, activeUnit.position, factionId, prototype as any, registry, threatenedCityPosition);
    enemy = enemyChoice.target;
    if (enemy && enemyChoice.score < HIGH_VALUE_ATTACK_SCORE && !shouldEngageFromPosition(activeUnit, enemyChoice.score)) {
      enemy = undefined;
    }
    log(trace, `${faction.name} ${prototype.name} charged into position`);
  }

  if (
    enemy &&
    activeUnit.attacksRemaining > 0 &&
    shouldBrace(
      activeUnit,
      prototype,
      current,
      factionDoctrine.fortressTranscendenceEnabled,
    ) &&
    enemyChoice.score <= 0
  ) {
    const units = new Map(current.units);
    units.set(unitId, prepareAbility(activeUnit, 'brace', current.round));
    log(trace, `${faction.name} ${prototype.name} braced`);
    current = { ...current, units };
    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return { state: current, pendingCombat: null };
  }

  if (enemy && activeUnit.attacksRemaining > 0) {
    const enemyPrototype = current.prototypes.get(enemy.prototypeId);
    if (!enemyPrototype) {
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }

    const combatPreview = previewCombatAction(current, registry, activeUnit.id, enemy.id);
    if (!combatPreview) {
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }
    if (combatMode === 'preview') {
      return { state: current, pendingCombat: combatPreview };
    }

    const appliedCombat = applyCombatAction(current, registry, combatPreview, 2);
    current = appliedCombat.state;

    const result = combatPreview.result;
    const resolution = appliedCombat.feedback.resolution;
    const updatedAttacker = current.units.get(activeUnit.id) ?? { ...activeUnit, hp: 0, morale: 0, routed: true };
    const updatedDefender = current.units.get(enemy.id) ?? { ...enemy, hp: 0, morale: 0, routed: true };

    if (resolution.capturedOnKill) {
      log(trace, `${faction.name} ${prototype.name} CAPTURED ${enemyPrototype.name}!`);
    }
    if (resolution.retreatCaptured) {
      log(trace, `${faction.name} ${prototype.name} captured retreating ${enemyPrototype.name}.`);
    }

    const roleInfo = result.roleModifier !== 0 ? ` role:${result.roleModifier > 0 ? '+' : ''}${(result.roleModifier * 100).toFixed(0)}%` : '';
    const weaponInfo = result.weaponModifier !== 0 ? ` weapon:${result.weaponModifier > 0 ? '+' : ''}${(result.weaponModifier * 100).toFixed(0)}%` : '';
    const rearInfo = result.rearAttackBonus > 0 ? ' rear:+20%' : '';
    const abilityInfo = `${result.ambushAttackBonus > 0 ? ' ambush' : ''}${combatPreview.details.chargeAttackBonus > 0 ? ' charge' : ''}${combatPreview.braceTriggered ? ' counter-braced' : ''}`;
    const stealthInfo = combatPreview.attackerWasStealthed ? ' stealth-ambush' : '';
    const poisonInfo = resolution.poisonApplied ? ` poisoned(${updatedDefender.poisonStacks ?? 0})` : '';
    const knockbackInfo = resolution.totalKnockbackDistance > 0 && !result.defenderDestroyed ? ' knocked-back' : '';
    const strikeFirstInfo = combatPreview.details.isChargeAttack && prototype.tags?.includes('cavalry') && result.defenderDestroyed && result.attackerDamage === 0 ? ' strike-first-kill' : '';
    const moraleInfo = ` morale:${result.defenderMoraleLoss.toFixed(0)}lost${result.defenderRouted ? ' ROUTED' : ''}${result.defenderFled ? ' FLED' : ''}`;
    log(
      trace,
      `${faction.name} ${prototype.name} fought ${enemyPrototype.name}${roleInfo}${weaponInfo}${rearInfo}${abilityInfo}${stealthInfo}${poisonInfo}${knockbackInfo}${strikeFirstInfo}${moraleInfo} | capabilities: ${describeCapabilityLevels(
        current.factions.get(factionId)!
      )}`
    );
    const outcomeLabel = describeCombatOutcome(result);
    const summary = formatCombatSummary(
      prototype.name,
      enemyPrototype.name,
      result.defenderDamage,
      result.attackerDamage,
      outcomeLabel,
      resolution.triggeredEffects
    );
    recordCombatEvent(trace, {
      round: current.round,
      attackerUnitId: updatedAttacker.id,
      defenderUnitId: updatedDefender.id,
      attackerFactionId: updatedAttacker.factionId,
      defenderFactionId: updatedDefender.factionId,
      attackerPrototypeId: updatedAttacker.prototypeId,
      defenderPrototypeId: updatedDefender.prototypeId,
      attackerPrototypeName: prototype.name,
      defenderPrototypeName: enemyPrototype.name,
      attackerDamage: result.attackerDamage,
      defenderDamage: result.defenderDamage,
      attackerHpAfter: updatedAttacker.hp,
      defenderHpAfter: updatedDefender.hp,
      attackerDestroyed: result.attackerDestroyed,
      defenderDestroyed: result.defenderDestroyed,
      attackerRouted: result.attackerRouted,
      defenderRouted: result.defenderRouted,
      attackerFled: result.attackerFled,
      defenderFled: result.defenderFled,
      summary,
      breakdown: {
        attacker: {
          unitId: activeUnit.id,
          factionId: activeUnit.factionId,
          prototypeId: activeUnit.prototypeId,
          prototypeName: prototype.name,
          position: activeUnit.position,
          terrain: combatPreview.details.attackerTerrainId,
          hpBefore: activeUnit.hp,
          hpAfter: updatedAttacker.hp,
          maxHp: activeUnit.maxHp,
          baseStat: result.attackerBaseAttack,
        },
        defender: {
          unitId: enemy.id,
          factionId: enemy.factionId,
          prototypeId: enemy.prototypeId,
          prototypeName: enemyPrototype.name,
          position: enemy.position,
          terrain: combatPreview.details.defenderTerrainId,
          hpBefore: enemy.hp,
          hpAfter: updatedDefender.hp,
          maxHp: enemy.maxHp,
          baseStat: result.defenderBaseDefense,
        },
        modifiers: {
          roleModifier: result.roleModifier,
          weaponModifier: result.weaponModifier,
          flankingBonus: result.flankingBonus,
          rearAttackBonus: result.rearAttackBonus,
          chargeBonus: combatPreview.details.chargeAttackBonus,
          braceDefenseBonus: result.braceDefenseBonus,
          ambushBonus: result.ambushAttackBonus,
          hiddenAttackBonus: result.hiddenAttackBonus,
          stealthAmbushBonus: combatPreview.attackerWasStealthed ? 0.5 : 0,
          situationalAttackModifier: result.situationalAttackModifier,
          situationalDefenseModifier: result.situationalDefenseModifier,
          synergyAttackModifier: combatPreview.details.synergyAttackModifier,
          synergyDefenseModifier: combatPreview.details.synergyDefenseModifier,
          improvementDefenseBonus: combatPreview.details.improvementDefenseBonus,
          wallDefenseBonus: combatPreview.details.wallDefenseBonus,
          finalAttackStrength: result.attackStrength,
          finalDefenseStrength: result.defenseStrength,
          baseMultiplier: result.baseMultiplier,
          positionalMultiplier: result.positionalMultiplier,
          damageVarianceMultiplier: result.damageVarianceMultiplier,
          retaliationVarianceMultiplier: result.retaliationVarianceMultiplier,
        },
        morale: {
          attackerLoss: result.attackerMoraleLoss,
          defenderLoss: result.defenderMoraleLoss,
          attackerRouted: result.attackerRouted,
          defenderRouted: result.defenderRouted,
          attackerFled: result.attackerFled,
          defenderFled: result.defenderFled,
        },
        outcome: {
          attackerDamage: result.attackerDamage,
          defenderDamage: result.defenderDamage,
          attackerDestroyed: result.attackerDestroyed,
          defenderDestroyed: result.defenderDestroyed,
          defenderKnockedBack: resolution.totalKnockbackDistance > 0 && !result.defenderDestroyed,
          knockbackDistance: resolution.totalKnockbackDistance,
        },
        triggeredEffects: resolution.triggeredEffects,
      },
    });

    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return { state: current, pendingCombat: null };
  }

  if (
    !enemy &&
    canUseAmbush(prototype, getAbilityTerrainAt(current, activeUnit.position)) &&
    !hasAdjacentEnemy(current, activeUnit)
  ) {
    const units = new Map(current.units);
    units.set(unitId, prepareAbility(activeUnit, 'ambush', current.round));
    log(trace, `${faction.name} ${prototype.name} prepared an ambush`);
    current = { ...current, units };
    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return { state: current, pendingCombat: null };
  }

  // Slave Galley: non-combat capture — attempt to enslave enemies within range 3
  // (Unit-based, not faction passive — only fires when unit has capture ability via slaver_net component)
  if (isTransportUnit(prototype, registry)
    && hasCaptureAbility(prototype, registry)
    && (activeUnit?.attacksRemaining ?? 0) > 0) {
    const greedyAbility = registry.getSignatureAbility(factionId);
    const captureParams = getCaptureParams(prototype, registry);
    // Use component's capture chance; fall back to signature ability for non-component sources
    const nonCombatChance = captureParams?.chance ?? greedyAbility?.greedyNonCombatCaptureChance ?? 0.4;
    const hpFraction = captureParams?.hpFraction ?? greedyAbility?.greedyCaptureHpFraction ?? 0.5;
    const captureCooldown = captureParams?.cooldown ?? greedyAbility?.greedyCaptureCooldown ?? 4;

    let bestCaptureTarget: UnitId | null = null;
    let bestCaptureDist = Infinity;
    // Find enemy units within range 3 (prioritize weaker, closer targets)
    for (const [, enemy] of current.units) {
      if (enemy.factionId === factionId || enemy.hp <= 0) continue;
      const dist = hexDistance(activeUnit.position, enemy.position);
      if (dist > 3) continue;
      // Prefer lower HP targets
      const currentBest = bestCaptureTarget ? current.units.get(bestCaptureTarget) : null;
      if (dist < bestCaptureDist || (dist === bestCaptureDist && enemy.hp < (currentBest?.hp ?? Infinity))) {
        bestCaptureDist = dist;
        bestCaptureTarget = enemy.id as UnitId;
      }
    }

    if (bestCaptureTarget) {
      const captureResult = attemptNonCombatCapture(
        current, unitId, bestCaptureTarget, registry, nonCombatChance, hpFraction, captureCooldown, current.rngState
      );
      if (captureResult.captured) {
        const capturedUnit = captureResult.state.units.get(bestCaptureTarget);
        const capturedProto = capturedUnit ? captureResult.state.prototypes.get(capturedUnit.prototypeId) : null;
        log(trace, `${faction.name} ${prototype.name} ENSLAVED ${capturedProto?.name ?? 'unit'} (non-combat capture)`);
        current = captureResult.state;
        current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
        current = applyHillDugInIfEligible(current, factionId, unitId);
        return { state: setUnitActivated(current, unitId), pendingCombat: null };
      } else {
        // Failed capture — spend the attack anyway
        const units = new Map(current.units);
        const failedUnit = current.units.get(unitId);
        if (failedUnit) {
          units.set(unitId, { ...failedUnit, attacksRemaining: 0 });
          current = { ...current, units };
        }
      }
    }
  }

  current = performStrategicMovement(current, unitId, registry, trace);

  const movedUnit = current.units.get(unitId);
  if (movedUnit) {
    if (movedUnit.attacksRemaining <= 0) {
      current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
      current = applyHillDugInIfEligible(current, factionId, unitId);
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }

    // After strategic movement, check for adjacent enemies and attack if possible
    if (movedUnit.hp > 0) {
      const postMoveTarget = findBestTargetChoice(
        current, unitId, movedUnit.position, factionId, prototype as any, registry, threatenedCityPosition
      );
      if (postMoveTarget.target && shouldEngageFromPosition(movedUnit, postMoveTarget.score, postMoveTarget.target.position)) {
        const postMoveEnemy = postMoveTarget.target;
        const postMovePreview = previewCombatAction(current, registry, movedUnit.id, postMoveEnemy.id);
        if (postMovePreview) {
          if (combatMode === 'preview') {
            return { state: current, pendingCombat: postMovePreview };
          }
          const postMoveCombat = applyCombatAction(current, registry, postMovePreview, 2);
          current = postMoveCombat.state;
          const enemyProto = current.prototypes.get(postMoveEnemy.prototypeId);
          const postMoveResult = postMovePreview.result;
          const postMoveResolution = postMoveCombat.feedback.resolution;
          const postMoveUpdatedAttacker = current.units.get(movedUnit.id) ?? { ...movedUnit, hp: 0, morale: 0, routed: true };
          const postMoveUpdatedDefender = current.units.get(postMoveEnemy.id) ?? { ...postMoveEnemy, hp: 0, morale: 0, routed: true };
          log(trace, `${faction.name} ${prototype.name} attacked ${enemyProto?.name ?? 'enemy'} after movement`);
          recordCombatEvent(trace, {
            round: current.round,
            attackerUnitId: postMoveUpdatedAttacker.id,
            defenderUnitId: postMoveUpdatedDefender.id,
            attackerFactionId: postMoveUpdatedAttacker.factionId,
            defenderFactionId: postMoveUpdatedDefender.factionId,
            attackerPrototypeId: postMoveUpdatedAttacker.prototypeId,
            defenderPrototypeId: postMoveUpdatedDefender.prototypeId,
            attackerPrototypeName: prototype.name,
            defenderPrototypeName: enemyProto?.name ?? 'unknown',
            attackerDamage: postMoveResult.attackerDamage,
            defenderDamage: postMoveResult.defenderDamage,
            attackerHpAfter: postMoveUpdatedAttacker.hp,
            defenderHpAfter: postMoveUpdatedDefender.hp,
            attackerDestroyed: postMoveResult.attackerDestroyed,
            defenderDestroyed: postMoveResult.defenderDestroyed,
            attackerRouted: postMoveResult.attackerRouted,
            defenderRouted: postMoveResult.defenderRouted,
            attackerFled: postMoveResult.attackerFled,
            defenderFled: postMoveResult.defenderFled,
            summary: formatCombatSummary(
              prototype.name,
              enemyProto?.name ?? 'unknown',
              postMoveResult.defenderDamage,
              postMoveResult.attackerDamage,
              describeCombatOutcome(postMoveResult),
              postMoveResolution.triggeredEffects
            ),
            breakdown: {
              attacker: {
                unitId: movedUnit.id,
                factionId: movedUnit.factionId,
                prototypeId: movedUnit.prototypeId,
                prototypeName: prototype.name,
                position: movedUnit.position,
                terrain: postMovePreview.details.attackerTerrainId,
                hpBefore: movedUnit.hp,
                hpAfter: postMoveUpdatedAttacker.hp,
                maxHp: movedUnit.maxHp,
                baseStat: postMoveResult.attackerBaseAttack,
              },
              defender: {
                unitId: postMoveEnemy.id,
                factionId: postMoveEnemy.factionId,
                prototypeId: postMoveEnemy.prototypeId,
                prototypeName: enemyProto?.name ?? 'unknown',
                position: postMoveEnemy.position,
                terrain: postMovePreview.details.defenderTerrainId,
                hpBefore: postMoveEnemy.hp,
                hpAfter: postMoveUpdatedDefender.hp,
                maxHp: postMoveEnemy.maxHp,
                baseStat: postMoveResult.defenderBaseDefense,
              },
              modifiers: {
                roleModifier: postMoveResult.roleModifier,
                weaponModifier: postMoveResult.weaponModifier,
                flankingBonus: postMoveResult.flankingBonus,
                rearAttackBonus: postMoveResult.rearAttackBonus,
                chargeBonus: postMovePreview.details.chargeAttackBonus,
                braceDefenseBonus: postMoveResult.braceDefenseBonus,
                ambushBonus: postMoveResult.ambushAttackBonus,
                hiddenAttackBonus: postMoveResult.hiddenAttackBonus,
                stealthAmbushBonus: postMovePreview.attackerWasStealthed ? 0.5 : 0,
                situationalAttackModifier: postMoveResult.situationalAttackModifier,
                situationalDefenseModifier: postMoveResult.situationalDefenseModifier,
                synergyAttackModifier: postMovePreview.details.synergyAttackModifier,
                synergyDefenseModifier: postMovePreview.details.synergyDefenseModifier,
                improvementDefenseBonus: postMovePreview.details.improvementDefenseBonus,
                wallDefenseBonus: postMovePreview.details.wallDefenseBonus,
                finalAttackStrength: postMoveResult.attackStrength,
                finalDefenseStrength: postMoveResult.defenseStrength,
                baseMultiplier: postMoveResult.baseMultiplier,
                positionalMultiplier: postMoveResult.positionalMultiplier,
                damageVarianceMultiplier: postMoveResult.damageVarianceMultiplier,
                retaliationVarianceMultiplier: postMoveResult.retaliationVarianceMultiplier,
              },
              morale: {
                attackerLoss: postMoveResult.attackerMoraleLoss,
                defenderLoss: postMoveResult.defenderMoraleLoss,
                attackerRouted: postMoveResult.attackerRouted,
                defenderRouted: postMoveResult.defenderRouted,
                attackerFled: postMoveResult.attackerFled,
                defenderFled: postMoveResult.defenderFled,
              },
              outcome: {
                attackerDamage: postMoveResult.attackerDamage,
                defenderDamage: postMoveResult.defenderDamage,
                attackerDestroyed: postMoveResult.attackerDestroyed,
                defenderDestroyed: postMoveResult.defenderDestroyed,
                defenderKnockedBack: postMoveResolution.totalKnockbackDistance > 0 && !postMoveResult.defenderDestroyed,
                knockbackDistance: postMoveResolution.totalKnockbackDistance,
              },
              triggeredEffects: postMoveResolution.triggeredEffects,
            },
          });
          current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
          current = applyHillDugInIfEligible(current, factionId, unitId);
          return { state: setUnitActivated(current, unitId), pendingCombat: null };
        }
      }
    }
  }

  current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
  current = applyHillDugInIfEligible(current, factionId, unitId);

  return { state: setUnitActivated(current, unitId), pendingCombat: null };
}

export function activateAiUnit(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  options: UnitActivationOptions = {},
): UnitActivationResult {
  return activateUnit(state, unitId, registry, options);
}
