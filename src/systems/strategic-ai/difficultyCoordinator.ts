import type { GameState } from '../../game/types.js';
import type { FactionId, HexCoord, UnitId, CityId } from '../../types.js';
import type { FactionPosture, FactionStrategy, UnitStrategicIntent, UnitAssignment } from '../factionStrategy.js';
import type { AiDifficultyProfile } from '../aiDifficulty.js';
import type { UnitWithPrototype, PressureObjective } from './types.js';
import { hexDistance, hexToKey } from '../../core/grid.js';
import { compareUnitEntries, buildHomeDefenseIntent, buildStagingHex } from './helpers.js';
import { getLivingEnemyUnits } from './fronts.js';
import {
  getNearestEnemyCity,
  getSecondNearestEnemyCity,
  chooseAdaptivePressureCity,
  chooseEconomicDenialObjective,
  chooseVillageFirstHunterTarget,
  getStrategicEnemyPressure,
  getHarassmentSuitability,
} from './objectives.js';

export function applyDifficultyCoordinator(
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
    objective: { waypoint: HexCoord; harassment?: boolean; city?: import('../../game/types.js').City },
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
    destinationCity: import('../../game/types.js').City,
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
