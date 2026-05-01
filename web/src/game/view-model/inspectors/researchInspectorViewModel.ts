/**
 * Research inspector view model extracted from worldViewModel.
 */

import type { GameState } from '../../../../../src/game/types.js';
import type { RulesRegistry, ResearchNodeDef } from '../../../../../src/data/registry/types.js';
import {
  getDomainTier,
} from '../../../../../src/systems/researchSystem.js';
import { getDomainProgression } from '../../../../../src/systems/domainProgression.js';
import type {
  ResearchInspectorViewModel,
  ResearchNodeViewState,
  ResearchNodeViewModel,
} from '../../types/clientState';
import HYBRID_RECIPES from '../../../../../src/content/base/hybrid-recipes.json';
import SIGNATURE_ABILITIES from '../../../../../src/content/base/signatureAbilities.json';
import CIVILIZATIONS from '../../../../../src/content/base/civilizations.json';

type UnlockEntry = { type: 'component' | 'chassis' | 'improvement' | 'recipe'; id: string; name: string };

type SignatureSummon = {
  chassisId: string;
  name: string;
};

function getSignatureSummon(value: unknown): SignatureSummon | null {
  if (!value || typeof value !== 'object' || !('summon' in value)) return null;
  const summon = (value as { summon?: unknown }).summon;
  if (!summon || typeof summon !== 'object') return null;
  const maybeSummon = summon as { chassisId?: unknown; name?: unknown };
  return typeof maybeSummon.chassisId === 'string' && typeof maybeSummon.name === 'string'
    ? { chassisId: maybeSummon.chassisId, name: maybeSummon.name }
    : null;
}

function getUnitUnlocksForNode(
  domainId: string,
  tier: number,
  nativeFaction: string,
): UnlockEntry[] {
  const unlocks: UnlockEntry[] = [];

  // T2 unlocks: mid-tier hybrid recipes (minLearnedDomains === 2) from the domain's native faction
  if (tier >= 2) {
    for (const recipe of Object.values(HYBRID_RECIPES) as { id: string; name: string; minLearnedDomains: number; nativeFaction: string }[]) {
      if (recipe.nativeFaction === nativeFaction && recipe.minLearnedDomains === 2) {
        unlocks.push({ type: 'recipe', id: recipe.id, name: recipe.name });
      }
    }
  }

  // T3 unlocks: late-tier hybrid recipes (minLearnedDomains === 3) from the domain's native faction
  if (tier >= 3) {
    for (const recipe of Object.values(HYBRID_RECIPES) as { id: string; name: string; minLearnedDomains: number; nativeFaction: string }[]) {
      if (recipe.nativeFaction === nativeFaction && recipe.minLearnedDomains === 3) {
        unlocks.push({ type: 'recipe', id: recipe.id, name: recipe.name });
      }
    }

    // T3 also unlocks the signature summon unit for this faction (if it exists)
    const summon = getSignatureSummon(SIGNATURE_ABILITIES[nativeFaction as keyof typeof SIGNATURE_ABILITIES]);
    if (summon) {
      unlocks.push({ type: 'recipe', id: summon.chassisId, name: summon.name });
    }
  }

  return unlocks;
}

function getNativeFactionForDomain(domainId: string): string {
  for (const civ of Object.values(CIVILIZATIONS) as { id: string; nativeDomain: string }[]) {
    if (civ.nativeDomain === domainId) {
      return civ.id;
    }
  }
  return '';
}

