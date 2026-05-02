// Movement system - handles unit movement on the hex map
import type { GameState } from '../game/types.js';
import type { UnitId, HexCoord } from '../types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { GameMap } from '../world/map/types.js';
import { getDirectionIndex, getNeighbors, hexDistance, hexToKey } from '../core/grid.js';
import { isHexOccupied } from './occupancySystem.js';
import { entersEnemyZoC, getZoCMovementCost } from './zocSystem.js';
import { applyOpportunityAttacks } from './opportunityAttackSystem.js';
import { getMovementCostModifier } from './factionIdentitySystem.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';
import { canUseCharge } from './abilitySystem.js';
import { pruneDeadUnits } from './combatActionSystem.js';
import { destroyVillage } from './villageSystem.js';
import { SynergyEngine } from './synergyEngine.js';
import pairSynergiesData from '../content/base/pair-synergies.json' assert { type: 'json' };
import emergentRulesData from '../content/base/emergent-rules.json' assert { type: 'json' };
import abilityDomainsData from '../content/base/ability-domains.json' assert { type: 'json' };
import type { PairSynergyConfig, EmergentRuleConfig, DomainConfig } from './synergyEngine.js';

// Lazy singleton for synergy resolution (swarm_speed)
let movementSynergyEngine: SynergyEngine | null = null;
function getMovementSynergyEngine(): SynergyEngine {
  if (!movementSynergyEngine) {
    movementSynergyEngine = new SynergyEngine(
      pairSynergiesData.pairSynergies as PairSynergyConfig[],
      emergentRulesData.rules as EmergentRuleConfig[],
      Object.values(abilityDomainsData.domains) as DomainConfig[],
    );
  }
  return movementSynergyEngine;
}

function getSwarmSpeedBonus(tags: string[]): number {
  const engine = getMovementSynergyEngine();
  const synergies = engine.resolveUnitPairs(tags);
  for (const syn of synergies) {
    if (syn.effect.type === 'swarm_speed') {
      return (syn.effect as { speedBonus: number }).speedBonus;
    }
  }
  return 0;
}

export interface MovementPreview {
  totalCost: number;
  zocCost: number;
  entersZoC: boolean;
  consumesAllMoves: boolean; // Terrain that ends movement on entry (swamp)
}

