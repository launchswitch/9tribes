import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { deleteSaveGame, listSaveGames, type SaveGameSummary } from '../savegames';
import { getMvpFactionConfigs } from '../../../../src/game/scenarios/mvp.js';
import type { DifficultyLevel } from '../../../../src/systems/aiDifficulty.js';
import { playMenuUiSound } from '../audio/musicManager';

type MenuStep = 'title' | 'mode' | 'setup' | 'tribe' | 'load';
type MenuMode = 'singleplayer';
type MapSize = 'small' | 'medium' | 'large';

type SetupState = {
  difficulty: DifficultyLevel;
  mapSize: MapSize;
  selectedFactionId: string;
};

const FACTIONS = getMvpFactionConfigs();
const MENU_STEPS: MenuStep[] = ['title', 'mode', 'setup', 'tribe'];

const MAP_SIZE_LABELS: Record<MapSize, string> = {
  small: '40 x 30',
  medium: '50 x 38',
  large: '60 x 46',
};

const DIFFICULTY_COPY: Record<DifficultyLevel, string> = {
  easy: 'Relaxed AI pressure and forgiving openings.',
  normal: 'Balanced pressure for standard campaign starts.',
  hard: 'Sharper AI decisions and less room for early mistakes.',
};

const DEFAULT_SETUP: SetupState = {
  difficulty: 'normal',
  mapSize: 'medium',
  selectedFactionId: FACTIONS.find((faction) => faction.id === 'steppe_clan')?.id ?? FACTIONS[0]?.id ?? 'steppe_clan',
};

