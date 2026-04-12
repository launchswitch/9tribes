import type { FactionId, UnitId, CityId, HexCoord } from '../types.js';
import type { AiPersonalitySnapshot } from './aiPersonality.js';

export type FactionPosture = 'offensive' | 'balanced' | 'defensive' | 'recovery' | 'siege' | 'exploration';

export type UnitAssignment =
  | 'main_army'
  | 'raider'
  | 'defender'
  | 'siege_force'
  | 'reserve'
  | 'recovery'
  | 'return_to_sacrifice';

export type WaypointKind =
  | 'enemy_city'
  | 'friendly_city'
  | 'front_anchor'
  | 'regroup_anchor'
  | 'cleanup_target';

export interface FrontLine {
  anchor: HexCoord;
  pressure: number;
  enemyFactionId: FactionId;
  enemyCityId?: CityId;
  friendlyUnits: number;
  enemyUnits: number;
}

export interface ThreatAssessment {
  cityId: CityId;
  threatScore: number;
  nearbyEnemyUnits: number;
  nearbyFriendlyUnits: number;
  nearestEnemyFactionId?: FactionId;
}

export interface ProductionPriority {
  prototypeId: string;
  score: number;
  reason: string;
}

export interface ResearchPriority {
  nodeId: string;
  score: number;
  reason: string;
}

export interface UnitStrategicIntent {
  assignment: UnitAssignment;
  waypointKind: WaypointKind;
  waypoint: HexCoord;
  objectiveCityId?: CityId;
  objectiveUnitId?: UnitId;
  anchor: HexCoord;
  // For defender units: the city being defended (may be under attack/siege)
  threatenedCityId?: CityId;
  isolationScore: number;
  isolated: boolean;
  reason: string;
}

export interface HybridGoal {
  preferredRecipeIds: string[];
  pursueHybridProduction: boolean;
  desiredDomainIds: string[];
}

export interface AbsorptionGoal {
  targetFactionId?: FactionId;
  desiredDomainIds: string[];
  nearExposureDomainIds: string[];
  finishOffPriority: boolean;
}

export interface FactionStrategy {
  factionId: FactionId;
  round: number;
  personality: AiPersonalitySnapshot;
  posture: FactionPosture;
  primaryEnemyFactionId?: FactionId;
  primaryObjective: string;
  primaryCityObjectiveId?: CityId;
  primaryFrontAnchor?: HexCoord;
  threatenedCities: ThreatAssessment[];
  fronts: FrontLine[];
  focusTargetUnitIds: UnitId[];
  regroupAnchors: HexCoord[];
  retreatAnchors: HexCoord[];
  unitIntents: Record<string, UnitStrategicIntent>;
  productionPriorities: ProductionPriority[];
  researchPriorities: ResearchPriority[];
  hybridGoal: HybridGoal;
  absorptionGoal: AbsorptionGoal;
  debugReasons: string[];
}
