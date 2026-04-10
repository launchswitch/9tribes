export type DifficultyLevel = 'easy' | 'normal' | 'hard';

export interface AiDifficultyProfile {
  difficulty: DifficultyLevel;
  adaptiveAi: boolean;
  production: {
    rushTurns: number;
    codifiedPivotDuration: number;
    codifiedPivotScoringBonus: number;
    supplyEfficiencyWeight: number;
    forceProjectionWeight: number;
    underCapUtilizationFloor: number;
    underCapTargetUtilization: number;
    underCapPressureWeight: number;
    underCapArmyShortfallWeight: number;
    underCapArmyShortfallCap: number;
    underCapCheapSupplyWeight: number;
    underCapCheapProductionWeight: number;
    armyQualityNearTopWindow: number;
    armyQualityHighestLagWeight: number;
    armyQualityAverageLagWeight: number;
    settlerGateStrength: number;
    settlerReserveFloor: number;
    settlerReservePerCity: number;
    settlerArmyShortfallWeight: number;
    settlerUtilizationFloor: number;
    settlerUtilizationPenaltyWeight: number;
    settlerVisibleEnemyBasePenalty: number;
    settlerVisibleEnemyPerUnitPenalty: number;
    settlerReservePenaltyWeight: number;
  };
  research: {
    stickyThreshold: number;
    tier3DepthWeight: number;
    breadthPivotFirstWeight: number;
    breadthPivotFollowupWeight: number;
    breadthPivotDevelopmentBonus: number;
    nativeTier3DelayPenalty: number;
    hybridBreadthWeight: number;
    emergentBreadthWeight: number;
    tripleStackTier2Weight: number;
    tripleStackTier3Weight: number;
  };
  personality: {
    aggressionFloor: number;
    siegeBiasFloor: number;
    raidBiasFloor: number;
    focusFireLimitBonus: number;
    squadSizeBonus: number;
    commitAdvantageOffset: number;
    retreatThresholdOffset: number;
    antiSkirmishResponseWeight: number;
  };
  strategy: {
    focusTargetLimit: number;
    focusBudgetLeaderBonus: number;
    focusOverfillPenalty: number;
    coordinatorEnabled: boolean;
    multiAxisEnabled: boolean;
    multiAxisGroupCount: number;
    coordinatorMinSupplyRatio: number;
    coordinatorMinIdleNearHome: number;
    coordinatorMinActiveArmy: number;
    coordinatorHunterShare: number;
    coordinatorHunterFloor: number;
    villageDetourTolerance: number;
    villageCityDistanceLimit: number;
    learnLoopEnabled: boolean;
    learnLoopHighAbilityThreshold: number;
    learnLoopMinAbilitiesToReturn: number;
    learnLoopMaxAbilitiesToLearn: number;
    learnLoopDomainTargetingEnabled: boolean;
    learnLoopFarFromHomeDistance: number;
    learnLoopIdleHomeRadius: number;
    learnLoopMinFieldForce: number;
    learnLoopMaxReturnShare: number;
    strategicFogCheat: boolean;
    memoryDecayTurns: number;
  };
}

