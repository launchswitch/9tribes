import { getNeighbors, hexDistance, hexToKey } from '../../core/grid.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { Unit } from '../../features/units/types.js';
import type { GameState, UnitId } from '../../game/types.js';
import {
  getCombatAttackModifier,
  getCombatDefenseModifier,
  getDesertSwarmBonus,
} from '../factionIdentitySystem.js';
import {
  getVeteranDefenseBonus,
  getVeteranMoraleBonus,
  getVeteranStatBonus,
  resolveCombat,
  type CombatResult,
} from '../combatSystem.js';
import { resolveCapabilityDoctrine } from '../capabilityDoctrine.js';
import { canUseCharge } from '../abilitySystem.js';
import { getBulwarkDefenseBonus, getTidalCoastDebuff } from '../signatureAbilitySystem.js';
import { calculateFlankingBonus, isRearAttack } from '../zocSystem.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { getWallDefenseBonus } from '../siegeSystem.js';
import {
  applyCombatSynergies,
  type CombatContext,
} from '../synergyEffects.js';
import {
  calculateSynergyAttackBonus,
  calculateSynergyDefenseBonus,
  getSynergyEngine,
} from '../synergyRuntime.js';

import type {
  CombatActionEffect,
  CombatActionPreview,
  CombatActionPreviewDetails,
} from './types.js';
import { formatPercent, humanizeCombatEffect, pushCombatEffect } from './labeling.js';
import { WATER_TERRAIN, getImprovementBonus, canAttackTarget, createCombatActionPreviewRecord } from './helpers.js';

