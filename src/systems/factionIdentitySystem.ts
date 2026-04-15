import type { GameState } from '../game/types.js';
import type { Faction } from '../features/factions/types.js';
import type { Unit } from '../features/units/types.js';
import type { TerrainDef } from '../data/registry/types.js';
import { getHexesInRange } from '../core/grid.js';
import { getUnitAtHex } from './occupancySystem.js';

const WATER_TERRAINS = new Set(['coast', 'river', 'ocean']);
const POOR_TERRAINS = new Set(['tundra', 'desert', 'hill', 'river', 'coast']);
const OPEN_GROUND_TERRAINS = new Set(['plains', 'savannah']);
const CHARGE_MOMENTUM_TERRAINS = new Set(['savannah', 'plains']);

export function isWaterTerrain(terrainId: string | undefined): boolean {
  return terrainId ? WATER_TERRAINS.has(terrainId) : false;
}

export function isPoorTerrain(terrainId: string | undefined): boolean {
  return terrainId ? POOR_TERRAINS.has(terrainId) : false;
}

export function getFactionForUnit(state: GameState, unit: Unit): Faction | undefined {
  return state.factions.get(unit.factionId);
}

const ROUGH_TERRAINS = new Set(['forest', 'jungle', 'hill', 'tundra', 'desert']);

export function getHealingBonus(faction: Faction | undefined, terrainId: string): number {
  const passive = faction?.identityProfile.passiveTrait;
  if (passive === 'healing_druids') {
    if (terrainId === 'forest') return 2;
    if (ROUGH_TERRAINS.has(terrainId)) return 2;
    return 1;
  }
  return 0;
}

export function getMovementCostModifier(
  faction: Faction | undefined,
  originTerrainId: string,
  targetTerrainId: string
): number {
  const passive = faction?.identityProfile.passiveTrait;

  if (passive === 'river_assault' && isWaterTerrain(targetTerrainId)) {
    return -2;
  }

  if (passive === 'greedy' && (targetTerrainId === 'coast' || targetTerrainId === 'ocean')) {
    return -1;
  }

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(targetTerrainId)) {
    return -1;
  }

  if (passive === 'healing_druids' && targetTerrainId === 'forest') {
    return -1;
  }

  if (passive === 'jungle_stalkers' && targetTerrainId === 'jungle') {
    return -2;
  }

  if (passive === 'jungle_stalkers' && (targetTerrainId === 'forest' || targetTerrainId === 'swamp')) {
    return -1;
  }

  if (passive === 'cold_hardened_growth' && targetTerrainId === 'tundra') {
    return -1;
  }

  if (passive === 'charge_momentum' && CHARGE_MOMENTUM_TERRAINS.has(targetTerrainId)) {
    return -1;
  }

  return 0;
}

export function getCombatAttackModifier(
  faction: Faction | undefined,
  attackerTerrain: TerrainDef | undefined,
  defenderTerrain: TerrainDef | undefined
): number {
  const passive = faction?.identityProfile.passiveTrait;
  const attackerTerrainId = attackerTerrain?.id ?? '';
  const defenderTerrainId = defenderTerrain?.id ?? '';

  if (passive === 'charge_momentum' && CHARGE_MOMENTUM_TERRAINS.has(attackerTerrainId)) {
    return 0.15;
  }

  if (passive === 'river_assault' && isWaterTerrain(attackerTerrainId)) {
    return 0.1;
  }

  if (passive === 'greedy' && (attackerTerrainId === 'coast' || attackerTerrainId === 'ocean')) {
    return 0.15;
  }

  if (passive === 'jungle_stalkers' && (attackerTerrainId === 'jungle' || attackerTerrainId === 'forest')) {
    return 0.15;
  }

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(attackerTerrainId)) {
    return 0.15;
  }

  if (passive === 'hill_engineering' && attackerTerrainId === 'hill') {
    return 0.25;
  }

  if (passive === 'healing_druids' && attackerTerrainId === 'forest') {
    return 0.15;
  }

  if (passive === 'cold_hardened_growth' && attackerTerrainId === 'tundra') {
    return 0.15;
  }

  return 0;
}

export function getCombatDefenseModifier(
  faction: Faction | undefined,
  defenderTerrain: TerrainDef | undefined
): number {
  const passive = faction?.identityProfile.passiveTrait;
  const terrainId = defenderTerrain?.id ?? '';

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(terrainId)) {
    return 0.2;
  }

  if (passive === 'hill_engineering' && terrainId === 'hill') {
    return 0.1;
  }

  if (passive === 'healing_druids' && ROUGH_TERRAINS.has(terrainId)) {
    return terrainId === 'forest' ? 0.1 : 0.05;
  }

  if (passive === 'cold_hardened_growth' && terrainId === 'tundra') {
    return 0.25;
  }

  if (passive === 'jungle_stalkers' && terrainId === 'jungle') {
    return 0.35;
  }

  // Jungle stalkers have guerrilla training on all rough terrain
  if (passive === 'jungle_stalkers' && (terrainId === 'forest' || terrainId === 'swamp')) {
    return 0.15;
  }

  if (passive === 'desert_logistics' && terrainId === 'desert') {
    return 0.15;
  }

  if (passive === 'charge_momentum' && CHARGE_MOMENTUM_TERRAINS.has(terrainId)) {
    return 0.15;
  }

  if (passive === 'greedy') {
    if (terrainId === 'coast' || terrainId === 'ocean') return 0.15;
    return 0.05; // pirate grit — always a little tougher
  }

  return 0;
}

