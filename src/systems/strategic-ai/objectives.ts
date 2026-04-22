import type { GameState } from '../../game/types.js';
import type { City, Village } from '../../game/types.js';
import type { CityId, FactionId, HexCoord, UnitId } from '../../types.js';
import type { FocusTargetDecision, FocusTargetCandidate, FocusTargetBudget, PressureObjective, UnitWithPrototype } from './types.js';
import type { FrontLine, ThreatAssessment, FactionPosture } from '../factionStrategy.js';
import type { AiPersonalitySnapshot } from '../aiPersonality.js';
import type { AiDifficultyProfile } from '../aiDifficulty.js';
import { hexDistance, hexToKey } from '../../core/grid.js';
import { keyToHex } from '../../core/hex.js';
import { scoreFocusTarget } from '../aiPersonality.js';
import { isUnitVisibleTo, getLastSeenEnemyCities, getExploredHexKeys } from '../fogSystem.js';
import { isSettlerPrototype } from '../productionSystem.js';
import { compareUnitEntries, compareUnits, dedupeHexes, nearestEnemySupportDistance, isSkirmisherPrototype } from './helpers.js';
import { THREAT_RADIUS } from './types.js';
import { getLivingEnemyUnits } from './fronts.js';

export function choosePrimaryEnemyFaction(
  fronts: FrontLine[],
  enemyUnits: UnitWithPrototype[],
  state?: GameState,
  factionId?: FactionId,
): FactionId | undefined {
  // Target fastest-expanding faction if there's a clear runaway
  if (state && factionId) {
    const cityCounts = new Map<FactionId, number>();
    for (const city of state.cities.values()) {
      if (city.factionId === factionId) continue;
      cityCounts.set(city.factionId, (cityCounts.get(city.factionId) ?? 0) + 1);
    }
    let maxCities = 0;
    let maxFaction: FactionId | undefined;
    let secondMax = 0;
    for (const [fid, count] of cityCounts) {
      if (count > maxCities) {
        secondMax = maxCities;
        maxCities = count;
        maxFaction = fid;
      } else if (count > secondMax) {
        secondMax = count;
      }
    }
    if (maxFaction && maxCities >= 3 && maxCities - secondMax >= 2) {
      return maxFaction;
    }
  }

  if (fronts.length > 0) {
    return fronts[0].enemyFactionId;
  }
  return enemyUnits[0]?.unit.factionId;
}

export function choosePrimaryCityObjective(
  fronts: FrontLine[],
  threatenedCities: ThreatAssessment[],
  posture: FactionPosture,
  state?: GameState,
  factionId?: FactionId,
  difficultyProfile?: AiDifficultyProfile,
  preferredEnemyFactionId?: FactionId,
): CityId | undefined {
  if ((posture === 'defensive' || posture === 'recovery') && threatenedCities.length > 0) {
    return threatenedCities[0].cityId;
  }

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

  // Runaway faction targeting: prefer the nearest city owned by the expanding threat
  if (preferredEnemyFactionId && state && factionId) {
    const homeCityId = state.factions.get(factionId)?.homeCityId;
    const homeCity = homeCityId ? state.cities.get(homeCityId) : undefined;
    const referencePosition = homeCity?.position ?? { q: 0, r: 0 };
    let bestCityId: CityId | undefined;
    let bestDist = 21; // max range for runaway targeting
    for (const city of state.cities.values()) {
      if (city.factionId === preferredEnemyFactionId) {
        const dist = hexDistance(referencePosition, city.position);
        if (dist < bestDist) {
          bestDist = dist;
          bestCityId = city.id;
        }
      }
    }
    if (bestCityId) return bestCityId;
  }

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

  if (state && factionId && difficultyProfile?.strategy.knownStartPositions) {
    const homeCityId = state.factions.get(factionId)?.homeCityId;
    const homeCity = homeCityId ? state.cities.get(homeCityId) : undefined;
    const startCity = Array.from(state.factions.values())
      .filter((f) => f.id !== factionId && f.homeCityId)
      .map((f) => ({ faction: f, city: state.cities.get(f.homeCityId!) }))
      .filter((entry) => entry.city)
      .sort((a, b) => {
        const aDist = hexDistance(a.city!.position, homeCity?.position ?? a.city!.position);
        const bDist = hexDistance(b.city!.position, homeCity?.position ?? b.city!.position);
        return aDist - bDist;
      })[0];
    if (startCity) {
      return startCity.city!.id;
    }
  }

  return undefined;
}