export function buildResearchInspectorViewModel(
  state: GameState,
  registry: RulesRegistry,
): ResearchInspectorViewModel | null {
  const factionId = state.activeFactionId;
  if (!factionId) return null;
  const faction = state.factions.get(factionId as never);
  if (!faction) return null;

  const research = state.research.get(factionId as never);
  if (!research) return null;

  const nativeDomain = faction.nativeDomain ?? '';
  const learnedDomains = faction.learnedDomains ?? [nativeDomain];
  const allDomains = registry.getAllResearchDomains();
  const progression = getDomainProgression(faction, research);

  // Build node VMs across all research domains
  const nodes: ResearchNodeViewModel[] = [];
  for (const domainDef of allDomains) {
    const domainId = domainDef.id;
    const isNative = domainId === nativeDomain;
    const isUnlocked = learnedDomains.includes(domainId);
    const domainNativeFaction = getNativeFactionForDomain(domainId);

    for (const nodeDef of Object.values(domainDef.nodes) as ResearchNodeDef[]) {
      const isCompleted = research.completedNodes.includes(nodeDef.id as never);
      const isActive = research.activeNodeId === nodeDef.id;
      const progress = research.progressByNodeId[nodeDef.id as never] ?? 0;

      const prereqsMet = (nodeDef.prerequisites ?? []).every((prereqId) =>
        research.completedNodes.includes(prereqId as never),
      );

      let nodeState: ResearchNodeViewState;
      if (!isUnlocked) nodeState = 'locked';
      else if (isCompleted) nodeState = 'completed';
      else if (isActive) nodeState = 'active';
      else if (!prereqsMet) nodeState = 'locked';
      else nodeState = 'available';

      const estimatedTurns =
        nodeState === 'active' && research.researchPerTurn > 0
          ? Math.ceil(Math.max(0, nodeDef.xpCost - progress) / research.researchPerTurn)
          : null;

      nodes.push({
        nodeId: nodeDef.id,
        name: nodeDef.name,
        tier: nodeDef.tier ?? 1,
        xpCost: nodeDef.xpCost,
        discountedXpCost: null,
        currentProgress: progress,
        state: nodeState,
        prerequisites: nodeDef.prerequisites ?? [],
        prerequisiteNames: [],
        unlocks: getUnitUnlocksForNode(domainId, nodeDef.tier ?? 1, domainNativeFaction),
        qualitativeEffect: isNative
          ? (nodeDef.qualitativeEffect?.nativeDescription ?? nodeDef.qualitativeEffect?.description ?? null)
          : (nodeDef.qualitativeEffect?.description ?? null),
        estimatedTurns,
        domain: domainId,
        isNative,
        isLocked: !isUnlocked,
      });
    }
  }

  // Build domain pips for all 10 research domains
  const capabilitiesVms = allDomains.map((domainDef: { id: string; name: string }) => {
    const domainId = domainDef.id;
    const tier = getDomainTier(faction, domainId, research.completedNodes);
    return {
      domainId,
      domainName: domainDef.name,
      description: domainDef.name,
      level: tier,
      hasResearchTrack: true,
      codified: learnedDomains.includes(domainId),
      t1Ready: tier >= 1,
      t2Ready: tier >= 2,
    };
  });

  // Find active node info across domains
  let activeNodeName: string | null = null;
  let activeNodeCost: number | null = null;
  let activeNodeProgress: number | null = null;

  if (research.activeNodeId) {
    const domainId = research.activeNodeId.split('_t')[0];
    const domain = registry.getResearchDomain(domainId);
    if (domain?.nodes[research.activeNodeId]) {
      activeNodeName = domain.nodes[research.activeNodeId].name;
      activeNodeCost = domain.nodes[research.activeNodeId].xpCost;
      activeNodeProgress = research.progressByNodeId[research.activeNodeId as never] ?? 0;
    }
  }

  // Simplified rate breakdown — flat base rate only
  const totalRate = research.researchPerTurn;

  return {
    factionId,
    activeNodeId: research.activeNodeId,
    activeNodeName,
    activeNodeProgress,
    activeNodeXpCost: activeNodeCost,
    completedCount: research.completedNodes.length,
    totalNodes: nodes.length,
    nodes,
    capabilities: capabilitiesVms,
    rateBreakdown: {
      base: research.researchPerTurn,
      detail: progression.canBuildLateTier
        ? `${learnedDomains.length} domains unlocked · late-tier production available`
        : progression.canBuildMidTier
          ? `${learnedDomains.length} domains unlocked · mid-tier production available`
          : `${learnedDomains.length} domain unlocked · base production only`,
      total: totalRate,
    },
    hasKnowledgeDiscount: false,
  };
}
