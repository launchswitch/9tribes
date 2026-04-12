import type { GameState } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { City, Prototype, Unit } from '../game/types.js';
import type { Village } from '../features/villages/types.js';
import type { CityId, FactionId, HexCoord, UnitId } from '../types.js';
import type {
  AbsorptionGoal,
  FactionPosture,
  FactionStrategy,
  FrontLine,
  HybridGoal,
  ThreatAssessment,
  UnitAssignment,
  UnitStrategicIntent,
  WaypointKind,
} from './factionStrategy.js';
import { hexDistance, hexToKey } from '../core/grid.js';
import { keyToHex } from '../core/hex.js';
import { getSupplyDeficit } from './economySystem.js';
import type { AiPersonalitySnapshot } from './aiPersonality.js';
import {
  computeAiPersonalitySnapshot,
  createEmptyAiPersonalitySnapshot,
  scoreFocusTarget,
  scorePosture,
  shouldCommitAttack,
} from './aiPersonality.js';
import { getExposureDetails } from './knowledgeSystem.js';
import { getTerrainPreferenceScore } from './factionIdentitySystem.js';
import { getEmbarkedUnits } from './transportSystem.js';
import { isSettlerPrototype } from './productionSystem.js';
import { getVisibleEnemyUnits, isUnitVisibleTo, getLastSeenEnemyUnits, getLastSeenEnemyCities, getExploredHexKeys } from './fogSystem.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { getAiDifficultyProfile, type AiDifficultyProfile } from './aiDifficulty.js';
import abilityDomainsData from '../content/base/ability-domains.json' with { type: 'json' };
import emergentRulesData from '../content/base/emergent-rules.json' with { type: 'json' };
import type { EmergentRuleConfig } from './synergyEngine.js';

const FRONT_RADIUS = 4;
const THREAT_RADIUS = 3;
const REGROUP_DISTANCE = 3;
const RECOVERY_HP_RATIO = 0.55;

interface UnitWithPrototype {
  unit: Unit;
  prototype: Prototype;
}

interface PostureDecision {
  posture: FactionPosture;
  reasons: string[];
}

interface FocusTargetDecision {
  candidates: FocusTargetCandidate[];
  unitIds: UnitId[];
  reasons: string[];
}

interface AssignmentDecision {
  intents: Record<string, UnitStrategicIntent>;
  reasons: string[];
}

interface FocusTargetCandidate {
  unitId: UnitId;
  score: number;
  baseScore: number;
  personalityScore: number;
}

interface FocusTargetBudget {
  unitId: UnitId;
  score: number;
  budget: number;
  allocated: number;
}

interface SquadPlanEntry {
  squadId: string;
  anchor: HexCoord;
  memberIds: UnitId[];
}

interface PressureObjective {
  waypointKind: WaypointKind;
  waypoint: HexCoord;
  objectiveCityId?: CityId;
  objectiveUnitId?: UnitId;
  villageId?: string;
  anchor: HexCoord;
  targetId: string;
  reason: string;
}

const ALL_ABILITY_DOMAIN_IDS = new Set(Object.keys(abilityDomainsData.domains));
const EMERGENT_RULES = emergentRulesData.rules as EmergentRuleConfig[];

export function computeFactionStrategy(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): FactionStrategy {
  const difficultyProfile = getAiDifficultyProfile(difficulty);
  const previousStrategy = state.factionStrategies.get(factionId);
  const faction = state.factions.get(factionId);
  if (!faction) {
    return createEmptyStrategy(state.round, factionId);
  }

  const friendlyUnits = getLivingUnitsForFaction(state, factionId);
  const enemyUnits = getLivingEnemyUnits(state, factionId, difficultyProfile);
  const threatenedCities = assessThreatenedCities(state, factionId, difficultyProfile);
  const fronts = detectFronts(state, factionId, threatenedCities, difficultyProfile);
  const personality = computeAiPersonalitySnapshot(state, factionId, registry, difficulty);
  const economy = state.economy.get(factionId);
  const supplyDeficit = economy ? getSupplyDeficit(economy) : 0;
  const exhaustion = state.warExhaustion.get(factionId)?.exhaustionPoints ?? 0;
  const postureDecision = determinePosture(
    friendlyUnits.length,
    enemyUnits.length,
    threatenedCities,
    exhaustion,
    supplyDeficit,
    fronts,
    personality,
    state.round,
    difficultyProfile,
    previousStrategy,
  );
  const posture = postureDecision.posture;
  const primaryEnemyFactionId = choosePrimaryEnemyFaction(fronts, enemyUnits);
  const primaryCityObjectiveId = choosePrimaryCityObjective(
    fronts,
    threatenedCities,
    posture,
    state,
    factionId,
    difficultyProfile,
  );
  const primaryFrontAnchor = choosePrimaryFrontAnchor(fronts, threatenedCities, posture);
  const focusTargetDecision = chooseFocusTargets(
    state,
    factionId,
    primaryCityObjectiveId,
    fronts,
    posture,
    personality,
    difficultyProfile,
  );
  const focusTargetUnitIds = focusTargetDecision.unitIds;
  const regroupAnchors = buildRegroupAnchors(state, factionId, fronts, threatenedCities);
  const retreatAnchors = getFriendlyCityAnchors(state, factionId);
  const hybridGoal = buildHybridGoal(state, factionId, registry);
  const absorptionGoal = buildAbsorptionGoal(state, factionId, enemyUnits, primaryEnemyFactionId);
  const assignmentDecision = assignUnitIntents(
    state,
    factionId,
    friendlyUnits,
    posture,
    personality,
    threatenedCities,
    primaryCityObjectiveId,
    primaryFrontAnchor,
    focusTargetDecision.candidates,
    regroupAnchors,
    retreatAnchors,
    difficultyProfile,
    previousStrategy,
  );
  const debugReasons = buildDebugReasons(
    posture,
    threatenedCities,
    fronts,
    supplyDeficit,
    exhaustion,
    hybridGoal,
    absorptionGoal,
    postureDecision.reasons,
    focusTargetDecision.reasons,
    assignmentDecision.reasons,
  );

  return {
    factionId,
    round: state.round,
    personality,
    posture,
    primaryEnemyFactionId,
    primaryObjective: summarizePrimaryObjective(posture, threatenedCities, primaryCityObjectiveId, primaryEnemyFactionId),
    primaryCityObjectiveId,
    primaryFrontAnchor,
    threatenedCities,
    fronts,
    focusTargetUnitIds,
    regroupAnchors,
    retreatAnchors,
    unitIntents: assignmentDecision.intents,
    productionPriorities: [],
    researchPriorities: [],
    hybridGoal,
    absorptionGoal,
    debugReasons,
  };
}

function createEmptyStrategy(round: number, factionId: FactionId): FactionStrategy {
  return {
    factionId,
    round,
    personality: createEmptyAiPersonalitySnapshot(factionId, round),
    posture: 'balanced',
    primaryObjective: 'hold position',
    threatenedCities: [],
    fronts: [],
    focusTargetUnitIds: [],
    regroupAnchors: [],
    retreatAnchors: [],
    unitIntents: {},
    productionPriorities: [],
    researchPriorities: [],
    hybridGoal: {
      preferredRecipeIds: [],
      pursueHybridProduction: false,
      desiredDomainIds: [],
    },
    absorptionGoal: {
      desiredDomainIds: [],
      nearExposureDomainIds: [],
      finishOffPriority: false,
    },
    debugReasons: [],
  };
}

function getLivingUnitsForFaction(state: GameState, factionId: FactionId): UnitWithPrototype[] {
  return Array.from(state.units.values())
    .filter((unit) => unit.factionId === factionId && unit.hp > 0)
    .map((unit) => ({ unit, prototype: state.prototypes.get(unit.prototypeId)! }))
    .filter((entry) => Boolean(entry.prototype))
    .sort(compareUnitEntries);
}

function getLivingEnemyUnits(
  state: GameState,
  factionId: FactionId,
  difficultyProfile: AiDifficultyProfile,
): UnitWithPrototype[] {
  if (difficultyProfile.strategy.strategicFogCheat) {
    return Array.from(state.units.values())
      .filter((unit) => unit.factionId !== factionId && unit.hp > 0)
      .map((unit) => ({ unit, prototype: state.prototypes.get(unit.prototypeId)! }))
      .filter((entry) => Boolean(entry.prototype))
      .sort(compareUnitEntries);
  }
  return getVisibleEnemyUnits(state, factionId);
}

function assessThreatenedCities(
  state: GameState,
  factionId: FactionId,
  difficultyProfile: AiDifficultyProfile,
): ThreatAssessment[] {
  return Array.from(state.cities.values())
    .filter((city) => city.factionId === factionId)
    .map((city) => {
      let nearbyEnemyUnits = 0;
      let nearbyFriendlyUnits = 0;
      let nearestEnemyFactionId: FactionId | undefined;
      let nearestEnemyDistance = Infinity;

      for (const unit of state.units.values()) {
        if (unit.hp <= 0) continue;
        if (unit.factionId === factionId) {
          nearbyFriendlyUnits += 1;
        } else {
          if (!difficultyProfile.strategy.strategicFogCheat && !isUnitVisibleTo(state, factionId, unit)) continue;
          const dist = hexDistance(city.position, unit.position);
          const prototype = state.prototypes.get(unit.prototypeId);
          const effectiveRange = prototype?.derivedStats.range ?? 1;
          const detectionRadius = Math.max(THREAT_RADIUS, effectiveRange);
          if (dist > detectionRadius) continue;
          nearbyEnemyUnits += 1;
          if (dist < nearestEnemyDistance) {
            nearestEnemyDistance = dist;
            nearestEnemyFactionId = unit.factionId;
          }
        }
      }

      const threatScore = nearbyEnemyUnits * 4 - nearbyFriendlyUnits * 2 + (city.besieged ? 6 : 0);
      return {
        cityId: city.id,
        threatScore,
        nearbyEnemyUnits,
        nearbyFriendlyUnits,
        nearestEnemyFactionId,
      };
    })
    .filter((threat) => threat.threatScore > 0)
    .sort((left, right) => {
      const leftCity = state.cities.get(left.cityId);
      const rightCity = state.cities.get(right.cityId);
      return right.threatScore - left.threatScore || compareHexes(leftCity?.position, rightCity?.position);
    });
}

function detectFronts(
  state: GameState,
  factionId: FactionId,
  threatenedCities: ThreatAssessment[],
  difficultyProfile: AiDifficultyProfile,
): FrontLine[] {
  const fronts = new Map<string, FrontLine>();
  const threatenedByCity = new Map(threatenedCities.map((threat) => [threat.cityId, threat]));

  // Helper to register a front from a known enemy position (visible or last-seen)
  const registerFront = (friendlyPos: HexCoord, enemyPos: HexCoord, enemyFactionId: FactionId, enemyCityId?: CityId) => {
    const dist = hexDistance(friendlyPos, enemyPos);
    if (dist > FRONT_RADIUS * 2) return; // Last-seen fronts need larger radius allowance

    const anchor = dist <= 1
      ? friendlyPos
      : {
          q: Math.round((friendlyPos.q + enemyPos.q) / 2),
          r: Math.round((friendlyPos.r + enemyPos.r) / 2),
        };
    const key = hexToKey(anchor);
    const existing = fronts.get(key);
    const nearbyEnemyCity = enemyCityId
      ? state.cities.get(enemyCityId)
      : Array.from(state.cities.values()).find(
          (city) => city.factionId === enemyFactionId && hexDistance(city.position, anchor) <= THREAT_RADIUS
        );

    if (!existing) {
      fronts.set(key, {
        anchor,
        pressure: (FRONT_RADIUS - dist + 1) * 0.5, // Last-seen fronts are weaker signals
        enemyFactionId,
        enemyCityId: nearbyEnemyCity?.id,
        friendlyUnits: 1,
        enemyUnits: 1,
      });
      return;
    }

    existing.pressure += (FRONT_RADIUS - dist + 1) * 0.5;
    existing.friendlyUnits += 1;
    existing.enemyUnits += 1;
    if (!existing.enemyCityId && nearbyEnemyCity) {
      existing.enemyCityId = nearbyEnemyCity.id;
    }
  };

  // Visible enemy units
  for (const friendly of state.units.values()) {
    if (friendly.factionId !== factionId || friendly.hp <= 0) continue;
    for (const enemy of state.units.values()) {
      if (enemy.factionId === factionId || enemy.hp <= 0) continue;
      if (!difficultyProfile.strategy.strategicFogCheat && !isUnitVisibleTo(state, factionId, enemy)) continue;
      const dist = hexDistance(friendly.position, enemy.position);
      if (dist > FRONT_RADIUS) continue;

      const anchor = dist <= 1
        ? friendly.position
        : {
            q: Math.round((friendly.position.q + enemy.position.q) / 2),
            r: Math.round((friendly.position.r + enemy.position.r) / 2),
          };
      const key = hexToKey(anchor);
      const existing = fronts.get(key);
      const nearbyEnemyCity = Array.from(state.cities.values()).find(
        (city) => city.factionId === enemy.factionId && hexDistance(city.position, anchor) <= THREAT_RADIUS
      );

      if (!existing) {
        fronts.set(key, {
          anchor,
          pressure: FRONT_RADIUS - dist + 1,
          enemyFactionId: enemy.factionId,
          enemyCityId: nearbyEnemyCity?.id,
          friendlyUnits: 1,
          enemyUnits: 1,
        });
        continue;
      }

      existing.pressure += FRONT_RADIUS - dist + 1;
      existing.friendlyUnits += 1;
      existing.enemyUnits += 1;
      if (!existing.enemyCityId && nearbyEnemyCity) {
        existing.enemyCityId = nearbyEnemyCity.id;
      }
    }
  }

  // Last-seen enemy units (memory of recently visible enemies)
  const lastSeenEnemies = getLastSeenEnemyUnits(state, factionId);
  for (const friendly of state.units.values()) {
    if (friendly.factionId !== factionId || friendly.hp <= 0) continue;
    for (const lse of lastSeenEnemies) {
      if (lse.roundsAgo > difficultyProfile.strategy.memoryDecayTurns) continue;
      registerFront(friendly.position, lse.position, lse.factionId);
    }
  }

  for (const threat of threatenedCities) {
    const city = state.cities.get(threat.cityId);
    if (!city || !threat.nearestEnemyFactionId) continue;
    const key = hexToKey(city.position);
    const existing = fronts.get(key);
    if (existing) {
      existing.pressure += Math.max(2, threat.threatScore);
      continue;
    }
    fronts.set(key, {
      anchor: city.position,
      pressure: Math.max(2, threat.threatScore),
      enemyFactionId: threat.nearestEnemyFactionId,
      enemyCityId: undefined,
      friendlyUnits: threat.nearbyFriendlyUnits,
      enemyUnits: threat.nearbyEnemyUnits,
    });
  }

  return Array.from(fronts.values()).sort(
    (left, right) => right.pressure - left.pressure || hexToKey(left.anchor).localeCompare(hexToKey(right.anchor))
  );
}

