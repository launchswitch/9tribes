import type { VictoryType } from '../systems/warEcologySimulation.js';

export interface ReplayBundle {
  version: 3;
  generatedAt: string;
  seed: number;
  maxTurns: number;
  map: ReplayMap;
  factions: ReplayFactionSummary[];
  turns: ReplayTurn[];
  victory: ReplayVictory;
}

export interface ReplayMap {
  width: number;
  height: number;
  hexes: ReplayMapHex[];
}

export interface ReplayMapHex {
  key: string;
  q: number;
  r: number;
  terrain: string;
}

export interface ReplayFactionSummary {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  learnedDomains: string[];
  homeBiome: string;
  signatureUnit: string;
  passiveTrait: string;
  economyAngle: string;
  terrainDependence: string;
  capabilities: Record<string, number>;
}

export interface ReplayTurnSnapshot {
  round: number;
  phase: 'start' | 'end';
  factions: ReplayTurnFactionState[];
  units: ReplayTurnUnit[];
  cities: ReplayTurnCity[];
  villages: ReplayTurnVillage[];
  factionTripleStacks: ReplayTripleStack[];
}

export interface ReplayTurn {
  round: number;
  snapshotStart: ReplayTurnSnapshot;
  snapshotEnd: ReplayTurnSnapshot;
  events: ReplayEvent[];
  combatEvents: ReplayCombatEvent[];
  siegeEvents: ReplaySiegeEvent[];
  aiIntentEvents: ReplayAiIntentEvent[];
  factionStrategyEvents: ReplayFactionStrategyEvent[];
}

export interface ReplayTurnFactionState {
  id: string;
  name: string;
  livingUnits: number;
  cities: number;
  villages: number;
}

export interface ReplayTurnUnit {
  id: string;
  factionId: string;
  prototypeId: string;
  prototypeName: string;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  facing?: number;
}

export interface ReplayTurnCity {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
  besieged: boolean;
  wallHp: number;
  maxWallHp: number;
  turnsUnderSiege: number;
}

export interface ReplayTurnVillage {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
}

export interface ReplayTripleStack {
  factionId: string;
  domains: string[];
  tripleName: string;
  emergentRule: string;
}

export interface ReplayEvent {
  round: number;
  message: string;
}

export interface ReplayCombatEvent {
  round: number;
  attackerUnitId: string;
  defenderUnitId: string;
  attackerFactionId: string;
  defenderFactionId: string;
  attackerPrototypeId: string;
  defenderPrototypeId: string;
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
  breakdown: ReplayCombatBreakdown;
}

export interface ReplayCombatBreakdown {
  attacker: ReplayCombatUnitBreakdown;
  defender: ReplayCombatUnitBreakdown;
  modifiers: ReplayCombatModifiers;
  morale: ReplayCombatMoraleBreakdown;
  outcome: ReplayCombatOutcomeBreakdown;
  triggeredEffects: ReplayCombatEffect[];
}

export interface ReplayCombatUnitBreakdown {
  unitId: string;
  factionId: string;
  prototypeId: string;
  prototypeName: string;
  position: { q: number; r: number };
  terrain: string;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  baseStat: number;
}

export interface ReplayCombatModifiers {
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

export interface ReplayCombatMoraleBreakdown {
  attackerLoss: number;
  defenderLoss: number;
  attackerRouted: boolean;
  defenderRouted: boolean;
  attackerFled: boolean;
  defenderFled: boolean;
}

export interface ReplayCombatOutcomeBreakdown {
  attackerDamage: number;
  defenderDamage: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  defenderKnockedBack: boolean;
  knockbackDistance: number;
}

export interface ReplayCombatEffect {
  label: string;
  detail: string;
  category: 'positioning' | 'ability' | 'synergy' | 'aftermath';
}

export interface ReplaySiegeEvent {
  round: number;
  cityId: string;
  cityName: string;
  factionId: string;
  eventType: 'siege_started' | 'siege_broken' | 'wall_damaged' | 'wall_repaired' | 'city_captured';
  wallHP: number;
  maxWallHP: number;
  turnsUnderSiege: number;
  attackerFactionId?: string;
}

export interface ReplayAiIntentEvent {
  round: number;
  factionId: string;
  unitId: string;
  intent: 'retreat' | 'regroup' | 'advance' | 'siege' | 'support';
  from: { q: number; r: number };
  to?: { q: number; r: number };
  reason: string;
  targetUnitId?: string;
  targetCityId?: string;
}

export interface ReplayFactionStrategyEvent {
  round: number;
  factionId: string;
  posture: 'offensive' | 'balanced' | 'defensive' | 'recovery' | 'siege' | 'exploration' | 'last_stand';
  primaryObjective: string;
  primaryEnemyFactionId?: string;
  primaryCityObjectiveId?: string;
  threatenedCityIds: string[];
  frontAnchors: { q: number; r: number }[];
  focusTargetUnitIds: string[];
  reasons: string[];
}

export interface ReplayVictory {
  winnerFactionId: string | null;
  victoryType: VictoryType;
  controlledCities: number | null;
  dominationThreshold: number | null;
}
