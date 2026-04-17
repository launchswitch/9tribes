import type { TutorialStep } from '../app/hooks/useTutorial';

type StepContent = {
  title: string;
  body: string;
};

const CONTENT: Partial<Record<TutorialStep, StepContent>> = {
  welcome: {
    title: 'Welcome to 9 Tribes',
    body: 'The objective of the game is to conquer 60% of the Tribes on the map. In this game, war pushes your culture forward: both units and special abilities are unlocked through battle. Combine technological and cultural advance for surprising combos and units. Good luck!',
  },
  build_city: {
    title: 'Found Your First City',
    body: "It's time to found your first city! Different locations give different bonuses to your city based on the territory that surrounds it. Press \"B\" to build a city.",
  },
  production: {
    title: 'Queue Your Units',
    body: 'Select a unit for production. Queue many units so you don\'t have to babysit the city. Notice in the overview the "Turns until next village" — villages give you supply and production to build more units. If you want to build a new city, settlers cost 4 villages.',
  },
  explore: {
    title: 'Explore the World',
    body: "Use your units to explore the world around you, but don't go too far — ensure you have defense near your capital. Left-click to select a unit, and right-click to move. Press Enter for next turn.",
  },
  research: {
    title: 'Check Your Research',
    body: "Try selecting 'Research' at the top of the screen. You will see your current research progress. After \"learning\" enemy research domains, they will appear here as well. 'T3' is the highest research level.",
  },
  synergies: {
    title: 'Ability Synergies',
    body: 'On the same top menu, to the far-right should be a small symbol: click on it. It contains "Ability Synergies". Here you will see your own ability, and as you learn others, they will show here. The "Emergent Rules" apply to learning (and researching to T3) 3 different skills: you will get powerful, defining skills to help push you over the edge towards the win.',
  },
  combat: {
    title: 'Engaging the Enemy',
    body: 'To attack an enemy, press "A" and left-click on the enemy to attack. Try to flank or attack enemies from behind if possible, and be aware of what kind of terrain they are on. Some units get bonuses based on terrain or type of units that are attacking them.',
  },
  help_button: {
    title: "You're Ready!",
    body: 'Select the "Help" button on the top menu for more assistance. Thanks for playing!',
  },
};

type Props = {
  step: TutorialStep;
  onDismiss: () => void;
};

export function TutorialOverlay({ step, onDismiss }: Props) {
  const content = CONTENT[step];
  if (!content) return null;

  const isWelcome = step === 'welcome';

  return (
    <div className={`tut-overlay${isWelcome ? ' tut-overlay--welcome' : ''}`} role="dialog" aria-label={content.title}>
      <div className="tut-card">
        <div className="tut-header">
          <h2 className="tut-title">{content.title}</h2>
        </div>
        <div className="tut-body">
          <p className="tut-text">{content.body}</p>
        </div>
        <div className="tut-footer">
          <button className="tut-btn" type="button" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