function determinePosture(
  unitCount: number,
  enemyUnitCount: number,
  threatenedCities: ThreatAssessment[],
  exhaustion: number,
  supplyDeficit: number,
  fronts: FrontLine[],
  personality: AiPersonalitySnapshot,
  round: number,
  difficultyProfile: AiDifficultyProfile,
  previousStrategy: FactionStrategy | undefined,
): PostureDecision {
  const cityThreat = threatenedCities[0]?.threatScore ?? 0;
  const majorFront = fronts[0];
  if (unitCount <= 1 || exhaustion >= 10 || supplyDeficit >= 3) {
    return {
      posture: 'recovery',
      reasons: ['posture_guard=recovery:critical_recovery_state'],
    };
  }
  if (cityThreat >= 5) {
    return {
      posture: 'defensive',
      reasons: ['posture_guard=defensive:high_city_threat'],
    };
  }
  const context = {
    threatenedCities: threatenedCities.length,
    fronts: fronts.length,
    localAdvantage: unitCount - enemyUnitCount,
    supplyDeficit,
    exhaustion,
  };
  const scoreByPosture = new Map<FactionPosture, number>();
  for (const posture of ['offensive', 'balanced', 'defensive', 'recovery', 'siege', 'exploration'] as FactionPosture[]) {
    scoreByPosture.set(posture, scorePosture(personality, context, posture));
  }
  if (majorFront && majorFront.enemyCityId && majorFront.friendlyUnits >= majorFront.enemyUnits + 1) {
    scoreByPosture.set('siege', (scoreByPosture.get('siege') ?? 0) + 2.5);
  }
  if (enemyUnitCount > 0 && unitCount >= enemyUnitCount * 2 && unitCount >= 5) {
    scoreByPosture.set('siege', (scoreByPosture.get('siege') ?? 0) + 2);
  }
  if (majorFront && majorFront.friendlyUnits >= majorFront.enemyUnits) {
    scoreByPosture.set('offensive', (scoreByPosture.get('offensive') ?? 0) + 1.5);
  }
  if (fronts.length === 0 && threatenedCities.length === 0) {
    scoreByPosture.set('exploration', (scoreByPosture.get('exploration') ?? 0) + 2.5);
  }
  if (enemyUnitCount === 0) {
    const penalty = difficultyProfile.strategy.noEnemySeenOffensivePenalty;
    scoreByPosture.set('offensive', (scoreByPosture.get('offensive') ?? 0) + penalty);
    scoreByPosture.set('siege', (scoreByPosture.get('siege') ?? 0) + penalty);
  }
  if (round >= difficultyProfile.strategy.postureExplorationDeadline) {
    scoreByPosture.set('exploration', Number.NEGATIVE_INFINITY);
  }
  if (enemyUnitCount > 0 && unitCount >= enemyUnitCount + 2) {
    scoreByPosture.set('balanced', (scoreByPosture.get('balanced') ?? 0) - 2.5);
    scoreByPosture.set('offensive', (scoreByPosture.get('offensive') ?? 0) + 1.5);
  }
  if (previousStrategy && difficultyProfile.strategy.postureCommitmentLockTurns > 0) {
    const roundsSinceLast = round - previousStrategy.round;
    const previousUnitCount = Object.keys(previousStrategy.unitIntents).length;
    const lostArmyMass =
      previousUnitCount > 0 && unitCount <= Math.max(1, Math.floor(previousUnitCount * 0.7));
    const decisiveBreak = cityThreat >= 5 || exhaustion >= 8 || supplyDeficit >= 2 || lostArmyMass;
    const stickyPosture =
      previousStrategy.posture === 'offensive' || previousStrategy.posture === 'siege'
        ? previousStrategy.posture
        : undefined;
    if (
      stickyPosture
      && roundsSinceLast <= difficultyProfile.strategy.postureCommitmentLockTurns
      && !decisiveBreak
    ) {
      scoreByPosture.set(stickyPosture, (scoreByPosture.get(stickyPosture) ?? 0) + 6);
    }
  }
  const ranked = Array.from(scoreByPosture.entries()).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  const winner = ranked[0];
  const runnerUp = ranked[1];
  return {
    posture: winner[0],
    reasons: [
      `posture_choice=${winner[0]}:${winner[1].toFixed(2)}`,
      runnerUp ? `posture_runner_up=${runnerUp[0]}:${runnerUp[1].toFixed(2)}` : 'posture_runner_up=none',
    ],
  };
}
function choosePrimaryEnemyFaction(fronts: FrontLine[], enemyUnits: UnitWithPrototype[]): FactionId | undefined {
  if (fronts.length > 0) {
    return fronts[0].enemyFactionId;
  }
  return enemyUnits[0]?.unit.factionId;
}

function choosePrimaryCityObjective(
  fronts: FrontLine[],
  threatenedCities: ThreatAssessment[],
  posture: FactionPosture,
  state?: GameState,
  factionId?: FactionId,
  difficultyProfile?: AiDifficultyProfile,
): CityId | undefined {
  if ((posture === 'defensive' || posture === 'recovery') && threatenedCities[0]) {
    return threatenedCities[0].cityId;
  }

  // Pirate Lords: prefer coastal enemy cities as offensive objectives
  const coastalFront = fronts.find((front) => {
    if (!front.enemyCityId || !state || !factionId) return false;
    const city = state.cities.get(front.enemyCityId);
    if (!city) return false;
    const terrain = state.map?.tiles.get(hexToKey(city.position))?.terrain ?? '';
    return terrain === 'coast' || terrain === 'river';
  });

  if (coastalFront?.enemyCityId) {
    return coastalFront.enemyCityId;
  }

  const frontCity = fronts.find((front) => Boolean(front.enemyCityId))?.enemyCityId;
  if (frontCity) return frontCity;

  if (state && factionId && difficultyProfile?.strategy.strategicFogCheat) {
    const homeCityId = state.factions.get(factionId)?.homeCityId;
    const homeCity = homeCityId ? state.cities.get(homeCityId) : undefined;
    const strategicCity = Array.from(state.cities.values())
      .filter((city) => city.factionId !== factionId)
      .sort((left, right) => {
        const leftDistance = hexDistance(left.position, homeCity?.position ?? left.position);
        const rightDistance = hexDistance(right.position, homeCity?.position ?? right.position);
        return leftDistance - rightDistance || left.id.localeCompare(right.id);
      })[0];
    if (strategicCity) {
      return strategicCity.id;
    }
  }

  if (state && factionId && posture !== 'defensive' && posture !== 'recovery') {
    const lastSeenCities = getLastSeenEnemyCities(state, factionId)
      .filter((c) => c.roundsAgo <= (difficultyProfile?.strategy.memoryDecayTurns ?? 20))
      .sort((a, b) => a.roundsAgo - b.roundsAgo);

    if (lastSeenCities.length > 0) {
      return lastSeenCities[0].cityId as CityId;
    }
  }

  return undefined;
}

function choosePrimaryFrontAnchor(
  fronts: FrontLine[],
  threatenedCities: ThreatAssessment[],
  posture: FactionPosture
): HexCoord | undefined {
  if ((posture === 'defensive' || posture === 'recovery') && threatenedCities.length > 0) {
    return fronts[0]?.anchor;
  }
  return fronts[0]?.anchor;
}

