import type { GameState } from '../../game/types.js';
import type { FactionId, HexCoord, UnitId, CityId } from '../../types.js';
import type { FactionPosture, FactionStrategy, UnitStrategicIntent, UnitAssignment } from '../factionStrategy.js';
import type { AiPersonalitySnapshot } from '../aiPersonality.js';
import type { AiDifficultyProfile } from '../aiDifficulty.js';
import type { UnitWithPrototype, FocusTargetCandidate, FocusTargetBudget, SquadPlanEntry, AssignmentDecision, WeightedAssignmentContext } from './types.js';
import type { ThreatAssessment } from '../factionStrategy.js';
import { REGROUP_DISTANCE, RECOVERY_HP_RATIO } from './types.js';
import { hexDistance, hexToKey } from '../../core/grid.js';
import { shouldCommitAttack } from '../aiPersonality.js';
import { getEmbarkedUnits } from '../transportSystem.js';
import { getLastSeenEnemyCities } from '../fogSystem.js';
import {
  compareUnitEntries,
  nearestFriendlyDistance,
  nearestHex,
  centroidHex,
  buildHomeDefenseIntent,
  isAggressiveAssignment,
  isSkirmisherPrototype,
} from './helpers.js';
import {
  findDirectedExplorationWaypoint,
  findNearestCoastalEnemyObjective,
  buildSoftTargetBudgets,
  selectFocusTargetCandidate,
  getNearestEnemyCity,
} from './objectives.js';
import { applyDifficultyCoordinator } from './difficultyCoordinator.js';
import { applyDifficultyLearnAndSacrificeCoordinator } from './learnLoopCoordinator.js';

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
  unit: import('../../game/types.js').Unit,
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

export function assignUnitIntents(
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
): AssignmentDecision {
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
    let waypointKind: import('../factionStrategy.js').WaypointKind = 'front_anchor';
    let waypoint = primaryFrontAnchor ?? retreatAnchors[0] ?? entry.unit.position;
    let anchor = waypoint;
    let objectiveCityId: CityId | undefined;
    let objectiveUnitId: UnitId | undefined;
    let reason = 'holding the primary front';

    const isTransport = (entry.prototype.tags ?? []).includes('transport');
    if (isTransport && getEmbarkedUnits(entry.unit.id, state.transportMap).length > 0) {
      assignment = 'raider';
      waypointKind = 'enemy_city';
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

    const faction2 = state.factions.get(factionId);
    if (faction2 && (entry.unit.learnedAbilities?.length ?? 0) > 0) {
      const homeCity2 = faction2.homeCityId ? state.cities.get(faction2.homeCityId) : undefined;
      if (homeCity2) {
        const distToHome = hexDistance(entry.unit.position, homeCity2.position);
        const armySize = friendlyUnits.length;
        const isElite = entry.unit.veteranLevel === 'elite';
        const abilityCount = entry.unit.learnedAbilities?.length ?? 0;

        const DISTANCE_THRESHOLD = 5;
        const MIN_ARMY_SIZE_FOR_SACRIFICE = 3;
        const shouldReturnToSacrifice =
          distToHome <= DISTANCE_THRESHOLD &&
          !isElite &&
          armySize >= MIN_ARMY_SIZE_FOR_SACRIFICE &&
          (abilityCount >= 3 || (abilityCount >= 2 && distToHome <= 3) || distToHome <= 2);

        if (shouldReturnToSacrifice) {
          assignment = 'return_to_sacrifice';
          waypointKind = 'friendly_city';
          waypoint = homeCity2.position;
          anchor = homeCity2.position;
          objectiveCityId = homeCity2.id;
          reason = `carrying ${abilityCount} ability(ies), returning to ${faction2.name} capital to sacrifice`;

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

    const nearSiegeObjective = primaryObjectiveCity
      && hexDistance(entry.unit.position, primaryObjectiveCity.position) <= 2;
    if ((lowHp && !nearSiegeObjective) || (posture === 'recovery' && isolationScore > REGROUP_DISTANCE)) {
      assignment = 'recovery';
      waypointKind = 'friendly_city';
      waypoint = nearestHex(entry.unit.position, retreatAnchors) ?? entry.unit.position;
      anchor = waypoint;
      reason = 'damaged or isolated unit recovering near a friendly city';
    } else if (posture === 'exploration') {
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
