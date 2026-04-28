import civilizationsData from '../../../../../src/content/base/civilizations.json';
import type { GameState } from '../../../../../src/game/types.js';
import type { RulesRegistry } from '../../../../../src/data/registry/types.js';
import { evaluateCitySiteBonuses } from '../../../../../src/systems/citySiteSystem.js';
import { getHexOwner } from '../../../../../src/systems/territorySystem.js';
import type { TerrainInspectorViewModel, TerrainDomainPressureEntry } from '../../types/clientState';

type CivEntry = {
  terrainBias: string;
  capabilitySeeds: Record<string, number>;
  nativeDomain: string;
  name: string;
};

const CIVS = civilizationsData as Record<string, CivEntry>;

const DOMAIN_LABELS: Record<string, string> = {
  woodcraft: 'Woodcraft',
  poisoncraft: 'Poisoncraft',
  stealth: 'Stealth',
  horsemanship: 'Horsemanship',
  mobility: 'Mobility',
  fortification: 'Fortification',
  hill_fighting: 'Hill Fighting',
  shock_resistance: 'Shock Resistance',
  desert_survival: 'Desert Survival',
  endurance: 'Endurance',
  formation_warfare: 'Formation Warfare',
  seafaring: 'Seafaring',
  navigation: 'Navigation',
  charge: 'Charge',
};

