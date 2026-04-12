import type { UnitAssignment } from './factionStrategy.js';
import type { AiPersonalitySnapshot } from './aiPersonality.js';
import { shouldCommitAttack, shouldRetreat } from './aiPersonality.js';

export interface StrategicTargetScoreInput {
  isFocusTarget: boolean;
  isAdjacentToPrimaryObjectiveCity: boolean;
  isRouted: boolean;
  hpRatio: number;
  attacksFromThreatenedCityHex: boolean;
  finishOffPriorityTarget: boolean;
  isolatedFromAnchor: boolean;
  // For defender units: attacker is near the city they're defending
  defenderProximityToThreatenedCity?: number;
}

export interface AttackCandidateScoreInput {
  roleEffectiveness: number;
  weaponEffectiveness: number;
  reverseRoleEffectiveness: number;
  targetHpRatio: number;
  targetRouted: boolean;
  strategicTargetScore: number;
  extraScore?: number;
  distancePenalty?: number;
  isSiegeVsCity?: boolean;
  isSiegeVsFort?: boolean;
}

export interface MoveCandidateScoreInput {
  assignment: UnitAssignment;
  originWaypointDistance: number;
  waypointDistance: number;
  terrainScore: number;
  supportScore: number;
  originSupport: number;
  originAnchorDistance: number;
  anchorDistance: number;
  cityDistance: number;
  hiddenExplorationBonus?: boolean;
  unsafeAfterMove?: boolean;
  // For defender units: distance to the threatened city being defended
  threatenedCityDistance?: number;
}

export interface RetreatRiskInput {
  hpRatio: number;
  nearbyEnemies: number;
  nearbyFriendlies: number;
  nearestFriendlyDistance: number;
  anchorDistance: number;
}

export interface EngageTargetGateInput {
  attackScore: number;
  retreatRisk: number;
}

export function scoreStrategicTarget(input: StrategicTargetScoreInput): number {
  let score = 0;
  if (input.isFocusTarget) score += 6;
  if (input.isAdjacentToPrimaryObjectiveCity) score += 4;
  if (input.isRouted) score += 2;
  if (input.hpRatio <= 0.4) score += 3;
  if (input.attacksFromThreatenedCityHex) score += 4;
  if (input.finishOffPriorityTarget) score += 3;
  if (input.isolatedFromAnchor) score -= 6;
  // Defender bonus: encourage attacking enemies near the city being defended
  // This rewards defenders for intercepting attackers before they reach the city
  if (input.defenderProximityToThreatenedCity !== undefined) {
    // Higher score for being closer to threatened city (1 = adjacent, 5+ = far)
    const proximityBonus = Math.max(0, 5 - input.defenderProximityToThreatenedCity) * 2;
    score += proximityBonus;
  }
  return score;
}

export function scoreAttackCandidate(input: AttackCandidateScoreInput): number {
  let score = 0;
  score += input.roleEffectiveness * 10;
  score += input.weaponEffectiveness * 10;
  score += (1 - input.targetHpRatio) * 5;
  if (input.targetRouted) score += 8;
  score -= input.reverseRoleEffectiveness * 5;
  score += input.strategicTargetScore;
  score += input.extraScore ?? 0;
  score -= input.distancePenalty ?? 0;
  if (input.isSiegeVsCity) score += 12;
  if (input.isSiegeVsFort) score += 6;
  return score;
}

export function scoreMoveCandidate(input: MoveCandidateScoreInput): number {
  let score = (input.originWaypointDistance - input.waypointDistance) * 8;
  score += input.terrainScore * 1.5;
  score += input.supportScore - input.originSupport;


  if (input.assignment === 'defender' || input.assignment === 'recovery') {
    score += Math.max(0, input.originAnchorDistance - input.anchorDistance) * 3;
    score += Math.max(0, 4 - input.cityDistance) * 1.5;
    // For defender units: reward moving toward the threatened city to intercept attackers
    if (input.assignment === 'defender' && input.threatenedCityDistance !== undefined) {
      // Encourage moving closer to the threatened city (lower distance = better)
      // Max bonus of +6 when adjacent to threatened city (distance 1)
      const defenderProximityBonus = Math.max(0, 4 - input.threatenedCityDistance) * 1.5;
      score += defenderProximityBonus;
    }
  }

  if (input.assignment === 'siege_force') {
    score += Math.max(0, input.originWaypointDistance - input.waypointDistance) * 2;
  }

  if (input.assignment === 'reserve' && input.anchorDistance <= 2) {
    score += 1.5;
  }

  if (input.hiddenExplorationBonus) {
    score += 6;
  }

  if (input.unsafeAfterMove) {
    score -= 10;
  }

  return score;
}

export function computeRetreatRisk(input: RetreatRiskInput): number {
  const hpPressure = Math.max(0, 0.6 - input.hpRatio) * 1.25;
  const enemyPressure = Math.max(0, input.nearbyEnemies - input.nearbyFriendlies) * 0.12;
  const isolationPressure = input.nearestFriendlyDistance > 3 ? 0.2 : 0;
  const anchorPressure = input.anchorDistance > 4 ? 0.2 : 0;
  return Math.min(1.25, hpPressure + enemyPressure + isolationPressure + anchorPressure);
}

export function computeAttackAdvantageFromScore(score: number): number {
  return 1 + score / 60;
}

export function shouldEngageTarget(
  snapshot: AiPersonalitySnapshot | undefined,
  input: EngageTargetGateInput,
): boolean {
  if (!snapshot) {
    return input.attackScore > 0;
  }

  if (shouldRetreat(snapshot, { retreatRisk: input.retreatRisk })) {
    return false;
  }

  return shouldCommitAttack(snapshot, {
    attackAdvantage: computeAttackAdvantageFromScore(input.attackScore),
  });
}
