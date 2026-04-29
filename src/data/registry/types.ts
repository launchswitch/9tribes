// Rules Registry Types - Data-driven content definitions

export type ProgressionTier = 'base' | 'mid' | 'late';

// Terrain definitions
export interface TerrainDef {
  id: string;
  name: string;
  movementCost: number;
  defenseModifier?: number; // percentage-based defense bonus (e.g., 0.25 = +25%)
  passable?: boolean; // defaults to true if not specified
  navalOnly?: boolean; // if true, only naval movementClass can traverse
  ecologyTags?: string[];
  capabilityPressure?: Record<string, number>;
}

// Chassis (unit frame) definitions
export interface ChassisDef {
  id: string;
  name: string;
  role?: string; // "melee" | "ranged" | "mounted" — determines role effectiveness
  slotTypes: string[];
  baseHp: number;
  baseMoves: number;
  baseAttack: number;
  baseDefense: number;
  movementClass: string;
  baseRange?: number;
  tags?: string[];
  tier?: ProgressionTier;
  minLearnedDomains?: number;
  capabilityPressure?: Record<string, number>;
  supplyCost?: number;
  transportCapacity?: number; // max land units this chassis can carry (transport)
  nativeFaction?: string; // if set, only this faction can produce units with this chassis
}

// Component (weapon/armor) definitions
export interface ComponentDef {
  id: string;
  name: string;
  slotType: string;
  attackBonus?: number;
  defenseBonus?: number;
  rangeBonus?: number;
  hpBonus?: number;
  movesBonus?: number;
  compatibleChassis: string[];
  tags?: string[];
  tier?: ProgressionTier;
  minLearnedDomains?: number;
  capabilityPressure?: Record<string, number>;
  captureChance?: number; // chance to capture instead of kill (0-1)
  captureCooldown?: number; // turns between captures
  captureHpFraction?: number; // HP fraction when captured (0-1)
}

// Veteran level definitions
export interface VeteranLevelDef {
  id: string;
  name: string;
  xpThreshold: number;
  attackBonus: number;
  defenseBonus: number;
  hpBonus?: number;
  moraleBonus?: number; // percentage morale loss reduction (e.g., 0.15 = -15% morale damage)
}

// Improvement definitions
export interface ImprovementDef {
  id: string;
  name: string;
  category: string;
  defenseBonus?: number;
}

// Research domain
export interface ResearchDomainDef {
  id: string;
  name: string;
  nodes: Record<string, ResearchNodeDef>;
}

// Research node
export interface ResearchNodeDef {
  id: string;
  name: string;
  domain: string;
  tier?: number;
  xpCost: number;
  prerequisites?: string[];
  unlocks: ResearchUnlock[];
  codifies?: string[];
  qualitativeEffect?: {
    type: string;
    description: string;
    nativeDescription?: string;
    effect: Record<string, unknown>;
  };
}

export type ResearchUnlock =
  | { type: 'component'; id: string }
  | { type: 'chassis'; id: string }
  | { type: 'improvement'; id: string }
  | { type: 'recipe'; id: string };

export interface HybridRecipeDef {
  id: string;
  name: string;
  chassisId: string;
  componentIds: string[];
  tier?: ProgressionTier;
  minLearnedDomains?: number;
  requiredCapabilityLevels?: Record<string, number>;
  tags?: string[];
  nativeFaction?: string;
  costOverride?: number;
  movesBonus?: number;
}

export interface TerrainYieldDef {
  terrainId: string;
  productionYield: number;
}

export interface FactionAiBaseline {
  factionId: string;
  aggression: number;
  caution: number;
  cohesion: number;
  opportunism: number;
  raidBias: number;
  siegeBias: number;
  defenseBias: number;
  exploreBias: number;
  captureBias: number;
  stealthBias: number;
  attritionBias: number;
  mobilityBias: number;
  preferredTerrains: string[];
  avoidedTerrains: string[];
  desiredRoleRatios: Partial<Record<'melee' | 'ranged' | 'mounted' | 'support' | 'siege' | 'naval', number>>;
  commitAdvantage: number;
  retreatThreshold: number;
  focusFireLimit: number;
  squadSize: number;
}