function chooseFocusTargets(
  state: GameState,
  factionId: FactionId,
  primaryCityObjectiveId: CityId | undefined,
  fronts: FrontLine[],
  posture: FactionPosture,
  personality: AiPersonalitySnapshot,
  difficultyProfile: AiDifficultyProfile,
): FocusTargetDecision {
  const targetEnemyFactionId = fronts[0]?.enemyFactionId;
  const candidateEnemyUnits = getLivingEnemyUnits(state, factionId, difficultyProfile);
  const primaryCityPosition = primaryCityObjectiveId
    ? state.cities.get(primaryCityObjectiveId)?.position
    : undefined;
  const candidates = candidateEnemyUnits
    .map((entry) => {
      const targetPrototype = state.prototypes.get(entry.unit.prototypeId);
      const cityDistance = primaryCityPosition
        ? hexDistance(entry.unit.position, primaryCityPosition)
        : 99;
      const hpRatio = entry.unit.hp / Math.max(1, entry.unit.maxHp);
      const routedBonus = entry.unit.routed ? 3 : 0;
      const sameFrontBonus = targetEnemyFactionId && entry.unit.factionId === targetEnemyFactionId ? 2 : 0;
      const postureBonus = posture === 'recovery' ? (entry.unit.routed ? 2 : 0) : 1;
      const nearestEnemySupport = nearestEnemySupportDistance(state, entry.unit);
      const isolated = nearestEnemySupport > 2;
      const capturable = entry.unit.routed || hpRatio <= 0.35;
      const wounded = hpRatio <= 0.6;
      const terrainId = state.map?.tiles.get(hexToKey(entry.unit.position))?.terrain;
      const antiSkirmishScore = isSkirmisherPrototype(targetPrototype)
        ? difficultyProfile.personality.antiSkirmishResponseWeight
        : 0;
      const personalityScore = scoreFocusTarget(
        personality,
        { targetDistance: cityDistance },
        {
          isolated,
          capturable,
          wounded,
          isCity: false,
          terrainId,
        },
      );
      const baseScore =
        sameFrontBonus + routedBonus + postureBonus + antiSkirmishScore + (1 - hpRatio) * 4 - cityDistance * 0.25;
      return {
        unitId: entry.unit.id,
        score: baseScore + personalityScore,
        baseScore,
        personalityScore,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftUnit = state.units.get(left.unitId);
      const rightUnit = state.units.get(right.unitId);
      return compareUnits(leftUnit, rightUnit, state);
    });
  const topCandidates = candidates.slice(0, difficultyProfile.strategy.focusTargetLimit);
  return {
    candidates: topCandidates,
    unitIds: topCandidates.map((candidate) => candidate.unitId),
    reasons: topCandidates.slice(0, 2).map(
      (candidate, index) =>
        `focus_${index + 1}=${candidate.unitId}:${candidate.score.toFixed(2)}(base=${candidate.baseScore.toFixed(2)},personality=${candidate.personalityScore.toFixed(2)})`,
    ),
  };
}
function buildRegroupAnchors(
  state: GameState,
  factionId: FactionId,
  fronts: FrontLine[],
  threatenedCities: ThreatAssessment[]
): HexCoord[] {
  const anchors: HexCoord[] = [];
  if (fronts[0]) anchors.push(fronts[0].anchor);
  if (fronts[1]) anchors.push(fronts[1].anchor);
  for (const threat of threatenedCities) {
    const city = state.cities.get(threat.cityId);
    if (city) anchors.push(city.position);
  }
  return dedupeHexes(anchors);
}

function getFriendlyCityAnchors(state: GameState, factionId: FactionId): HexCoord[] {
  return dedupeHexes(
    Array.from(state.cities.values())
      .filter((city) => city.factionId === factionId)
      .map((city) => city.position)
  );
}

/**
 * Find a waypoint toward unexplored territory, biased toward the map center.
 * The center bias acts as a proxy for moving toward likely enemy positions,
 * since factions are placed roughly equidistant from the center.
 */
function findDirectedExplorationWaypoint(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord,
  difficultyProfile: AiDifficultyProfile,
): HexCoord | null {
  const exploredKeys = getExploredHexKeys(state, factionId);
  const tiles = state.map?.tiles;
  if (!tiles) return null;

  const centerQ = Math.floor((state.map?.width ?? 20) / 2);
  const centerR = Math.floor((state.map?.height ?? 20) / 2);
  const effectiveBias = Math.max(
    0,
    difficultyProfile.strategy.explorationCenterBias
      - state.round * difficultyProfile.strategy.explorationCenterBiasDecayPerRound,
  );

  let best: HexCoord | null = null;
  let bestScore = Infinity;

  for (const [key, tile] of tiles) {
    if (exploredKeys.has(key)) continue;
    const hex = keyToHex(key);
    const distFromUnit = hexDistance(origin, hex);
    const distFromCenter = hexDistance({ q: centerQ, r: centerR }, hex);
    const score = distFromUnit + effectiveBias * distFromCenter;
    if (score < bestScore) {
      bestScore = score;
      best = hex;
    }
  }

  return best;
}

function assignUnitIntents(
  state: GameState,
  factionId: FactionId,
  friendlyUnits: UnitWithPrototype[],
  posture: FactionPosture,
  personality: AiPersonalitySnapshot,
  threatenedCities: ThreatAssessment[],
  primaryCityObjectiveId: CityId | undefined,
  primaryFrontAnchor: HexCoord | undefined,
  focusTargetCandidates: FocusTargetCandidate[],
  regroupAnchors: HexCoord[],
  retreatAnchors: HexCoord[],
  difficultyProfile: AiDifficultyProfile,
  previousStrategy: FactionStrategy | undefined,
) : AssignmentDecision {
  const intents: Record<string, UnitStrategicIntent> = {};
  const assignmentSamples: string[] = [];
  const cityThreat = threatenedCities[0];
  const threatenedCity = cityThreat ? state.cities.get(cityThreat.cityId) : undefined;
  const primaryObjectiveCity = primaryCityObjectiveId ? state.cities.get(primaryCityObjectiveId) : undefined;
  const faction = state.factions.get(factionId);
  const homeCity = faction?.homeCityId ? state.cities.get(faction.homeCityId) : undefined;
  const focusTargetBudgets = buildSoftTargetBudgets(
    friendlyUnits.length,
    focusTargetCandidates,
    personality,
    difficultyProfile,
  );
  const targetSelectionStats = {
    choices: 0,
    overfills: 0,
  };
  const squadPlan = buildStatelessSquadPlan(
    friendlyUnits,
    Math.max(1, Math.round(personality.thresholds.squadSize)),
    primaryFrontAnchor,
    regroupAnchors,
  );

  for (const entry of friendlyUnits) {
    const isolationScore = nearestFriendlyDistance(state, entry.unit, factionId);
    const lowHp = entry.unit.hp / Math.max(1, entry.unit.maxHp) <= RECOVERY_HP_RATIO;
    const fastUnit = entry.prototype.derivedStats.role === 'mounted' || entry.prototype.derivedStats.moves >= 3;
    const selectedFocusTarget = selectFocusTargetCandidate(
      state,
      entry.unit,
      focusTargetBudgets,
      targetSelectionStats,
      difficultyProfile,
    );
    let assignment: UnitAssignment = 'main_army';
    let waypointKind: WaypointKind = 'front_anchor';
    let waypoint = primaryFrontAnchor ?? retreatAnchors[0] ?? entry.unit.position;
    let anchor = waypoint;
    let objectiveCityId: CityId | undefined;
    let objectiveUnitId: UnitId | undefined;
    let reason = 'holding the primary front';

    // Transport units with embarked troops: assign raider intent toward coastal objectives
    const isTransport = (entry.prototype.tags ?? []).includes('transport');
    if (isTransport && getEmbarkedUnits(entry.unit.id, state.transportMap).length > 0) {
      assignment = 'raider';
      waypointKind = 'enemy_city';
      // Find nearest coastal enemy objective
      const coastalObjective = findNearestCoastalEnemyObjective(state, factionId, entry.unit.position);
      if (coastalObjective) {
        waypoint = coastalObjective.position;
        anchor = primaryFrontAnchor ?? coastalObjective.position;
        objectiveCityId = coastalObjective.id;
        reason = 'transport with troops heading to raid coastal objective';
      } else if (primaryObjectiveCity) {
        waypoint = primaryObjectiveCity.position;
        anchor = primaryFrontAnchor ?? primaryObjectiveCity.position;
        objectiveCityId = primaryObjectiveCity.id;
        reason = 'transport with troops heading to primary enemy city';
      }
      intents[entry.unit.id] = {
        assignment,
        waypointKind,
        waypoint,
        objectiveCityId,
        objectiveUnitId,
        anchor,
        threatenedCityId: threatenedCity?.id,
        isolationScore,
        isolated: false,
        reason,
      };
      continue;
    }

    // Return to sacrifice: if a unit has learned abilities and is near home city, consider returning to sacrifice
    // This should be checked early so it can override other assignments when conditions are met
    const faction = state.factions.get(factionId);
    if (faction && (entry.unit.learnedAbilities?.length ?? 0) > 0) {
      const homeCity = faction.homeCityId ? state.cities.get(faction.homeCityId) : undefined;
      if (homeCity) {
        const distToHome = hexDistance(entry.unit.position, homeCity.position);
        const armySize = friendlyUnits.length;
        const isElite = entry.unit.veteranLevel === 'elite';
        const abilityCount = entry.unit.learnedAbilities?.length ?? 0;
        
        // Heuristic for return_to_sacrifice:
        // - Distance threshold: within 5 hexes of home city
        // - Don't sacrifice elite units (high combat value)
        // - Don't sacrifice if army is very small (< 3 units)
        // - Higher priority if carrying more abilities (3 = highest)
        const DISTANCE_THRESHOLD = 5;
        const MIN_ARMY_SIZE_FOR_SACRIFICE = 3;
        const shouldReturnToSacrifice = 
          distToHome <= DISTANCE_THRESHOLD &&
          !isElite &&
          armySize >= MIN_ARMY_SIZE_FOR_SACRIFICE &&
          // Priority increases with ability count and decreases with distance
          (abilityCount >= 3 || (abilityCount >= 2 && distToHome <= 3) || distToHome <= 2);
        
        if (shouldReturnToSacrifice) {
          assignment = 'return_to_sacrifice';
          waypointKind = 'friendly_city';
          waypoint = homeCity.position;
          anchor = homeCity.position;
          objectiveCityId = homeCity.id;
          reason = `carrying ${abilityCount} ability(ies), returning to ${faction.name} capital to sacrifice`;
          
          intents[entry.unit.id] = {
            assignment,
            waypointKind,
            waypoint,
            objectiveCityId,
            objectiveUnitId,
            anchor,
            isolationScore,
            isolated: false,
            reason,
          };
          continue;
        }
      }
    }

    // Units adjacent to their siege objective stay committed even if wounded
    const nearSiegeObjective = primaryObjectiveCity
      && hexDistance(entry.unit.position, primaryObjectiveCity.position) <= 2;
    if ((lowHp && !nearSiegeObjective) || (posture === 'recovery' && isolationScore > REGROUP_DISTANCE)) {
      assignment = 'recovery';
      waypointKind = 'friendly_city';
      waypoint = nearestHex(entry.unit.position, retreatAnchors) ?? entry.unit.position;
      anchor = waypoint;
      reason = 'damaged or isolated unit recovering near a friendly city';
    } else if (posture === 'exploration') {
      // Exploration mode: push outward to find enemies
      const explorationWaypoint = findDirectedExplorationWaypoint(state, factionId, entry.unit.position, difficultyProfile);
      if (explorationWaypoint && fastUnit) {
        assignment = 'raider';
        waypointKind = 'front_anchor';
        waypoint = explorationWaypoint;
        anchor = entry.unit.position;
        reason = 'scout exploring toward hidden territory';
      } else if (explorationWaypoint) {
        assignment = 'main_army';
        waypointKind = 'front_anchor';
        waypoint = explorationWaypoint;
        anchor = entry.unit.position;
        reason = 'exploration force moving toward unseen territory';
      } else {
        // No hidden hexes found — fall back to moving toward nearest enemy city from memory
        const lastSeenCities = getLastSeenEnemyCities(state, factionId)
          .filter((c) => c.roundsAgo <= 15)
          .sort((a, b) => a.roundsAgo - b.roundsAgo);
        if (lastSeenCities.length > 0) {
          const targetCityId = lastSeenCities[0].cityId;
          const targetCity = state.cities.get(targetCityId as CityId);
          if (targetCity) {
            assignment = 'main_army';
            waypointKind = 'enemy_city';
            waypoint = targetCity.position;
            anchor = entry.unit.position;
            objectiveCityId = targetCity.id;
            reason = 'marching toward last-known enemy city';
          }
        } else {
          // Absolute fallback: march toward map center to search for contact
          assignment = 'raider';
          waypointKind = 'front_anchor';
          const centerQ = Math.floor((state.map?.width ?? 20) / 2);
          const centerR = Math.floor((state.map?.height ?? 20) / 2);
          waypoint = { q: centerQ, r: centerR };
          anchor = entry.unit.position;
          reason = 'searching for contact';
        }
      }
    } else if (posture !== 'offensive' && threatenedCity) {
      assignment = 'defender';
      waypointKind = 'friendly_city';
      waypoint = threatenedCity.position;
      anchor = threatenedCity.position;
      objectiveCityId = threatenedCity.id;
      reason = 'reinforcing the most threatened city';
    } else {
      const weightedChoice = chooseWeightedAssignment(
        personality,
        posture,
        {
          lowHp,
          fastUnit,
          isolationScore,
          hasPrimaryObjective: Boolean(primaryObjectiveCity),
          hasFocusTarget: Boolean(selectedFocusTarget),
          hasThreatenedCity: Boolean(threatenedCity),
          isMelee: entry.prototype.derivedStats.role === 'melee',
        },
      );
      assignment = weightedChoice.assignment;

      if (assignment === 'siege_force' && primaryObjectiveCity) {
        waypointKind = 'enemy_city';
        waypoint = primaryObjectiveCity.position;
        anchor = primaryFrontAnchor ?? primaryObjectiveCity.position;
        objectiveCityId = primaryObjectiveCity.id;
        reason = `weighted siege pressure (${weightedChoice.score.toFixed(2)})`;
      } else if (assignment === 'reserve') {
        waypointKind = 'regroup_anchor';
        waypoint = nearestHex(entry.unit.position, regroupAnchors) ?? entry.unit.position;
        anchor = waypoint;
        reason = `weighted reserve regroup (${weightedChoice.score.toFixed(2)})`;
      } else if (assignment === 'raider' && selectedFocusTarget) {
        waypointKind = 'cleanup_target';
        waypoint = selectedFocusTarget.position;
        anchor = primaryFrontAnchor ?? selectedFocusTarget.position;
        objectiveUnitId = selectedFocusTarget.id;
        reason = `weighted raider exploit (${weightedChoice.score.toFixed(2)})`;
      } else if (assignment === 'defender' && threatenedCity) {
        waypointKind = 'friendly_city';
        waypoint = threatenedCity.position;
        anchor = threatenedCity.position;
        objectiveCityId = threatenedCity.id;
        reason = `weighted city defense (${weightedChoice.score.toFixed(2)})`;
      } else if (assignment === 'recovery') {
        waypointKind = 'friendly_city';
        waypoint = nearestHex(entry.unit.position, retreatAnchors) ?? entry.unit.position;
        anchor = waypoint;
        reason = `weighted recovery reset (${weightedChoice.score.toFixed(2)})`;
      } else if (selectedFocusTarget && posture !== 'recovery') {
        assignment = 'main_army';
        waypointKind = 'cleanup_target';
        waypoint = selectedFocusTarget.position;
        anchor = primaryFrontAnchor ?? selectedFocusTarget.position;
        objectiveUnitId = selectedFocusTarget.id;
        reason = `weighted main army pressure (${weightedChoice.score.toFixed(2)})`;
      } else if (primaryObjectiveCity) {
        waypointKind = 'enemy_city';
        waypoint = primaryObjectiveCity.position;
        anchor = primaryFrontAnchor ?? primaryObjectiveCity.position;
        objectiveCityId = primaryObjectiveCity.id;
        reason = `weighted objective advance (${weightedChoice.score.toFixed(2)})`;
      } else {
        reason = `weighted hold (${weightedChoice.score.toFixed(2)})`;
      }
    }

    if (assignmentSamples.length < 3) {
      assignmentSamples.push(`assignment_${entry.unit.id}=${assignment}:${reason}`);
    }
    intents[entry.unit.id] = {
      assignment,
      waypointKind,
      waypoint,
      objectiveCityId,
      objectiveUnitId,
      anchor,
      isolationScore,
      isolated: isolationScore > REGROUP_DISTANCE,
      reason,
    };
  }

  const coordinatorReasons = applyDifficultyCoordinator(
    state,
    factionId,
    friendlyUnits,
    intents,
    posture,
    difficultyProfile,
    previousStrategy,
  );
  const learnLoopReasons = difficultyProfile.strategy.learnLoopEnabled
    ? applyDifficultyLearnAndSacrificeCoordinator(
        state,
        factionId,
        friendlyUnits,
        intents,
        getNearestEnemyCity(
          state,
          factionId,
          homeCity?.position
            ?? retreatAnchors[0]
            ?? friendlyUnits[0]?.unit.position
            ?? { q: 0, r: 0 },
        ),
        difficultyProfile,
      )
    : [];

  const waitForAlliesStats = applyWaitForAlliesGate(
    state,
    factionId,
    personality,
    intents,
    squadPlan,
    regroupAnchors,
  );

  const summaryCounts: Partial<Record<UnitAssignment, number>> = {};
  for (const intent of Object.values(intents)) {
    summaryCounts[intent.assignment] = (summaryCounts[intent.assignment] ?? 0) + 1;
  }
  const summary = (
    ['main_army', 'raider', 'defender', 'siege_force', 'reserve', 'recovery', 'return_to_sacrifice'] as UnitAssignment[]
  )
    .filter((assignment) => (summaryCounts[assignment] ?? 0) > 0)
    .map((assignment) => `${assignment}:${summaryCounts[assignment]}`)
    .join(',');

  return {
    intents,
    reasons: [
      summary ? `assignment_mix=${summary}` : 'assignment_mix=none',
      `target_budget=choices:${targetSelectionStats.choices},overfills:${targetSelectionStats.overfills}`,
      `squad_wait=waits:${waitForAlliesStats.waits},overrides:${waitForAlliesStats.overrides}`,
      `squad_count=${new Set(Object.values(squadPlan).map((entry) => entry.squadId)).size}`,
      ...coordinatorReasons,
      ...learnLoopReasons,
      ...assignmentSamples,
    ],
  };
}

function applyDifficultyCoordinator(
  state: GameState,
  factionId: FactionId,
  friendlyUnits: UnitWithPrototype[],
  intents: Record<string, UnitStrategicIntent>,
  posture: FactionPosture,
  difficultyProfile: AiDifficultyProfile,
  previousStrategy: FactionStrategy | undefined,
): string[] {
  if (!difficultyProfile.strategy.coordinatorEnabled) {
    return [];
  }
  const coordinatorLabel = difficultyProfile.difficulty;

  const faction = state.factions.get(factionId);
  const homeCity = faction?.homeCityId ? state.cities.get(faction.homeCityId) : undefined;
  if (!faction || !homeCity) {
    return [`${coordinatorLabel}_coordinator=skipped:no_home_city`];
  }

  const activeArmy = friendlyUnits.filter((entry) => {
    const intent = intents[entry.unit.id];
    return intent && intent.assignment !== 'recovery' && intent.assignment !== 'return_to_sacrifice';
  });
  if (activeArmy.length === 0) {
    return [`${coordinatorLabel}_coordinator=skipped:no_active_army`];
  }

  const garrisonUnit = [...activeArmy].sort((left, right) => {
    const distanceDelta =
      hexDistance(left.unit.position, homeCity.position) - hexDistance(right.unit.position, homeCity.position);
    if (distanceDelta !== 0) {
      return distanceDelta;
    }
    return compareUnitEntries(left, right);
  })[0];
  intents[garrisonUnit.unit.id] = buildHomeDefenseIntent(
    intents[garrisonUnit.unit.id],
    homeCity,
    `${coordinatorLabel} coordinator home garrison`,
  );

  // Lightweight coordinator for non-adaptive (Easy) difficulty:
  // send all non-garrison units toward the nearest enemy city or map center
  if (!difficultyProfile.adaptiveAi) {
    const targetCity = getNearestEnemyCity(state, factionId, homeCity.position);
    const target = targetCity?.position ?? { q: Math.floor((state.map?.width ?? 20) / 2), r: Math.floor((state.map?.height ?? 20) / 2) };
    const hunterPool = activeArmy.filter((entry) => entry.unit.id !== garrisonUnit.unit.id);
    for (const entry of hunterPool) {
      intents[entry.unit.id] = {
        ...intents[entry.unit.id],
        assignment: 'raider',
        waypointKind: targetCity ? 'enemy_city' : 'front_anchor',
        waypoint: target,
        objectiveCityId: targetCity?.id,
        anchor: homeCity.position,
        isolationScore: 0,
        isolated: false,
        reason: 'easy coordinator sending unit toward enemy',
      };
    }
    return [
      `${coordinatorLabel}_garrison=${garrisonUnit.unit.id}`,
      `${coordinatorLabel}_coordinator=simple_exploration:hunters=${hunterPool.length}`,
    ];
  }

  const economy = state.economy.get(factionId);
  const supplyRatio = economy && economy.supplyIncome > 0 ? economy.supplyDemand / economy.supplyIncome : 0;
  const idleNearHome = activeArmy.filter(
    (entry) =>
      entry.unit.id !== garrisonUnit.unit.id
      && entry.unit.status === 'ready'
      && hexDistance(entry.unit.position, homeCity.position) <= 3,
  );
  if (
    supplyRatio < difficultyProfile.strategy.coordinatorMinSupplyRatio
    || idleNearHome.length < difficultyProfile.strategy.coordinatorMinIdleNearHome
    || activeArmy.length < difficultyProfile.strategy.coordinatorMinActiveArmy
  ) {
    return [
      `${coordinatorLabel}_garrison=${garrisonUnit.unit.id}`,
      `${coordinatorLabel}_coordinator=standby:supply=${supplyRatio.toFixed(2)},idle=${idleNearHome.length}`,
    ];
  }

  const targetCity = getNearestEnemyCity(state, factionId, homeCity.position);
  if (!targetCity) {
    return [
      `${coordinatorLabel}_garrison=${garrisonUnit.unit.id}`,
      `${coordinatorLabel}_coordinator=standby:no_enemy_city`,
    ];
  }

  const hunterPool = activeArmy.filter((entry) => entry.unit.id !== garrisonUnit.unit.id);
  const enemyUnits = getLivingEnemyUnits(state, factionId, difficultyProfile);
  const isWinning = enemyUnits.length > 0 && activeArmy.length >= enemyUnits.length + 2;
  const isLosing = difficultyProfile.strategy.losingDenialMode && enemyUnits.length >= activeArmy.length + 2;
  const hunterShare = isWinning
    ? difficultyProfile.strategy.advantageHunterShare
    : difficultyProfile.strategy.coordinatorHunterShare;
  const hunterCount = Math.min(
    hunterPool.length,
    Math.max(
      difficultyProfile.strategy.coordinatorHunterFloor,
      Math.ceil(activeArmy.length * hunterShare),
    ),
  );
  if (hunterCount < difficultyProfile.strategy.coordinatorHunterFloor) {
    return [
      `${coordinatorLabel}_garrison=${garrisonUnit.unit.id}`,
      `${coordinatorLabel}_coordinator=standby:hunter_pool=${hunterPool.length}`,
    ];
  }

  const usedObjectives = {
    unitIds: new Set<UnitId>(),
    villageIds: new Set<string>(),
    cityIds: new Set<CityId>(),
  };
  const registerObjective = (objective: PressureObjective | undefined) => {
    if (!objective) return;
    if (objective.objectiveUnitId) usedObjectives.unitIds.add(objective.objectiveUnitId);
    if (objective.villageId) usedObjectives.villageIds.add(objective.villageId);
    if (objective.objectiveCityId) usedObjectives.cityIds.add(objective.objectiveCityId);
  };
  const rankHuntersForObjective = (
    pool: UnitWithPrototype[],
    objective: { waypoint: HexCoord; harassment?: boolean; city?: City },
  ): UnitWithPrototype[] =>
    [...pool].sort((left, right) => {
      const leftDistance = hexDistance(left.unit.position, objective.waypoint);
      const rightDistance = hexDistance(right.unit.position, objective.waypoint);
      const leftHarass = objective.harassment ? getHarassmentSuitability(left, factionId) : 0;
      const rightHarass = objective.harassment ? getHarassmentSuitability(right, factionId) : 0;
      if (leftHarass !== rightHarass) {
        return rightHarass - leftHarass;
      }
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      if (objective.city) {
        const leftCityDistance = hexDistance(left.unit.position, objective.city.position);
        const rightCityDistance = hexDistance(right.unit.position, objective.city.position);
        if (leftCityDistance !== rightCityDistance) {
          return leftCityDistance - rightCityDistance;
        }
      }
      if (left.prototype.derivedStats.moves !== right.prototype.derivedStats.moves) {
        return right.prototype.derivedStats.moves - left.prototype.derivedStats.moves;
      }
      return compareUnitEntries(left, right);
    });
  const assignObjectiveGroup = (
    huntersToAssign: UnitWithPrototype[],
    assignedHunterIds: Set<UnitId>,
    objective: PressureObjective,
    assignment: UnitAssignment,
    pushReason: string,
  ) => {
    registerObjective(objective);
    for (const hunter of huntersToAssign) {
      assignedHunterIds.add(hunter.unit.id);
      intents[hunter.unit.id] = {
        ...intents[hunter.unit.id],
        assignment,
        waypointKind: objective.waypointKind,
        waypoint: objective.waypoint,
        objectiveCityId: objective.objectiveCityId,
        objectiveUnitId: objective.objectiveUnitId,
        anchor: objective.anchor,
        isolated: false,
        reason: `${pushReason} ${objective.reason}`,
      };
    }
  };
  const assignStagingGroup = (
    huntersToAssign: UnitWithPrototype[],
    assignedHunterIds: Set<UnitId>,
    destination: HexCoord,
    pushReason: string,
  ) => {
    const stagingHex = buildStagingHex(homeCity.position, destination);
    for (const hunter of huntersToAssign) {
      assignedHunterIds.add(hunter.unit.id);
      intents[hunter.unit.id] = {
        ...intents[hunter.unit.id],
        assignment: 'reserve',
        waypointKind: 'regroup_anchor',
        waypoint: stagingHex,
        objectiveCityId: undefined,
        objectiveUnitId: undefined,
        anchor: stagingHex,
        isolated: false,
        reason: `${pushReason} staging behind early harassment`,
      };
    }
  };
  const chooseCityPressureObjective = (
    destinationCity: City,
  ): PressureObjective => {
    if (isLosing) {
      const denialObjective = chooseEconomicDenialObjective(
        state,
        factionId,
        homeCity.position,
        difficultyProfile,
        {
          preferredEnemyFactionId: destinationCity.factionId,
          excludedUnitIds: usedObjectives.unitIds,
          excludedVillageIds: usedObjectives.villageIds,
          excludedCityIds: usedObjectives.cityIds,
        },
      );
      if (denialObjective) {
        return denialObjective;
      }
    }

    const waypointVillage =
      posture === 'offensive' || posture === 'siege' || difficultyProfile.strategy.economicDenialWeight > 0
        ? chooseVillageFirstHunterTarget(state, factionId, homeCity.position, destinationCity, difficultyProfile)
        : undefined;
    if (waypointVillage) {
      return {
        waypointKind: 'cleanup_target',
        waypoint: waypointVillage.position,
        objectiveCityId: undefined,
        objectiveUnitId: undefined,
        villageId: waypointVillage.id,
        anchor: destinationCity.position,
        targetId: waypointVillage.id,
        reason: `via village ${waypointVillage.id} before ${destinationCity.id}`,
      };
    }
    return {
      waypointKind: 'enemy_city',
      waypoint: destinationCity.position,
      objectiveCityId: destinationCity.id,
      objectiveUnitId: undefined,
      villageId: undefined,
      anchor: destinationCity.position,
      targetId: destinationCity.id,
      reason: `toward ${destinationCity.id}`,
    };
  };

  const multiAxisMinGroupSize = Math.max(2, difficultyProfile.strategy.multiAxisMinGroupSize);
  const shouldStaggerMainPush =
    difficultyProfile.strategy.multiAxisStaggerTurns > 0
    && difficultyProfile.strategy.multiAxisGroupCount >= 3
    && (!previousStrategy || state.round - previousStrategy.round > difficultyProfile.strategy.multiAxisStaggerTurns);

  if (
    difficultyProfile.strategy.multiAxisEnabled
    && difficultyProfile.strategy.multiAxisGroupCount >= 3
    && hunterCount >= multiAxisMinGroupSize * 3
  ) {
    const flankTargetCity = chooseAdaptivePressureCity(
      state,
      factionId,
      homeCity.position,
      targetCity.id,
      difficultyProfile,
      usedObjectives.cityIds,
    );
    const harassObjective = chooseEconomicDenialObjective(
      state,
      factionId,
      homeCity.position,
      difficultyProfile,
      {
        preferredEnemyFactionId: targetCity.factionId,
        excludedUnitIds: usedObjectives.unitIds,
        excludedVillageIds: usedObjectives.villageIds,
        excludedCityIds: usedObjectives.cityIds,
      },
    );
    if (flankTargetCity && harassObjective) {
      const harassCount = Math.max(
        multiAxisMinGroupSize,
        Math.min(
          hunterCount - multiAxisMinGroupSize * 2,
          Math.floor(hunterCount * difficultyProfile.strategy.multiAxisHarassShare),
        ),
      );
      const rankedHarassers = rankHuntersForObjective(hunterPool, {
        waypoint: harassObjective.waypoint,
        harassment: true,
      });
      const harassmentHunters = rankedHarassers.slice(0, harassCount);
      if (harassmentHunters.length >= multiAxisMinGroupSize) {
        const harassmentIds = new Set(harassmentHunters.map((entry) => entry.unit.id));
        const remainingPool = hunterPool.filter((entry) => !harassmentIds.has(entry.unit.id));
        const remainingCount = remainingPool.length;
        const primaryCount = Math.max(
          multiAxisMinGroupSize,
          Math.min(
            remainingCount - multiAxisMinGroupSize,
            Math.round(hunterCount * difficultyProfile.strategy.multiAxisPrimaryShare),
          ),
        );
        const flankCount = Math.max(
          multiAxisMinGroupSize,
          Math.min(
            remainingCount - primaryCount,
            Math.round(hunterCount * difficultyProfile.strategy.multiAxisFlankShare),
          ),
        );
        const primaryHunters = rankHuntersForObjective(remainingPool, {
          waypoint: targetCity.position,
          city: targetCity,
        }).slice(0, primaryCount);
        const primaryIds = new Set(primaryHunters.map((entry) => entry.unit.id));
        const flankHunters = rankHuntersForObjective(
          remainingPool.filter((entry) => !primaryIds.has(entry.unit.id)),
          {
            waypoint: flankTargetCity.position,
            city: flankTargetCity,
          },
        ).slice(0, flankCount);

        if (primaryHunters.length >= multiAxisMinGroupSize && flankHunters.length >= multiAxisMinGroupSize) {
          const hunterIds = new Set<UnitId>();
          const primaryObjective = chooseCityPressureObjective(targetCity);
          const flankObjective = chooseCityPressureObjective(flankTargetCity);
          assignObjectiveGroup(
            harassmentHunters,
            hunterIds,
            harassObjective,
            'raider',
            `${coordinatorLabel} coordinator harassment wave`,
          );
          if (shouldStaggerMainPush) {
            assignStagingGroup(
              primaryHunters,
              hunterIds,
              targetCity.position,
              `${coordinatorLabel} coordinator main push`,
            );
            assignStagingGroup(
              flankHunters,
              hunterIds,
              flankTargetCity.position,
              `${coordinatorLabel} coordinator flanking push`,
            );
          } else {
            assignObjectiveGroup(
              primaryHunters,
              hunterIds,
              primaryObjective,
              isLosing ? 'raider' : 'main_army',
              `${coordinatorLabel} coordinator main push`,
            );
            assignObjectiveGroup(
              flankHunters,
              hunterIds,
              flankObjective,
              isLosing ? 'raider' : 'main_army',
              `${coordinatorLabel} coordinator flanking push`,
            );
          }

          for (const defender of hunterPool) {
            if (hunterIds.has(defender.unit.id)) {
              continue;
            }
            intents[defender.unit.id] = buildHomeDefenseIntent(
              intents[defender.unit.id],
              homeCity,
              `${coordinatorLabel} coordinator home defense`,
            );
          }

          return [
            `${coordinatorLabel}_garrison=${garrisonUnit.unit.id}`,
            `${coordinatorLabel}_multi_axis=triple`,
            `${coordinatorLabel}_stagger=${shouldStaggerMainPush ? 'arming' : 'released'}`,
            `${coordinatorLabel}_harass_target=${harassObjective.targetId}`,
            `${coordinatorLabel}_flank_target=${flankTargetCity.id}`,
            `${coordinatorLabel}_coordinator=active:supply=${supplyRatio.toFixed(2)},hunters=${hunterIds.size},defenders=${hunterPool.length - hunterIds.size + 1},mode=${isLosing ? 'denial' : isWinning ? 'advantage' : 'standard'}`,
          ];
        }
      }
    }
  }

  if (
    difficultyProfile.strategy.multiAxisEnabled
    && difficultyProfile.strategy.multiAxisGroupCount > 1
    && hunterCount >= multiAxisMinGroupSize * 2
  ) {
    const secondTargetCity = chooseAdaptivePressureCity(
      state,
      factionId,
      homeCity.position,
      targetCity.id,
      difficultyProfile,
      usedObjectives.cityIds,
    ) ?? getSecondNearestEnemyCity(state, factionId, homeCity.position, targetCity.id);
    if (secondTargetCity) {
      const flankCount = Math.max(multiAxisMinGroupSize, Math.floor(hunterCount * difficultyProfile.strategy.multiAxisFlankShare || 0.4));
      const primaryCount = hunterCount - flankCount;
      if (primaryCount >= multiAxisMinGroupSize) {
        const primaryHunters = rankHuntersForObjective(hunterPool, {
          waypoint: targetCity.position,
          city: targetCity,
        }).slice(0, primaryCount);
        const primaryHunterIds = new Set(primaryHunters.map((entry) => entry.unit.id));
        const flankHunters = rankHuntersForObjective(
          hunterPool.filter((entry) => !primaryHunterIds.has(entry.unit.id)),
          {
            waypoint: secondTargetCity.position,
            city: secondTargetCity,
          },
        ).slice(0, flankCount);

        if (flankHunters.length >= multiAxisMinGroupSize) {
          const hunterIds = new Set<UnitId>();
          assignObjectiveGroup(
            primaryHunters,
            hunterIds,
            chooseCityPressureObjective(targetCity),
            isLosing ? 'raider' : 'main_army',
            `${coordinatorLabel} coordinator hunter push`,
          );
          assignObjectiveGroup(
            flankHunters,
            hunterIds,
            chooseCityPressureObjective(secondTargetCity),
            isLosing ? 'raider' : 'main_army',
            `${coordinatorLabel} coordinator flanking push`,
          );

          for (const defender of hunterPool) {
            if (hunterIds.has(defender.unit.id)) {
              continue;
            }
            intents[defender.unit.id] = buildHomeDefenseIntent(
              intents[defender.unit.id],
              homeCity,
              `${coordinatorLabel} coordinator home defense`,
            );
          }

          return [
            `${coordinatorLabel}_garrison=${garrisonUnit.unit.id}`,
            `${coordinatorLabel}_multi_axis=double`,
            `${coordinatorLabel}_flank_target=${secondTargetCity.id}`,
            `${coordinatorLabel}_coordinator=active:supply=${supplyRatio.toFixed(2)},hunters=${hunterIds.size},defenders=${hunterPool.length - hunterIds.size + 1},mode=${isLosing ? 'denial' : isWinning ? 'advantage' : 'standard'}`,
          ];
        }
      }
    }
  }

  const singleAxisObjective = isLosing
    ? chooseEconomicDenialObjective(
        state,
        factionId,
        homeCity.position,
        difficultyProfile,
        {
          preferredEnemyFactionId: targetCity.factionId,
          excludedUnitIds: usedObjectives.unitIds,
          excludedVillageIds: usedObjectives.villageIds,
          excludedCityIds: usedObjectives.cityIds,
        },
      ) ?? chooseCityPressureObjective(targetCity)
    : chooseCityPressureObjective(targetCity);

  const hunters = rankHuntersForObjective(hunterPool, {
    waypoint: singleAxisObjective.waypoint,
    harassment: singleAxisObjective.objectiveUnitId !== undefined || singleAxisObjective.villageId !== undefined,
    city: singleAxisObjective.objectiveCityId ? state.cities.get(singleAxisObjective.objectiveCityId) : undefined,
  })
    .slice(0, hunterCount);
  const hunterIds = new Set(hunters.map((entry) => entry.unit.id));

  assignObjectiveGroup(
    hunters,
    hunterIds,
    singleAxisObjective,
    isLosing ? 'raider' : 'main_army',
    `${coordinatorLabel} coordinator hunter push`,
  );

  for (const defender of hunterPool) {
    if (hunterIds.has(defender.unit.id)) {
      continue;
    }
    intents[defender.unit.id] = buildHomeDefenseIntent(
      intents[defender.unit.id],
      homeCity,
      `${coordinatorLabel} coordinator home defense`,
    );
  }

  return [
    `${coordinatorLabel}_garrison=${garrisonUnit.unit.id}`,
    `${coordinatorLabel}_multi_axis=single`,
    `${coordinatorLabel}_target=${singleAxisObjective.targetId}`,
    `${coordinatorLabel}_coordinator=active:supply=${supplyRatio.toFixed(2)},hunters=${hunterIds.size},defenders=${hunterPool.length - hunterIds.size + 1},mode=${isLosing ? 'denial' : isWinning ? 'advantage' : 'standard'}`,
  ];
}

function applyDifficultyLearnAndSacrificeCoordinator(
  state: GameState,
  factionId: FactionId,
  friendlyUnits: UnitWithPrototype[],
  intents: Record<string, UnitStrategicIntent>,
  targetCity: City | undefined,
  difficultyProfile: AiDifficultyProfile,
): string[] {
  const learnLoopLabel = `${difficultyProfile.difficulty}_learn_loop`;
  const faction = state.factions.get(factionId);
  const homeCity = faction?.homeCityId ? state.cities.get(faction.homeCityId) : undefined;
  if (!faction || !homeCity) {
    return [`${learnLoopLabel}=skipped:no_home_city`];
  }

  const minAbilitiesToReturn = difficultyProfile.strategy.learnLoopMinAbilitiesToReturn;
  const maxAbilitiesToLearn = difficultyProfile.strategy.learnLoopMaxAbilitiesToLearn;
  const farFromHomeDistance = difficultyProfile.strategy.learnLoopFarFromHomeDistance;
  const idleHomeRadius = difficultyProfile.strategy.learnLoopIdleHomeRadius;
  const minFieldForce = difficultyProfile.strategy.learnLoopMinFieldForce;
  const maxReturnShare = difficultyProfile.strategy.learnLoopMaxReturnShare;

  const fieldArmy = friendlyUnits.filter((entry) => {
    const intent = intents[entry.unit.id];
    return intent && intent.assignment !== 'defender' && intent.assignment !== 'recovery' && intent.assignment !== 'return_to_sacrifice';
  });

  const returnCandidates = fieldArmy
    .filter((entry) => (entry.unit.learnedAbilities?.length ?? 0) >= minAbilitiesToReturn)
    .filter((entry) => hexDistance(entry.unit.position, homeCity.position) > farFromHomeDistance)
    .sort((left, right) => {
      const abilityDelta = (right.unit.learnedAbilities?.length ?? 0) - (left.unit.learnedAbilities?.length ?? 0);
      if (abilityDelta !== 0) {
        return abilityDelta;
      }
      const veteranDelta = left.unit.veteranLevel.localeCompare(right.unit.veteranLevel);
      if (veteranDelta !== 0) {
        return veteranDelta;
      }
      return hexDistance(right.unit.position, homeCity.position) - hexDistance(left.unit.position, homeCity.position);
    });

  const maxReturnCount = Math.min(
    returnCandidates.length,
    Math.max(0, fieldArmy.length - minFieldForce),
    Math.max(1, Math.floor(fieldArmy.length * maxReturnShare)),
  );

  const returningIds = new Set<UnitId>();
  for (const candidate of returnCandidates.slice(0, maxReturnCount)) {
    returningIds.add(candidate.unit.id);
    intents[candidate.unit.id] = {
      ...intents[candidate.unit.id],
      assignment: 'return_to_sacrifice',
      waypointKind: 'friendly_city',
      waypoint: homeCity.position,
      objectiveCityId: homeCity.id,
      objectiveUnitId: undefined,
      anchor: homeCity.position,
      isolated: false,
      reason: `${difficultyProfile.difficulty} learn loop returning ${candidate.unit.learnedAbilities.length} learned abilities to ${faction.name} capital`,
    };
  }

  const fallbackTargetCity = targetCity ?? getNearestEnemyCity(state, factionId, homeCity.position);
  const learnerTargetCity = difficultyProfile.strategy.learnLoopDomainTargetingEnabled
    ? getLearnLoopTargetCity(
        state,
        factionId,
        faction.learnedDomains,
        homeCity.position,
        fallbackTargetCity,
        difficultyProfile,
      )
    : fallbackTargetCity;
  const learnerPool = fieldArmy
    .filter((entry) => !returningIds.has(entry.unit.id))
    .filter((entry) => (entry.unit.learnedAbilities?.length ?? 0) <= maxAbilitiesToLearn)
    .filter((entry) => entry.unit.status === 'ready')
    .filter((entry) => hexDistance(entry.unit.position, homeCity.position) <= idleHomeRadius)
    .filter((entry) => {
      const assignment = intents[entry.unit.id]?.assignment;
      return assignment !== 'defender' && assignment !== 'main_army';
    });

  for (const learner of learnerPool) {
    const currentIntent = intents[learner.unit.id];
    intents[learner.unit.id] = {
      ...currentIntent,
      assignment: 'main_army',
      waypointKind: learnerTargetCity ? 'enemy_city' : currentIntent?.waypointKind ?? 'front_anchor',
      waypoint: learnerTargetCity?.position ?? currentIntent?.waypoint ?? learner.unit.position,
      objectiveCityId: learnerTargetCity?.id,
      objectiveUnitId: undefined,
      anchor: learnerTargetCity?.position ?? currentIntent?.anchor ?? learner.unit.position,
      isolated: false,
      reason: learnerTargetCity
        ? difficultyProfile.strategy.learnLoopDomainTargetingEnabled && learnerTargetCity.id !== fallbackTargetCity?.id
          ? `${difficultyProfile.difficulty} learn loop sending low-knowledge unit to hunt needed domains at ${learnerTargetCity.id}`
          : `${difficultyProfile.difficulty} learn loop sending low-knowledge unit to fight toward ${learnerTargetCity.id}`
        : `${difficultyProfile.difficulty} learn loop promoting idle unit to seek combat`,
    };
  }

  return [
    `${learnLoopLabel}=returners:${returningIds.size},learners:${learnerPool.length}`,
  ];
}

function getLearnLoopTargetCity(
  state: GameState,
  factionId: FactionId,
  learnedDomains: string[],
  origin: HexCoord,
  fallbackTargetCity: City | undefined,
  difficultyProfile: AiDifficultyProfile,
): City | undefined {
  const neededDomains = new Set<string>();
  const knownDomains = new Set(learnedDomains);
  for (const domainId of ALL_ABILITY_DOMAIN_IDS) {
    if (!knownDomains.has(domainId)) {
      neededDomains.add(domainId);
    }
  }
  if (neededDomains.size === 0) {
    return fallbackTargetCity;
  }

  let bestCity: City | undefined;
  let bestDistance = Infinity;
  for (const city of state.cities.values()) {
    if (city.factionId === factionId) {
      continue;
    }
    const cityFaction = state.factions.get(city.factionId);
    if (!cityFaction || !neededDomains.has(cityFaction.nativeDomain)) {
      continue;
    }
    const distance = hexDistance(origin, city.position);
    const adjustedDistance =
      distance
      - getEmergentRuleSacrificeDistanceCredit(
        knownDomains,
        cityFaction.nativeDomain,
        difficultyProfile,
      );
    if (adjustedDistance < bestDistance || (adjustedDistance === bestDistance && distance < hexDistance(origin, bestCity?.position ?? city.position))) {
      bestDistance = adjustedDistance;
      bestCity = city;
    }
  }
  return bestCity ?? fallbackTargetCity;
}

function getRuleDomainGroups(rule: EmergentRuleConfig): string[][] {
  if (rule.domainSets) {
    return Object.values(rule.domainSets);
  }
  if (rule.mobilityDomains) {
    return [rule.mobilityDomains];
  }
  if (rule.combatDomains) {
    return [rule.combatDomains];
  }
  return [];
}

function getEmergentRuleSacrificeDistanceCredit(
  knownDomains: Set<string>,
  candidateDomainId: string,
  difficultyProfile: AiDifficultyProfile,
): number {
  const baseCredit = difficultyProfile.research.emergentRuleSacrificePriority * 2;
  if (baseCredit <= 0 || knownDomains.has(candidateDomainId)) {
    return 0;
  }

  let bestCredit = 0;
  for (const rule of EMERGENT_RULES) {
    if (rule.condition === 'default') {
      continue;
    }
    const groups = getRuleDomainGroups(rule);
    if (groups.length === 0) {
      continue;
    }

    if (groups.length === 1) {
      const knownCount = groups[0].filter((domainId) => knownDomains.has(domainId)).length;
      if (knownCount === 2 && groups[0].includes(candidateDomainId)) {
        bestCredit = Math.max(bestCredit, baseCredit);
      }
      continue;
    }

    const coveredGroups = groups.filter((domains) => domains.some((domainId) => knownDomains.has(domainId)));
    if (coveredGroups.length !== groups.length - 1) {
      continue;
    }

    const missingGroup = groups.find((domains) => !domains.some((domainId) => knownDomains.has(domainId)));
    if (missingGroup?.includes(candidateDomainId)) {
      bestCredit = Math.max(bestCredit, baseCredit);
    }
  }

  return bestCredit;
}

function buildStagingHex(origin: HexCoord, destination: HexCoord): HexCoord {
  return {
    q: Math.round((origin.q * 2 + destination.q) / 3),
    r: Math.round((origin.r * 2 + destination.r) / 3),
  };
}

function getStrategicEnemyPressure(
  state: GameState,
  factionId: FactionId,
  position: HexCoord,
  radius: number,
  difficultyProfile: AiDifficultyProfile,
): number {
  let pressure = 0;
  for (const enemy of state.units.values()) {
    if (enemy.factionId === factionId || enemy.hp <= 0) continue;
    if (!difficultyProfile.strategy.strategicFogCheat && !isUnitVisibleTo(state, factionId, enemy)) continue;
    if (hexDistance(position, enemy.position) <= radius) {
      pressure += 1;
    }
  }
  return pressure;
}

function getHarassmentSuitability(entry: UnitWithPrototype, factionId: FactionId): number {
  const tags = entry.prototype.tags ?? [];
  let score = entry.prototype.derivedStats.moves;
  if (entry.prototype.derivedStats.role === 'mounted') score += 3;
  if (tags.includes('naval') || tags.includes('transport')) score += 2;
  if (tags.includes('skirmish')) score += 1.5;
  if (tags.includes('capture') || tags.includes('slave')) score += 1.5;

  switch (factionId) {
    case 'steppe_clan':
      if (entry.prototype.derivedStats.role === 'mounted') score += 3;
      if (tags.includes('skirmish')) score += 2;
      break;
    case 'coral_people':
      if (tags.includes('naval') || tags.includes('transport')) score += 3;
      if (tags.includes('capture') || tags.includes('slave')) score += 2;
      break;
    case 'desert_nomads':
      if (tags.includes('camel') || tags.includes('desert')) score += 3;
      break;
    case 'frost_wardens':
      if (entry.prototype.name.toLowerCase().includes('bear')) score += 2.5;
      break;
    default:
      break;
  }

  return score;
}

function chooseAdaptivePressureCity(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord,
  excludedCityId: CityId,
  difficultyProfile: AiDifficultyProfile,
  excludedCityIds: Set<CityId> = new Set(),
): City | undefined {
  return Array.from(state.cities.values())
    .filter((city) => city.factionId !== factionId && city.id !== excludedCityId && !excludedCityIds.has(city.id))
    .map((city) => {
      const distance = hexDistance(origin, city.position);
      const defenders = getStrategicEnemyPressure(state, factionId, city.position, 2, difficultyProfile);
      const villageCount = state.factions.get(city.factionId)?.villageIds.length ?? 0;
      const vulnerableCaptureBonus =
        city.turnsSinceCapture !== undefined && city.turnsSinceCapture <= Math.max(1, difficultyProfile.strategy.freshVillageDenialTurns)
          ? 8
          : 0;
      const cityAge = city.foundedRound !== undefined ? state.round - city.foundedRound : Infinity;
      const freshFoundingBonus =
        difficultyProfile.strategy.freshVillageDenialTurns > 0 && cityAge <= difficultyProfile.strategy.freshVillageDenialTurns
          ? 6
          : 0;
      const score =
        18
        + villageCount * difficultyProfile.strategy.economicDenialWeight * 0.5
        + vulnerableCaptureBonus
        + freshFoundingBonus
        + (city.isCapital ? 0 : 2)
        - distance * 0.75
        - defenders * 4
        - city.wallHP / 35;
      return { city, score, defenders, distance };
    })
    .sort((left, right) =>
      right.score - left.score
      || left.defenders - right.defenders
      || left.distance - right.distance
      || left.city.id.localeCompare(right.city.id)
    )[0]?.city;
}

function chooseEconomicDenialObjective(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord,
  difficultyProfile: AiDifficultyProfile,
  options: {
    preferredEnemyFactionId?: FactionId;
    excludedUnitIds?: Set<UnitId>;
    excludedVillageIds?: Set<string>;
    excludedCityIds?: Set<CityId>;
  } = {},
): PressureObjective | undefined {
  const economicWeight = difficultyProfile.strategy.economicDenialWeight;
  if (economicWeight <= 0) {
    return undefined;
  }

  const objectives: Array<PressureObjective & { score: number }> = [];
  const excludedUnitIds = options.excludedUnitIds ?? new Set<UnitId>();
  const excludedVillageIds = options.excludedVillageIds ?? new Set<string>();
  const excludedCityIds = options.excludedCityIds ?? new Set<CityId>();
  const sameEnemyBonus = (enemyFactionId: FactionId) =>
    options.preferredEnemyFactionId && enemyFactionId === options.preferredEnemyFactionId ? 3 : 0;

  if (difficultyProfile.strategy.settlerInterceptionEnabled) {
    for (const enemy of state.units.values()) {
      if (enemy.factionId === factionId || enemy.hp <= 0 || excludedUnitIds.has(enemy.id)) continue;
      if (!difficultyProfile.strategy.strategicFogCheat && !isUnitVisibleTo(state, factionId, enemy)) continue;
      const prototype = state.prototypes.get(enemy.prototypeId);
      if (!prototype || !isSettlerPrototype(prototype)) continue;

      const distance = hexDistance(origin, enemy.position);
      if (distance > difficultyProfile.strategy.settlerInterceptionRadius) continue;
      const escortPressure = getStrategicEnemyPressure(state, factionId, enemy.position, 2, difficultyProfile);
      const score =
        16
        + economicWeight * 2.5
        + sameEnemyBonus(enemy.factionId)
        + Math.max(0, difficultyProfile.strategy.settlerInterceptionRadius - distance) * 0.35
        - escortPressure * 2;
      objectives.push({
        waypointKind: 'cleanup_target',
        waypoint: enemy.position,
        objectiveCityId: undefined,
        objectiveUnitId: enemy.id,
        anchor: enemy.position,
        targetId: `settler:${enemy.id}`,
        reason: `to intercept settler ${enemy.id}`,
        villageId: undefined,
        score,
      });
    }
  }

  for (const village of state.villages.values()) {
    if (village.factionId === factionId || excludedVillageIds.has(village.id)) continue;
    const distance = hexDistance(origin, village.position);
    const defenders = getStrategicEnemyPressure(state, factionId, village.position, 2, difficultyProfile);
    const villageAge = Math.max(0, state.round - village.foundedRound);
    const freshBonus = villageAge <= difficultyProfile.strategy.freshVillageDenialTurns ? 10 : 0;
    const score =
      8
      + sameEnemyBonus(village.factionId)
      + (village.productionBonus + village.supplyBonus + 1) * economicWeight
      + freshBonus
      + Math.max(0, 12 - distance)
      - defenders * 2;
    objectives.push({
      waypointKind: 'cleanup_target',
      waypoint: village.position,
      objectiveCityId: undefined,
      objectiveUnitId: undefined,
      villageId: village.id,
      anchor: village.position,
      targetId: `village:${village.id}`,
      reason: `to deny village ${village.id}`,
      score,
    });
  }

  for (const city of state.cities.values()) {
    if (city.factionId === factionId || excludedCityIds.has(city.id)) continue;
    const isCapturedVulnerable = city.turnsSinceCapture !== undefined && city.turnsSinceCapture <= Math.max(1, difficultyProfile.strategy.freshVillageDenialTurns);
    const cityAge = city.foundedRound !== undefined ? state.round - city.foundedRound : Infinity;
    const isFreshFounded = difficultyProfile.strategy.freshVillageDenialTurns > 0 && cityAge <= difficultyProfile.strategy.freshVillageDenialTurns;
    if (!isCapturedVulnerable && !isFreshFounded) {
      continue;
    }
    const distance = hexDistance(origin, city.position);
    const defenders = getStrategicEnemyPressure(state, factionId, city.position, 2, difficultyProfile);
    const foundingBonus = isFreshFounded ? 4 : 0;
    const score =
      10
      + sameEnemyBonus(city.factionId)
      + economicWeight * 1.5
      + foundingBonus
      + Math.max(0, 10 - distance)
      - defenders * 3
      - city.wallHP / 40;
    objectives.push({
      waypointKind: 'enemy_city',
      waypoint: city.position,
      objectiveCityId: city.id,
      objectiveUnitId: undefined,
      villageId: undefined,
      anchor: city.position,
      targetId: `city:${city.id}`,
      reason: isFreshFounded && !isCapturedVulnerable ? `to punish newly founded city ${city.id}` : `to punish vulnerable city ${city.id}`,
      score,
    });
  }

  return objectives
    .sort((left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId))[0];
}

function chooseVillageFirstHunterTarget(
  state: GameState,
  factionId: FactionId,
  homePosition: HexCoord,
  targetCity: City,
  difficultyProfile: AiDifficultyProfile,
): Village | undefined {
  const directDistance = Math.max(1, hexDistance(homePosition, targetCity.position));
  const targetEnemyFactionId = targetCity.factionId;

  return Array.from(state.villages.values())
    .filter((village) => village.factionId !== factionId)
    .map((village) => {
      const distFromHome = hexDistance(homePosition, village.position);
      const distToCity = hexDistance(village.position, targetCity.position);
      const detour = distFromHome + distToCity - directDistance;
      const sameEnemyBonus = village.factionId === targetEnemyFactionId ? 3 : 0;
      const villageAge = Math.max(0, state.round - village.foundedRound);
      const freshVillageBonus = villageAge <= difficultyProfile.strategy.freshVillageDenialTurns ? 8 : 0;
      const economyValue =
        village.productionBonus * 3
        + village.supplyBonus * Math.max(1, difficultyProfile.strategy.economicDenialWeight * 0.75);
      const score =
        sameEnemyBonus
        + economyValue
        + freshVillageBonus
        + Math.max(0, 6 - detour * 2)
        + Math.max(0, 5 - distToCity);
      return { village, score, detour, distToCity };
    })
    .sort((left, right) =>
      right.score - left.score
      || left.detour - right.detour
      || left.distToCity - right.distToCity
      || left.village.id.localeCompare(right.village.id)
    )
    .filter(
      ({ detour, distToCity }) =>
        detour <= difficultyProfile.strategy.villageDetourTolerance
        && distToCity <= difficultyProfile.strategy.villageCityDistanceLimit,
    )[0]?.village;
}

function buildHomeDefenseIntent(
  currentIntent: UnitStrategicIntent | undefined,
  homeCity: City,
  reason: string,
  threatenedCityId?: CityId,
): UnitStrategicIntent {
  return {
    assignment: 'defender',
    waypointKind: 'friendly_city',
    waypoint: homeCity.position,
    objectiveCityId: homeCity.id,
    objectiveUnitId: undefined,
    anchor: homeCity.position,
    threatenedCityId: threatenedCityId ?? currentIntent?.threatenedCityId,
    isolationScore: currentIntent?.isolationScore ?? 0,
    isolated: false,
    reason,
  };
}

function getNearestEnemyCity(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord,
): City | undefined {
  let best: City | undefined;
  let bestDistance = Infinity;
  for (const city of state.cities.values()) {
    if (city.factionId === factionId) {
      continue;
    }
    const distance = hexDistance(origin, city.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = city;
    }
  }
  return best;
}

function getSecondNearestEnemyCity(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord,
  excludedCityId: CityId,
): City | undefined {
  const primaryTargetCity = state.cities.get(excludedCityId);
  const enemyCities = Array.from(state.cities.values())
    .filter((city) => city.factionId !== factionId && city.id !== excludedCityId)
    .sort((left, right) => {
      const leftDistance = hexDistance(origin, left.position);
      const rightDistance = hexDistance(origin, right.position);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left.id.localeCompare(right.id);
    });

  if (enemyCities.length === 0) {
    return undefined;
  }

  const differentFactionCity = primaryTargetCity
    ? enemyCities.find((city) => city.factionId !== primaryTargetCity.factionId)
    : undefined;
  return differentFactionCity ?? enemyCities[0];
}

function buildSoftTargetBudgets(
  unitCount: number,
  candidates: FocusTargetCandidate[],
  personality: AiPersonalitySnapshot,
  difficultyProfile: AiDifficultyProfile,
): FocusTargetBudget[] {
  if (candidates.length === 0) return [];
  const pressureFactor = 0.4 + personality.scalars.aggression * 0.25 + personality.scalars.raidBias * 0.2;
  const assaultSlots = Math.max(1, Math.round(unitCount * pressureFactor));
  const focusFireLimit = Math.max(1, Math.round(personality.thresholds.focusFireLimit));
  const weightedSum = candidates.reduce((sum, candidate) => sum + Math.max(0.5, candidate.score), 0);
  return candidates.map((candidate, index) => {
    const weight = Math.max(0.5, candidate.score);
    const budget = Math.min(
      focusFireLimit,
      (weight / weightedSum) * assaultSlots + (index === 0 ? difficultyProfile.strategy.focusBudgetLeaderBonus : 0),
    );
    return {
      unitId: candidate.unitId,
      score: candidate.score,
      budget,
      allocated: 0,
    };
  });
}

function selectFocusTargetCandidate(
  state: GameState,
  unit: Unit,
  budgets: FocusTargetBudget[],
  stats: { choices: number; overfills: number },
  difficultyProfile: AiDifficultyProfile,
): Unit | undefined {
  if (budgets.length === 0) return undefined;

  let bestTarget: FocusTargetBudget | undefined;
  let bestScore = -Infinity;
  for (const budget of budgets) {
    const target = state.units.get(budget.unitId);
    if (!target || target.hp <= 0) continue;
    const distancePenalty = hexDistance(unit.position, target.position) * 0.2;
    const overfillPenalty =
      Math.max(0, budget.allocated - budget.budget) * difficultyProfile.strategy.focusOverfillPenalty;
    const score = budget.score - distancePenalty - overfillPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestTarget = budget;
    }
  }

  if (!bestTarget) return undefined;

  bestTarget.allocated += 1;
  stats.choices += 1;
  if (bestTarget.allocated > bestTarget.budget + 0.001) {
    stats.overfills += 1;
  }
  return state.units.get(bestTarget.unitId);
}

