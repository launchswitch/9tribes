import type { FactionPosture, ThreatAssessment, FrontLine } from '../factionStrategy.js';
import type { CityId, FactionId } from '../../types.js';
import type { HybridGoal, AbsorptionGoal } from '../factionStrategy.js';
import { hexToKey } from '../../core/grid.js';

export function summarizePrimaryObjective(
  posture: FactionPosture,
  threatenedCities: ThreatAssessment[],
  primaryCityObjectiveId: CityId | undefined,
  primaryEnemyFactionId: FactionId | undefined,
): string {
  if ((posture === 'defensive' || posture === 'recovery') && threatenedCities[0]) {
    return `defend ${threatenedCities[0].cityId}`;
  }
  if (primaryCityObjectiveId) {
    return `pressure ${primaryCityObjectiveId}`;
  }
  if (primaryEnemyFactionId) {
    return `engage ${primaryEnemyFactionId}`;
  }
  return 'stabilize the line';
}

export function buildDebugReasons(
  posture: FactionPosture,
  threatenedCities: ThreatAssessment[],
  fronts: FrontLine[],
  supplyDeficit: number,
  exhaustion: number,
  hybridGoal: HybridGoal,
  absorptionGoal: AbsorptionGoal,
  postureReasons: string[],
  focusReasons: string[],
  assignmentReasons: string[],
): string[] {
  const reasons = [`posture=${posture}`];
  reasons.push(...postureReasons.slice(0, 2));
  reasons.push(...focusReasons.slice(0, 2));
  reasons.push(...assignmentReasons.slice(0, 4));
  if (threatenedCities[0]) reasons.push(`threatened_city=${threatenedCities[0].cityId}:${threatenedCities[0].threatScore}`);
  if (fronts[0]) reasons.push(`front=${hexToKey(fronts[0].anchor)}:${fronts[0].pressure}`);
  if (supplyDeficit > 0) reasons.push(`supply_deficit=${supplyDeficit}`);
  if (exhaustion > 0) reasons.push(`war_exhaustion=${exhaustion}`);
  if (hybridGoal.preferredRecipeIds[0]) reasons.push(`hybrid=${hybridGoal.preferredRecipeIds[0]}`);
  if (absorptionGoal.targetFactionId) reasons.push(`absorption_target=${absorptionGoal.targetFactionId}`);
  return reasons;
}