export interface DomainAiDoctrine {
  domainId: string;
  scalarMods?: Partial<{
    aggression: number;
    caution: number;
    cohesion: number;
    opportunism: number;
    raidBias: number;
    siegeBias: number;
    defenseBias: number;
    exploreBias: number;
    captureBias: number;
    stealthBias: number;
    attritionBias: number;
    mobilityBias: number;
  }>;
  thresholdMods?: Partial<{
    commitAdvantage: number;
    retreatThreshold: number;
    focusFireLimit: number;
    squadSize: number;
  }>;
  terrainBiasMods?: {
    prefer?: string[];
    avoid?: string[];
    terrainScores?: Record<string, number>;
  };
  targetRules?: Record<string, number>;
  moveRules?: Record<string, number>;
  assignmentRules?: Record<string, number>;
  productionRules?: Record<string, number>;
  researchRules?: Record<string, number>;
}

export interface AiProfilesDef {
  factionBaselines: Record<string, FactionAiBaseline>;
  domainDoctrines: Record<string, DomainAiDoctrine>;
}

// Signature ability definitions per faction
export interface SummonConfig {
  chassisId: string;
  terrainTypes: string[];
  hp: number;
  attack: number;
  defense: number;
  moves: number;
  tags: string[];
  name: string;
}

export interface SignatureAbilityParams {
  endlessStride?: boolean;
  stampedeBonus?: number;
  summon?: SummonConfig;
  summonDuration?: number;
  cooldownDuration?: number;
  venomDamagePerTurn?: number;
  hitAndRun?: boolean;
  tidalAssaultBonus?: number;
  sneakAttackBonus?: number;
  greedyBonus?: number;
  villageCaptureDestroys?: boolean;
  villageCaptureCooldownRounds?: number;
  greedyCaptureChance?: number;
  greedyCaptureCooldown?: number;
  greedyCaptureHpFraction?: number;
  greedyNonCombatCaptureChance?: number;
  desertSwarmThreshold?: number;
  desertSwarmAttackBonus?: number;
  desertSwarmDefenseMultiplier?: number;
  wallDefenseMultiplier?: number;
}

export type SignatureAbilities = Record<string, SignatureAbilityParams>;

// Rules Registry Interface
export interface RulesRegistry {
  // Terrain
  getTerrain(id: string): TerrainDef | undefined;
  getAllTerrains(): TerrainDef[];
  
  // Chassis
  getChassis(id: string): ChassisDef | undefined;
  getAllChassis(): ChassisDef[];
  
  // Components
  getComponent(id: string): ComponentDef | undefined;
  getAllComponents(): ComponentDef[];
  
  // Veteran levels
  getVeteranLevel(id: string): VeteranLevelDef | undefined;
  getAllVeteranLevels(): VeteranLevelDef[];
  
  // Improvements
  getImprovement(id: string): ImprovementDef | undefined;
  getAllImprovements(): ImprovementDef[];
  
  // Research
  getResearchDomain(domainId: string): ResearchDomainDef | undefined;
  getResearchNode(domainId: string, nodeId: string): ResearchNodeDef | undefined;
  getAllResearchDomains(): ResearchDomainDef[];

  // Hybrid recipes
  getHybridRecipe(recipeId: string): HybridRecipeDef | undefined;
  getAllHybridRecipes(): HybridRecipeDef[];

  // Economy
    getTerrainYield(terrainId: string): TerrainYieldDef | undefined;
    getAllTerrainYields(): TerrainYieldDef[];

    // AI profiles
    getFactionAiBaseline(factionId: string): FactionAiBaseline | undefined;
    getAllFactionAiBaselines(): FactionAiBaseline[];
    getDomainAiDoctrine(domainId: string): DomainAiDoctrine | undefined;
    getAllDomainAiDoctrines(): DomainAiDoctrine[];

    // Signature abilities
    getSignatureAbilities(): SignatureAbilities;
    getSignatureAbility(factionId: string): SignatureAbilityParams | undefined;
  }
