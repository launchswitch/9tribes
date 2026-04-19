import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import researchData from '../data/research.json';

// ── Types ──

type ResearchDataMap = Record<string, {
  nodes: Record<string, { qualitativeEffect?: { description?: string } }>;
}>;

type TechDiscoveryEvent = {
  nodeId: string;
  nodeName: string;
  tier: number;
  effectDescription: string | null;
};

// ── Helpers ──

const RESEARCH = researchData as unknown as ResearchDataMap;

const TIER_LABELS: Record<number, string> = {
  1: 'Foundation',
  2: 'Mastery',
  3: 'Transcendence',
};

function lookupEffectDescription(nodeId: string): string | null {
  const domainId = nodeId.split('_t')[0];
  return RESEARCH[domainId]?.nodes[nodeId]?.qualitativeEffect?.description ?? null;
}

// ── Context ──

type TechDiscoveryContextValue = {
  showTechDiscovery: (event: TechDiscoveryEvent) => void;
};

const TechDiscoveryContext = createContext<TechDiscoveryContextValue | null>(null);

export function useTechDiscoveryModal() {
  const ctx = useContext(TechDiscoveryContext);
  if (!ctx) throw new Error('useTechDiscoveryModal must be used within TechDiscoveryModalProvider');
  return ctx;
}

// ── Detection Hook ──

export function useTechDiscoveryDetector(
  lastResearchCompletion: { nodeId: string; nodeName: string; tier: number } | null | undefined,
  onDetect: (event: TechDiscoveryEvent) => void,
) {
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastResearchCompletion) return;
    const key = `${lastResearchCompletion.nodeId}:${lastResearchCompletion.tier}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    onDetect({
      ...lastResearchCompletion,
      effectDescription: lookupEffectDescription(lastResearchCompletion.nodeId),
    });
  }, [lastResearchCompletion, onDetect]);
}

// ── Provider ──

export function TechDiscoveryModalProvider({ children }: { children: React.ReactNode }) {
  const [event, setEvent] = useState<TechDiscoveryEvent | null>(null);

  const showTechDiscovery = useCallback((e: TechDiscoveryEvent) => setEvent(e), []);
  const dismiss = useCallback(() => setEvent(null), []);

  const ctxValue = useMemo(() => ({ showTechDiscovery }), [showTechDiscovery]);

  return (
    <TechDiscoveryContext.Provider value={ctxValue}>
      {children}
      {event ? <TechDiscoveryModalInner event={event} onDismiss={dismiss} /> : null}
    </TechDiscoveryContext.Provider>
  );
}

// ── Modal ──

type ModalInnerProps = {
  event: TechDiscoveryEvent;
  onDismiss: () => void;
};

function TechDiscoveryModalInner({ event, onDismiss }: ModalInnerProps) {
  const tierLabel = TIER_LABELS[event.tier] ?? `Tier ${event.tier}`;

  return (
    <div className="tdm-overlay" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="tdm-card">
        <div className="tdm-glow" />
        <div className="tdm-header">
          <span className="tdm-icon">✦</span>
          <h2 className="tdm-title">Your Knowledge Has Progressed!</h2>
          <span className="tdm-icon">✦</span>
        </div>
        <div className="tdm-divider">
          <span className="tdm-divider-gem" />
        </div>
        <div className="tdm-tech-row">
          <span className="tdm-tier-badge" data-tier={event.tier}>{tierLabel}</span>
          <h3 className="tdm-tech-name">{event.nodeName}</h3>
        </div>
        {event.effectDescription ? (
          <div className="tdm-effect-block">
            <p className="tdm-effect-label">Effect</p>
            <p className="tdm-effect-text">{event.effectDescription}</p>
          </div>
        ) : null}
        <button type="button" className="tdm-dismiss" onClick={onDismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
