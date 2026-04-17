import type { FactionId } from '../../types.js';
import type { FactionPosture, FactionStrategy, ThreatAssessment, FrontLine } from '../factionStrategy.js';
import type { PostureDecision } from './types.js';
import type { AiPersonalitySnapshot } from '../aiPersonality.js';
import { scorePosture } from '../aiPersonality.js';
import type { AiDifficultyProfile } from '../aiDifficulty.js';

export function determinePosture(
  unitCount: number,
  enemyUnitCount: number,
  threatenedCities: ThreatAssessment[],
  exhaustion: number,
  supplyDeficit: number,
  fronts: FrontLine[],
  personality: AiPersonalitySnapshot,
  round: number,
  difficultyProfile: AiDifficultyProfile,
  previousStrategy: FactionStrategy | undefined,
): PostureDecision {
  const cityThreat = threatenedCities[0]?.threatScore ?? 0;
  const majorFront = fronts[0];
  if (unitCount <= 1 || exhaustion >= 10 || supplyDeficit >= 3) {
    return {
      posture: 'recovery',
      reasons: ['posture_guard=recovery:critical_recovery_state'],
    };
  }
  if (cityThreat >= 5) {
    return {
      posture: 'defensive',
      reasons: ['posture_guard=defensive:high_city_threat'],
    };
  }
  const context = {
    threatenedCities: threatenedCities.length,
    fronts: fronts.length,
    localAdvantage: unitCount - enemyUnitCount,
    supplyDeficit,
    exhaustion,
  };
  const scoreByPosture = new Map<FactionPosture, number>();
  for (const posture of ['offensive', 'balanced', 'defensive', 'recovery', 'siege', 'exploration'] as FactionPosture[]) {
    scoreByPosture.set(posture, scorePosture(personality, context, posture));
  }
  if (majorFront && majorFront.enemyCityId && majorFront.friendlyUnits >= majorFront.enemyUnits + 1) {
    scoreByPosture.set('siege', (scoreByPosture.get('siege') ?? 0) + 2.5);
  }
  if (enemyUnitCount > 0 && unitCount >= enemyUnitCount * 2 && unitCount >= 5) {
    scoreByPosture.set('siege', (scoreByPosture.get('siege') ?? 0) + 2);
  }
  if (majorFront && majorFront.friendlyUnits >= majorFront.enemyUnits) {
    scoreByPosture.set('offensive', (scoreByPosture.get('offensive') ?? 0) + 1.5);
  }
  if (fronts.length === 0 && threatenedCities.length === 0) {
    scoreByPosture.set('exploration', (scoreByPosture.get('exploration') ?? 0) + 2.5);
  }
  if (enemyUnitCount === 0) {
    const penalty = difficultyProfile.strategy.noEnemySeenOffensivePenalty;
    scoreByPosture.set('offensive', (scoreByPosture.get('offensive') ?? 0) + penalty);
    scoreByPosture.set('siege', (scoreByPosture.get('siege') ?? 0) + penalty);
  }
  if (round >= difficultyProfile.strategy.postureExplorationDeadline) {
    scoreByPosture.set('exploration', Number.NEGATIVE_INFINITY);
  }
  if (enemyUnitCount > 0 && unitCount >= enemyUnitCount + 2) {
    scoreByPosture.set('balanced', (scoreByPosture.get('balanced') ?? 0) - 2.5);
    scoreByPosture.set('offensive', (scoreByPosture.get('offensive') ?? 0) + 1.5);
  }
  if (previousStrategy && difficultyProfile.strategy.postureCommitmentLockTurns > 0) {
    const roundsSinceLast = round - previousStrategy.round;
    const previousUnitCount = Object.keys(previousStrategy.unitIntents).length;
    const lostArmyMass =
      previousUnitCount > 0 && unitCount <= Math.max(1, Math.floor(previousUnitCount * 0.7));
    const decisiveBreak = cityThreat >= 5 || exhaustion >= 8 || supplyDeficit >= 2 || lostArmyMass;
    const stickyPosture =
      previousStrategy.posture === 'offensive' || previousStrategy.posture === 'siege'
        ? previousStrategy.posture
        : undefined;
    if (
      stickyPosture
      && roundsSinceLast <= difficultyProfile.strategy.postureCommitmentLockTurns
      && !decisiveBreak
    ) {
      scoreByPosture.set(stickyPosture, (scoreByPosture.get(stickyPosture) ?? 0) + 6);
    }
  }
  const ranked = Array.from(scoreByPosture.entries()).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  const winner = ranked[0];
  const runnerUp = ranked[1];
  return {
    posture: winner[0],
    reasons: [
      `posture_choice=${winner[0]}:${winner[1].toFixed(2)}`,
      runnerUp ? `posture_runner_up=${runnerUp[0]}:${runnerUp[1].toFixed(2)}` : 'posture_runner_up=none',
    ],
  };
}
