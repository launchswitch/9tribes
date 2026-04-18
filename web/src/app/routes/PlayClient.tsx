import { useEffect, useState } from 'react';
import { GameShell } from '../GameShell';
import { findSaveGameByLabel, getSaveGame, writeSaveGame, type SaveGameSummary } from '../savegames';
import { GameController } from '../../game/controller/GameController';
import { GameSession } from '../../game/controller/GameSession';
import { createCuratedPlaytestPayload } from '../../game/fixtures/curatedPlaytest';
import type { DifficultyLevel } from '../../../../src/systems/aiDifficulty.js';
import type { MapGenerationMode } from '../../../../src/world/map/types.js';

export function PlayClient() {
  const [controller, setController] = useState<GameController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentSaveId = new URLSearchParams(window.location.search).get('save')?.trim() || null;
  const currentSave = currentSaveId ? getSaveGame(currentSaveId) : null;

  useEffect(() => {
    try {
      setController(createPlayController());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown play bootstrap failure');
    }
  }, []);

  const handleRestartSession = () => {
    try {
      setController(createPlayController());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown play bootstrap failure');
    }
  };

  const handleSaveGame = (): SaveGameSummary | null => {
    if (!controller) {
      return null;
    }

    const snapshot = controller.getSaveSnapshot();
    if (!snapshot) {
      return null;
    }

    const suggestedLabel = currentSave?.label
      ?? `${snapshot.preview.playerFactionName ?? snapshot.preview.activeFactionName} | Round ${snapshot.preview.round}`;
    const enteredLabel = window.prompt('Save slot name', suggestedLabel);
    if (enteredLabel === null) {
      return null;
    }

    const label = enteredLabel.trim();
    if (!label) {
      window.alert('Save cancelled: slot name cannot be empty.');
      return null;
    }

    const existing = findSaveGameByLabel(label);
    if (existing && existing.id !== currentSaveId) {
      const shouldOverwrite = window.confirm(`Overwrite existing save "${existing.label}"?`);
      if (!shouldOverwrite) {
        return null;
      }

      return writeSaveGame(snapshot, label, existing.id);
    }

    return writeSaveGame(snapshot, label, currentSaveId ?? undefined);
  };

  if (error) {
    return <div className="client-loading">Playable client unavailable: {error}</div>;
  }

  if (!controller) {
    return <div className="client-loading">Booting playable client scaffold…</div>;
  }

  return (
    <GameShell
      controller={controller}
      onRestartSession={handleRestartSession}
      onSaveGame={handleSaveGame}
    />
  );
}

function createPlayController() {
  const search = new URLSearchParams(window.location.search);
  const hasMenuLaunchParams =
    search.has('map')
    || search.has('size')
    || search.has('player')
    || search.has('tribes');
  const useFreshBootstrap = search.get('bootstrap') === 'fresh' || hasMenuLaunchParams;
  const seed = Number(search.get('seed') ?? '42');
  const difficulty = parseDifficultyParam(search.get('difficulty'));
  const maxRounds = parseRoundsParam(search.get('rounds'));
  const playerFactionId = search.get('player')?.trim() || 'steppe_clan';
  const selectedFactions = parseFactionList(search.get('tribes'));
  const mapMode = parseMapModeParam(search.get('map'));
  const mapSize = parseMapSizeParam(search.get('size'));
  const saveId = search.get('save')?.trim() || null;
  const saveRecord = saveId ? getSaveGame(saveId) : null;
  if (saveId && !saveRecord) {
    throw new Error('Requested save was not found in local storage.');
  }
  const session = new GameSession(
    saveRecord
      ? { type: 'serialized', payload: saveRecord.payload }
      : useFreshBootstrap
      ? {
          type: 'fresh',
          seed: Number.isFinite(seed) ? seed : 42,
          mapMode,
          mapSize,
          selectedFactionIds: selectedFactions,
        }
      : { type: 'serialized', payload: createCuratedPlaytestPayload() },
    undefined,
    {
      humanControlledFactionIds: [playerFactionId],
      difficulty,
      maxRounds,
      mapMode,
      mapSize,
      selectedFactions,
    },
  );

  return new GameController({ mode: 'play', session });
}

function parseDifficultyParam(value: string | null): DifficultyLevel {
  if (value === 'normal' || value === 'hard' || value === 'easy') {
    return value;
  }
  return 'easy';
}

function parseMapModeParam(value: string | null): MapGenerationMode {
  if (value === 'fixed') {
    return 'fixed';
  }
  return 'randomClimateBands';
}

function parseMapSizeParam(value: string | null): 'small' | 'medium' | 'large' {
  if (value === 'small' || value === 'medium' || value === 'large') {
    return value;
  }
  return 'medium';
}

function parseRoundsParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseFactionList(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const ids = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return ids.length > 0 ? ids : undefined;
}