function isSkirmisherPrototype(prototype: Prototype | undefined): boolean {
  if (!prototype) return false;
  return prototype.derivedStats.role === 'mounted'
    || prototype.derivedStats.range > 1
    || prototype.derivedStats.moves >= 3;
}

function buildStatelessSquadPlan(
  friendlyUnits: UnitWithPrototype[],
  squadSize: number,
  primaryFrontAnchor: HexCoord | undefined,
  regroupAnchors: HexCoord[],
): Record<string, SquadPlanEntry> {
  const assignments: Record<string, SquadPlanEntry> = {};
  if (friendlyUnits.length === 0) return assignments;

  const remaining = [...friendlyUnits];
  const seedAnchor = primaryFrontAnchor ?? regroupAnchors[0] ?? remaining[0].unit.position;
  remaining.sort((left, right) => {
    const leftDistance = hexDistance(left.unit.position, seedAnchor);
    const rightDistance = hexDistance(right.unit.position, seedAnchor);
    return leftDistance - rightDistance || compareUnitEntries(left, right);
  });

  let squadIndex = 0;
  while (remaining.length > 0) {
    const leader = remaining.shift()!;
    const squadMembers = [leader];
    remaining.sort((left, right) => {
      const leftDistance = hexDistance(left.unit.position, leader.unit.position);
      const rightDistance = hexDistance(right.unit.position, leader.unit.position);
      return leftDistance - rightDistance || compareUnitEntries(left, right);
    });
    while (squadMembers.length < squadSize && remaining.length > 0) {
      squadMembers.push(remaining.shift()!);
    }

    const squadId = `sq_${squadIndex}`;
    squadIndex += 1;
    const anchor = centroidHex(squadMembers.map((member) => member.unit.position));
    const memberIds = squadMembers.map((member) => member.unit.id);
    for (const memberId of memberIds) {
      assignments[memberId] = {
        squadId,
        anchor,
        memberIds,
      };
    }
  }
  return assignments;
}

