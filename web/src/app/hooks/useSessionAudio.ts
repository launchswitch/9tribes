import { useEffect, useRef, useState } from 'react';
import type { ClientState } from '../../game/types/clientState';
import { getDestroyedPlayerVillages, playSessionDeltaSounds } from '../audio/sfxManager';

/**
 * Hook that detects session state deltas and triggers audio feedback
 * and village destruction alerts.
 */
export function useSessionAudio(state: ClientState, combatLocked: boolean) {
  const previousStateRef = useRef<ClientState | null>(null);
  const [pendingVillageDestroyedAlert, setPendingVillageDestroyedAlert] = useState<string[] | null>(null);

  useEffect(() => {
    const destroyedVillages = getDestroyedPlayerVillages(previousStateRef.current, state);
    if (destroyedVillages.length > 0) {
      setPendingVillageDestroyedAlert(destroyedVillages);
    }
    playSessionDeltaSounds(previousStateRef.current, state);
    previousStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (combatLocked || !pendingVillageDestroyedAlert || pendingVillageDestroyedAlert.length === 0) {
      return;
    }

    const villageSummary = pendingVillageDestroyedAlert.join(', ');
    const message = pendingVillageDestroyedAlert.length === 1
      ? `A village has been destroyed: ${villageSummary}.`
      : `Villages have been destroyed: ${villageSummary}.`;
    window.alert(message);
    setPendingVillageDestroyedAlert(null);
  }, [combatLocked, pendingVillageDestroyedAlert]);
}
