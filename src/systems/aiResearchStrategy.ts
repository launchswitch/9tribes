// src/systems/aiResearchStrategy.ts
// AI Research Strategy — 10-domain × 3-tier research tree
//
// Each faction has 1 native domain (T1 auto-completed) + 0–9 foreign domains
// unlocked via sacrifice.  The AI scores available nodes by posture alignment,
// native-domain priority, tier urgency, synergy potential, and cost efficiency.

import type { GameState } from '../game/types.js';
import type { RulesRegistry, ResearchNodeDef } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import type { FactionStrategy, ResearchPriority } from './factionStrategy.js';
import { scoreResearchCandidate } from './aiPersonality.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { usesNormalAiBehavior } from './aiDifficulty.js';
import { getDomainProgression } from './domainProgression.js';
import emergentRulesData from '../content/base/emergent-rules.json' with { type: 'json' };
import type { EmergentRuleConfig } from './synergyEngine.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearchDecision {
  nodeId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Domain → posture affinity map
// ---------------------------------------------------------------------------

/** Domains that align with each posture, ordered by strength. */
const POSTURE_DOMAINS: Record<string, string[]> = {
  defensive:  ['fortress', 'river_stealth', 'heavy_hitter', 'nature_healing'],
  recovery:   ['fortress', 'nature_healing', 'heavy_hitter'],
  siege:      ['fortress', 'tidal_warfare', 'heavy_hitter'],
  offensive:  ['charge', 'hitrun', 'venom', 'slaving'],
  balanced:   ['charge', 'fortress', 'hitrun', 'nature_healing'],
  exploration:['hitrun', 'river_stealth', 'camel_adaptation', 'tidal_warfare'],
};