function centroidHex(points: HexCoord[]): HexCoord {
  if (points.length === 0) return { q: 0, r: 0 };
  const q = Math.round(points.reduce((sum, point) => sum + point.q, 0) / points.length);
  const r = Math.round(points.reduce((sum, point) => sum + point.r, 0) / points.length);
  return { q, r };
}

function applyWaitForAlliesGate(
  state: GameState,
  factionId: FactionId,
  personality: AiPersonalitySnapshot,
  intents: Record<string, UnitStrategicIntent>,
  squadPlan: Record<string, SquadPlanEntry>,
  regroupAnchors: HexCoord[],
): { waits: number; overrides: number } {
  const stats = { waits: 0, overrides: 0 };
  const squadSize = Math.max(1, Math.round(personality.thresholds.squadSize));

  for (const [unitId, intent] of Object.entries(intents)) {
    if (!isAggressiveAssignment(intent.assignment)) continue;
    const unit = state.units.get(unitId as UnitId);
    if (!unit || unit.hp <= 0) continue;

    const target = resolveIntentTarget(state, intent);
    if (!target) continue;

    const local = computeLocalEngagementSnapshot(state, factionId, unit, intent, target, intents, squadPlan);
    const canCommit = shouldCommitAttack(personality, { attackAdvantage: local.attackAdvantage });
    const squadReady = local.committedAllies >= squadSize && local.squadSupport >= squadSize;
    const trivialTarget = local.enemyPressure === 0 || local.targetHpRatio <= 0.35 || local.targetRouted;

    if ((squadReady && canCommit) || trivialTarget) {
      continue;
    }

    const exceptional = isExceptionalDoctrineOpportunity(personality, local);
    if (exceptional && canCommit) {
      intent.reason = `${intent.reason}; doctrine_override=exceptional_opportunity`;
      stats.overrides += 1;
      continue;
    }

    const fallback = nearestHex(unit.position, [local.squadAnchor, ...regroupAnchors]) ?? unit.position;
    intents[unitId] = {
      ...intent,
      assignment: 'reserve',
      waypointKind: 'regroup_anchor',
      waypoint: fallback,
      anchor: fallback,
      reason: `${intent.reason}; wait_for_allies=holding_for_squad`,
    };
    stats.waits += 1;
  }

  return stats;
}