export function previewMove(
  gameState: GameState,
  unitId: UnitId,
  targetHex: HexCoord,
  map: GameMap,
  rulesRegistry: RulesRegistry
): MovementPreview | null {
  const unit = gameState.units.get(unitId);
  if (!unit || unit.status !== 'ready') {
    return null;
  }

  if (hexDistance(unit.position, targetHex) !== 1) {
    return null;
  }

  const tile = map.tiles.get(hexToKey(targetHex));
  if (!tile) {
    return null;
  }

  const terrain = rulesRegistry.getTerrain(tile.terrain);
  if (!terrain || !terrain.passable) {
    return null;
  }

  // Naval movement restriction: naval units can only traverse water (coast/river)
  // Amphibious units can go ashore but at +1 movement cost penalty
  const prototype = gameState.prototypes.get(unit.prototypeId);
  const chassis = prototype ? rulesRegistry.getChassis(prototype.chassisId) : null;
  const isNavalUnit = chassis?.movementClass === 'naval';
  const isAmphibious = prototype?.tags?.includes('amphibious') ?? false;
  const prototypeTags = prototype?.tags ?? [];
  const targetTerrainId = tile.terrain;
  const isWaterTerrain = targetTerrainId === 'coast' || targetTerrainId === 'river' || targetTerrainId === 'ocean';
  const isDeepWater = targetTerrainId === 'coast' || targetTerrainId === 'ocean';

  // Deep water (ocean/coast): only naval units can traverse; river is crossable by land units
  if (isDeepWater && !isNavalUnit) {
    return null;
  }

  if (isNavalUnit && !isWaterTerrain && !isAmphibious) {
    return null; // Naval units cannot traverse non-water terrain (unless amphibious)
  }

  if (isHexOccupied(gameState, targetHex)) {
    return null;
  }

  // Cannot move into an enemy or neutral city
  for (const [, city] of gameState.cities) {
    if (city.factionId !== unit.factionId &&
        city.position.q === targetHex.q && city.position.r === targetHex.r) {
      return null;
    }
  }

  const faction = gameState.factions.get(unit.factionId);
  const doctrine = resolveResearchDoctrine(
    gameState.research.get(unit.factionId),
    faction,
  );
  const canChargeThroughTerrain = !!prototype && doctrine.chargeTranscendenceEnabled
    && (canUseCharge(prototype) || (prototype.derivedStats.range ?? 1) <= 1);

  const zocCost = getZoCMovementCost(targetHex, unit, gameState, doctrine);
  const originTerrainId = map.tiles.get(hexToKey(unit.position))?.terrain ?? 'plains';
  const movementModifier = getMovementCostModifier(faction, originTerrainId, tile.terrain);
  // Amphibious units pay +1 cost when going ashore (non-water terrain)
  const amphibiousLandingPenalty = (isNavalUnit && isAmphibious && !isWaterTerrain) ? 1 : 0;

  // Movement must always spend at least one point per entered hex.
  // ZoC does NOT add to cost — it triggers a forced-stop (all moves consumed) instead.
  let totalCost = terrain.movementCost + movementModifier + amphibiousLandingPenalty;

  // Endless Stride (desert_nomads signature): faction units ignore terrain costs on desert only
  const factionAbility = rulesRegistry.getSignatureAbility(unit.factionId);
  if (factionAbility?.endlessStride && targetTerrainId === 'desert') {
    totalCost = 1;
  }

  // Camel Adaptation (tag-based): Camel-tagged units ignore all terrain costs, always cost 1
  if (prototypeTags.includes('camel') || chassis?.movementClass === 'camel') {
    totalCost = 1;
  }

  // Ignore terrain (tag-based): units with ignore_terrain tag ignore all terrain costs, always cost 1
  if (prototypeTags.includes('ignore_terrain')) {
    totalCost = 1;
  }

  // Swarm speed synergy: reduce movement cost
  const swarmBonus = getSwarmSpeedBonus(prototypeTags);
  if (swarmBonus > 0) {
    totalCost -= swarmBonus;
  }

  // Doctrine-based movement bonuses
  const isCavalry = chassis?.movementClass === 'cavalry';

  // River crossing (tidal_warfare Tier 1): river costs 1 instead of 2
  if (targetTerrainId === 'river' && doctrine.riverCrossingEnabled) {
    totalCost = Math.min(totalCost, 1);
  }
  if ((targetTerrainId === 'coast' || targetTerrainId === 'river') && doctrine.amphibiousMovementEnabled) {
    totalCost = Math.min(totalCost, 1);
  }
  if (targetTerrainId === 'desert' && doctrine.heatResistanceEnabled) {
    totalCost = Math.min(totalCost, 1);
  }
  // E4 — Desert Raider emergent: allied units ignore desert movement penalty
  if (targetTerrainId === 'desert' && faction?.activeTripleStack?.emergentRule.effect.type === 'desert_raider') {
    totalCost = Math.min(totalCost, 1);
  }
  // Winter campaign (camel_adaptation Tier 2): no tundra movement penalty
  if (targetTerrainId === 'tundra' && doctrine.winterCampaignEnabled) {
    totalCost = Math.min(totalCost, 1);
  }
  if (doctrine.roughTerrainMovementEnabled && ['forest', 'jungle', 'hill', 'swamp'].includes(targetTerrainId)) {
    totalCost = Math.max(1, totalCost - 1);
  }
  if (canChargeThroughTerrain) {
    totalCost = Math.min(totalCost, 1);
  }

  // Only River People naval movement through rivers is allowed to drop below 1.
  const minimumMoveCost = isNavalUnit
    && targetTerrainId === 'river'
    && faction?.identityProfile.passiveTrait === 'river_assault'
    ? 0.5
    : 1;
  totalCost = Math.max(minimumMoveCost, totalCost);
  
  // Swamp: always enterable but consumes all remaining moves (difficult terrain)
  const consumesAllMoves = targetTerrainId === 'swamp';

  return {
    totalCost,
    zocCost,
    entersZoC: entersEnemyZoC(unit.position, targetHex, unit, gameState, doctrine),
    consumesAllMoves,
  };
}

/**
 * Check if a unit can move to a target hex.
 * Returns false if:
 * - Unit doesn't exist or is not ready
 * - Target is not adjacent (not within distance 1)
 * - Terrain is impassable
 * - Unit doesn't have enough moves remaining
 */
