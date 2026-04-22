// Learn-by-Kill System - Units learn enemy faction domains by killing them
// Part of the Learn by Killing + Sacrifice to Codify mechanic

import type { GameState } from '../game/types.js';
import type { City } from '../features/cities/types.js';
import type { Unit, LearnedAbility } from '../features/units/types.js';

import type { SimulationTrace } from './warEcologySimulation.js';
import type { RNGState } from '../core/rng.js';
import { rngNextFloat } from '../core/rng.js';
import { hexDistance } from '../core/grid.js';

const LEARN_CHANCE_BY_VETERAN_LEVEL: Record<string, number> = {
  green: 0.12,
  seasoned: 0.20,
  veteran: 0.28,
  elite: 0.35,
};
const MAX_LEARNED_ABILITIES = 3;

export interface LearnFromKillResult {
  unit: Unit;
  learned: boolean;
  domainId?: string;
  fromFactionId?: string;
}

export interface LearnFromCityCaptureResult {
  state: GameState;
  learned: boolean;
  unitId?: string;
  domainId?: string;
  fromFactionId?: string;
}

/**
 * Calculate the learn chance based on veteran's level.
 * Base rates (player): Green: 12%, Seasoned: 20%, Veteran: 28%, Elite: 35%
 * AI callers pass learnChanceScale=2 for double: 24/40/56/70
 */
function calculateLearnChance(veteranLevel: string, scale = 1): number {
  const base = LEARN_CHANCE_BY_VETERAN_LEVEL[veteranLevel] ?? LEARN_CHANCE_BY_VETERAN_LEVEL.green;
  return Math.min(base * scale, 1.0);
}

/**
 * Check if a unit already has a learned ability from a specific domain.
 */
function alreadyHasDomain(learnedAbilities: LearnedAbility[], domainId: string): boolean {
  return learnedAbilities.some(ability => ability.domainId === domainId);
}

/**
 * Try to learn a domain from killing an enemy unit.
 * This is called after combat when a defender is destroyed.
 * 
 * @param attacker - The unit that killed the enemy
 * @param defender - The destroyed enemy unit
 * @param state - Current game state
 * @param rngState - RNG state for roll
 * @param trace - Optional trace for logging
 * @returns Updated attacker unit and whether learning succeeded
 */
export function tryLearnFromKill(
  attacker: Unit,
  defender: Unit,
  state: GameState,
  rngState: RNGState,
  trace?: SimulationTrace,
  learnChanceScale = 1,
): LearnFromKillResult {
  // Get defender's faction to find its native domain
  const defenderFaction = state.factions.get(defender.factionId);
  if (!defenderFaction) {
    return { unit: attacker, learned: false };
  }

  const nativeDomain = defenderFaction.nativeDomain;
  const fromFactionId = defender.factionId;

  // Skip if attacker already has this domain learned
  if (alreadyHasDomain(attacker.learnedAbilities ?? [], nativeDomain)) {
    return { unit: attacker, learned: false };
  }

  // Skip if attacker is already at cap
  if ((attacker.learnedAbilities?.length ?? 0) >= MAX_LEARNED_ABILITIES) {
    log(trace, `${getUnitName(attacker, state)} already knows ${MAX_LEARNED_ABILITIES} abilities — cannot learn more`);
    return { unit: attacker, learned: false };
  }

  // Skip if attacker and defender are same faction
  if (attacker.factionId === defender.factionId) {
    return { unit: attacker, learned: false };
  }

  // Calculate learn chance based on veterancy (scaled for AI vs player)
  const learnChance = calculateLearnChance(attacker.veteranLevel, learnChanceScale);
  const roll = rngNextFloat(rngState);

  if (roll >= learnChance) {
    log(trace, `${getUnitName(attacker, state)} failed to learn ${nativeDomain} from ${defenderFaction.name} (roll: ${roll.toFixed(2)} vs chance: ${learnChance.toFixed(2)})`);
    return { unit: attacker, learned: false };
  }

  // Success! Add the learned ability
  const newAbility: LearnedAbility = {
    domainId: nativeDomain,
    fromFactionId: fromFactionId,
    learnedOnRound: state.round,
  };

  const updatedUnit: Unit = {
    ...attacker,
    learnedAbilities: [...(attacker.learnedAbilities ?? []), newAbility],
  };

  log(trace, `${getUnitName(attacker, state)} LEARNED ${nativeDomain} from ${defenderFaction.name}! (${updatedUnit.learnedAbilities.length}/${MAX_LEARNED_ABILITIES} abilities)`);

  return {
    unit: updatedUnit,
    learned: true,
    domainId: nativeDomain,
    fromFactionId: fromFactionId,
  };
}

