import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import { getBattleCount, getKillCount } from '../historySystem.js';
import { describeCapabilityLevels } from '../capabilitySystem.js';
import { getFactionCityIds } from '../factionOwnershipSystem.js';
import { getVillageCount } from '../villageSystem.js';

export function summarizeFaction(state: GameState, factionId: FactionId): string {
  const faction = state.factions.get(factionId);
  if (!faction) return '';
  const livingUnits = faction.unitIds.filter((id) => state.units.has(id as never));
  const prototypeNames = faction.prototypeIds
    .map((id) => state.prototypes.get(id as never)?.name)
    .filter((name): name is string => Boolean(name));

  const economy = state.economy.get(factionId);
  const economyInfo = economy
    ? `prod=${economy.productionPool.toFixed(1)} supply=${economy.supplyIncome.toFixed(1)}/${economy.supplyDemand}`
    : '';

  const we = state.warExhaustion.get(factionId);
  const weInfo = we && we.exhaustionPoints > 0 ? `WE=${we.exhaustionPoints}` : '';

  const besiegedCities = getFactionCityIds(state, factionId).filter((id) => state.cities.get(id)?.besieged);
  const siegeInfo = besiegedCities.length > 0 ? `besieged=${besiegedCities.length}` : '';

  return [
    `${faction.name}`,
    `units=${livingUnits.length}`,
    `villages=${getVillageCount(state, factionId)}`,
    economyInfo,
    weInfo,
    siegeInfo,
    `battles=${livingUnits.reduce((sum, id) => sum + getBattleCount(state.units.get(id as never)!), 0)}`,
    `kills=${livingUnits.reduce((sum, id) => sum + getKillCount(state.units.get(id as never)!), 0)}`,
    `capabilities=${describeCapabilityLevels(faction)}`,
    `prototypes=${prototypeNames.join(', ')}`,
  ].filter(Boolean).join(' | ');
}
