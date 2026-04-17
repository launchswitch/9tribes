import type { CombatActionEffect, CombatActionEffectCategory } from './types.js';

export function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
}

export function humanizeCombatEffect(effect: string): { label: string; detail: string } | null {
  const poisonAura = effect.match(/^poison_aura_radius_(\d+)$/);
  if (poisonAura) {
    return { label: 'Poison Aura', detail: `Applied poison pressure in radius ${poisonAura[1]}.` };
  }
  const landAura = effect.match(/^land_aura_radius_(\d+)$/);
  if (landAura) {
    return { label: 'Land Aura', detail: `Granted a defensive aura in radius ${landAura[1]}.` };
  }
  const healingRadius = effect.match(/^extended_healing_radius_(\d+)$/);
  if (healingRadius) {
    return { label: 'Extended Healing', detail: `Healing aura extended to radius ${healingRadius[1]}.` };
  }
  const stealthReveal = effect.match(/^stealth_aura_reveal_(\d+)$/);
  if (stealthReveal) {
    return { label: 'Stealth Aura', detail: `Threatened hidden enemies within radius ${stealthReveal[1]}.` };
  }
  const combatHealing = effect.match(/^combat_healing_(\d+)%$/);
  if (combatHealing) {
    return { label: 'Combat Healing', detail: `Converted ${combatHealing[1]}% of dealt damage into healing.` };
  }
  const sandstorm = effect.match(/^sandstorm_damage_(\d+)_accuracy_debuff_(\d+\.?\d*)$/);
  if (sandstorm) {
    return { label: 'Sandstorm', detail: `Dealt ${sandstorm[1]} area damage and reduced accuracy by ${formatPercent(-Number(sandstorm[2]))}.` };
  }
  const withering = effect.match(/^withering_healing_reduction_(\d+)%$/);
  if (withering) {
    return { label: 'Withering', detail: `Reduced incoming healing by ${withering[1]}%.` };
  }
  const poisonMultiplier = effect.match(/^poison_multiplier_(\d+\.?\d*)x$/);
  if (poisonMultiplier) {
    return { label: 'Poison Multiplier', detail: `Amplified attack output by ${poisonMultiplier[1]}x.` };
  }
  const frostSpeed = effect.match(/^frost_speed_movement_(\d+)$/);
  if (frostSpeed) {
    return { label: 'Frost Speed', detail: `Adjusted movement by ${frostSpeed[1]} on frozen ground.` };
  }
  const healOnRetreat = effect.match(/^heal_on_retreat_(\d+)$/);
  if (healOnRetreat) {
    return { label: 'Heal On Retreat', detail: `Recovered ${healOnRetreat[1]} HP after disengaging.` };
  }
  const swarmSpeed = effect.match(/^swarm_speed_(\d+)$/);
  if (swarmSpeed) {
    return { label: 'Swarm Speed', detail: `Reduced movement cost by ${swarmSpeed[1]}.` };
  }
  const adaptiveMultiplier = effect.match(/^adaptive_multiplier_(\d+\.?\d*)x$/);
  if (adaptiveMultiplier) {
    return { label: 'Adaptive Multiplier', detail: `Triple-stack multiplier boosted combat by ${adaptiveMultiplier[1]}x.` };
  }

  const labels: Record<string, string> = {
    charge_shield: 'Charge Shield',
    anti_displacement: 'Anti-Displacement',
    dug_in: 'Dug In',
    terrain_fortress: 'Terrain Fortress',
    charge_cooldown_reset: 'Charge Reset',
    ram_attack: 'Ram Attack',
    stealth_charge: 'Stealth Charge',
    double_charge: 'Double Charge',
    poison_trap: 'Poison Trap',
    contaminate_coastal: 'Contaminate',
    stealth_healing: 'Stealth Healing',
    terrain_poison: 'Terrain Poison',
    aura_overlap: 'Aura Overlap',
    wave_cavalry_amphibious: 'Wave Cavalry',
    stealth_recharge: 'Stealth Recharge',
    desert_fortress: 'Desert Fortress',
    frostbite: 'Frostbite',
    frost_defense: 'Frost Defense',
    bear_charge: 'Bear Charge',
    bear_cover: 'Bear Cover',
    ice_zone_difficult_terrain: 'Ice Zone',
    bear_mount: 'Bear Mount',
    terrain_share: 'Terrain Share',
    pack_bonus: 'Pack Bonus',
    oasis_neutral_terrain: 'Oasis',
    permanent_stealth_terrain: 'Permanent Stealth Terrain',
    shadow_network: 'Shadow Network',
    nomad_network: 'Nomad Network',
    impassable_retreat: 'Impassable Retreat',
    paladin_sustain: 'Paladin Sustain',
    juggernaut_doubled: 'Juggernaut Doubled',
    ambush_damage: 'Ambush Damage',
  };

  const label = labels[effect];
  if (!label) {
    return null;
  }

  return { label, detail: label };
}

export function pushCombatEffect(
  effects: CombatActionEffect[],
  label: string,
  detail: string,
  category: CombatActionEffectCategory,
): void {
  effects.push({ label, detail, category });
}
