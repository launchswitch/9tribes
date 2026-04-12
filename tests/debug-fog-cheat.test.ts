import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { computeFactionStrategy } from '../src/systems/strategicAi';
import { initializeFogForFaction, updateFogState } from '../src/systems/fogSystem';

const registry = loadRulesRegistry();

function trimState(state: ReturnType<typeof buildMvpScenario>, factionIds: string[]) {
  const keepFactions = new Set(factionIds);
  const keepUnits = new Set(
    Array.from(state.units.values())
      .filter((unit) => keepFactions.has(unit.factionId))
      .map((unit) => unit.id),
  );
  const keepCities = new Set(
    Array.from(state.cities.values())
      .filter((city) => keepFactions.has(city.factionId))
      .map((city) => city.id),
  );

  state.factions = new Map(Array.from(state.factions.entries()).filter(([factionId]) => keepFactions.has(factionId)));
  state.units = new Map(Array.from(state.units.entries()).filter(([unitId]) => keepUnits.has(unitId)));
  state.cities = new Map(Array.from(state.cities.entries()).filter(([cityId]) => keepCities.has(cityId)));
  state.villages = new Map();
  state.improvements = new Map();
  state.economy = new Map(Array.from(state.economy.entries()).filter(([factionId]) => keepFactions.has(factionId)));
  state.research = new Map(Array.from(state.research.entries()).filter(([factionId]) => keepFactions.has(factionId)));
  state.warExhaustion = new Map(Array.from(state.warExhaustion.entries()).filter(([factionId]) => keepFactions.has(factionId)));
  state.factionStrategies = new Map();

  for (const [factionId, faction] of state.factions) {
    state.factions.set(factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((unitId) => state.units.has(unitId)),
      cityIds: faction.cityIds.filter((cityId) => state.cities.has(cityId)),
      villageIds: [],
    });
  }

  let current = state;
  for (const factionId of keepFactions) {
    current = initializeFogForFaction(current, factionId as never);
  }
  return current;
}

function withUpdatedFog(state: ReturnType<typeof buildMvpScenario>, factionIds: string[]) {
  let current = state;
  for (const factionId of factionIds) {
    current = updateFogState(current, factionId as never);
  }
  return current;
}

describe('debug fog cheat', () => {
  it('traces the failing test scenario', () => {
    const state = buildMvpScenario(42, { registry });
    const trimmed = trimState(state, ['steppe_clan', 'hill_clan']);
    const steppeId = 'steppe_clan' as never;
    const hillId = 'hill_clan' as never;
    const steppeUnits = trimmed.factions.get(steppeId)!.unitIds;
    const hillUnits = trimmed.factions.get(hillId)!.unitIds;

    trimmed.units.set(steppeUnits[0], { ...trimmed.units.get(steppeUnits[0])!, position: { q: 5, r: 5 }, hp: 100 });
    trimmed.units.set(steppeUnits[1], { ...trimmed.units.get(steppeUnits[1])!, position: { q: 10, r: 4 }, hp: 100 });
    trimmed.units.set(steppeUnits[2], { ...trimmed.units.get(steppeUnits[2])!, position: { q: 14, r: 6 }, hp: 100 });
    trimmed.units.set(hillUnits[0], { ...trimmed.units.get(hillUnits[0])!, position: { q: 10, r: 5 }, hp: 100 });

    const withFog = withUpdatedFog(trimmed, [steppeId, hillId]);
    
    // Log fog state
    const steppeFog = withFog.fogState?.get(steppeId);
    console.log('Steppe fog state:', steppeFog ? 'exists' : 'missing');
    if (steppeFog) {
      console.log('Steppe visible hexes:', steppeFog.hexVisibility.size);
      // Check if hill unit position is visible
      const hillUnitPos = { q: 10, r: 5 };
      const hillUnitKey = `${hillUnitPos.q},${hillUnitPos.r}`;
      console.log('Hill unit at (10,5) visible to steppe?', steppeFog.hexVisibility.get(hillUnitKey));
    }

    // Log all units and their positions
    console.log('\nAll units:');
    for (const [unitId, unit] of withFog.units) {
      console.log(`  ${unitId}: faction=${unit.factionId}, pos=(${unit.position.q},${unit.position.r}), hp=${unit.hp}`);
    }

    // Log home city position
    const steppeFaction = withFog.factions.get(steppeId);
    if (steppeFaction?.homeCityId) {
      const homeCity = withFog.cities.get(steppeFaction.homeCityId);
      if (homeCity) {
        console.log(`\nSteppe home city at (${homeCity.position.q},${homeCity.position.r})`);
      }
    }

    const strategy = computeFactionStrategy(withFog, steppeId, registry);

    console.log('\nPosture:', strategy.posture);
    console.log('Debug reasons:', strategy.debugReasons);
    
    // Log all unit intents
    console.log('Total unit intents:', Object.keys(strategy.unitIntents).length);
    console.log('All steppe unit IDs:', steppeUnits);
    console.log('All hill unit IDs:', hillUnits);
    
    // Check visibility of hill units from steppe perspective
    for (const hillUnitId of hillUnits) {
      const hillUnit = withFog.units.get(hillUnitId);
      if (hillUnit) {
        console.log(`Hill unit ${hillUnitId} at (${hillUnit.position.q},${hillUnit.position.r})`);
      }
    }
    
    for (const [unitId, intent] of Object.entries(strategy.unitIntents)) {
      console.log(`Unit ${unitId}: assignment=${intent.assignment}, reason=${intent.reason}`);
    }
    
    // Check which steppe units are missing from intents
    for (const unitId of steppeUnits) {
      if (!strategy.unitIntents[unitId]) {
        console.log(`Missing intent for unit ${unitId}`);
      }
    }

    // Check for waited units
    const waitedUnits = Object.values(strategy.unitIntents).filter((intent) =>
      intent.reason.includes('wait_for_allies=holding_for_squad'),
    );
    console.log('Waited units count:', waitedUnits.length);
  });
});
