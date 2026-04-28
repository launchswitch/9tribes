import type { FactionId, HexCoord, UnitId, PrototypeId } from '../../types.js';
import type { FactionStrategy } from '../factionStrategy.js';

export interface TurnSnapshot {
  round: number;
  phase: 'start' | 'end';
  factions: {
    id: FactionId;
    name: string;
    livingUnits: number;
    cities: number;
    villages: number;
  }[];
  units: {
    id: UnitId;
    factionId: FactionId;
    prototypeId: string;
    q: number;
    r: number;
    hp: number;
    maxHp: number;
    facing?: number;
  }[];
  cities: {
    id: string;
    factionId: FactionId;
    q: number;
    r: number;
    besieged: boolean;
    wallHP: number;
    maxWallHP: number;
    turnsUnderSiege: number;
  }[];
  villages: {
    id: string;
    factionId: FactionId;
    q: number;
    r: number;
  }[];
  factionTripleStacks?: {
    factionId: FactionId;
    domains: string[];
    tripleName: string;
    emergentRule: string;
  }[];
}

export interface TraceLogEvent {
  round: number;
  message: string;
}

export interface TraceCombatEvent {
  round: number;
  attackerUnitId: UnitId;
  defenderUnitId: UnitId;
  attackerFactionId: FactionId;
  defenderFactionId: FactionId;
  attackerPrototypeId: PrototypeId;
  defenderPrototypeId: PrototypeId;
  attackerPrototypeName: string;
  defenderPrototypeName: string;
  attackerDamage: number;
  defenderDamage: number;
  attackerHpAfter: number;
  defenderHpAfter: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  attackerRouted: boolean;
  defenderRouted: boolean;
  attackerFled: boolean;
  defenderFled: boolean;
  summary: string;
  breakdown: TraceCombatBreakdown;
}

export interface TraceCombatBreakdown {
  attacker: TraceCombatUnitBreakdown;
  defender: TraceCombatUnitBreakdown;
  modifiers: TraceCombatModifiers;
  morale: TraceCombatMoraleBreakdown;
  outcome: TraceCombatOutcomeBreakdown;
  triggeredEffects: TraceCombatEffect[];
}

export interface TraceCombatUnitBreakdown {
  unitId: UnitId;
  factionId: FactionId;
  prototypeId: PrototypeId;
  prototypeName: string;
  position: HexCoord;
  terrain: string;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  baseStat: number;
}

export interface TraceCombatModifiers {
  roleModifier: number;
  weaponModifier: number;
  flankingBonus: number;
  rearAttackBonus: number;
  chargeBonus: number;
  braceDefenseBonus: number;
  ambushBonus: number;
  hiddenAttackBonus: number;
  stealthAmbushBonus: number;
  situationalAttackModifier: number;
  situationalDefenseModifier: number;
  synergyAttackModifier: number;
  synergyDefenseModifier: number;
  improvementDefenseBonus: number;
  wallDefenseBonus: number;
  finalAttackStrength: number;
  finalDefenseStrength: number;
  baseMultiplier: number;
  positionalMultiplier: number;
  damageVarianceMultiplier: number;
  retaliationVarianceMultiplier: number;
}

export interface TraceCombatMoraleBreakdown {
  attackerLoss: number;
  defenderLoss: number;
  attackerRouted: boolean;
  defenderRouted: boolean;
  attackerFled: boolean;
  defenderFled: boolean;
}

export interface TraceCombatOutcomeBreakdown {
  attackerDamage: number;
  defenderDamage: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  defenderKnockedBack: boolean;
  knockbackDistance: number;
}

export interface TraceCombatEffect {
  label: string;
  detail: string;
  category: 'positioning' | 'ability' | 'synergy' | 'aftermath';
}

export interface TraceSiegeEvent {
  round: number;
  cityId: string;
  cityName: string;
  factionId: FactionId;
  eventType: 'siege_started' | 'siege_broken' | 'wall_damaged' | 'wall_repaired' | 'city_captured';
  wallHP: number;
  maxWallHP: number;
  turnsUnderSiege: number;
  attackerFactionId?: FactionId;
}

export interface TraceAiIntentEvent {
  round: number;
  factionId: FactionId;
  unitId: UnitId;
  intent: 'retreat' | 'regroup' | 'advance' | 'siege' | 'support';
  from: HexCoord;
  to?: HexCoord;
  reason: string;
  targetUnitId?: UnitId;
  targetCityId?: string;
}

export interface TraceFactionStrategyEvent {
  round: number;
  factionId: FactionId;
  posture: FactionStrategy['posture'];
  primaryObjective: string;
  primaryEnemyFactionId?: FactionId;
  primaryCityObjectiveId?: string;
  threatenedCityIds: string[];
  frontAnchors: HexCoord[];
  focusTargetUnitIds: UnitId[];
  reasons: string[];
}

export interface TraceAbilityLearnedEvent {
  round: number;
  unitId: UnitId;
  factionId: FactionId;
  domainId: string;
  fromFactionId: FactionId;
}

export interface TraceUnitSacrificedEvent {
  round: number;
  unitId: UnitId;
  factionId: FactionId;
  learnedDomains: string[];
}

export interface SimulationTrace {
  lines: string[];
  snapshots?: TurnSnapshot[];
  events?: TraceLogEvent[];
  combatEvents?: TraceCombatEvent[];
  siegeEvents?: TraceSiegeEvent[];
  aiIntentEvents?: TraceAiIntentEvent[];
  factionStrategyEvents?: TraceFactionStrategyEvent[];
  abilityLearnedEvents?: TraceAbilityLearnedEvent[];
  unitSacrificedEvents?: TraceUnitSacrificedEvent[];
  currentRound?: number;
}

export type VictoryType = 'elimination' | 'domination' | 'unresolved' | 'defeat';

export interface VictoryStatus {
  winnerFactionId: FactionId | null;
  victoryType: VictoryType;
  controlledCities: number | null;
  dominationThreshold: number | null;
}