function isAggressiveAssignment(assignment: UnitAssignment): boolean {
  return assignment === 'main_army' || assignment === 'raider' || assignment === 'siege_force';
}

function resolveIntentTarget(
  state: GameState,
  intent: UnitStrategicIntent,
): { hex: HexCoord; hpRatio: number; routed: boolean } | undefined {
  if (intent.objectiveUnitId) {
    const unit = state.units.get(intent.objectiveUnitId);
    if (!unit || unit.hp <= 0) return undefined;
    return {
      hex: unit.position,
      hpRatio: unit.hp / Math.max(1, unit.maxHp),
      routed: unit.routed,
    };
  }
  if (intent.objectiveCityId) {
    const city = state.cities.get(intent.objectiveCityId);
    if (!city) return undefined;
    return {
      hex: city.position,
      hpRatio: 1,
      routed: false,
    };
  }
  return undefined;
}

function computeLocalEngagementSnapshot(
  state: GameState,
  factionId: FactionId,
  unit: Unit,
  intent: UnitStrategicIntent,
  target: { hex: HexCoord; hpRatio: number; routed: boolean },
  intents: Record<string, UnitStrategicIntent>,
  squadPlan: Record<string, SquadPlanEntry>,
): {
  committedAllies: number;
  enemyPressure: number;
  attackAdvantage: number;
  retreatPathGood: boolean;
  targetHpRatio: number;
  targetRouted: boolean;
  squadSupport: number;
  squadAnchor: HexCoord;
} {
  let committedAllies = 0;
  let enemyPressure = 0;
  const squadEntry = squadPlan[unit.id];
  const squadAnchor = squadEntry?.anchor ?? intent.anchor;
  let squadSupport = 0;

  for (const [otherId, otherIntent] of Object.entries(intents)) {
    const ally = state.units.get(otherId as UnitId);
    if (!ally || ally.hp <= 0 || ally.factionId !== factionId) continue;
    if (!isAggressiveAssignment(otherIntent.assignment)) continue;
    if (hexDistance(ally.position, target.hex) <= 2) {
      committedAllies += 1;
    }
    if (squadEntry && squadEntry.memberIds.includes(otherId as UnitId) && hexDistance(ally.position, target.hex) <= 3) {
      squadSupport += 1;
    }
  }

  for (const enemy of state.units.values()) {
    if (enemy.hp <= 0 || enemy.factionId === factionId) continue;
    if (hexDistance(enemy.position, target.hex) <= 2) {
      enemyPressure += 1;
    }
  }

  const attackAdvantage = committedAllies / Math.max(1, enemyPressure);
  const retreatPathGood = hexDistance(unit.position, squadAnchor) <= 3 || nearestFriendlyDistance(state, unit, factionId) <= 2;

  return {
    committedAllies,
    enemyPressure,
    attackAdvantage,
    retreatPathGood,
    targetHpRatio: target.hpRatio,
    targetRouted: target.routed,
    squadSupport,
    squadAnchor,
  };
}

