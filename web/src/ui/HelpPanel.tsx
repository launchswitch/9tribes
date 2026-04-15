import { useEffect, useState } from 'react';
import type { ClientState } from '../game/types/clientState';
import { helpContent } from '../data/help-content';
import { SynergyEncyclopediaTab } from './SynergyEncyclopediaTab';
import { TribesTab } from './TribesTab';
import { ResearchTab } from './ResearchTab';
import { CombatTab } from './CombatTab';
import { ControlsTab } from './ControlsTab';

type HelpTabId = 'quick-start' | 'tribes' | 'combat' | 'research' | 'synergies' | 'controls';

type HelpTab = {
  id: HelpTabId;
  label: string;
  enabled: boolean;
};

const TABS: HelpTab[] = [
  { id: 'quick-start', label: 'Quick Start', enabled: true },
  { id: 'tribes', label: 'Tribes', enabled: true },
  { id: 'combat', label: 'Combat', enabled: true },
  { id: 'research', label: 'Research & Codify', enabled: true },
  { id: 'synergies', label: 'Synergies', enabled: true },
  { id: 'controls', label: 'Controls', enabled: true },
];

type HelpPanelProps = {
  state: ClientState;
  onClose: () => void;
  initialTab?: string;
};

export function HelpPanel({ state: _state, onClose, initialTab }: HelpPanelProps) {
  const [activeTab, setActiveTab] = useState<HelpTabId>(() => {
    if (initialTab) {
      const found = TABS.find((t) => t.id === initialTab);
      if (found && found.enabled) return found.id;
    }
    return 'quick-start';
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleTabClick = (tab: HelpTab) => {
    if (!tab.enabled) return;
    setActiveTab(tab.id);
  };

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-panel" onClick={(e) => e.stopPropagation()}>
        <header className="help-panel__header">
          <h2 className="help-panel__title">War Guide</h2>
          <button className="help-panel__close" onClick={onClose} aria-label="Close">&times;</button>
        </header>

        <nav className="help-tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`help-tab${activeTab === tab.id ? ' help-tab--active' : ''}${!tab.enabled ? ' help-tab--disabled' : ''}`}
              disabled={!tab.enabled}
              onClick={() => handleTabClick(tab)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="help-panel__body">
          {activeTab === 'controls' && (
            <div className="help-content">
              <ControlsTab />
            </div>
          )}
          {activeTab === 'quick-start' && (
            <div className="help-content">
              <div
                className="help-prose"
                dangerouslySetInnerHTML={{ __html: helpContent.quickStart.body }}
              />
            </div>
          )}
          {activeTab === 'tribes' && (
            <div className="help-content">
              <TribesTab />
            </div>
          )}
          {activeTab === 'combat' && (
            <div className="help-content">
              <CombatTab />
            </div>
          )}
          {activeTab === 'research' && (
            <div className="help-content">
              <ResearchTab />
            </div>
          )}
          {activeTab === 'synergies' && (
            <div className="help-content">
              <SynergyEncyclopediaTab />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
