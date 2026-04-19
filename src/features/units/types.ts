// Unit entity types
import type { UnitId, FactionId, PrototypeId } from '../../types.js';
import type { HexCoord } from '../../types.js';
import type { VeteranLevel, UnitStatus } from '../../core/enums.js';

export interface HistoryEntry {
  type: string;
  timestamp: number;
  details: Record<string, unknown>;
}

/**
 * Represents a domain ability learned by killing an enemy unit.
 * When a unit kills an enemy, it has a chance to learn the enemy's faction's native domain.
 */
export interface LearnedAbility {
  domainId: string;       // The domain ID learned (e.g., 'venom', 'frost')
  fromFactionId: FactionId; // The faction ID this domain was learned from
  learnedOnRound: number;  // The round when this ability was learned
}

export interface Unit {
  id: UnitId;
  factionId: FactionId;
  position: HexCoord;
  facing: number;
  hp: number;
  maxHp: number;
  movesRemaining: number;
  maxMoves: number;
  attacksRemaining: number;
  xp: number;
  veteranLevel: VeteranLevel;
  status: UnitStatus;
  prototypeId: PrototypeId;
  history: HistoryEntry[];
  morale: number;
  routed: boolean;
  poisoned?: boolean;
  poisonedBy?: FactionId; // Track which faction inflicted the poison
  activatedThisRound?: boolean;
  preparedAbility?: 'brace' | 'ambush';
  preparedAbilityExpiresOnRound?: number;
  enteredZoCThisActivation?: boolean;
  poisonStacks: number;
  poisonTurnsRemaining: number; // Turns left before poison expires; 0 = not poisoned
  isStealthed: boolean;
  turnsSinceStealthBreak: number;
  hillDugIn?: boolean;
  entrenching?: boolean;  // Turn 1 of 2-turn dig-in process
  frozen?: boolean;
  frostbiteStacks?: number;
  frostbiteDoTDuration?: number;
  // Learn-by-kill system: abilities learned from killing enemy faction units
  learnedAbilities: LearnedAbility[];
  // Multi-turn move queue target; undefined = no active queue
  moveQueueDestination?: HexCoord;
}