export function getEconomyProductionBonus(
  faction: Faction | undefined,
  terrainId: string
): number {
  const passive = faction?.identityProfile.passiveTrait;

  if (passive === 'cold_hardened_growth' && isPoorTerrain(terrainId)) {
    return 0.10;
  }

  if (passive === 'greedy' && (terrainId === 'coast' || terrainId === 'ocean')) {
    return 0.10;
  }

  if (passive === 'river_assault' && terrainId === 'river') {
    return 0.02;
  }

  if (passive === 'healing_druids' && ROUGH_TERRAINS.has(terrainId)) {
    return 0.04;
  }

  if (passive === 'hill_engineering' && terrainId === 'hill') {
    return 0.04;
  }

  if (passive === 'jungle_stalkers' && terrainId === 'jungle') {
    return 0.05;
  }

  if (passive === 'desert_logistics' && terrainId === 'desert') {
    return 0.08;
  }

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(terrainId)) {
    return 0.04;
  }

  if (passive === 'charge_momentum' && terrainId === 'savannah') {
    return 0.10;
  }

  if (passive === 'charge_momentum' && terrainId === 'plains') {
    return 0.03;
  }

  return 0;
}

export function getEconomySupplyBonus(
  faction: Faction | undefined,
  terrainId: string
): number {
  const passive = faction?.identityProfile.passiveTrait;

  if (passive === 'desert_logistics' && terrainId === 'desert') {
    return 0.10;
  }

  if (passive === 'desert_logistics' && terrainId === 'savannah') {
    return 0.20;
  }

  if (passive === 'desert_logistics' && terrainId === 'plains') {
    return 0.20;
  }

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(terrainId)) {
    return 0.03;
  }

  if (passive === 'charge_momentum' && terrainId === 'savannah') {
    return 0.06;
  }

  if (passive === 'charge_momentum' && terrainId === 'plains') {
    return 0;
  }

  if (passive === 'jungle_stalkers' && terrainId === 'jungle') {
    return 0.05;
  }

  if (passive === 'greedy' && (terrainId === 'coast' || terrainId === 'ocean')) {
    return 0.10;
  }

  return 0;
}

export function isUnitRiverStealthed(faction: Faction | undefined, terrainId: string): boolean {
  const passive = faction?.identityProfile.passiveTrait;
  return passive === 'river_assault' && (isWaterTerrain(terrainId) || terrainId === 'swamp');
}

export function getTerrainPreferenceScore(
  faction: Faction | undefined,
  terrainId: string
): number {
  if (!faction) {
    return 0;
  }

  if (terrainId === faction.identityProfile.homeBiome) {
    return 2;
  }

  const passive = faction.identityProfile.passiveTrait;
  if (passive === 'greedy' && (terrainId === 'coast' || terrainId === 'ocean')) {
    return 2;
  }
  if (passive === 'river_assault' && (terrainId === 'river' || terrainId === 'swamp')) {
    return 1.5;
  }
  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(terrainId)) {
    return 1;
  }
  if (passive === 'desert_logistics' && terrainId === 'desert') {
    return 1;
  }
  if (passive === 'healing_druids' && terrainId === 'forest') {
    return 3;
  }
  if (passive === 'healing_druids' && ROUGH_TERRAINS.has(terrainId)) {
    return 1.5;
  }
  if (passive === 'jungle_stalkers' && terrainId === 'jungle') {
    return 3;
  }
  if (passive === 'jungle_stalkers' && terrainId === 'forest') {
    return 1;
  }

  if (passive === 'hill_engineering' && ROUGH_TERRAINS.has(terrainId)) {
    return 1;
  }

  if (passive === 'cold_hardened_growth' && terrainId === 'tundra') {
    return 3;
  }

  return 0;
}

/**
 * Desert Swarm (desert_logistics passive): when N+ living friendly units
 * (same faction, HP > 0) are within Chebyshev distance 2, the unit gains
 * a configurable attack bonus and defense multiplier.
 */
export interface DesertSwarmConfig {
  threshold: number;
  attackBonus: number;
  defenseMultiplier: number;
}

const DEFAULT_DESERT_SWARM_CONFIG: DesertSwarmConfig = {
  threshold: 3,
  attackBonus: 1,
  defenseMultiplier: 1.10,
};

export function getDesertSwarmBonus(
  faction: Faction | undefined,
  unit: Unit,
  state: GameState,
  config: DesertSwarmConfig = DEFAULT_DESERT_SWARM_CONFIG,
): { attackBonus: number; defenseMultiplier: number } {
  if (faction?.identityProfile.passiveTrait !== 'desert_logistics') {
    return { attackBonus: 0, defenseMultiplier: 1.0 };
  }

  const nearbyHexes = getHexesInRange(unit.position, 2);
  let friendlyCount = 0;
  for (const hex of nearbyHexes) {
    const unitId = getUnitAtHex(state, hex);
    if (unitId) {
      const nearbyUnit = state.units.get(unitId);
      if (nearbyUnit && nearbyUnit.factionId === unit.factionId && nearbyUnit.hp > 0) {
        friendlyCount++;
      }
    }
  }

  if (friendlyCount >= config.threshold) {
    return { attackBonus: config.attackBonus, defenseMultiplier: config.defenseMultiplier };
  }
  return { attackBonus: 0, defenseMultiplier: 1.0 };
}
