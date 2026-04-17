import type { City, Prototype, Unit } from '../../game/types.js';
import type { CityId, FactionId, HexCoord, UnitId } from '../../types.js';
import type { FactionPosture, UnitAssignment, WaypointKind } from '../factionStrategy.js';

export const FRONT_RADIUS = 4;
export const THREAT_RADIUS = 3;
export const REGROUP_DISTANCE = 3;
export const RECOVERY_HP_RATIO = 0.55;

export interface UnitWithPrototype {
  unit: Unit;
  prototype: Prototype;
}

export interface PostureDecision {
  posture: FactionPosture;
  reasons: string[];
}

export interface FocusTargetDecision {
  candidates: FocusTargetCandidate[];
  unitIds: UnitId[];
  reasons: string[];
}

export interface AssignmentDecision {
  intents: Record<string, import('../factionStrategy.js').UnitStrategicIntent>;
  reasons: string[];
}

export interface FocusTargetCandidate {
  unitId: UnitId;
  score: number;
  baseScore: number;
  personalityScore: number;
}

export interface FocusTargetBudget {
  unitId: UnitId;
  score: number;
  budget: number;
  allocated: number;
}

export interface SquadPlanEntry {
  squadId: string;
  anchor: HexCoord;
  memberIds: UnitId[];
}

export interface PressureObjective {
  waypointKind: WaypointKind;
  waypoint: HexCoord;
  objectiveCityId?: CityId;
  objectiveUnitId?: UnitId;
  villageId?: string;
  anchor: HexCoord;
  targetId: string;
  reason: string;
}

export interface WeightedAssignmentContext {
  lowHp: boolean;
  fastUnit: boolean;
  isolationScore: number;
  hasPrimaryObjective: boolean;
  hasFocusTarget: boolean;
  hasThreatenedCity: boolean;
  isMelee: boolean;
}