const EASY_PROFILE: AiDifficultyProfile = {
  difficulty: 'easy',
  adaptiveAi: false,
  production: {
    rushTurns: 0,
    codifiedPivotDuration: 0,
    codifiedPivotScoringBonus: 0,
    supplyEfficiencyWeight: 0.22,
    forceProjectionWeight: 0.95,
    underCapUtilizationFloor: 0.8,
    underCapTargetUtilization: 0.9,
    underCapPressureWeight: 12,
    underCapArmyShortfallWeight: 1.2,
    underCapArmyShortfallCap: 6,
    underCapCheapSupplyWeight: 1.4,
    underCapCheapProductionWeight: 0.08,
    armyQualityNearTopWindow: 1,
    armyQualityHighestLagWeight: 0.55,
    armyQualityAverageLagWeight: 0.35,
    settlerGateStrength: 1,
    settlerReserveFloor: 3,
    settlerReservePerCity: 2,
    settlerArmyShortfallWeight: 3,
    settlerUtilizationFloor: 0.75,
    settlerUtilizationPenaltyWeight: 18,
    settlerVisibleEnemyBasePenalty: 12,
    settlerVisibleEnemyPerUnitPenalty: 1.5,
    settlerReservePenaltyWeight: 2.5,
  },
  research: {
    stickyThreshold: 3,
    tier3DepthWeight: 3,
    breadthPivotFirstWeight: 7,
    breadthPivotFollowupWeight: 4,
    breadthPivotDevelopmentBonus: 2,
    nativeTier3DelayPenalty: 5,
    hybridBreadthWeight: 4.5,
    emergentBreadthWeight: 2.5,
    tripleStackTier2Weight: 10,
    tripleStackTier3Weight: 7,
  },
  personality: {
    aggressionFloor: 0.5,
    siegeBiasFloor: 0.25,
    raidBiasFloor: 0.25,
    focusFireLimitBonus: 0,
    squadSizeBonus: 0,
    commitAdvantageOffset: 0,
    retreatThresholdOffset: 0,
    antiSkirmishResponseWeight: 0,
  },
  strategy: {
    focusTargetLimit: 3,
    focusBudgetLeaderBonus: 0.5,
    focusOverfillPenalty: 2.4,
    coordinatorEnabled: false,
    multiAxisEnabled: false,
    multiAxisGroupCount: 1,
    coordinatorMinSupplyRatio: 0.8,
    coordinatorMinIdleNearHome: 3,
    coordinatorMinActiveArmy: 4,
    coordinatorHunterShare: 0.5,
    coordinatorHunterFloor: 3,
    villageDetourTolerance: 3,
    villageCityDistanceLimit: 8,
    learnLoopEnabled: false,
    learnLoopHighAbilityThreshold: 2,
    learnLoopMinAbilitiesToReturn: 2,
    learnLoopMaxAbilitiesToLearn: 1,
    learnLoopDomainTargetingEnabled: false,
    learnLoopFarFromHomeDistance: 5,
    learnLoopIdleHomeRadius: 4,
    learnLoopMinFieldForce: 3,
    learnLoopMaxReturnShare: 0.4,
    strategicFogCheat: false,
    memoryDecayTurns: 10,
  },
};

const NORMAL_PROFILE: AiDifficultyProfile = {
  difficulty: 'normal',
  adaptiveAi: true,
  production: {
    rushTurns: 10,
    codifiedPivotDuration: 3,
    codifiedPivotScoringBonus: 0,
    supplyEfficiencyWeight: 0.22,
    forceProjectionWeight: 0.95,
    underCapUtilizationFloor: 0.5,
    underCapTargetUtilization: 0.9,
    underCapPressureWeight: 12,
    underCapArmyShortfallWeight: 1.2,
    underCapArmyShortfallCap: 6,
    underCapCheapSupplyWeight: 1.4,
    underCapCheapProductionWeight: 0.08,
    armyQualityNearTopWindow: 1,
    armyQualityHighestLagWeight: 0.55,
    armyQualityAverageLagWeight: 0.35,
    settlerGateStrength: 1,
    settlerReserveFloor: 3,
    settlerReservePerCity: 2,
    settlerArmyShortfallWeight: 3,
    settlerUtilizationFloor: 0.75,
    settlerUtilizationPenaltyWeight: 18,
    settlerVisibleEnemyBasePenalty: 12,
    settlerVisibleEnemyPerUnitPenalty: 1.5,
    settlerReservePenaltyWeight: 2.5,
  },
  research: {
    stickyThreshold: 3,
    tier3DepthWeight: 3,
    breadthPivotFirstWeight: 7,
    breadthPivotFollowupWeight: 4,
    breadthPivotDevelopmentBonus: 2,
    nativeTier3DelayPenalty: 5,
    hybridBreadthWeight: 4.5,
    emergentBreadthWeight: 2.5,
    tripleStackTier2Weight: 10,
    tripleStackTier3Weight: 7,
  },
  personality: {
    aggressionFloor: 0.7,
    siegeBiasFloor: 0.5,
    raidBiasFloor: 0.4,
    focusFireLimitBonus: 0,
    squadSizeBonus: 0,
    commitAdvantageOffset: 0,
    retreatThresholdOffset: 0,
    antiSkirmishResponseWeight: 1,
  },
  strategy: {
    focusTargetLimit: 3,
    focusBudgetLeaderBonus: 0.5,
    focusOverfillPenalty: 2.4,
    coordinatorEnabled: true,
    multiAxisEnabled: false,
    multiAxisGroupCount: 1,
    coordinatorMinSupplyRatio: 0.8,
    coordinatorMinIdleNearHome: 3,
    coordinatorMinActiveArmy: 4,
    coordinatorHunterShare: 0.5,
    coordinatorHunterFloor: 3,
    villageDetourTolerance: 3,
    villageCityDistanceLimit: 8,
    learnLoopEnabled: true,
    learnLoopHighAbilityThreshold: 2,
    learnLoopMinAbilitiesToReturn: 2,
    learnLoopMaxAbilitiesToLearn: 1,
    learnLoopDomainTargetingEnabled: false,
    learnLoopFarFromHomeDistance: 5,
    learnLoopIdleHomeRadius: 4,
    learnLoopMinFieldForce: 3,
    learnLoopMaxReturnShare: 0.4,
    strategicFogCheat: false,
    memoryDecayTurns: 10,
  },
};

