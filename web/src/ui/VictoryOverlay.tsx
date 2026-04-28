import type { DifficultyLevel } from '../../../src/systems/aiDifficulty.js';
import type { VictoryType } from '../../../src/systems/warEcologySimulation.js';

type VictoryOverlayProps = {
  victoryType: VictoryType;
  controlledCities: number | null;
  totalCities: number | null;
  rounds: number;
  maxRounds: number;
  difficulty: DifficultyLevel;
  onDismiss: () => void;
};

const DIFFICULTY_MULTIPLIER: Record<DifficultyLevel, number> = {
  easy: 0.5,
  normal: 1,
  hard: 2,
};

const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

/**
 * Score formula:
 *   base = 10000
 *   turn_efficiency = max(0.5, maxRounds / rounds)  — finishing faster is better
 *   difficulty_mult = 0.5 / 1 / 2
 *   domination_bonus = +20% if domination victory (cities > 55%)
 *   total = round(base * turn_efficiency * difficulty_mult * domination_bonus)
 */
export function computeScore(input: {
  rounds: number;
  maxRounds: number;
  difficulty: DifficultyLevel;
  victoryType: VictoryType;
}): number {
  const { rounds, maxRounds, difficulty, victoryType } = input;
  const turnEfficiency = Math.max(0.5, maxRounds / Math.max(1, rounds));
  const difficultyMult = DIFFICULTY_MULTIPLIER[difficulty];
  const dominationBonus = victoryType === 'domination' ? 1.2 : 1;
  const raw = 10000 * turnEfficiency * difficultyMult * dominationBonus;
  return Math.round(raw);
}

function describeVictory(victoryType: VictoryType, controlledCities: number | null, totalCities: number | null): string {
  if (victoryType === 'defeat') {
    return 'Your tribe has been eliminated.';
  }
  if (victoryType === 'elimination') {
    return 'All rival tribes have been eliminated.';
  }
  if (victoryType === 'domination' && controlledCities != null && totalCities != null) {
    return `You control ${controlledCities} of ${totalCities} cities — domination achieved.`;
  }
  return 'Victory!';
}

export function VictoryOverlay({
  victoryType,
  controlledCities,
  totalCities,
  rounds,
  maxRounds,
  difficulty,
  onDismiss,
}: VictoryOverlayProps) {
  const score = computeScore({ rounds, maxRounds, difficulty, victoryType });
  const isDefeat = victoryType === 'defeat';

  return (
    <div className="vic-overlay" role="dialog" aria-label={isDefeat ? 'Defeat' : 'Victory'}>
      <div className="vic-card">
        <div className="vic-header">
          <h2 className="vic-title">{isDefeat ? 'GAME OVER' : 'VICTORY!'}</h2>
        </div>
        <div className="vic-body">
          <p className="vic-description">{describeVictory(victoryType, controlledCities, totalCities)}</p>
          <div className="vic-score-block">
            <span className="vic-score-label">Total score:</span>
            <span className="vic-score-value">{score.toLocaleString()}</span>
          </div>
          <div className="vic-breakdown">
            <div className="vic-breakdown-row">
              <span className="vic-breakdown-label">Difficulty</span>
              <span className="vic-breakdown-value">{DIFFICULTY_LABEL[difficulty]} (×{DIFFICULTY_MULTIPLIER[difficulty]})</span>
            </div>
            <div className="vic-breakdown-row">
              <span className="vic-breakdown-label">Rounds taken</span>
              <span className="vic-breakdown-value">{rounds} / {maxRounds}</span>
            </div>
            <div className="vic-breakdown-row">
              <span className="vic-breakdown-label">Victory type</span>
              <span className="vic-breakdown-value">{victoryType === 'elimination' ? 'Elimination' : 'Domination'}</span>
            </div>
          </div>
        </div>
        <div className="vic-footer">
          <button className="vic-btn" type="button" onClick={onDismiss}>
            Continue
          </button>
          <button className="vic-btn vic-btn--secondary" type="button" onClick={() => { window.location.search = ''; }}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