export function choosePrimaryFrontAnchor(
  fronts: FrontLine[],
  threatenedCities: ThreatAssessment[],
  posture: FactionPosture,
): HexCoord | undefined {
  if ((posture === 'defensive' || posture === 'recovery') && threatenedCities.length > 0) {
    return fronts[0]?.anchor;
  }
  return fronts[0]?.anchor;
}

export function chooseFocusTargets(
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
      const executeBonus = hpRatio <= 0.15 ? 6 : 0;
      const baseScore =
        sameFrontBonus + routedBonus + postureBonus + antiSkirmishScore + (1 - hpRatio) * 4 + executeBonus - cityDistance * 0.25;
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

export function buildRegroupAnchors(
  state: GameState,
  factionId: FactionId,
  fronts: FrontLine[],
  threatenedCities: ThreatAssessment[],
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

export function getFriendlyCityAnchors(state: GameState, factionId: FactionId): HexCoord[] {
  return dedupeHexes(
    Array.from(state.cities.values())
      .filter((city) => city.factionId === factionId)
      .map((city) => city.position),
  );
}

export function findDirectedExplorationWaypoint(
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

  const knownEnemyCities: HexCoord[] = [];
  if (difficultyProfile.strategy.knownStartPositions) {
    for (const f of state.factions.values()) {
      if (f.id === factionId || !f.homeCityId) continue;
      const city = state.cities.get(f.homeCityId);
      if (city) knownEnemyCities.push(city.position);
    }
  }

  let best: HexCoord | null = null;
  let bestScore = Infinity;

  for (const [key, tile] of tiles) {
    if (exploredKeys.has(key)) continue;
    const hex = keyToHex(key);
    const distFromUnit = hexDistance(origin, hex);
    const distFromCenter = hexDistance({ q: centerQ, r: centerR }, hex);
    let score = distFromUnit + effectiveBias * distFromCenter;
    if (knownEnemyCities.length > 0) {
      const minCityDist = Math.min(...knownEnemyCities.map((c) => hexDistance(c, hex)));
      score += effectiveBias * 0.5 * minCityDist;
    }
    if (score < bestScore) {
      bestScore = score;
      best = hex;
    }
  }

  return best;
}

export function getStrategicEnemyPressure(
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

export function getHarassmentSuitability(entry: UnitWithPrototype, factionId: FactionId): number {
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

export function chooseAdaptivePressureCity(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord,
  excludedCityId: CityId,
  difficultyProfile: AiDifficultyProfile,
  excludedCityIds: Set<CityId> = new Set(),
  preferredEnemyFactionId?: FactionId,
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
      const runawayBonus = preferredEnemyFactionId && city.factionId === preferredEnemyFactionId ? 8 : 0;
      const score =
        18
        + villageCount * difficultyProfile.strategy.economicDenialWeight * 0.5
        + vulnerableCaptureBonus
        + freshFoundingBonus
        + runawayBonus
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

export function chooseEconomicDenialObjective(
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

export function chooseVillageFirstHunterTarget(
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

export function getNearestEnemyCity(
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

export function getSecondNearestEnemyCity(
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

export function findNearestCoastalEnemyObjective(
  state: GameState,
  factionId: FactionId,
  origin: HexCoord,
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

export function buildSoftTargetBudgets(
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

export function selectFocusTargetCandidate(
  state: GameState,
  unit: import('../../game/types.js').Unit,
  budgets: FocusTargetBudget[],
  stats: { choices: number; overfills: number },
  difficultyProfile: AiDifficultyProfile,
): import('../../game/types.js').Unit | undefined {
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