// Faction-specific flavor text per terrain. '_default' is the fallback.
const FLAVOR: Record<string, Record<string, string>> = {
  forest: {
    druid_circle: 'Your sacred groves. Units recover faster under the canopy, and the bark remembers every step of your enemies.',
    jungle_clan: 'Denser cousins of jungle. Your poison still finds the gaps between branches.',
    steppe_clan: 'Trees kill your charge distance. Keep your riders to the forest edges or dismount.',
    hill_clan: 'Timber breaks your siege lines of sight. Build here only when you control the clearings.',
    frost_wardens: 'Cold-hardened timber. Your axes bite faster than anyone else\u2019s.',
    savannah_lions: 'Canopy closes off your shock fronts. Avoid unless flanking around it.',
    coral_people: 'Landlocked cover. Useful for ambushing supply lines far from the coast.',
    desert_nomads: 'Wet and shaded \u2014 your camels slow in the undergrowth.',
    river_people: 'Dense enough to hide a galley crew. Useful for river approach concealment.',
    _default: 'Tangled boughs break formations and shelter defenders from missile fire.',
  },
  jungle: {
    jungle_clan: 'Your domain. Poison spreads on the humid air. Ambushes spring from nothing. Nothing moves here without your permission.',
    druid_circle: 'Wilder than your groves, but your woodcraft speaks this language too. Slower healing, deeper shadows.',
    steppe_clan: 'Impassable for charge lines. Your horses sink. Skirt the edges or die in detail.',
    desert_nomads: 'The moisture is lethal to your supply discipline. Stay out entirely.',
    hill_clan: 'Impossible to fortify in the traditional sense. Use the density itself as your wall.',
    frost_wardens: 'Heat and humidity punish your cold-weather constitution. Brief incursions only.',
    coral_people: 'Coastal jungle edges are perfect staging for amphibious poisoncraft landings.',
    savannah_lions: 'Your elephants struggle under low canopy. Avoid unless no other route exists.',
    _default: 'Rank undergrowth punishes invaders. Only jungle-born armies move freely here.',
  },
  hill: {
    hill_clan: 'Your fortress ground. Every ridge is a battlement waiting to be shaped. Every slope an ambush lane.',
    frost_wardens: 'Cold stone underfoot. Your endurance outlasts any army that tries to push you off a ridge.',
    steppe_clan: 'Hills kill your charge momentum. Use ridgelines for flanking routes, not direct pushes.',
    coral_people: 'Inland elevation with no sea access. You fight here only if cornered.',
    druid_circle: 'Rocky but familiar. Your woodcraft does not shine, but your endurance holds the high ground.',
    jungle_clan: 'Broken terrain with good sight lines for your stealthed units.',
    _default: 'High ground multiplies defensive firepower and breaks uphill charges.',
  },
  plains: {
    steppe_clan: 'Open range. Your horse archers sweep across it like wind over grass. Nothing escapes you here.',
    savannah_lions: 'Broad ground for shock fronts. Second only to savannah in your hands.',
    hill_clan: 'Flat and exposed. Your siege engines grind across it, but expect no natural cover.',
    druid_circle: 'Treeless land. Your units lose their canopy shelter. Fight here only at strength.',
    coral_people: 'Open inland \u2014 your ships cannot reach you here. Weak ground for your faction.',
    frost_wardens: 'Windswept plains. Cold and open suits your endurance, but cover is minimal.',
    jungle_clan: 'Far from any canopy. Your poisons lose their cloud cover in open air.',
    desert_nomads: 'Fast crossing, but no terrain shelter from enemy fire.',
    river_people: 'Flat corridors make for fast river approach from the plains. Look for water nearby.',
    _default: 'Open ground favors fast cavalry and line formations over ambush.',
  },
  desert: {
    desert_nomads: 'Home range. Your camels drink from hidden wells your enemies cannot find. You outpace and outlast everyone here.',
    steppe_clan: 'Harsh but passable for your mobility. Beware overextension without your pasture supply lines.',
    frost_wardens: 'Arid waste. Your cold-weather endurance does not translate to heat. Keep campaigns short.',
    hill_clan: 'Sandy ground undermines fortification foundations. Build elsewhere unless you must hold a dune ridge.',
    savannah_lions: 'Hot open ground \u2014 your shock formation stays functional, but supply discipline is critical.',
    druid_circle: 'Far from any forest. Your sustain advantage vanishes in the heat.',
    coral_people: 'Coastal desert edges allow shallow-water approaches. Inland desert is no-man\u2019s-land for you.',
    jungle_clan: 'The heat kills your poison cultivation. Brief forays only.',
    _default: 'Blistering heat drains supply. Only desert-adapted armies endure long campaigns here.',
  },
  tundra: {
    frost_wardens: 'Frozen wastes are your cradle. Cold gives you strength it costs everyone else. You grow where others wither.',
    hill_clan: 'Frost-locked stone. Hard to dig, but the natural walls are everywhere if you read the terrain.',
    desert_nomads: 'Your camels suffer in the cold. Do not overextend into the frost.',
    jungle_clan: 'Far from your canopy and warmth. Poison dissipates fast in cold air.',
    steppe_clan: 'Your horses handle cold reasonably. Keep the supply chains short and move fast.',
    _default: 'Frozen ground slows siegeworks and attrits lightly-supplied armies over time.',
  },
  savannah: {
    savannah_lions: 'Your hunting ground. Wide sight lines for shock charges and elephant routes. You own this terrain.',
    steppe_clan: 'Almost as good as plains for your riders. Thick grass breaks formation enemies\u2019 cohesion.',
    druid_circle: 'Open and bright. Your forest stealth does not function on savannah. Fight at full formation strength.',
    coral_people: 'Inland open ground. Far from your ships and plunder \u2014 only campaign here when necessary.',
    frost_wardens: 'Warm open land. Your cold-weather advantages mean nothing, but endurance still serves.',
    desert_nomads: 'Adjacent to your desert range. Savannah supply is easier than deep sand.',
    _default: 'Open grassland rewards mobile armies and punishes slow-moving defenders.',
  },
  coast: {
    coral_people: 'Your empire begins at the waterline. Every coastal hex is a harbor in waiting. You are never stronger than here.',
    river_people: 'Shore access for your galleys. Natural staging ground for river-to-coast assault arcs.',
    frost_wardens: 'Cold northern shores. Your endurance makes long coastal sieges viable where others retreat.',
    jungle_clan: 'Jungle coastal edges. Useful for amphibious poisoncraft landings behind enemy lines.',
    druid_circle: 'Coastal forest margins give you stealth approach to shore defenses.',
    _default: 'Coastal hexes allow naval access and amphibious landings.',
  },
  river: {
    river_people: 'River corridors are your veins. Your galleys move freely here. Every river is a highway.',
    coral_people: 'Inland waterways extend your coastal reach. Treat rivers like narrow ocean lanes.',
    druid_circle: 'Your river ambushers were made for this terrain. Stealth on the water is powerful.',
    desert_nomads: 'River crossings are logistical choke points. Control the ford, control the campaign.',
    frost_wardens: 'Rivers freeze in winter \u2014 your troops cross where others cannot.',
    _default: 'Rivers enable transport and supply lines but restrict crossing points.',
  },
  swamp: {
    jungle_clan: 'Wet and dark. Your poison thrives in stagnant water. Ideal ground for attrition campaigns.',
    river_people: 'Shallow waterways for your shallow-draft galleys. Move where others cannot wade.',
    steppe_clan: 'Your horses sink in the bog. Avoid swamp country entirely.',
    hill_clan: 'Boggy ground prevents foundation digging. Build only on the firm margins.',
    druid_circle: 'Ancient wetland. Your stealth and woodcraft extend naturally into marshes.',
    _default: 'Waterlogged terrain exhausts attackers and rewards patient, entrenched defenders.',
  },
  mountain: {
    hill_clan: 'Impassable for most \u2014 but your engineers can thread passes and hold heights that others cannot even approach.',
    frost_wardens: 'Frozen peaks. Your cold-hardened constitution lets you operate at altitude longer than anyone.',
    _default: 'Mountains block all movement. They are walls, not terrain \u2014 hold the pass or go around.',
  },
  ocean: {
    coral_people: 'Deep water is your highway. No other faction matches your open-ocean speed and reach.',
    river_people: 'Your galleys can cross open ocean. A rare capability \u2014 use it for strategic surprise.',
    _default: 'Deep water \u2014 only naval units may traverse. Impassable to land armies.',
  },
};