/** Domains that synergize with each signature unit keyword. */
const SIGNATURE_DOMAINS: Record<string, string[]> = {
  cavalry:    ['charge', 'hitrun'],
  archer:     ['hitrun', 'nature_healing'],
  elephant:   ['charge', 'heavy_hitter'],
  camel:      ['camel_adaptation', 'hitrun'],
  ship:       ['tidal_warfare', 'river_stealth'],
  naval:      ['tidal_warfare', 'river_stealth'],
  poison:     ['venom'],
  venom:      ['venom'],
  slave:      ['slaving'],
  infantry:   ['fortress', 'heavy_hitter'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract domain ID from a node ID.
 * Convention: "{domain}_t{tier}" e.g. "venom_t2" → "venom"
 */
function extractDomain(nodeId: string): string {
  const idx = nodeId.lastIndexOf('_t');
  return idx > 0 ? nodeId.substring(0, idx) : nodeId;
}

/**
 * Extract tier number from a node ID.
 * Convention: "{domain}_t{tier}" e.g. "venom_t2" → 2
 * Returns 1 if the pattern doesn't match.
 */
function extractTier(nodeId: string): number {
  const match = nodeId.match(/_t(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

function getEffectiveXpCost(_faction: { learnedDomains?: string[]; nativeDomain?: string }, xpCost: number): number {
  return xpCost;
}

// ---------------------------------------------------------------------------
// Candidate enumeration
// ---------------------------------------------------------------------------

interface CandidateNode {
  def: ResearchNodeDef;
  domainId: string;
  tier: number;
  isNative: boolean;
}

interface TripleStackOpportunity {
  ruleId: string;
  ruleName: string;
  missingDomains: Set<string>;
}

/**
 * Enumerate all researchable nodes for a faction.
 * Filters by: not completed, domain unlocked, prerequisites met,
 * and tier-ordering (T2 before T3 within a domain).
 */
function getCandidateNodes(
  faction: { nativeDomain: string; learnedDomains: string[] },
  completedNodes: string[],
  registry: RulesRegistry,
): CandidateNode[] {
  const completedSet = new Set(completedNodes);
  const learnedSet = new Set(faction.learnedDomains);

  const candidates: CandidateNode[] = [];

  for (const domain of registry.getAllResearchDomains()) {
    // Domain must be unlocked
    if (!learnedSet.has(domain.id)) continue;

    const isNative = domain.id === faction.nativeDomain;

    for (const node of Object.values(domain.nodes)) {
      // Skip already completed
      if (completedSet.has(node.id)) continue;

      const tier = node.tier ?? extractTier(node.id);

      // T1 is auto-completed for native domain — shouldn't appear
      if (tier === 1) continue;

      // Prerequisites must be met
      const prereqs = node.prerequisites ?? [];
      if (!prereqs.every((p) => completedSet.has(p))) continue;

      // Tier ordering: don't offer T3 if T2 isn't done yet
      if (tier === 3) {
        const t2Id = `${domain.id}_t2`;
        if (!completedSet.has(t2Id)) continue;
      }

      candidates.push({ def: node, domainId: domain.id, tier, isNative });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

/**
 * Native domain priority: strong early bias toward completing native T2,
 * moderate bias toward native T3 once T2 is done.
 */
function scoreNativePriority(candidate: CandidateNode): number {
  if (!candidate.isNative) return 0;
  // T2 in native domain is the highest-priority research target
  if (candidate.tier === 2) return 6;
  // T3 in native domain is valuable but less urgent than T2 was
  if (candidate.tier === 3) return 3;
  return 0;
}

/**
 * Posture alignment: bonus for domains matching current strategic posture.
 */
function scorePosture(posture: FactionStrategy['posture'], domainId: string): number {
  const preferred = POSTURE_DOMAINS[posture] ?? [];
  const idx = preferred.indexOf(domainId);
  if (idx === -1) return 0;
  // First domain in list = strongest alignment: +4, then +3, +2, +1
  return Math.max(1, 4 - idx);
}

/**
 * Signature unit synergy: bonus for domains matching the faction's signature unit.
 */
function scoreSignatureDomain(
  signatureUnit: string,
  domainId: string,
): number {
  const sig = signatureUnit.toLowerCase();
  for (const [keyword, domains] of Object.entries(SIGNATURE_DOMAINS)) {
    if (sig.includes(keyword) && domains.includes(domainId)) {
      return 3;
    }
  }
  return 0;
}

/**
 * Synergy with hybrid / absorption goals.
 */
function scoreSynergy(strategy: FactionStrategy, codifies: string[]): number {
  let score = 0;
  for (const domainId of codifies) {
    if (strategy.hybridGoal.desiredDomainIds.includes(domainId)) score += 2.5;
  }
  return score;
}

/**
 * Tier urgency: prefer cheaper T2 nodes over expensive T3 nodes.
 * Lower-tier nodes provide faster ROI.
 */
function scoreTierUrgency(tier: number): number {
  // T2 gets a small urgency bonus; T3 gets a slight penalty
  return tier === 2 ? 1.5 : 0;
}

/**
 * Cost efficiency: penalize expensive nodes so the AI doesn't
 * get stuck on a 100-XP T3 when a 60-XP T2 is available.
 */
function scoreCostEfficiency(
  faction: { learnedDomains?: string[]; nativeDomain?: string },
  xpCost: number,
): number {
  const effective = getEffectiveXpCost(faction, xpCost);
  // Linear penalty: 0.1 per effective XP point
  return -effective * 0.1;
}

/**
 * Research no longer grants hidden production unlocks directly.
 */
function scoreImmediateUnlocks(
  state: GameState,
  factionId: FactionId,
  nodeId: string,
  registry: RulesRegistry,
): number {
  void state;
  void factionId;
  void nodeId;
  void registry;
  return 0;
}

/**
 * Research rate is flat, so there is no hidden knowledge discount bonus.
 */
function scoreKnowledgeBonus(
  faction: { learnedDomains?: string[]; nativeDomain?: string },
  xpCost: number,
): number {
  void faction;
  void xpCost;
  return 0;
}

/**
 * Game-state urgency: boost defensive domains if losing, offensive if winning.
 */
function scoreGameStateUrgency(
  faction: { combatRecord?: { recentWins: number; recentLosses: number } },
  posture: FactionStrategy['posture'],
  domainId: string,
): number {
  const wins = faction.combatRecord?.recentWins ?? 0;
  const losses = faction.combatRecord?.recentLosses ?? 0;
  const losing = losses > wins;

  if (losing) {
    // Losing: boost defensive domains
    const defensive = ['fortress', 'nature_healing', 'heavy_hitter', 'river_stealth'];
    return defensive.includes(domainId) ? 2 : 0;
  } else {
    // Winning: boost offensive domains
    const offensive = ['charge', 'hitrun', 'venom', 'slaving', 'tidal_warfare'];
    return offensive.includes(domainId) ? 1 : 0;
  }
}

function scoreDoctrinePackageCompletion(
  candidate: CandidateNode,
  completedNodes: string[],
  strategy: FactionStrategy,
): number {
  const completed = new Set(completedNodes);
  let score = 0;

  if (strategy.personality.activeDoctrines.includes(candidate.domainId)) {
    score += candidate.tier === 2 ? 1.75 : 1.25;
  }

  if (candidate.tier === 3 && completed.has(`${candidate.domainId}_t2`)) {
    score += 1.5;
  }

  const domainWeight = strategy.personality.researchWeights[candidate.domainId] ?? 0;
  if (domainWeight > 0) {
    score += Math.min(2, domainWeight);
  }

  return score;
}

function getDomainsWithResearchProgress(research: NonNullable<GameState['research'] extends Map<any, infer R> ? R : never>): Set<string> {
  const domains = new Set<string>();

  for (const nodeId of research.completedNodes) {
    domains.add(extractDomain(nodeId));
  }
  if (research.activeNodeId) {
    domains.add(extractDomain(research.activeNodeId));
  }
  for (const [nodeId, progress] of Object.entries(research.progressByNodeId)) {
    if ((progress ?? 0) > 0) {
      domains.add(extractDomain(nodeId));
    }
  }

  return domains;
}

function scoreNormalTier3DepthFocus(
  candidate: CandidateNode,
  domainsWithProgress: Set<string>,
  difficulty?: DifficultyLevel,
): number {
  if (!usesNormalAiBehavior(difficulty)) return 0;
  if (candidate.tier !== 3) return 0;
  if (!domainsWithProgress.has(candidate.domainId)) return 0;
  return 3;
}

function scoreNormalBreadthPivot(
  candidate: CandidateNode,
  faction: { nativeDomain: string; learnedDomains: string[] },
  progression: ReturnType<typeof getDomainProgression>,
  domainsWithProgress: Set<string>,
  difficulty?: DifficultyLevel,
): number {
  if (!usesNormalAiBehavior(difficulty)) return 0;

  const nativeT2Secured = progression.t2Domains.includes(faction.nativeDomain);
  const nonNativeT2Count = progression.t2Domains.filter((domainId) => domainId !== faction.nativeDomain).length;
  const activeBreadthCount = Array.from(domainsWithProgress).filter((domainId) => domainId !== faction.nativeDomain).length;
  const isForeign = candidate.domainId !== faction.nativeDomain;
  const isNewBreadthTier2 = candidate.tier === 2 && isForeign && !progression.t2Domains.includes(candidate.domainId);
  const isNativeTier3 = candidate.tier === 3 && candidate.domainId === faction.nativeDomain;

  let score = 0;
  if (nativeT2Secured && isNewBreadthTier2) {
    score += nonNativeT2Count === 0 ? 7 : 4;
    if (activeBreadthCount === 0) {
      score += 2;
    }
  }

  if (isNativeTier3 && nativeT2Secured && nonNativeT2Count === 0 && activeBreadthCount === 0) {
    score -= 5;
  }

  return score;
}

function scoreNormalHybridBreadth(
  candidate: CandidateNode,
  strategy: FactionStrategy,
  progression: ReturnType<typeof getDomainProgression>,
  difficulty?: DifficultyLevel,
): number {
  if (!usesNormalAiBehavior(difficulty)) return 0;
  if (candidate.tier !== 2) return 0;
  if (!strategy.hybridGoal.desiredDomainIds.includes(candidate.domainId)) return 0;

  const alreadyDeveloped = progression.t2Domains.includes(candidate.domainId);
  return alreadyDeveloped ? 0 : 4.5;
}

function scoreNormalEmergentBreadth(
  candidate: CandidateNode,
  progression: ReturnType<typeof getDomainProgression>,
  difficulty?: DifficultyLevel,
): number {
  if (!usesNormalAiBehavior(difficulty)) return 0;
  if (candidate.tier !== 2) return 0;
  if (progression.emergentEligibleDomains.includes(candidate.domainId)) return 0;
  if (progression.t2Domains.length >= 2) return 0;
  return 2.5;
}

function getRuleDomainGroups(rule: EmergentRuleConfig): string[][] {
  if (rule.domainSets) {
    return Object.values(rule.domainSets);
  }
  if (rule.mobilityDomains) {
    return [rule.mobilityDomains];
  }
  if (rule.combatDomains) {
    return [rule.combatDomains];
  }
  return [];
}

function getReachableTripleStackOpportunities(
  codifiedDomains: Set<string>,
  unlockedDomains: Set<string>,
): TripleStackOpportunity[] {
  const rules = (emergentRulesData.rules as EmergentRuleConfig[]).filter((rule) => rule.condition !== 'default');
  const opportunities: TripleStackOpportunity[] = [];

  for (const rule of rules) {
    const groups = getRuleDomainGroups(rule);
    if (groups.length === 0) {
      continue;
    }

    if (groups.length === 1) {
      const eligibleDomains = groups[0];
      const codifiedCount = eligibleDomains.filter((domainId) => codifiedDomains.has(domainId)).length;
      if (codifiedCount !== 2) {
        continue;
      }

      const missingDomains = new Set(
        eligibleDomains.filter((domainId) => unlockedDomains.has(domainId) && !codifiedDomains.has(domainId)),
      );
      if (missingDomains.size === 0) {
        continue;
      }

      opportunities.push({
        ruleId: rule.id,
        ruleName: rule.name,
        missingDomains,
      });
      continue;
    }

    const coveredGroups = groups.filter((domains) => domains.some((domainId) => codifiedDomains.has(domainId)));
    if (coveredGroups.length !== groups.length - 1) {
      continue;
    }

    const missingGroup = groups.find((domains) => !domains.some((domainId) => codifiedDomains.has(domainId)));
    if (!missingGroup) {
      continue;
    }

    const missingDomains = new Set(missingGroup.filter((domainId) => unlockedDomains.has(domainId) && !codifiedDomains.has(domainId)));
    if (missingDomains.size === 0) {
      continue;
    }

    opportunities.push({
      ruleId: rule.id,
      ruleName: rule.name,
      missingDomains,
    });
  }

  return opportunities;
}

function scoreNormalTripleStackFocus(
  candidate: CandidateNode,
  opportunities: TripleStackOpportunity[],
  difficulty?: DifficultyLevel,
): number {
  if (!usesNormalAiBehavior(difficulty)) return 0;

  let score = 0;
  for (const opportunity of opportunities) {
    if (!opportunity.missingDomains.has(candidate.domainId)) {
      continue;
    }
    score = Math.max(score, candidate.tier === 2 ? 10 : 7);
  }
  return score;
}

function getMountedShare(state: GameState, factionId: FactionId): number {
  let living = 0;
  let mounted = 0;
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype) continue;
    living += 1;
    if (prototype.derivedStats.role === 'mounted') {
      mounted += 1;
    }
  }
  return living > 0 ? mounted / living : 0;
}

function scoreLogisticsFit(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  candidate: CandidateNode,
): number {
  const economy = state.economy.get(factionId) ?? { supplyIncome: 0, supplyDemand: 0 };
  const supplyDeficit = Math.max(0, economy.supplyDemand - economy.supplyIncome);
  if (supplyDeficit <= 0) return 0;

  const mountedShare = getMountedShare(state, factionId);
  let score = 0;
  if (mountedShare >= 0.4) {
    if (candidate.domainId === 'hitrun') score += 1.5;
    if (candidate.domainId === 'nature_healing') score += 1.2;
    if (candidate.domainId === 'river_stealth') score += 1.0;
    if (candidate.domainId === 'fortress') score += 1.0;
  }
  if (candidate.domainId === 'charge' || candidate.domainId === 'heavy_hitter') {
    score -= 0.8;
  }

  const personalityPreference = scoreResearchCandidate(
    strategy.personality,
    { supplyDeficit },
    { domainId: candidate.domainId, codifies: candidate.def.codifies },
  );

  return score + personalityPreference * 0.8;
}

// ---------------------------------------------------------------------------
// Reason string builder
// ---------------------------------------------------------------------------

function buildResearchReason(
  candidate: CandidateNode,
  posture: FactionStrategy['posture'],
  scores: {
    native: number;
    posture: number;
    signature: number;
    synergy: number;
    tier: number;
    immediate: number;
    knowledge: number;
    gameState: number;
    doctrinePackage: number;
    logistics: number;
    depthFocus: number;
    breadthPivot: number;
    hybridBreadth: number;
    emergentBreadth: number;
    tripleStack: number;
  },
): string {
  const parts: string[] = [`${posture} posture`, candidate.def.id];
  if (candidate.isNative) parts.push('native domain');
  if (scores.native > 0) parts.push('native priority');
  if (scores.posture > 0) parts.push('posture-aligned');
  if (scores.signature > 0) parts.push('signature unit synergy');
  if (scores.synergy > 0) parts.push('hybrid/absorption goal');
  if (scores.tier > 0) parts.push('tier 2 urgency');
  if (scores.immediate > 0) parts.push('unlocks production');
  if (scores.knowledge > 0) parts.push('cosmopolitan knowledge bonus');
  if (scores.gameState > 0) parts.push('game-state urgency');
  if (scores.doctrinePackage > 0) parts.push('doctrine package');
  if (scores.logistics > 0) parts.push('logistics fit');
  if (scores.depthFocus > 0) parts.push('normal depth-first tier 3 push');
  if (scores.breadthPivot > 0) parts.push('normal breadth pivot');
  if (scores.hybridBreadth > 0) parts.push('normal hybrid breadth');
  if (scores.emergentBreadth > 0) parts.push('normal emergent breadth');
  if (scores.tripleStack > 0) parts.push('normal triple-stack reach');
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rank all available research nodes by strategic score.
 * Returns sorted list of ResearchPriority entries (highest first).
 */
export function rankResearchPriorities(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ResearchPriority[] {
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  if (!faction || !research) return [];

  const candidates = getCandidateNodes(faction, research.completedNodes as string[], registry);
  const domainsWithProgress = getDomainsWithResearchProgress(research);
  const progression = getDomainProgression(faction, research);
  const tripleStackOpportunities = getReachableTripleStackOpportunities(
    new Set(progression.emergentEligibleDomains),
    new Set(faction.learnedDomains),
  );

  return candidates
    .map((candidate) => {
      const native = scoreNativePriority(candidate);
      const postureScore = scorePosture(strategy.posture, candidate.domainId);
      const signatureScore = scoreSignatureDomain(
        faction.identityProfile.signatureUnit,
        candidate.domainId,
      );
      const synergyScore = scoreSynergy(strategy, candidate.def.codifies ?? []);
      const tierScore = scoreTierUrgency(candidate.tier);
      const costScore = scoreCostEfficiency(faction, candidate.def.xpCost);
      const immediateScore = scoreImmediateUnlocks(
        state,
        factionId,
        candidate.def.id,
        registry,
      );
      const knowledgeScore = scoreKnowledgeBonus(faction, candidate.def.xpCost);
      const gameStateScore = scoreGameStateUrgency(faction, strategy.posture, candidate.domainId);
      const doctrinePackageScore = scoreDoctrinePackageCompletion(
        candidate,
        research.completedNodes as string[],
        strategy,
      );
      const logisticsScore = scoreLogisticsFit(state, factionId, strategy, candidate);
      const depthFocusScore = scoreNormalTier3DepthFocus(candidate, domainsWithProgress, difficulty);
      const breadthPivotScore = scoreNormalBreadthPivot(
        candidate,
        faction,
        progression,
        domainsWithProgress,
        difficulty,
      );
      const hybridBreadthScore = scoreNormalHybridBreadth(candidate, strategy, progression, difficulty);
      const emergentBreadthScore = scoreNormalEmergentBreadth(candidate, progression, difficulty);
      const tripleStackScore = scoreNormalTripleStackFocus(candidate, tripleStackOpportunities, difficulty);

      const score =
        native +
        postureScore +
        signatureScore +
        synergyScore +
        tierScore +
        costScore +
        immediateScore +
        knowledgeScore +
        gameStateScore +
        doctrinePackageScore +
        logisticsScore +
        depthFocusScore +
        breadthPivotScore +
        hybridBreadthScore +
        emergentBreadthScore +
        tripleStackScore;

      return {
        nodeId: candidate.def.id,
        score,
        reason: buildResearchReason(candidate, strategy.posture, {
          native,
          posture: postureScore,
          signature: signatureScore,
          synergy: synergyScore,
          tier: tierScore,
          immediate: immediateScore,
          knowledge: knowledgeScore,
          gameState: gameStateScore,
          doctrinePackage: doctrinePackageScore,
          logistics: logisticsScore,
          depthFocus: depthFocusScore,
          breadthPivot: breadthPivotScore,
          hybridBreadth: hybridBreadthScore,
          emergentBreadth: emergentBreadthScore,
          tripleStack: tripleStackScore,
        }),
      };
    })
    .sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));
}

/** Score threshold that must be exceeded to switch away from active research. */
const STICKY_THRESHOLD = 3;

/**
 * Choose the best research node for the AI to work on next.
 * Implements "sticky" behavior: won't switch away from the active node
 * unless a clearly better option emerges (score > active + threshold).
 */
export function chooseStrategicResearch(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ResearchDecision | null {
  const priorities = rankResearchPriorities(state, factionId, strategy, registry, difficulty);
  strategy.researchPriorities = priorities;

  const research = state.research.get(factionId);
  if (!research) return null;

  const top = priorities[0];
  if (!top) return null;

  // Sticky: keep active research unless the new top pick is clearly better
  if (research.activeNodeId && research.activeNodeId !== top.nodeId) {
    const activePriority = priorities.find((p) => p.nodeId === research.activeNodeId);
    const activeScore = activePriority?.score ?? -Infinity;

    if (top.score - activeScore < STICKY_THRESHOLD) {
      return {
        nodeId: research.activeNodeId,
        reason: activePriority?.reason ?? `keeping active research ${research.activeNodeId} sticky`,
      };
    }
  }

  return {
    nodeId: top.nodeId,
    reason: top.reason,
  };
}