function isExceptionalDoctrineOpportunity(
  personality: AiPersonalitySnapshot,
  local: {
    attackAdvantage: number;
    retreatPathGood: boolean;
    targetHpRatio: number;
    targetRouted: boolean;
    enemyPressure: number;
  },
): boolean {
  const hasSkirmishDoctrine = personality.activeDoctrines.includes('hitrun') || personality.activeDoctrines.includes('charge');
  const strongRaidIdentity = personality.scalars.raidBias >= 0.8 && personality.scalars.opportunism >= 0.65;
  if (!hasSkirmishDoctrine && !strongRaidIdentity) return false;

  const highValueWindow = local.targetRouted || local.targetHpRatio <= 0.45 || local.enemyPressure <= 1;
  return highValueWindow && local.retreatPathGood && local.attackAdvantage >= personality.thresholds.commitAdvantage;
}

interface WeightedAssignmentContext {
  lowHp: boolean;
  fastUnit: boolean;
  isolationScore: number;
  hasPrimaryObjective: boolean;
  hasFocusTarget: boolean;
  hasThreatenedCity: boolean;
  isMelee: boolean;
}

function chooseWeightedAssignment(
  personality: AiPersonalitySnapshot,
  posture: FactionPosture,
  context: WeightedAssignmentContext,
): { assignment: UnitAssignment; score: number } {
  const scoreByAssignment = new Map<UnitAssignment, number>([
    ['main_army', personality.assignmentWeights.main_army ?? 0],
    ['raider', personality.assignmentWeights.raider ?? 0],
    ['defender', personality.assignmentWeights.defender ?? 0],
    ['siege_force', personality.assignmentWeights.siege_force ?? 0],
    ['reserve', personality.assignmentWeights.reserve ?? 0],
    ['recovery', personality.assignmentWeights.recovery ?? 0],
  ]);

  scoreByAssignment.set('main_army', (scoreByAssignment.get('main_army') ?? 0) + 1.5 + (context.hasFocusTarget ? 1.25 : 0));
  scoreByAssignment.set('raider', (scoreByAssignment.get('raider') ?? 0) + (context.fastUnit ? 2 : 0) + (posture === 'offensive' ? 1 : 0));
  scoreByAssignment.set('defender', (scoreByAssignment.get('defender') ?? 0) + (context.hasThreatenedCity ? 2 : -2));
  scoreByAssignment.set(
    'siege_force',
    (scoreByAssignment.get('siege_force') ?? 0)
      + (context.hasPrimaryObjective ? 2 : -2)
      + (posture === 'siege' ? 2 : 0)
      + (context.isMelee ? 1 : 0),
  );
  scoreByAssignment.set('reserve', (scoreByAssignment.get('reserve') ?? 0) + (context.isolationScore > REGROUP_DISTANCE ? 2.5 : -0.5));
  scoreByAssignment.set('recovery', (scoreByAssignment.get('recovery') ?? 0) + (context.lowHp ? 3 : -2));

  const ranked = Array.from(scoreByAssignment.entries()).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  return {
    assignment: ranked[0][0],
    score: ranked[0][1],
  };
}