export function buildTerrainInspectorViewModel(
  state: GameState,
  registry: RulesRegistry,
  position: { q: number; r: number },
  playerFactionId: string | null,
): TerrainInspectorViewModel | null {
  if (!state.map) return null;

  const tileKey = `${position.q},${position.r}`;
  const tile = state.map.tiles.get(tileKey);
  if (!tile) return null;

  const terrainDef = registry.getTerrain(tile.terrain);
  if (!terrainDef) return null;

  const civEntry = playerFactionId ? CIVS[playerFactionId] : null;
  const playerFaction = playerFactionId ? state.factions.get(playerFactionId as never) : null;
  const playerSeeds: Record<string, number> = civEntry?.capabilitySeeds ?? {};
  const isHomeTerrain = civEntry ? civEntry.terrainBias === tile.terrain : false;

  // Build domain pressure entries
  const domainPressure: TerrainDomainPressureEntry[] = Object.entries(terrainDef.capabilityPressure ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([domainId, pressure]) => {
      const playerSeed = playerSeeds[domainId] ?? 0;
      return {
        domainId,
        label: DOMAIN_LABELS[domainId] ?? domainId.replace(/_/g, ' '),
        pressure,
        playerSeed,
        isSynergy: playerSeed > 0,
      };
    });

  const synergyScore = domainPressure.filter((d) => d.isSynergy).length;

  // Faction-flavored narrative
  const terrainFlavors = FLAVOR[tile.terrain] ?? {};
  const flavor = (playerFactionId && terrainFlavors[playerFactionId])
    ? terrainFlavors[playerFactionId]
    : (terrainFlavors['_default'] ?? '');

  // Speculative city founding bonuses
  let cityBonus: TerrainInspectorViewModel['cityBonus'] = null;
  const isPassableLand = (terrainDef.passable !== false) && !terrainDef.navalOnly;
  if (isPassableLand && state.map) {
    try {
      const bonuses = evaluateCitySiteBonuses(state.map, position, 2);
      cityBonus = {
        productionBonus: bonuses.productionBonus,
        supplyBonus: bonuses.supplyBonus,
        traits: bonuses.traits.map((t) => ({
          key: t.key,
          label: t.label,
          effect: t.effect,
          active: t.active,
        })),
      };
    } catch {
      // skip if evaluation fails
    }
  }

  // Territory owner
  const ownerFactionId = getHexOwner(position, state);
  let ownerFactionName: string | null = null;
  if (ownerFactionId) {
    const ownerFaction = state.factions.get(ownerFactionId as never);
    ownerFactionName = ownerFaction?.name ?? ownerFactionId;
  }

  // Improvement on this tile
  const improvement = tile.improvementId ?? null;

  return {
    q: position.q,
    r: position.r,
    terrainId: tile.terrain,
    terrainName: terrainDef.name,
    flavor,
    movementCost: terrainDef.movementCost,
    defenseModifier: terrainDef.defenseModifier ?? 0,
    passable: terrainDef.passable !== false,
    navalOnly: terrainDef.navalOnly ?? false,
    isHomeTerrain,
    ecologyTags: terrainDef.ecologyTags ?? [],
    domainPressure,
    synergyScore,
    cityBonus,
    ownerFactionName,
    improvement,
    playerFactionName: playerFaction?.name ?? null,
  };
}
