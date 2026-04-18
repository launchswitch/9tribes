// src/systems/villageCaptureSystem.ts
// Pirate's Greedy trait implementation for capturing enemy villages

import type { GameState } from '../game/types.js';
import type { Village } from '../features/villages/types.js';
import type { FactionId, VillageId, HexCoord } from '../types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { destroyVillage } from './villageSystem.js';
import { syncFactionSettlementIds } from './factionOwnershipSystem.js';
import { hexToKey, getNeighbors } from '../core/grid.js';

/**
 * Record of a village capture event, used to track cooldown periods.
 */
export interface VillageCaptureRecord {
  position: string; // hexKey of the captured village
  capturedByFactionId: FactionId;
  capturedRound: number;
}

/**
 * Map of hex keys to their capture records, tracking when they can host a village again.
 */
export type VillageCaptureCooldownMap = Map<string, VillageCaptureRecord>;

/**
 * Check if a faction has the greedy trait.
 * The greedy trait allows pirates to capture enemy villages.
 */
export function hasGreedyTrait(
  faction: { identityProfile: { passiveTrait: string } } | undefined
): boolean {
  if (!faction) return false;
  return faction.identityProfile.passiveTrait === 'greedy';
}

/**
 * Check if a village is on capture cooldown for a given hex.
 */
export function isOnVillageCooldown(
  hexKey: string,
  currentRound: number,
  cooldownMap: VillageCaptureCooldownMap,
  cooldownRounds: number
): boolean {
  const record = cooldownMap.get(hexKey);
  if (!record) return false;
  return currentRound - record.capturedRound < cooldownRounds;
}

/**
 * Check if a village can be captured by a unit.
 * Conditions:
 * - The unit's faction has the greedy trait
 * - The village is enemy-owned (different faction)
 * - The village is not on capture cooldown
 * - The village is adjacent to the unit's position
 */
export function canCaptureVillage(
  state: GameState,
  unitFactionId: FactionId,
  villageId: VillageId,
  currentRound: number,
  cooldownMap: VillageCaptureCooldownMap,
  registry?: RulesRegistry
): boolean {
  // Check if unit's faction has greedy trait
  const unitFaction = state.factions.get(unitFactionId);
  if (!hasGreedyTrait(unitFaction)) {
    return false;
  }

  // Get the village
  const village = state.villages.get(villageId);
  if (!village) {
    return false;
  }

  // Cannot capture own villages
  if (village.factionId === unitFactionId) {
    return false;
  }

  // Check cooldown — read from registry if available, otherwise default 10
  const cooldownRounds = registry
    ? registry.getSignatureAbility(unitFactionId)?.villageCaptureCooldownRounds ?? 10
    : 10;
  const hexKey = hexToKey(village.position);
  if (isOnVillageCooldown(hexKey, currentRound, cooldownMap, cooldownRounds)) {
    return false;
  }

  return true;
}

/**
 * Capture a village: transfer ownership, apply greedy bonus, destroy it.
 * Returns the updated state, cooldown map, and production gained.
 */
export function captureVillage(
  state: GameState,
  villageId: VillageId,
  capturingFactionId: FactionId,
  registry: RulesRegistry,
  cooldownMap: VillageCaptureCooldownMap
): {
  state: GameState;
  cooldownMap: VillageCaptureCooldownMap;
  productionGained: number;
} {
  const village = state.villages.get(villageId);
  if (!village) {
    return { state, cooldownMap, productionGained: 0 };
  }

  const capturingFaction = state.factions.get(capturingFactionId);
  if (!capturingFaction) {
    return { state, cooldownMap, productionGained: 0 };
  }

  const previousFactionId = village.factionId;
  const previousFaction = state.factions.get(previousFactionId);

  // Get greedy bonus from registry (default 25)
  const greedyBonus = registry.getSignatureAbility(capturingFactionId)?.greedyBonus ?? 25;

  // Get destroy setting from registry (default true)
  const destroySetting = registry.getSignatureAbility(capturingFactionId)?.villageCaptureDestroys ?? true;

  // Get cooldown from registry (default 10 rounds)
  const cooldownRounds = registry.getSignatureAbility(capturingFactionId)?.villageCaptureCooldownRounds ?? 10;

  const hexKey = hexToKey(village.position);

  // 1. Transfer village ownership to capturing faction
  const updatedVillage: Village = {
    ...village,
    factionId: capturingFactionId,
  };

  // Create new villages map with updated village
  const newVillages = new Map(state.villages);
  newVillages.set(villageId, updatedVillage);

  // 2. Update capturing faction's villageIds
  const newCapturingFaction = {
    ...capturingFaction,
    villageIds: [...capturingFaction.villageIds, villageId],
  };

  // 3. Update previous faction's villageIds (remove village)
  let newFactions = new Map(state.factions);
  newFactions.set(capturingFactionId, newCapturingFaction);

  if (previousFaction) {
    const newPreviousFaction = {
      ...previousFaction,
      villageIds: previousFaction.villageIds.filter((id) => id !== villageId),
    };
    newFactions.set(previousFactionId, newPreviousFaction);
  }

  let newState: GameState = {
    ...state,
    villages: newVillages,
    factions: newFactions,
  };

  // 4. Destroy the village if destroy setting is true
  if (destroySetting) {
    newState = destroyVillage(newState, villageId);
  }

  // 5. Record the capture in cooldown map
  const newCooldownMap = new Map(cooldownMap);
  newCooldownMap.set(hexKey, {
    position: hexKey,
    capturedByFactionId: capturingFactionId,
    capturedRound: state.round,
  });

  // 6. Sync faction settlement IDs to ensure consistency
  newState = syncFactionSettlementIds(newState, capturingFactionId);
  if (previousFaction) {
    newState = syncFactionSettlementIds(newState, previousFactionId);
  }

  return {
    state: newState,
    cooldownMap: newCooldownMap,
    productionGained: greedyBonus,
  };
}

/**
 * Find all capturable villages adjacent to a unit's position.
 */
export function findCapturableVillages(
  state: GameState,
  unitPosition: HexCoord,
  unitFactionId: FactionId,
  currentRound: number,
  cooldownMap: VillageCaptureCooldownMap,
  registry?: RulesRegistry
): VillageId[] {
  // Check if unit's faction has greedy trait
  const unitFaction = state.factions.get(unitFactionId);
  if (!hasGreedyTrait(unitFaction)) {
    return [];
  }

  // Get all neighboring hexes including the unit's position
  const adjacentHexes = getNeighbors(unitPosition);
  const hexesToCheck = [unitPosition, ...adjacentHexes];

  const capturableVillageIds: VillageId[] = [];

  // Read cooldown from registry if available
  const cooldownRounds = registry
    ? registry.getSignatureAbility(unitFactionId)?.villageCaptureCooldownRounds ?? 10
    : 10;

  for (const village of state.villages.values()) {
    // Skip villages owned by the same faction
    if (village.factionId === unitFactionId) {
      continue;
    }

    const villageHexKey = hexToKey(village.position);

    // Check if village is on cooldown
    if (isOnVillageCooldown(villageHexKey, currentRound, cooldownMap, cooldownRounds)) {
      continue;
    }

    // Check if village is adjacent to or on the unit's position
    const isAdjacent = hexesToCheck.some(
      (hex) => hexToKey(hex) === villageHexKey
    );

    if (isAdjacent) {
      capturableVillageIds.push(village.id);
    }
  }

  return capturableVillageIds;
}