function nearestEnemySupportDistance(state: GameState, unit: Unit): number {
  let nearest = Infinity;
  for (const other of state.units.values()) {
    if (other.id === unit.id || other.factionId !== unit.factionId || other.hp <= 0) continue;
    nearest = Math.min(nearest, hexDistance(unit.position, other.position));
  }
  return nearest === Infinity ? 99 : nearest;
}

function nearestFriendlyDistance(state: GameState, unit: Unit, factionId: FactionId): number {
  let nearest = Infinity;
  for (const other of state.units.values()) {
    if (other.id === unit.id || other.factionId !== factionId || other.hp <= 0) continue;
    nearest = Math.min(nearest, hexDistance(unit.position, other.position));
  }
  return nearest === Infinity ? 99 : nearest;
}

function nearestHex(origin: HexCoord, anchors: HexCoord[]): HexCoord | null {
  let best: HexCoord | null = null;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const dist = hexDistance(origin, anchor);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = anchor;
    }
  }
  return best;
}

function dedupeHexes(hexes: HexCoord[]): HexCoord[] {
  const map = new Map<string, HexCoord>();
  for (const hex of hexes) {
    map.set(hexToKey(hex), hex);
  }
  return Array.from(map.values());
}

/**
 * Find the nearest enemy city on or adjacent to coast/water.
 * Used for Pirate Lords transport raiding targets.
 */
function findNearestCoastalEnemyObjective(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord
): { id: CityId; position: HexCoord } | undefined {
  let best: { id: CityId; position: HexCoord; dist: number } | undefined;

  for (const [, city] of state.cities) {
    if (city.factionId === factionId) continue;
    const terrain = state.map?.tiles.get(hexToKey(city.position))?.terrain ?? '';
    if (terrain === 'coast' || terrain === 'river') {
      const dist = hexDistance(origin, city.position);
      if (!best || dist < best.dist) {
        best = { id: city.id, position: city.position, dist };
      }
    }
  }

  return best ? { id: best.id, position: best.position } : undefined;
}

function compareUnitEntries(left: UnitWithPrototype, right: UnitWithPrototype): number {
  return compareUnits(left.unit, right.unit, undefined, left.prototype.name, right.prototype.name);
}

function compareUnits(
  left: Unit | undefined,
  right: Unit | undefined,
  state?: GameState,
  leftName?: string,
  rightName?: string
): number {
  if (!left || !right) return 0;
  const leftPrototypeName = leftName ?? state?.prototypes.get(left.prototypeId)?.name ?? '';
  const rightPrototypeName = rightName ?? state?.prototypes.get(right.prototypeId)?.name ?? '';
  return (
    left.factionId.localeCompare(right.factionId)
    || compareHexes(left.position, right.position)
    || leftPrototypeName.localeCompare(rightPrototypeName)
    || left.maxHp - right.maxHp
    || left.maxMoves - right.maxMoves
    || left.hp - right.hp
  );
}

function compareHexes(left?: HexCoord, right?: HexCoord): number {
  if (!left || !right) return 0;
  return left.q - right.q || left.r - right.r;
}

function summarizePrimaryObjective(
  posture: FactionPosture,
  threatenedCities: ThreatAssessment[],
  primaryCityObjectiveId: CityId | undefined,
  primaryEnemyFactionId: FactionId | undefined
): string {
  if ((posture === 'defensive' || posture === 'recovery') && threatenedCities[0]) {
    return `defend ${threatenedCities[0].cityId}`;
  }
  if (primaryCityObjectiveId) {
    return `pressure ${primaryCityObjectiveId}`;
  }
  if (primaryEnemyFactionId) {
    return `engage ${primaryEnemyFactionId}`;
  }
  return 'stabilize the line';
}

function buildDebugReasons(
  posture: FactionPosture,
  threatenedCities: ThreatAssessment[],
  fronts: FrontLine[],
  supplyDeficit: number,
  exhaustion: number,
  hybridGoal: HybridGoal,
  absorptionGoal: AbsorptionGoal,
  postureReasons: string[],
  focusReasons: string[],
  assignmentReasons: string[],
): string[] {
  const reasons = [`posture=${posture}`];
  reasons.push(...postureReasons.slice(0, 2));
  reasons.push(...focusReasons.slice(0, 2));
  reasons.push(...assignmentReasons.slice(0, 4));
  if (threatenedCities[0]) reasons.push(`threatened_city=${threatenedCities[0].cityId}:${threatenedCities[0].threatScore}`);
  if (fronts[0]) reasons.push(`front=${hexToKey(fronts[0].anchor)}:${fronts[0].pressure}`);
  if (supplyDeficit > 0) reasons.push(`supply_deficit=${supplyDeficit}`);
  if (exhaustion > 0) reasons.push(`war_exhaustion=${exhaustion}`);
  if (hybridGoal.preferredRecipeIds[0]) reasons.push(`hybrid=${hybridGoal.preferredRecipeIds[0]}`);
  if (absorptionGoal.targetFactionId) reasons.push(`absorption_target=${absorptionGoal.targetFactionId}`);
  return reasons;
}

function buildHybridGoal(state: GameState, factionId: FactionId, registry: RulesRegistry): HybridGoal {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return { preferredRecipeIds: [], pursueHybridProduction: false, desiredDomainIds: [] };
  }

  const recipes = registry.getAllHybridRecipes()
    .filter((recipe) => faction.capabilities?.unlockedRecipeIds.includes(recipe.id) && (!recipe.nativeFaction || recipe.nativeFaction === factionId))
    .map((recipe) => {
      const synergyScore = recipe.tags?.reduce(
        (sum, tag) => sum + (faction.learnedDomains.includes(tag) ? 1 : 0),
        0
      ) ?? 0;
      return { recipeId: recipe.id, score: synergyScore + recipe.componentIds.length * 0.5 };
    })
    .sort((left, right) => right.score - left.score || left.recipeId.localeCompare(right.recipeId));

  const desiredDomainIds = faction.learnedDomains.slice(1);
  return {
    preferredRecipeIds: recipes.slice(0, 3).map((recipe) => recipe.recipeId),
    pursueHybridProduction: recipes.length > 0 && (faction.learnedDomains.length >= 2),
    desiredDomainIds,
  };
}

function buildAbsorptionGoal(
  state: GameState,
  factionId: FactionId,
  enemyUnits: UnitWithPrototype[],
  primaryEnemyFactionId: FactionId | undefined
): AbsorptionGoal {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return { desiredDomainIds: [], nearExposureDomainIds: [], finishOffPriority: false };
  }

  const exposureCandidates = Object.keys(faction.exposureProgress)
    .map((domainId) => ({
      domainId,
      details: getExposureDetails(faction, domainId),
    }))
    .filter((entry) => entry.details && entry.details.progress >= 0.75)
    .sort((left, right) => (right.details?.progress ?? 0) - (left.details?.progress ?? 0));

  // Count ALL living enemy units globally (not just visible) to identify nearly-eliminated factions
  const weakEnemyFactionCounts = new Map<FactionId, number>();
  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (unit.factionId === factionId) continue;
    weakEnemyFactionCounts.set(unit.factionId, (weakEnemyFactionCounts.get(unit.factionId) ?? 0) + 1);
  }
  const weakEnemyTarget = Array.from(weakEnemyFactionCounts.entries())
    .sort(
      (left, right) =>
        left[1] - right[1] || String(left[0] ?? '').localeCompare(String(right[0] ?? '')),
    )[0]?.[0];

  return {
    targetFactionId: primaryEnemyFactionId ?? weakEnemyTarget,
    desiredDomainIds: exposureCandidates.map((entry) => entry.domainId),
    nearExposureDomainIds: exposureCandidates.map((entry) => entry.domainId),
    // Finish off factions with ≤1 living unit — they're on the brink of elimination
    finishOffPriority: Boolean(weakEnemyTarget && weakEnemyFactionCounts.get(weakEnemyTarget)! <= 1),
  };
}

export function getUnitIntent(strategy: FactionStrategy | undefined, unitId: UnitId): UnitStrategicIntent | undefined {
  return strategy?.unitIntents[unitId];
}

export function scoreStrategicTerrain(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord
): number {
  const faction = state.factions.get(factionId);
  const terrainId = state.map?.tiles.get(hexToKey(hex))?.terrain ?? 'plains';
  return getTerrainPreferenceScore(faction, terrainId);
}

export function getNearbySupportScore(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord
): number {
  let support = 0;
  for (const unit of state.units.values()) {
    if (unit.factionId === factionId && unit.hp > 0 && hexDistance(unit.position, hex) <= 2) {
      support += 1;
    }
  }
  return support;
}

export function isThreatenedCityHex(
  state: GameState,
  strategy: FactionStrategy | undefined,
  hex: HexCoord
): boolean {
  if (!strategy) return false;
  return strategy.threatenedCities.some((threat) => {
    const city = state.cities.get(threat.cityId);
    return city && city.position.q === hex.q && city.position.r === hex.r;
  });
}

export function getNearestFriendlyCity(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord
): City | undefined {
  let best: City | undefined;
  let bestDist = Infinity;
  for (const city of state.cities.values()) {
    if (city.factionId !== factionId) continue;
    const dist = hexDistance(origin, city.position);
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }
  return best;
}

