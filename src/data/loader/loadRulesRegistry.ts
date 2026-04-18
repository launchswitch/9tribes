// Rules Registry Loader - Loads content from JSON files

import type { RulesRegistry } from '../registry/types.js';
import type {
  TerrainDef,
  ChassisDef,
  ComponentDef,
  VeteranLevelDef,
  ImprovementDef,
  ResearchDomainDef,
  ResearchNodeDef,
  HybridRecipeDef,
  TerrainYieldDef,
  AiProfilesDef,
} from '../registry/types.js';

// Import JSON data (ESM requires .js extension in imports)
import terrainsData from '../../content/base/terrains.json';
import chassisData from '../../content/base/chassis.json';
import componentsData from '../../content/base/components.json';
import veteranLevelsData from '../../content/base/veteran-levels.json';
import improvementsData from '../../content/base/improvements.json';
import researchData from '../../content/base/research.json';
import hybridRecipesData from '../../content/base/hybrid-recipes.json';
import economyData from '../../content/base/economy.json';
import aiProfilesData from '../../content/base/ai-profiles.json';
import signatureAbilitiesData from '../../content/base/signatureAbilities.json';
import { assertValidBalanceOverrides, cloneData, type BalanceOverrides } from '../../balance/types.js';
import type { SignatureAbilities } from '../registry/types.js';

export function loadRulesRegistry(overrides?: BalanceOverrides): RulesRegistry {
  assertValidBalanceOverrides(overrides);

  // Cast imported JSON to typed objects
  const terrains = cloneData(terrainsData) as Record<string, TerrainDef>;
  const chassis = cloneData(chassisData) as Record<string, ChassisDef>;
  const components = cloneData(componentsData) as Record<string, ComponentDef>;
  const veteranLevels = cloneData(veteranLevelsData) as Record<string, VeteranLevelDef>;
  const improvements = cloneData(improvementsData) as Record<string, ImprovementDef>;
  const research = cloneData(researchData) as Record<string, ResearchDomainDef>;
  const hybridRecipes = cloneData(hybridRecipesData) as Record<string, HybridRecipeDef>;
  const terrainYields = cloneData(economyData) as Record<string, TerrainYieldDef>;
  const aiProfiles = cloneData(aiProfilesData) as AiProfilesDef;
  let signatureAbilities = cloneData(signatureAbilitiesData) as SignatureAbilities;

  // Apply signature ability overrides from balance system
  for (const [factionId, override] of Object.entries(overrides?.signatureAbilities ?? {})) {
    if (signatureAbilities[factionId]) {
      const original = signatureAbilities[factionId];
      // Deep merge the 'summon' field to avoid replacing the entire nested object
      if (override.summon && original.summon) {
        signatureAbilities[factionId] = {
          ...original,
          ...override,
          summon: { ...original.summon, ...override.summon } as typeof original.summon,
        };
      } else {
        // Safe: override has been validated; original provides all required fields
        signatureAbilities[factionId] = { ...original, ...override } as typeof original;
      }
    }
  }

  for (const [terrainId, override] of Object.entries(overrides?.terrainYields ?? {})) {
    terrainYields[terrainId] = {
      ...terrainYields[terrainId],
      ...override,
    };
  }

  for (const [chassisId, override] of Object.entries(overrides?.chassis ?? {})) {
    chassis[chassisId] = {
      ...chassis[chassisId],
      ...override,
    };
  }

  for (const [componentId, override] of Object.entries(overrides?.components ?? {})) {
    components[componentId] = {
      ...components[componentId],
      ...override,
    };
  }

  return {
    // Terrain
    getTerrain(id: string): TerrainDef | undefined {
      return terrains[id];
    },
    getAllTerrains(): TerrainDef[] {
      return Object.values(terrains);
    },

    // Chassis
    getChassis(id) {
      return chassis[id];
    },
    getAllChassis(): ChassisDef[] {
      return Object.values(chassis);
    },

    // Components
    getComponent(id) {
      return components[id];
    },
    getAllComponents(): ComponentDef[] {
      return Object.values(components);
    },

    // Veteran levels
    getVeteranLevel(id: string): VeteranLevelDef | undefined {
      return veteranLevels[id];
    },
    getAllVeteranLevels(): VeteranLevelDef[] {
      return Object.values(veteranLevels);
    },

    // Improvements
    getImprovement(id) {
      return improvements[id];
    },
    getAllImprovements(): ImprovementDef[] {
      return Object.values(improvements);
    },

    // Research
    getResearchDomain(domainId: string): ResearchDomainDef | undefined {
      return research[domainId];
    },
    getResearchNode(domainId: string, nodeId: string): ResearchNodeDef | undefined {
      const domain = research[domainId];
      return domain?.nodes[nodeId];
    },
    getAllResearchDomains(): ResearchDomainDef[] {
      return Object.values(research);
    },

    // Hybrid recipes
    getHybridRecipe(recipeId: string): HybridRecipeDef | undefined {
      return hybridRecipes[recipeId];
    },
    getAllHybridRecipes(): HybridRecipeDef[] {
      return Object.values(hybridRecipes);
    },

    // Economy
    getTerrainYield(terrainId: string): TerrainYieldDef | undefined {
      return terrainYields[terrainId];
    },
    getAllTerrainYields(): TerrainYieldDef[] {
      return Object.values(terrainYields);
    },

    // AI profiles
    getFactionAiBaseline(factionId: string) {
      return aiProfiles.factionBaselines[factionId];
    },
    getAllFactionAiBaselines() {
      return Object.values(aiProfiles.factionBaselines);
    },
    getDomainAiDoctrine(domainId: string) {
      return aiProfiles.domainDoctrines[domainId];
    },
    getAllDomainAiDoctrines() {
      return Object.values(aiProfiles.domainDoctrines);
    },

    // Signature abilities
    getSignatureAbilities(): SignatureAbilities {
      return signatureAbilities;
    },
    getSignatureAbility(factionId: string) {
      return signatureAbilities[factionId];
    },
  };
}
