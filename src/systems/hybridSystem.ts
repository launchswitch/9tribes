import type { GameState } from '../game/types.js';
import type { Faction } from '../features/factions/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId, PrototypeId } from '../types.js';
import { createPrototypeId } from '../core/ids.js';
import { assemblePrototype } from '../design/assemblePrototype.js';
import { getDomainProgression, meetsLearnedDomainRequirement } from './domainProgression.js';

function updateFaction(game: GameState, faction: Faction): GameState {
  const factions = new Map(game.factions);
  factions.set(faction.id, faction);
  return { ...game, factions };
}

export function unlockHybridRecipes(
  game: GameState,
  factionId: FactionId,
  registry: RulesRegistry
): GameState {
  const faction = game.factions.get(factionId);
  const research = game.research.get(factionId);
  if (!faction || !research) {
    return game;
  }

  let current = game;
  let updatedFaction = faction;
  const progression = getDomainProgression(faction, research);

  for (const recipe of registry.getAllHybridRecipes()) {
    if (!meetsLearnedDomainRequirement(progression, recipe)) {
      continue;
    }

    if (recipe.nativeFaction && recipe.nativeFaction !== factionId) {
      continue;
    }

    if (updatedFaction.prototypeIds.some((prototypeId) => {
      const prototype = current.prototypes.get(prototypeId);
      return prototype?.sourceRecipeId === recipe.id;
    })) {
      continue;
    }

    const prototypeId = createPrototypeId(`${factionId}_${recipe.id}`) as PrototypeId;
    let prototype;
    try {
      prototype = assemblePrototype(
        factionId,
        recipe.chassisId as never,
        recipe.componentIds as never,
        registry,
        Array.from(current.prototypes.keys()),
        {
          researchState: research,
          faction,
          id: prototypeId,
          name: recipe.name,
          tags: recipe.tags ?? [],
          sourceRecipeId: recipe.id,
          productionCost: recipe.costOverride,
        }
      );
    } catch {
      continue;
    }

    const prototypes = new Map(current.prototypes);
    prototypes.set(prototype.id, prototype);
    current = { ...current, prototypes };

    updatedFaction = {
      ...updatedFaction,
      prototypeIds: [...updatedFaction.prototypeIds, prototype.id],
      capabilities: {
        ...updatedFaction.capabilities!,
        unlockedRecipeIds: [...(updatedFaction.capabilities?.unlockedRecipeIds ?? []), recipe.id],
      },
    };
    current = updateFaction(current, updatedFaction);
  }

  return current;
}