export function previewCombatAction(
  state: GameState,
  registry: RulesRegistry,
  attackerId: UnitId,
  defenderId: UnitId,
): CombatActionPreview | null {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);
  if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0 || !state.map) {
    return null;
  }

  if (attacker.factionId !== state.activeFactionId || defender.factionId === attacker.factionId || attacker.attacksRemaining <= 0 || attacker.movesRemaining <= 0) {
    return null;
  }

  if (!canAttackTarget(state, registry, attacker, defender)) {
    return null;
  }

  const attackerPrototype = state.prototypes.get(attacker.prototypeId as never);
  const defenderPrototype = state.prototypes.get(defender.prototypeId as never);
  if (!attackerPrototype || !defenderPrototype) {
    return null;
  }

  const attackerTerrainId = state.map.tiles.get(hexToKey(attacker.position))?.terrain ?? 'plains';
  const defenderTerrainId = state.map.tiles.get(hexToKey(defender.position))?.terrain ?? 'plains';
  const attackerTerrain = registry.getTerrain(attackerTerrainId);
  const defenderTerrain = registry.getTerrain(defenderTerrainId);
  const attackerFaction = state.factions.get(attacker.factionId);
  const defenderFaction = state.factions.get(defender.factionId);
  const attackerDoctrine = attackerFaction
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), attackerFaction)
    : undefined;
  const defenderDoctrine = defenderFaction
    ? resolveCapabilityDoctrine(state.research.get(defender.factionId), defenderFaction)
    : undefined;
  const canChargeAttack =
    (attackerPrototype.derivedStats.range ?? 1) <= 1
    && (canUseCharge(attackerPrototype) || attackerDoctrine?.chargeTranscendenceEnabled === true);
  const isChargeAttack = canChargeAttack
    && (
      attackerDoctrine?.chargeTranscendenceEnabled === true
      || attacker.movesRemaining < attacker.maxMoves
    );
  const attackerOnFort = getImprovementBonus(state, attacker.position) > 0;
  const defenderOnFort = getImprovementBonus(state, defender.position) > 0;
  const flankingBonus = defenderOnFort ? 0 : calculateFlankingBonus(attacker, defender, state);
  const rearAttackBonus = (defenderOnFort ? false : isRearAttack(attacker, defender)) ? 0.2 : 0;
  const braceTriggered = defender.preparedAbility === 'brace'
    && (attackerPrototype.derivedStats.role === 'mounted' || (attackerPrototype.derivedStats.range ?? 1) <= 1);
  const ambushAttackBonus = attacker.preparedAbility === 'ambush' ? 0.15 : 0;
  const attackerWasStealthed = attacker.isStealthed ?? false;
  let chargeAttackBonus = isChargeAttack && !braceTriggered ? 0.15 : 0;
  let sneakAttackTriggered = false;
  let stampedeTriggered = false;
  if (
    isChargeAttack
    && !braceTriggered
    && (attackerPrototype.tags?.includes('elephant') || attackerPrototype.tags?.includes('chariot'))
  ) {
    chargeAttackBonus += registry.getSignatureAbility('savannah_lions')?.stampedeBonus ?? 0.3;
    stampedeTriggered = true;
  }
  const braceDefenseBonus = defender.preparedAbility === 'brace'
    ? (defenderDoctrine?.fortressTranscendenceEnabled ? 0.4 : 0.2)
    : 0;
  let situationalAttackModifier = getCombatAttackModifier(attackerFaction, attackerTerrain, defenderTerrain);
  let situationalDefenseModifier = getCombatDefenseModifier(defenderFaction, defenderTerrain);

  if ((attackerTerrainId === 'river' || attackerTerrainId === 'swamp') && attackerFaction?.id === 'plains_riders') {
    situationalAttackModifier += registry.getSignatureAbility('plains_riders')?.sneakAttackBonus ?? 0.5;
    sneakAttackTriggered = true;
  }

  const desertAbility = registry.getSignatureAbility('desert_nomads');
  const desertSwarmConfig = desertAbility
    ? {
        threshold: desertAbility.desertSwarmThreshold ?? 3,
        attackBonus: desertAbility.desertSwarmAttackBonus ?? 1,
        defenseMultiplier: desertAbility.desertSwarmDefenseMultiplier ?? 1.1,
      }
    : undefined;
  const attackerSwarm = getDesertSwarmBonus(attackerFaction, attacker, state, desertSwarmConfig);
  if (attackerSwarm.attackBonus > 0) {
    situationalAttackModifier += attackerSwarm.attackBonus;
  }
  const defenderSwarm = getDesertSwarmBonus(defenderFaction, defender, state, desertSwarmConfig);
  if (defenderSwarm.defenseMultiplier > 1) {
    situationalDefenseModifier += defenderSwarm.defenseMultiplier - 1;
  }

  let tidalAssaultTriggered = false;
  if (attackerPrototype.tags?.includes('naval') && (attackerPrototype.tags?.includes('shock') || attackerPrototype.tags?.includes('ranged'))) {
    const isWaterToLand = ['coast', 'river'].includes(attackerTerrainId) && !['coast', 'river'].includes(defenderTerrainId);
    if (isWaterToLand) {
      situationalAttackModifier += registry.getSignatureAbility('coral_people')?.tidalAssaultBonus ?? 0.2;
      situationalDefenseModifier -= getTidalCoastDebuff();
      tidalAssaultTriggered = true;
    }
  }

  const attackerIsCamel = attackerPrototype.tags?.includes('camel') ?? false;
  const defenderIsCavalry = defenderPrototype.tags?.includes('cavalry') ?? false;
  if (attackerIsCamel && defenderIsCavalry) {
    situationalAttackModifier += 0.3;
  }
  if (defenderIsCavalry && !attackerIsCamel && (defenderPrototype.tags?.includes('camel') ?? false)) {
    situationalAttackModifier -= 0.2;
  }

  let bulwarkTriggered = false;
  for (const hex of getNeighbors(defender.position)) {
    const neighborUnitId = getUnitAtHex(state, hex);
    if (!neighborUnitId) {
      continue;
    }
    const neighborUnit = state.units.get(neighborUnitId);
    if (!neighborUnit || neighborUnit.factionId !== defender.factionId || neighborUnit.hp <= 0) {
      continue;
    }
    const neighborPrototype = state.prototypes.get(neighborUnit.prototypeId);
    if (neighborPrototype?.tags?.includes('fortress')) {
      situationalDefenseModifier += getBulwarkDefenseBonus(defender, state, registry);
      bulwarkTriggered = true;
      break;
    }
  }

  let fortifiedVolleyTriggered = false;
  let fortifiedCoverTriggered = false;
  const attackerIsRanged = attackerPrototype.derivedStats.role === 'ranged' || (attackerPrototype.derivedStats.range ?? 1) > 1;
  if (attackerIsRanged && attackerOnFort) {
    const attackerIsFortress = attackerPrototype.tags?.includes('fortress') ?? false;
    const attackerIsSiege = attackerPrototype.tags?.includes('siege') ?? false;
    const volleyBonus = attackerIsSiege ? 0.4 : attackerIsFortress ? 0.3 : 0.15;
    situationalAttackModifier += volleyBonus;
    fortifiedVolleyTriggered = true;
  }
  const defenderIsRanged = defenderPrototype.derivedStats.role === 'ranged' || (defenderPrototype.derivedStats.range ?? 1) > 1;
  if (defenderIsRanged && defenderOnFort) {
    const defenderIsFortress = defenderPrototype.tags?.includes('fortress') ?? false;
    situationalDefenseModifier += defenderIsFortress ? 0.3 : 0.15;
    fortifiedCoverTriggered = true;
  }

  const defenderOnCity = Array.from(state.cities.values()).some(
    (city) => city.position.q === defender.position.q && city.position.r === defender.position.r,
  );
  if ((attackerPrototype.tags?.includes('siege') ?? false) && defenderOnCity) {
    situationalAttackModifier += 0.25;
  }

  const retaliationDamageMultiplier = braceTriggered && isChargeAttack ? 1.1 : 1;

  if (defender.hillDugIn) {
    situationalDefenseModifier += 0.2;
  }
  if (attackerDoctrine?.greedyCaptureEnabled && defender.hp < defender.maxHp * 0.5) {
    situationalAttackModifier += 0.15;
  }
  if (attackerDoctrine?.antiFortificationEnabled && (defender.preparedAbility === 'brace' || defenderOnFort)) {
    situationalAttackModifier += 0.2;
  }
  if (attackerDoctrine?.chargeRoutedBonusEnabled && isChargeAttack && defender.routed) {
    situationalAttackModifier += 0.5;
  }
  if (defenderDoctrine?.shieldWallEnabled) {
    const defenderIsInfantry = defenderPrototype.derivedStats.role === 'melee'
      && !(defenderPrototype.tags?.includes('cavalry') || defenderPrototype.tags?.includes('elephant'));
    if (attackerIsRanged && defenderIsInfantry) {
      const supportRadius = defenderDoctrine.fortressTranscendenceEnabled ? 2 : 1;
      const hasSupportAlly = Array.from(state.units.values()).some((neighbor) =>
        neighbor.id !== defender.id
        && neighbor.factionId === defender.factionId
        && neighbor.hp > 0
        && hexDistance(neighbor.position, defender.position) <= supportRadius);
      if (hasSupportAlly) {
        situationalDefenseModifier += defenderDoctrine.fortressAuraUpgradeEnabled ? 0.25 : 0.15;
      }
    }
  }
  if (
    defenderDoctrine?.canopyCoverEnabled
    && defenderPrototype.derivedStats.role === 'ranged'
    && (defenderTerrain?.id === 'forest' || defenderTerrain?.id === 'jungle')
  ) {
    situationalDefenseModifier += 0.3;
  }
  if (defenderDoctrine?.roughTerrainDefenseEnabled && ['forest', 'jungle', 'hill', 'swamp'].includes(defenderTerrain?.id ?? '')) {
    situationalDefenseModifier += 0.2;
  }
  if (defenderDoctrine?.undyingEnabled && defender.hp < defender.maxHp * 0.2) {
    situationalDefenseModifier += 0.5;
  }

  const forestFirstStrike = attackerDoctrine?.forestAmbushEnabled === true && attackerTerrain?.id === 'forest';

  const resolveSynergies = (unit: Unit, prototype: typeof attackerPrototype, faction: typeof attackerFaction, enemyUnit: Unit, enemyPrototype: typeof defenderPrototype) => {
    const engine = getSynergyEngine();
    const triple = faction?.activeTripleStack ?? null;
    const synergies = triple
      ? triple.pairs
      : prototype.tags
        ? engine.resolveUnitPairs(prototype.tags)
        : [];

    const context: CombatContext = {
      attackerId: unit.id,
      defenderId: enemyUnit.id,
      attackerTags: prototype.tags ?? [],
      defenderTags: enemyPrototype.tags ?? [],
      attackerHp: unit.hp,
      defenderHp: enemyUnit.hp,
      terrain: state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? 'plains',
      isCharge: unit.id === attacker.id ? isChargeAttack : false,
      isStealthAttack: unit.id === attacker.id ? attackerWasStealthed : (unit.isStealthed ?? false),
      isRetreat: false,
      isStealthed: unit.isStealthed ?? false,
      position: { x: unit.position.q, y: unit.position.r },
      attackerPosition: { x: unit.position.q, y: unit.position.r },
      defenderPosition: { x: enemyUnit.position.q, y: enemyUnit.position.r },
    };

    return applyCombatSynergies(context, synergies, triple);
  };

  const attackerSynergyResult = resolveSynergies(attacker, attackerPrototype, attackerFaction, defender, defenderPrototype);
  const defenderSynergyResult = resolveSynergies(defender, defenderPrototype, defenderFaction, attacker, attackerPrototype);
  const synergyAttackModifier = calculateSynergyAttackBonus(attackerSynergyResult);
  const synergyDefenseModifier = calculateSynergyDefenseBonus(defenderSynergyResult);
  situationalAttackModifier += synergyAttackModifier;
  situationalDefenseModifier += synergyDefenseModifier;

  const attackerChassis = registry.getChassis(attackerPrototype.chassisId);
  if (attackerDoctrine?.navalCoastalBonusEnabled && attackerChassis?.movementClass === 'naval' && ['coast', 'river'].includes(attackerTerrain?.id ?? '')) {
    situationalAttackModifier += 0.25;
  }

  const improvementDefenseBonus = getImprovementBonus(state, defender.position);
  const wallDefenseBonus = getWallDefenseBonus(
    state,
    defender.position,
    registry.getSignatureAbility('coral_people')?.wallDefenseMultiplier ?? 2,
  );
  const result = resolveCombat(
    attacker,
    defender,
    attackerPrototype,
    defenderPrototype,
    getVeteranStatBonus(registry, attacker.veteranLevel),
    getVeteranDefenseBonus(registry, defender.veteranLevel),
    attackerTerrain,
    defenderTerrain,
    improvementDefenseBonus + wallDefenseBonus,
    getVeteranMoraleBonus(registry, defender.veteranLevel),
    registry,
    flankingBonus,
    situationalAttackModifier + chargeAttackBonus,
    situationalDefenseModifier,
    state.rngState,
    rearAttackBonus,
    braceDefenseBonus,
    ambushAttackBonus,
    (rearAttackBonus > 0 ? 18 : 0) + (attacker.preparedAbility === 'ambush' ? 10 : 0),
    retaliationDamageMultiplier,
    0,
    isChargeAttack,
    attackerWasStealthed,
    attackerSynergyResult.chargeShield,
    defenderSynergyResult.antiDisplacement || defenderDoctrine?.armorPenetrationEnabled === true,
    attackerSynergyResult.stealthChargeMultiplier,
    attackerSynergyResult.sandstormAccuracyDebuff,
    forestFirstStrike,
  );

  let totalKnockbackDistance = result.defenderKnockedBack ? result.knockbackDistance : 0;
  if (result.defenderKnockedBack && attackerDoctrine?.elephantStampede2Enabled && attackerPrototype.tags?.includes('elephant')) {
    totalKnockbackDistance = 2;
  }
  totalKnockbackDistance += attackerSynergyResult.knockbackDistance;

  const triggeredEffects: CombatActionEffect[] = [];

  if (flankingBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Flanking', `Attack gained ${formatPercent(flankingBonus)} from adjacent allied pressure.`, 'positioning');
  }
  if (rearAttackBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Rear Attack', `Hit from behind for ${formatPercent(rearAttackBonus)} and extra morale damage.`, 'positioning');
  }
  if (chargeAttackBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Charge', `Attack gained ${formatPercent(chargeAttackBonus)} from momentum.`, 'ability');
  }
  if (braceTriggered) {
    pushCombatEffect(triggeredEffects, 'Brace', `Defender braced for ${formatPercent(braceDefenseBonus)} defense and stronger retaliation.`, 'ability');
  }
  if (ambushAttackBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Ambush', `Prepared ambush added ${formatPercent(ambushAttackBonus)} attack.`, 'ability');
  }
  if (attackerWasStealthed) {
    pushCombatEffect(triggeredEffects, 'Stealth Ambush', 'Attacker opened from stealth for a major burst bonus.', 'ability');
  }
  if (tidalAssaultTriggered) {
    pushCombatEffect(triggeredEffects, 'Tidal Assault', 'Naval shock force attacked from water and reduced the defender\'s footing.', 'ability');
  }
  if (bulwarkTriggered) {
    pushCombatEffect(triggeredEffects, 'Bulwark', 'Adjacent fortress support hardened the defender.', 'ability');
  }
  if (fortifiedVolleyTriggered) {
    pushCombatEffect(triggeredEffects, 'Fortified Volley', 'Ranged unit fired from a field fort for bonus attack.', 'ability');
  }
  if (fortifiedCoverTriggered) {
    pushCombatEffect(triggeredEffects, 'Fortified Cover', 'Ranged defender in a field fort gained fortified cover.', 'ability');
  }
  if (sneakAttackTriggered) {
    pushCombatEffect(triggeredEffects, 'Sneak Attack', 'River stealth ambush from water terrain for massive damage.', 'ability');
  }
  if (stampedeTriggered) {
    pushCombatEffect(triggeredEffects, 'Stampede', 'Elephant momentum stacked extra charge damage.', 'ability');
  }
  if (result.roleModifier !== 0) {
    const sign = result.roleModifier > 0 ? '+' : '';
    pushCombatEffect(
      triggeredEffects,
      'Role Effectiveness',
      `${attackerPrototype.derivedStats.role ?? 'unknown'} vs ${defenderPrototype.derivedStats.role ?? 'unknown'}: ${sign}${(result.roleModifier * 100).toFixed(0)}%`,
      'positioning',
    );
  }
  if (result.weaponModifier !== 0) {
    const sign = result.weaponModifier > 0 ? '+' : '';
    pushCombatEffect(triggeredEffects, 'Weapon Effectiveness', `${sign}${(result.weaponModifier * 100).toFixed(0)}%`, 'ability');
  }
  if (synergyAttackModifier !== 0) {
    pushCombatEffect(triggeredEffects, 'Synergy Attack Bonus', `Pair or triple synergies added ${formatPercent(synergyAttackModifier)} attack pressure.`, 'synergy');
  }
  if (synergyDefenseModifier !== 0) {
    pushCombatEffect(triggeredEffects, 'Synergy Defense Bonus', `Pair or triple synergies added ${formatPercent(synergyDefenseModifier)} defense.`, 'synergy');
  }
  for (const effectCode of [...attackerSynergyResult.additionalEffects, ...defenderSynergyResult.additionalEffects]) {
    const effect = humanizeCombatEffect(effectCode);
    if (effect) {
      pushCombatEffect(triggeredEffects, effect.label, effect.detail, 'synergy');
    }
  }

  return createCombatActionPreviewRecord(
    state,
    attackerId,
    defenderId,
    result,
    triggeredEffects,
    braceTriggered,
    attackerWasStealthed,
    {
      attackerTerrainId,
      defenderTerrainId,
      isChargeAttack,
      chargeAttackBonus,
      synergyAttackModifier,
      synergyDefenseModifier,
      improvementDefenseBonus,
      wallDefenseBonus,
      totalKnockbackDistance,
      poisonTrapPositions: attackerSynergyResult.poisonTrapDamage > 0
        ? [{ q: attacker.position.q, r: attacker.position.r }]
        : attackerSynergyResult.poisonTrapPositions.map((position) => ({ q: position.x, r: position.y })),
      poisonTrapDamage: attackerSynergyResult.poisonTrapDamage,
      poisonTrapSlow: attackerSynergyResult.poisonTrapSlow,
      healOnRetreatAmount: attackerSynergyResult.healOnRetreatAmount,
      sandstormDamage: attackerSynergyResult.sandstormDamage,
      contaminateActive: attackerSynergyResult.contaminateActive,
      frostbiteColdDoT: attackerSynergyResult.frostbiteColdDoT,
      frostbiteSlow: attackerSynergyResult.frostbiteSlow,
      attackerSynergyEffects: attackerSynergyResult.additionalEffects,
      defenderSynergyEffects: defenderSynergyResult.additionalEffects,
      sneakAttackTriggered,
      stampedeTriggered,
    },
  );
}
