import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { ThreatAssessment, FrontLine } from '../factionStrategy.js';
import type { UnitWithPrototype } from './types.js';
import { THREAT_RADIUS } from './types.js';
import { hexDistance, hexToKey } from '../../core/grid.js';
import type { AiDifficultyProfile } from '../aiDifficulty.js';
import { isUnitVisibleTo, getVisibleEnemyUnits, getLastSeenEnemyUnits } from '../fogSystem.js';
import { compareUnitEntries, compareHexes } from './helpers.js';

export function getLivingUnitsForFaction(state: GameState, factionId: FactionId): UnitWithPrototype[] {
  return Array.from(state.units.values())
    .filter((unit) => unit.factionId === factionId && unit.hp > 0)
    .map((unit) => ({ unit, prototype: state.prototypes.get(unit.prototypeId)! }))
    .filter((entry) => Boolean(entry.prototype))
    .sort(compareUnitEntries);
}

export function getLivingEnemyUnits(
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

export function assessThreatenedCities(
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

export function detectFronts(
  state: GameState,
  factionId: FactionId,
  threatenedCities: ThreatAssessment[],
  difficultyProfile: AiDifficultyProfile,
): FrontLine[] {
  const fronts = new Map<string, FrontLine>();
  const threatenedByCity = new Map(threatenedCities.map((threat) => [threat.cityId, threat]));

  const registerFront = (friendlyPos: import('../../types.js').HexCoord, enemyPos: import('../../types.js').HexCoord, enemyFactionId: FactionId, enemyCityId?: import('../../types.js').CityId) => {
    const dist = hexDistance(friendlyPos, enemyPos);
    if (dist > 8) return;

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
        pressure: (4 - dist + 1) * 0.5,
        enemyFactionId,
        enemyCityId: nearbyEnemyCity?.id,
        friendlyUnits: 1,
        enemyUnits: 1,
      });
      return;
    }

    existing.pressure += (4 - dist + 1) * 0.5;
    existing.friendlyUnits += 1;
    existing.enemyUnits += 1;
    if (!existing.enemyCityId && nearbyEnemyCity) {
      existing.enemyCityId = nearbyEnemyCity.id;
    }
  };

  for (const friendly of state.units.values()) {
    if (friendly.factionId !== factionId || friendly.hp <= 0) continue;
    for (const enemy of state.units.values()) {
      if (enemy.factionId === factionId || enemy.hp <= 0) continue;
      if (!difficultyProfile.strategy.strategicFogCheat && !isUnitVisibleTo(state, factionId, enemy)) continue;
      const dist = hexDistance(friendly.position, enemy.position);
      if (dist > 4) continue;

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
          pressure: 4 - dist + 1,
          enemyFactionId: enemy.factionId,
          enemyCityId: nearbyEnemyCity?.id,
          friendlyUnits: 1,
          enemyUnits: 1,
        });
        continue;
      }

      existing.pressure += 4 - dist + 1;
      existing.friendlyUnits += 1;
      existing.enemyUnits += 1;
      if (!existing.enemyCityId && nearbyEnemyCity) {
        existing.enemyCityId = nearbyEnemyCity.id;
      }
    }
  }

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