const HARD_PROFILE: AiDifficultyProfile = {
  difficulty: 'hard',
  adaptiveAi: true,
  production: {
    rushTurns: 7,
    codifiedPivotDuration: 4,
    codifiedPivotScoringBonus: 5,
    supplyEfficiencyWeight: 0.24,
    forceProjectionWeight: 1.1,
    underCapUtilizationFloor: 0.88,
    underCapTargetUtilization: 0.98,
    underCapPressureWeight: 16,
    underCapArmyShortfallWeight: 1.5,
    underCapArmyShortfallCap: 8,
    underCapCheapSupplyWeight: 1.6,
    underCapCheapProductionWeight: 0.1,
    armyQualityNearTopWindow: 1,
    armyQualityHighestLagWeight: 0.8,
    armyQualityAverageLagWeight: 0.5,
    settlerGateStrength: 1.35,
    settlerReserveFloor: 4,
    settlerReservePerCity: 2.5,
    settlerArmyShortfallWeight: 4,
    settlerUtilizationFloor: 0.85,
    settlerUtilizationPenaltyWeight: 24,
    settlerVisibleEnemyBasePenalty: 14,
    settlerVisibleEnemyPerUnitPenalty: 2,
    settlerReservePenaltyWeight: 3.25,
  },
  research: {
    stickyThreshold: 2.5,
    tier3DepthWeight: 2.25,
    breadthPivotFirstWeight: 9,
    breadthPivotFollowupWeight: 6,
    breadthPivotDevelopmentBonus: 3,
    nativeTier3DelayPenalty: 8,
    hybridBreadthWeight: 6.25,
    emergentBreadthWeight: 4,
    tripleStackTier2Weight: 12,
    tripleStackTier3Weight: 8.5,
  },
  personality: {
    aggressionFloor: 0.78,
    siegeBiasFloor: 0.62,
    raidBiasFloor: 0.48,
    focusFireLimitBonus: 1,
    squadSizeBonus: 1,
    commitAdvantageOffset: -0.05,
    retreatThresholdOffset: 0.05,
    antiSkirmishResponseWeight: 1.8,
  },
  strategy: {
    focusTargetLimit: 2,
    focusBudgetLeaderBonus: 1.1,
    focusOverfillPenalty: 3.8,
    coordinatorEnabled: true,
    multiAxisEnabled: true,
    multiAxisGroupCount: 2,
    coordinatorMinSupplyRatio: 0.9,
    coordinatorMinIdleNearHome: 2,
    coordinatorMinActiveArmy: 6,
    coordinatorHunterShare: 0.80,
    coordinatorHunterFloor: 4,
    villageDetourTolerance: 2,
    villageCityDistanceLimit: 6,
    learnLoopEnabled: true,
    learnLoopHighAbilityThreshold: 2,
    learnLoopMinAbilitiesToReturn: 1,
    learnLoopMaxAbilitiesToLearn: 2,
    learnLoopDomainTargetingEnabled: true,
    learnLoopFarFromHomeDistance: 4,
    learnLoopIdleHomeRadius: 5,
    learnLoopMinFieldForce: 4,
    learnLoopMaxReturnShare: 0.33,
    strategicFogCheat: true,
    memoryDecayTurns: Infinity,
  },
};

const DIFFICULTY_PROFILES: Record<DifficultyLevel, AiDifficultyProfile> = {
  easy: EASY_PROFILE,
  normal: NORMAL_PROFILE,
  hard: HARD_PROFILE,
};

export function getAiDifficultyProfile(difficulty?: DifficultyLevel): AiDifficultyProfile {
  return DIFFICULTY_PROFILES[difficulty ?? 'easy'];
}

export function usesAdaptiveAiBehavior(difficulty?: DifficultyLevel): boolean {
  return getAiDifficultyProfile(difficulty).adaptiveAi;
}

/**
 * @deprecated Use getAiDifficultyProfile() or usesAdaptiveAiBehavior().
 */
export function usesNormalAiBehavior(difficulty?: DifficultyLevel): boolean {
  return usesAdaptiveAiBehavior(difficulty);
}