export function MenuClient() {
  const [step, setStep] = useState<MenuStep>(() => getInitialStep());
  const mode: MenuMode = 'singleplayer';
  const [setup, setSetup] = useState<SetupState>(DEFAULT_SETUP);
  const [saveGames, setSaveGames] = useState<SaveGameSummary[]>([]);

  const selectedFaction = useMemo(
    () => FACTIONS.find((faction) => faction.id === setup.selectedFactionId) ?? FACTIONS[0],
    [setup.selectedFactionId],
  );

  const canStart = Boolean(selectedFaction);

  useEffect(() => {
    setSaveGames(listSaveGames());
  }, []);

  const playUiSelect = () => {
    playMenuUiSound();
  };

  const goBack = () => {
    playUiSelect();
    if (step === 'load') {
      setStep('mode');
      return;
    }

    const index = MENU_STEPS.indexOf(step);
    if (index > 0) {
      setStep(MENU_STEPS[index - 1] ?? 'title');
    }
  };

  const beginGame = () => {
    if (!selectedFaction) {
      return;
    }

    playUiSelect();
    const params = new URLSearchParams();
    params.set('mode', 'play');
    params.set('bootstrap', 'fresh');
    params.set('seed', String(createSeed()));
    params.set('map', 'random');
    params.set('size', setup.mapSize);
    params.set('difficulty', setup.difficulty);
    params.set('player', selectedFaction.id);

    window.location.search = params.toString();
  };

  const handleLoadSave = (saveId: string) => {
    playUiSelect();
    const params = new URLSearchParams();
    params.set('mode', 'play');
    params.set('save', saveId);
    window.location.search = params.toString();
  };

  const handleDeleteSave = (saveId: string) => {
    playUiSelect();
    deleteSaveGame(saveId);
    setSaveGames(listSaveGames());
  };

  return (
    <main className={`menu-shell menu-shell--${step}`}>
      <div className={`menu-screen ${step === 'title' ? 'menu-screen--title' : 'menu-screen--panel'}`}>
        {step !== 'title' ? (
          <header className="menu-header">
            <button className="menu-back" type="button" onClick={goBack}>
              Back
            </button>
            <div className="menu-header__copy">
              <p className="menu-kicker">9 Tribes</p>
              <h1>{getStepTitle(step)}</h1>
            </div>
            <div className="menu-header__spacer" aria-hidden="true" />
          </header>
        ) : null}

        {step === 'title' ? (
          <section className="menu-title">
            <div className="menu-title__scrim" />
            <div className="menu-title__actions">
              <button
                className="menu-primary menu-primary--hero"
                type="button"
                onClick={() => {
                  playUiSelect();
                  setStep('mode');
                }}
              >
                Press Start
              </button>
            </div>
          </section>
        ) : null}

        {step === 'mode' ? (
          <section className="menu-panel">
            <div className="menu-copy">
              <p className="menu-kicker">Choose Mode</p>
              <h2>Begin a New Campaign</h2>
            </div>

            <div className="menu-option-stack">
              <button
                className={`menu-option ${mode === 'singleplayer' ? 'is-selected' : ''}`}
                type="button"
                onClick={() => {
                  playUiSelect();
                  setStep('setup');
                }}
              >
                <span className="menu-option__title">Single Player</span>
                <span className="menu-option__body">Procedural world, nine tribes, one human faction.</span>
              </button>

              <button className="menu-option is-disabled" type="button" disabled>
                <span className="menu-option__title">Multiplayer</span>
                <span className="menu-option__body">Coming later once networked sessions exist.</span>
              </button>

              <button
                className="menu-option"
                type="button"
                onClick={() => {
                  playUiSelect();
                  setStep('load');
                }}
              >
                <span className="menu-option__title">Load Game</span>
                <span className="menu-option__body">
                  {saveGames.length > 0 ? `Resume one of ${saveGames.length} local saves.` : 'Open local save browser.'}
                </span>
              </button>
            </div>
          </section>
        ) : null}

        {step === 'setup' ? (
          <section className="menu-panel">
            <div className="menu-copy">
              <p className="menu-kicker">World Setup</p>
              <h2>Set the opening conditions</h2>
            </div>

            <div className="menu-config-grid">
              <div className="menu-config-card">
                <h3>Difficulty</h3>
                <div className="menu-chip-row">
                  {(['easy', 'normal', 'hard'] as DifficultyLevel[]).map((difficulty) => {
                    const isLocked = difficulty !== 'normal';
                    return (
                      <button
                        key={difficulty}
                        className={`menu-chip ${setup.difficulty === difficulty ? 'is-selected' : ''} ${isLocked ? 'is-disabled' : ''}`}
                        type="button"
                        disabled={isLocked}
                        onClick={() => {
                          playUiSelect();
                          setSetup((current) => ({ ...current, difficulty }));
                        }}
                      >
                        {difficulty}
                      </button>
                    );
                  })}
                </div>
                <p className="menu-config-card__hint">{DIFFICULTY_COPY[setup.difficulty]}</p>
              </div>

              <div className="menu-config-card">
                <h3>Map Size</h3>
                <div className="menu-chip-row">
                  {(['small', 'medium', 'large'] as MapSize[]).map((mapSize) => (
                    <button
                      key={mapSize}
                      className={`menu-chip ${setup.mapSize === mapSize ? 'is-selected' : ''}`}
                      type="button"
                      onClick={() => {
                        playUiSelect();
                        setSetup((current) => ({ ...current, mapSize }));
                      }}
                    >
                      {mapSize}
                    </button>
                  ))}
                </div>
                <p className="menu-config-card__hint">World size: {MAP_SIZE_LABELS[setup.mapSize]}</p>
              </div>
            </div>

            <div className="menu-footer-actions">
              <button
                className="menu-primary"
                type="button"
                onClick={() => {
                  playUiSelect();
                  setStep('tribe');
                }}
              >
                Choose Tribe
              </button>
            </div>
          </section>
        ) : null}

        {step === 'tribe' ? (
          <section className="menu-panel menu-panel--tribes">
            <div className="menu-copy">
              <p className="menu-kicker">Select Tribe</p>
              <h2>Choose your people</h2>
            </div>

            <div className="tribe-layout">
              <div className="tribe-grid" role="list" aria-label="Playable tribes">
                {FACTIONS.map((faction) => {
                  const isSelected = faction.id === selectedFaction?.id;
                  return (
                    <button
                      key={faction.id}
                      className={`tribe-card ${isSelected ? 'is-selected' : ''}`}
                      type="button"
                      onClick={() => {
                        playUiSelect();
                        setSetup((current) => ({ ...current, selectedFactionId: faction.id }));
                      }}
                      role="listitem"
                    >
                      <span className="tribe-card__crest" style={{ '--tribe-accent': faction.color } as CSSProperties} />
                      <span className="tribe-card__name">{faction.name}</span>
                      <span className="tribe-card__biome">{formatBiome(faction.homeBiome)}</span>
                    </button>
                  );
                })}
              </div>

              {selectedFaction ? (
                <aside className="tribe-preview">
                  <div
                    className="tribe-preview__swatch"
                    style={{ '--tribe-accent': selectedFaction.color } as CSSProperties}
                  />
                  <p className="menu-kicker">Selected Tribe</p>
                  <h3>{selectedFaction.name}</h3>
                  <p>{selectedFaction.economyAngle}</p>
                  <dl className="tribe-stats">
                    <div>
                      <dt>Home Biome</dt>
                      <dd>{formatBiome(selectedFaction.homeBiome)}</dd>
                    </div>
                    <div>
                      <dt>Signature Unit</dt>
                      <dd>{selectedFaction.signatureUnit}</dd>
                    </div>
                    <div>
                      <dt>Strength</dt>
                      <dd>{selectedFaction.naturalPrey}</dd>
                    </div>
                    <div>
                      <dt>Threat</dt>
                      <dd>{selectedFaction.naturalCounter}</dd>
                    </div>
                  </dl>
                </aside>
              ) : null}
            </div>

            <div className="menu-footer-actions">
              <button className="menu-primary" type="button" onClick={beginGame} disabled={!canStart}>
                Start Game
              </button>
            </div>
          </section>
        ) : null}

        {step === 'load' ? (
          <section className="menu-panel">
            <div className="menu-copy">
              <p className="menu-kicker">Load Game</p>
              <h2>Resume a saved campaign</h2>
              <p>These saves are stored locally in this browser profile.</p>
            </div>

            {saveGames.length > 0 ? (
              <div className="savegame-list">
                {saveGames.map((saveGame) => (
                  <article key={saveGame.id} className="savegame-card">
                    <div className="savegame-card__copy">
                      <h3>{saveGame.label}</h3>
                      <p>
                        {saveGame.preview.playerFactionName ?? saveGame.preview.activeFactionName}
                        {' · '}
                        Round {saveGame.preview.round}
                        {' · '}
                        Turn {saveGame.preview.turnNumber}
                      </p>
                      <span>{formatSaveTimestamp(saveGame.savedAt)}</span>
                    </div>

                    <div className="savegame-card__actions">
                      <button className="menu-primary" type="button" onClick={() => handleLoadSave(saveGame.id)}>
                        Load
                      </button>
                      <button className="menu-back" type="button" onClick={() => handleDeleteSave(saveGame.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="menu-empty-state">
                <p className="menu-kicker">No Saves Yet</p>
                <p>Start a campaign, then use the in-game Game menu to save it here.</p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function getStepTitle(step: Exclude<MenuStep, 'title'>) {
  switch (step) {
    case 'mode':
      return 'Mode Select';
    case 'setup':
      return 'Difficulty and Map Size';
    case 'tribe':
      return 'Tribe Selection';
    case 'load':
      return 'Load Game';
  }
}

function createSeed() {
  return Math.floor(Math.random() * 1_000_000);
}

function formatBiome(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInitialStep(): MenuStep {
  const screen = new URLSearchParams(window.location.search).get('screen');
  return screen === 'load' ? 'load' : 'title';
}

function formatSaveTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