export function canMoveTo(
  gameState: GameState,
  unitId: UnitId,
  targetHex: HexCoord,
  map: GameMap,
  rulesRegistry: RulesRegistry
): boolean {
  // Get the unit
  const unit = gameState.units.get(unitId);
  if (!unit || unit.status !== 'ready') {
    return false;
  }

  // Check adjacency (distance must be 1)
  if (hexDistance(unit.position, targetHex) !== 1) {
    return false;
  }

  const preview = previewMove(gameState, unitId, targetHex, map, rulesRegistry);
  if (!preview) {
    return false;
  }

  if (unit.movesRemaining < preview.totalCost) {
    if (preview.consumesAllMoves) {
      // Consumes-all-moves terrain (swamp): allow entry with at least 1 move
      if (unit.movesRemaining < 1) {
        return false;
      }
    } else if (unit.movesRemaining < unit.maxMoves) {
      // Overspend: allow expensive terrain only when at full moves
      return false;
    }
  }

  return true;
}

/**
 * Move a unit to a target hex.
 * Returns new GameState with updated unit position and deducted moves.
 * Throws error if movement is invalid.
 */
export function moveUnit(
  gameState: GameState,
  unitId: UnitId,
  targetHex: HexCoord,
  map: GameMap,
  rulesRegistry: RulesRegistry
): GameState {
  if (!canMoveTo(gameState, unitId, targetHex, map, rulesRegistry)) {
    throw new Error(
      `Invalid move for unit ${unitId} to (${targetHex.q}, ${targetHex.r})`
    );
  }

  const unit = gameState.units.get(unitId)!;
  const preview = previewMove(gameState, unitId, targetHex, map, rulesRegistry)!;
  const facing = getDirectionIndex(unit.position, targetHex) ?? unit.facing;
  const movesRemaining = (preview.entersZoC || preview.consumesAllMoves) ? 0 : Math.max(0, unit.movesRemaining - preview.totalCost);

  // Create new units map with updated unit
  const newUnits = new Map(gameState.units);
  newUnits.set(unitId, {
    ...unit,
    position: targetHex,
    facing,
    movesRemaining,
    enteredZoCThisActivation: preview.entersZoC,
    entrenching: false,
  });

  let newState: GameState = {
    ...gameState,
    units: newUnits,
  };

  for (const village of newState.villages.values()) {
    if (village.factionId === unit.factionId) {
      continue;
    }
    if (village.position.q !== targetHex.q || village.position.r !== targetHex.r) {
      continue;
    }
    newState = destroyVillage(newState, village.id);
    break;
  }

  // Poison trap trigger: check if target hex has a trap owned by a different faction
  const trapKey = hexToKey(targetHex);
  const trap = newState.poisonTraps.get(trapKey);
  if (trap && trap.ownerFactionId !== unit.factionId) {
    const movedUnit = newState.units.get(unitId);
    if (movedUnit) {
      const trapUnits = new Map(newState.units);
      trapUnits.set(unitId, {
        ...movedUnit,
        hp: Math.max(0, movedUnit.hp - trap.damage),
        movesRemaining: Math.max(0, movedUnit.movesRemaining - trap.slow),
      });
      const newTraps = new Map(newState.poisonTraps);
      newTraps.delete(trapKey);
      newState = { ...newState, units: trapUnits, poisonTraps: newTraps };
    }
  }

  // Opportunity attacks: melee enemies that the unit departed from get a free strike.
  newState = applyOpportunityAttacks(newState, unitId, unit.position, targetHex, rulesRegistry);

  return pruneDeadUnits(newState);
}

/**
 * Get all valid movement targets for a unit.
 * Returns array of adjacent hexes the unit can move to.
 */
export function getValidMoves(
  gameState: GameState,
  unitId: UnitId,
  map: GameMap,
  rulesRegistry: RulesRegistry
): HexCoord[] {
  const unit = gameState.units.get(unitId);
  if (!unit || unit.status !== 'ready') {
    return [];
  }

  const neighbors = getNeighbors(unit.position);
  return neighbors.filter((hex) =>
    canMoveTo(gameState, unitId, hex, map, rulesRegistry)
  );
}
