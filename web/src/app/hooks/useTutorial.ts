import { useEffect, useRef, useState } from 'react';
import type { ClientState } from '../../game/types/clientState';

export type TutorialStep =
  | 'welcome'
  | 'build_city'
  | 'production'
  | 'explore'
  | 'research'
  | 'synergies'
  | 'wait_for_combat_turn'
  | 'combat'
  | 'help_button'
  | 'done';

// Steps that show a popup (wait_for_combat_turn and done are silent)
const POPUP_STEPS = new Set<TutorialStep>([
  'welcome',
  'build_city',
  'production',
  'explore',
  'research',
  'synergies',
  'combat',
  'help_button',
]);

// Steps where "Got it" also advances the step (vs just hiding the popup)
const ADVANCE_ON_DISMISS = new Set<TutorialStep>([
  'welcome',
  'research',
  'synergies',
  'combat',
  'help_button',
]);

const TUTORIAL_ENABLED = new URLSearchParams(window.location.search).get('tutorial') === '1';

export type TutorialState = {
  step: TutorialStep;
  popupVisible: boolean;
  onDismiss: () => void;
};

export function useTutorial(state: ClientState): TutorialState {
  const [step, setStep] = useState<TutorialStep>(TUTORIAL_ENABLED ? 'welcome' : 'done');
  const [popupVisible, setPopupVisible] = useState(TUTORIAL_ENABLED);

  const playerFactionId = state.playFeedback?.playerFactionId ?? null;
  const playerCityCount = playerFactionId
    ? state.world.cities.filter((c) => c.factionId === playerFactionId).length
    : 0;
  const productionPopupOpen = state.productionPopupCityId != null;
  const endTurnCount = state.playFeedback?.endTurnCount ?? 0;

  // Refs to avoid stale closure issues
  const endTurnCountRef = useRef(endTurnCount);
  endTurnCountRef.current = endTurnCount;

  const stepStartEndTurnCount = useRef(0);
  const productionPanelWasOpen = useRef(false);

  // Re-show popup whenever step changes to one that has a popup
  useEffect(() => {
    if (POPUP_STEPS.has(step)) {
      setPopupVisible(true);
    }
  }, [step]);

  // Snapshot endTurnCount when step changes so we can detect "next end turn"
  useEffect(() => {
    stepStartEndTurnCount.current = endTurnCountRef.current;
    productionPanelWasOpen.current = false;
  }, [step]); // intentionally not including endTurnCount

  // build_city → production: player's first city appears
  useEffect(() => {
    if (step === 'build_city' && playerCityCount > 0) {
      setStep('production');
    }
  }, [step, playerCityCount]);

  // production → explore: production panel opens then closes, or player ends turn
  useEffect(() => {
    if (step !== 'production') return;
    if (productionPopupOpen) {
      productionPanelWasOpen.current = true;
    } else if (productionPanelWasOpen.current || endTurnCount > stepStartEndTurnCount.current) {
      productionPanelWasOpen.current = false;
      stepStartEndTurnCount.current = endTurnCount;
      setStep('explore');
    }
  }, [step, productionPopupOpen, endTurnCount]);

  // explore → research: after end turn
  useEffect(() => {
    if (step === 'explore' && endTurnCount > stepStartEndTurnCount.current) {
      setStep('research');
    }
  }, [step, endTurnCount]);

  // wait_for_combat_turn → combat: after end turn
  useEffect(() => {
    if (step === 'wait_for_combat_turn' && endTurnCount > stepStartEndTurnCount.current) {
      setStep('combat');
    }
  }, [step, endTurnCount]);

  const onDismiss = () => {
    if (!ADVANCE_ON_DISMISS.has(step)) {
      setPopupVisible(false);
      return;
    }
    switch (step) {
      case 'welcome':
        setStep('build_city');
        break;
      case 'research':
        stepStartEndTurnCount.current = endTurnCount;
        setStep('synergies');
        break;
      case 'synergies':
        stepStartEndTurnCount.current = endTurnCount;
        setStep('wait_for_combat_turn');
        break;
      case 'combat':
        setStep('help_button');
        break;
      case 'help_button':
        setStep('done');
        break;
    }
  };

  if (!TUTORIAL_ENABLED) {
    return { step: 'done', popupVisible: false, onDismiss: () => {} };
  }

  return { step, popupVisible, onDismiss };
}