/**
 * Grant domain learning from capturing an enemy city.
 * Finds the closest adjacent unit of the capturing faction and unconditionally
 * grants it the old city owner's nativeDomain (100% transfer).
 *
 * @param city - The city that was just captured (pre-capture object, factionId = old owner)
 * @param newOwnerFactionId - The faction that captured the city
 * @param state - Current game state (city ownership already transferred)
 * @param trace - Optional trace for logging
 * @returns Updated state and transfer details
 */
export function tryLearnFromCityCapture(
  city: City,
  newOwnerFactionId: string,
  state: GameState,
  trace?: SimulationTrace
): LearnFromCityCaptureResult {
  const oldOwnerFactionId = city.factionId;
  const oldOwnerFaction = state.factions.get(oldOwnerFactionId);
  if (!oldOwnerFaction) {
    return { state, learned: false };
  }

  const nativeDomain = oldOwnerFaction.nativeDomain;

  // Skip if same faction (shouldn't happen but guard)
  if (newOwnerFactionId === oldOwnerFactionId) {
    return { state, learned: false };
  }

  // Find the first adjacent unit of the capturing faction that can accept the domain
  for (const [, unit] of state.units) {
    if (unit.factionId !== newOwnerFactionId || unit.hp <= 0) continue;
    if (hexDistance(unit.position, city.position) > 1) continue;

    // Already has this domain — skip to next unit
    if (alreadyHasDomain(unit.learnedAbilities ?? [], nativeDomain)) continue;

    // At ability cap — skip to next unit
    if ((unit.learnedAbilities?.length ?? 0) >= MAX_LEARNED_ABILITIES) {
      log(trace, `${getUnitName(unit, state)} already knows ${MAX_LEARNED_ABILITIES} abilities — cannot learn from city capture`);
      continue;
    }

    // Grant the domain (100% chance)
    const newAbility: LearnedAbility = {
      domainId: nativeDomain,
      fromFactionId: oldOwnerFactionId,
      learnedOnRound: state.round,
    };

    const updatedUnit: Unit = {
      ...unit,
      learnedAbilities: [...(unit.learnedAbilities ?? []), newAbility],
    };

    const newUnits = new Map(state.units);
    newUnits.set(updatedUnit.id, updatedUnit);

    log(trace, `${getUnitName(updatedUnit, state)} LEARNED ${nativeDomain} from capturing ${city.name} (owned by ${oldOwnerFaction.name})! (${updatedUnit.learnedAbilities.length}/${MAX_LEARNED_ABILITIES} abilities)`);

    return {
      state: { ...state, units: newUnits },
      learned: true,
      unitId: updatedUnit.id,
      domainId: nativeDomain,
      fromFactionId: oldOwnerFactionId,
    };
  }

  return { state, learned: false };
}

/**
 * Get a human-readable name for a unit.
 */
function getUnitName(unit: Unit, state: GameState): string {
  const prototype = state.prototypes.get(unit.prototypeId);
  const faction = state.factions.get(unit.factionId);
  return `${faction?.name ?? 'Unknown'} ${prototype?.name ?? 'unit'}`;
}

/**
 * Log a message to the trace if trace is provided.
 */
function log(trace: SimulationTrace | undefined, message: string): void {
  if (trace) {
    trace.lines.push(message);
  }
}
