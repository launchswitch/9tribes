import { buildMvpScenario } from '../../../../src/game/buildMvpScenario.js';
import type { GameState, Unit, UnitId } from '../../../../src/game/types.js';
import { createCityId, createImprovementId } from '../../../../src/core/ids.js';
import { hexDistance, hexToKey } from '../../../../src/core/grid.js';
import { getMvpScenarioConfig } from '../../../../src/game/scenarios/mvp.js';
import { loadRulesRegistry } from '../../../../src/data/loader/loadRulesRegistry.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import { getCombatAttackModifier, getCombatDefenseModifier } from '../../../../src/systems/factionIdentitySystem.js';
import {
  getVeteranDefenseBonus,
  getVeteranMoraleBonus,
  getVeteranStatBonus,
  resolveCombat,
} from '../../../../src/systems/combatSystem.js';
import { getValidMoves, moveUnit, previewMove } from '../../../../src/systems/movementSystem.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { canUseCharge } from '../../../../src/systems/abilitySystem.js';
import { getRoleEffectiveness } from '../../../../src/data/roleEffectiveness.js';
import { getWeaponEffectiveness } from '../../../../src/data/weaponEffectiveness.js';
import {
  computeFactionStrategy,
  getNearestFriendlyCity,
  getNearbySupportScore,
  getUnitIntent,
  isThreatenedCityHex,
  scoreStrategicTerrain,
} from '../../../../src/systems/strategicAi.js';
import {
  computeRetreatRisk,
  scoreAttackCandidate,
  scoreMoveCandidate,
  scoreStrategicTarget,
  shouldEngageTarget,
} from '../../../../src/systems/aiTactics.js';
import { deriveResourceIncome, advanceCaptureTimers } from '../../../../src/systems/economySystem.js';
import {
  advanceProduction,
  canPaySettlerVillageCost,
  canCompleteCurrentProduction,
  canProducePrototype,
  cancelCurrentProduction,
  completeProduction,
  getNearestFactionVillageIds,
  getPrototypeCostType,
  getPrototypeQueueCost,
  queueUnit,
  removeFromQueue,
} from '../../../../src/systems/productionSystem.js';
import { getFactionCityIds, syncFactionSettlementIds } from '../../../../src/systems/factionOwnershipSystem.js';
import { advanceTurn } from '../../../../src/systems/turnSystem.js';
import {
  addResearchProgress,
  startResearch,
} from '../../../../src/systems/researchSystem.js';
import { chooseStrategicResearch } from '../../../../src/systems/aiResearchStrategy.js';
import { chooseStrategicProduction } from '../../../../src/systems/aiProductionStrategy.js';
import { applyCombatSignals } from '../../../../src/systems/combatSignalSystem.js';
import { unlockHybridRecipes } from '../../../../src/systems/hybridSystem.js';
import { awardCombatXP } from '../../../../src/systems/xpSystem.js';
import { tryPromoteUnit } from '../../../../src/systems/veterancySystem.js';
import { evaluateAndSpawnVillage } from '../../../../src/systems/villageSystem.js';
import type { FactionStrategy, UnitStrategicIntent } from '../../../../src/systems/factionStrategy.js';
import type { CombatResult } from '../../../../src/systems/combatSystem.js';
import type { GameAction } from '../types/clientState';
import type { ReplayCombatEvent } from '../types/replay';
import type { PlayStateSource, SerializedGameState } from '../types/playState';
import type { AttackTargetView, ReachableHexView } from '../types/worldView';
import { deserializeGameState, serializeGameState } from '../types/playState';
import { updateFogState } from '../../../../src/systems/fogSystem.js';
import { applyHealingForFaction } from '../../../../src/systems/healingSystem.js';
import {
  addExhaustion,
  applySupplyDeficitPenalties,
  EXHAUSTION_CONFIG,
} from '../../../../src/systems/warExhaustionSystem.js';
import { performSacrifice } from '../../../../src/systems/sacrificeSystem.js';
import { tryLearnFromKill } from '../../../../src/systems/learnByKillSystem.js';
import { attemptNonCombatCapture } from '../../../../src/systems/captureSystem.js';
import { createCitySiteBonuses, getSettlementOccupancyBlocker } from '../../../../src/systems/citySiteSystem.js';
import { findRetreatHex } from '../../../../src/systems/signatureAbilitySystem.js';
import {
  captureCity,
  degradeWalls,
  getCapturingFaction,
  isCityVulnerable,
  repairWalls,
} from '../../../../src/systems/siegeSystem.js';
import { isCityEncircled, isEncirclementBroken } from '../../../../src/systems/territorySystem.js';
import type { DifficultyLevel } from '../../../../src/systems/aiDifficulty.js';
import type { MapGenerationMode } from '../../../../src/world/map/types.js';

type SessionEvent = {
  sequence: number;
  round: number;
  kind: 'move' | 'turn' | 'combat';
  message: string;
};

type SessionFeedback = {
  eventSequence: number;
  moveCount: number;
  endTurnCount: number;
  lastActiveFactionId: string | null;
  liveCombatEvents: ReplayCombatEvent[];
  lastMove:
    | {
        unitId: string;
        destination: { q: number; r: number };
      }
    | null;
  lastTurnChange:
    | {
        factionId: string;
      }
    | null;
  lastSacrifice:
    | {
        unitId: string;
        unitName: string;
        domains: string[];
      }
    | null;
  lastLearnedDomain:
    | {
        unitId: string;
        domainId: string;
      }
    | null;
  lastResearchCompletion:
    | {
        nodeId: string;
        nodeName: string;
        tier: number;
      }
    | null;
  hitAndRunRetreat:
    | {
        unitId: string;
        to: { q: number; r: number };
      }
    | null;
  lastSettlerVillageSpend:
    | {
        factionId: string;
        villageIds: string[];
      }
    | null;
};

/** Pre-resolved combat data returned by resolveAttack() before state is mutated */
export interface PendingCombat {
  attackerId: UnitId;
  defenderId: UnitId;
  result: CombatResult;
  combatEvent: ReplayCombatEvent;
}

interface GameSessionOptions {
  humanControlledFactionIds?: string[];
  difficulty?: DifficultyLevel;
  mapMode?: MapGenerationMode;
  mapSize?: 'small' | 'medium' | 'large';
  selectedFactions?: string[];
}

export type SessionSaveSnapshot = {
  payload: SerializedGameState;
  preview: {
    round: number;
    turnNumber: number;
    activeFactionId: string | null;
    activeFactionName: string;
    playerFactionId: string | null;
    playerFactionName: string | null;
  };
};

export class GameSession {
  private state: GameState;
  private readonly registry: RulesRegistry;
  private readonly maxTurns: number;
  private readonly humanControlledFactionIds: Set<string>;
  private readonly difficulty: DifficultyLevel;
  private readonly mapMode?: MapGenerationMode;
  private readonly mapSize?: 'small' | 'medium' | 'large';
  private readonly selectedFactions?: string[];
  private readonly events: SessionEvent[] = [];
  private readonly feedback: SessionFeedback = {
    eventSequence: 0,
    moveCount: 0,
    endTurnCount: 0,
    lastActiveFactionId: null,
    lastMove: null,
    lastTurnChange: null,
    lastSacrifice: null,
    lastLearnedDomain: null,
    lastResearchCompletion: null,
    hitAndRunRetreat: null,
    lastSettlerVillageSpend: null,
    liveCombatEvents: [],
  };

  /** Holds a pre-resolved combat waiting for animation to complete before applying */
  private _pendingCombat: PendingCombat | null = null;

  /** Queue of AI-vs-AI (or AI-vs-player) combats resolved during AI turn processing */
  private _aiCombatQueue: PendingCombat[] = [];

  constructor(
    source: PlayStateSource = { type: 'fresh' },
    registry = loadRulesRegistry(),
    options: GameSessionOptions = {},
  ) {
    this.registry = registry;
    this.maxTurns = getMvpScenarioConfig().roundsToWin;
    this.difficulty = options.difficulty ?? 'easy';
    this.mapMode = options.mapMode;
    this.mapSize = options.mapSize;
    this.selectedFactions = options.selectedFactions;
    this.humanControlledFactionIds = new Set(options.humanControlledFactionIds ?? []);
    this.state = this.bootstrap(source);
    if (this.humanControlledFactionIds.size === 0) {
      this.state.factions.forEach((_faction, factionId) => this.humanControlledFactionIds.add(factionId));
    }
    this.feedback.lastActiveFactionId = this.state.activeFactionId;
    this.runAiUntilHumanTurn();
  }

  getState() {
    return this.state;
  }

  getRegistry() {
    return this.registry;
  }

  getMaxTurns() {
    return this.maxTurns;
  }

  getEvents() {
    return [...this.events];
  }

  getFeedback() {
    return {
      ...this.feedback,
      lastMove: this.feedback.lastMove ? {
        ...this.feedback.lastMove,
        destination: { ...this.feedback.lastMove.destination },
      } : null,
      lastTurnChange: this.feedback.lastTurnChange ? { ...this.feedback.lastTurnChange } : null,
      lastSacrifice: this.feedback.lastSacrifice ? { ...this.feedback.lastSacrifice } : null,
      lastLearnedDomain: this.feedback.lastLearnedDomain ? { ...this.feedback.lastLearnedDomain } : null,
      lastResearchCompletion: this.feedback.lastResearchCompletion ? { ...this.feedback.lastResearchCompletion } : null,
      hitAndRunRetreat: this.feedback.hitAndRunRetreat ? { ...this.feedback.hitAndRunRetreat } : null,
      lastSettlerVillageSpend: this.feedback.lastSettlerVillageSpend
        ? {
            factionId: this.feedback.lastSettlerVillageSpend.factionId,
            villageIds: [...this.feedback.lastSettlerVillageSpend.villageIds],
          }
        : null,
    };
  }

  getPrimaryHumanFactionId(): string | null {
    return Array.from(this.humanControlledFactionIds)[0] ?? null;
  }

  getSaveSnapshot(): SessionSaveSnapshot {
    const playerFactionId = Array.from(this.humanControlledFactionIds)[0] ?? null;
    const playerFaction = playerFactionId ? this.state.factions.get(playerFactionId as never) : null;
    const activeFaction = this.state.activeFactionId
      ? this.state.factions.get(this.state.activeFactionId as never)
      : null;

    return {
      payload: serializeGameState(this.state),
      preview: {
        round: this.state.round,
        turnNumber: this.state.turnNumber,
        activeFactionId: this.state.activeFactionId,
        activeFactionName: activeFaction?.name ?? 'No active faction',
        playerFactionId,
        playerFactionName: playerFaction?.name ?? null,
      },
    };
  }

  dispatch(action: GameAction) {
    switch (action.type) {
      case 'move_unit':
        this.applyMove(action.unitId as UnitId, action.destination);
        return;
      case 'attack_unit':
        this._pendingCombat = this.resolveAttack(action.attackerId as UnitId, action.defenderId as UnitId);
        return;
      case 'end_turn':
        if (this.state.activeFactionId) {
          const activeFactionId = this.state.activeFactionId;
          this.resolveFactionEconomyAndProduction(activeFactionId);
          this.resolveFactionSiege(activeFactionId);
          this.state = applySupplyDeficitPenalties(this.state, activeFactionId as never, this.registry);
          this.state = applyHealingForFaction(this.state, activeFactionId, this.registry);
        }
        this.feedback.lastMove = null;
        this.state = this.refreshFogForAllFactions(advanceTurn(this.state));
        this.feedback.endTurnCount += 1;
        this.feedback.lastActiveFactionId = this.state.activeFactionId;
        this.feedback.lastTurnChange = this.state.activeFactionId
          ? { factionId: this.state.activeFactionId }
          : null;
        this.record('turn', `Turn passed to ${this.getActiveFactionName()}.`);
        this.runAiUntilHumanTurn();
        return;
      case 'set_city_production':
        this.setCityProduction(action.cityId, action.prototypeId);
        return;
      case 'cancel_city_production':
        this.cancelCityProduction(action.cityId);
        return;
      case 'remove_from_queue':
        this.removeFromQueue(action.cityId, action.queueIndex);
        return;
      case 'start_research':
        this.applyStartResearch(action.nodeId);
        return;
      case 'cancel_research':
        this.applyCancelResearch();
        return;
      case 'sacrifice_unit':
        this.applySacrifice(action.unitId);
        return;
      case 'build_fort':
        this.applyBuildFort(action.unitId);
        return;
      case 'build_city':
        this.applyBuildCity(action.unitId);
        return;
      default:
        return;
    }
  }

  getLegalMoves(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || unit.hp <= 0 || unit.factionId !== this.state.activeFactionId || !this.state.map) {
      return [];
    }

    return this.buildReachableMoves(unit.id);
  }

  getAttackTargets(unitId: string): AttackTargetView[] {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || unit.hp <= 0 || unit.factionId !== this.state.activeFactionId || unit.attacksRemaining <= 0) {
      return [];
    }

    const prototype = this.state.prototypes.get(unit.prototypeId as never);
    const attackRange = prototype?.derivedStats.range ?? 1;
    const chassis = prototype ? this.registry.getChassis(prototype.chassisId) : null;
    const isNavalUnit = chassis?.movementClass === 'naval';

    // Check amphibious assault doctrine
    const faction = this.state.factions.get(unit.factionId);
    const research = this.state.research.get(unit.factionId);
    const doctrine = research
      ? resolveCapabilityDoctrine(research, faction)
      : undefined;
    const canAmphibiousAssault = isNavalUnit && doctrine?.amphibiousAssaultEnabled === true;

    return Array.from(this.state.units.values())
      .filter((candidate) => candidate.hp > 0 && candidate.factionId !== unit.factionId)
      .filter((candidate) => hexDistance(unit.position, candidate.position) <= attackRange)
      .filter((candidate) => {
        // Naval units can normally only attack targets on water
        // With amphibious assault, they can attack land units adjacent to water
        if (isNavalUnit && !canAmphibiousAssault) {
          const candidateTile = this.state.map?.tiles.get(hexToKey(candidate.position));
          const candidateTerrain = candidateTile?.terrain ?? '';
          return candidateTerrain === 'coast' || candidateTerrain === 'river';
        }
        return true;
      })
      .map((candidate) => ({
        key: `${candidate.position.q},${candidate.position.r}`,
        q: candidate.position.q,
        r: candidate.position.r,
        unitId: candidate.id,
        distance: hexDistance(unit.position, candidate.position),
      }))
      .sort((left, right) => left.distance - right.distance || left.q - right.q || left.r - right.r);
  }

  private bootstrap(source: PlayStateSource) {
    let state = source.type === 'serialized'
      ? deserializeGameState(source.payload)
      : buildMvpScenario(source.seed ?? 42, {
          registry: this.registry,
          mapMode: source.mapMode ?? this.mapMode,
          mapSize: source.mapSize ?? this.mapSize,
          selectedFactionIds: source.selectedFactionIds ?? this.selectedFactions,
          settlerStartFactionIds: Array.from(this.humanControlledFactionIds),
        });

    state = state.activeFactionId ? state : advanceTurn(state);

    return this.refreshFogForAllFactions(state);
  }

  private applyMove(unitId: UnitId, destination: { q: number; r: number }) {
    const unit = this.state.units.get(unitId);
    if (!unit || !this.state.map) {
      return;
    }

    if (unit.factionId !== this.state.activeFactionId) {
      return;
    }

    const plan = this.buildReachableMoves(unitId).find((entry) => entry.key === `${destination.q},${destination.r}`);
    if (!plan) {
      return;
    }

    let nextState = this.state;
    for (const step of plan.path.slice(1)) {
      nextState = moveUnit(nextState, unitId, step, nextState.map!, this.registry);
    }

    this.state = this.refreshFogForAllFactions(nextState);
    const movedUnit = this.state.units.get(unitId);
    if (movedUnit) {
      this.feedback.moveCount += 1;
      this.feedback.lastMove = {
        unitId,
        destination,
      };
      this.feedback.lastTurnChange = null;
      this.record('move', `${this.getPrototypeName(movedUnit.prototypeId)} moved to ${destination.q},${destination.r}.`);
    }
  }

  private buildReachableMoves(unitId: UnitId): ReachableHexView[] {
    const unit = this.state.units.get(unitId);
    const map = this.state.map;
    if (!unit || !map) {
      return [];
    }

    type FrontierNode = {
      state: GameState;
      path: Array<{ q: number; r: number }>;
    };

    const start = { q: unit.position.q, r: unit.position.r };
    const frontier: FrontierNode[] = [{ state: this.state, path: [start] }];
    const bestRemainingByKey = new Map<string, number>([[`${start.q},${start.r}`, unit.movesRemaining]]);
    const movesByKey = new Map<string, ReachableHexView>();

    while (frontier.length > 0) {
      frontier.sort((left, right) => {
        const leftUnit = left.state.units.get(unitId)!;
        const rightUnit = right.state.units.get(unitId)!;
        return rightUnit.movesRemaining - leftUnit.movesRemaining;
      });

      const current = frontier.shift()!;
      for (const hex of getValidMoves(current.state, unitId, map, this.registry)) {
        if (current.path.some((step) => step.q === hex.q && step.r === hex.r)) {
          continue;
        }

        const preview = previewMove(current.state, unitId, hex, map, this.registry);
        if (!preview) {
          continue;
        }

        const nextState = moveUnit(current.state, unitId, hex, map, this.registry);
        const movedUnit = nextState.units.get(unitId);
        if (!movedUnit) {
          continue;
        }

        const key = `${hex.q},${hex.r}`;
        const path = [...current.path, { q: hex.q, r: hex.r }];
        const candidate: ReachableHexView = {
          key,
          q: hex.q,
          r: hex.r,
          cost: unit.movesRemaining - movedUnit.movesRemaining,
          movesRemainingAfterMove: movedUnit.movesRemaining,
          path,
        };

        const previous = movesByKey.get(key);
        if (
          !previous
          || candidate.movesRemainingAfterMove > previous.movesRemainingAfterMove
          || (
            candidate.movesRemainingAfterMove === previous.movesRemainingAfterMove
            && candidate.path.length < previous.path.length
          )
        ) {
          movesByKey.set(key, candidate);
        }

        const bestRemaining = bestRemainingByKey.get(key) ?? -1;
        if (movedUnit.movesRemaining <= bestRemaining) {
          continue;
        }

        bestRemainingByKey.set(key, movedUnit.movesRemaining);
        frontier.push({ state: nextState, path });
      }
    }

    movesByKey.delete(`${start.q},${start.r}`);
    return [...movesByKey.values()].sort((left, right) => left.cost - right.cost || left.path.length - right.path.length);
  }

  /**
   * Phase 1: Resolve combat mathematically but do NOT mutate game state.
   * Returns PendingCombat data for the animator to use, or null if illegal.
   */
  resolveAttack(attackerId: UnitId, defenderId: UnitId): PendingCombat | null {
    const attacker = this.state.units.get(attackerId);
    const defender = this.state.units.get(defenderId);
    if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0 || !this.state.map) {
      return null;
    }

    if (attacker.factionId !== this.state.activeFactionId || defender.factionId === attacker.factionId || attacker.attacksRemaining <= 0) {
      return null;
    }

    const legalTarget = this.getAttackTargets(attackerId).find((target) => target.unitId === defenderId);
    if (!legalTarget) {
      return null;
    }

    const attackerPrototype = this.state.prototypes.get(attacker.prototypeId as never);
    const defenderPrototype = this.state.prototypes.get(defender.prototypeId as never);
    if (!attackerPrototype || !defenderPrototype) {
      return null;
    }

    const attackerTerrainId = this.state.map.tiles.get(hexToKey(attacker.position))?.terrain ?? 'plains';
    const defenderTerrainId = this.state.map.tiles.get(hexToKey(defender.position))?.terrain ?? 'plains';
    const attackerTerrain = this.registry.getTerrain(attackerTerrainId);
    const defenderTerrain = this.registry.getTerrain(defenderTerrainId);
    const attackerFaction = this.state.factions.get(attacker.factionId);
    const defenderFaction = this.state.factions.get(defender.factionId);
    const attackerDoctrine = attackerFaction
      ? resolveCapabilityDoctrine(this.state.research.get(attacker.factionId), attackerFaction)
      : undefined;
    const canChargeAttack =
      (attackerPrototype.derivedStats.range ?? 1) <= 1
      && (canUseCharge(attackerPrototype) || attackerDoctrine?.chargeTranscendenceEnabled === true);
    const isChargeAttack = canChargeAttack
      && (
        attackerDoctrine?.chargeTranscendenceEnabled === true
        || attacker.movesRemaining < attacker.maxMoves
      );
    const attackModifier =
      getCombatAttackModifier(attackerFaction, attackerTerrain, defenderTerrain)
      + (isChargeAttack ? 0.15 : 0);
    const result = resolveCombat(
      attacker,
      defender,
      attackerPrototype,
      defenderPrototype,
      getVeteranStatBonus(this.registry, attacker.veteranLevel),
      getVeteranDefenseBonus(this.registry, defender.veteranLevel),
      attackerTerrain,
      defenderTerrain,
      this.getImprovementBonus(defender.position),
      getVeteranMoraleBonus(this.registry, defender.veteranLevel),
      this.registry,
      0,
      attackModifier,
      getCombatDefenseModifier(defenderFaction, defenderTerrain),
      this.state.rngState,
      0,
      0,
      0,
      0,
      1,
      0,
      isChargeAttack,
    );

    // Build the combat event (same logic as before, but state is NOT mutated yet)
    const triggeredEffects: ReplayCombatEvent['breakdown']['triggeredEffects'] = [];

    if (result.flankingBonus !== 0) {
      triggeredEffects.push({
        label: 'Flanking',
        detail: `Attacked from the side (${(result.flankingBonus * 100).toFixed(0)}%)`,
        category: 'positioning',
      });
    }
    if (result.rearAttackBonus !== 0) {
      triggeredEffects.push({
        label: 'Rear Attack',
        detail: `Struck from behind (${(result.rearAttackBonus * 100).toFixed(0)}%)`,
        category: 'positioning',
      });
    }
    if (result.roleModifier !== 0) {
      const sign = result.roleModifier > 0 ? '+' : '';
      triggeredEffects.push({
        label: 'Role Effectiveness',
        detail: `${attackerPrototype.derivedStats.role ?? 'unknown'} vs ${defenderPrototype.derivedStats.role ?? 'unknown'}: ${sign}${(result.roleModifier * 100).toFixed(0)}%`,
        category: 'positioning',
      });
    }
    if (result.weaponModifier !== 0) {
      const sign = result.weaponModifier > 0 ? '+' : '';
      triggeredEffects.push({
        label: 'Weapon Effectiveness',
        detail: `${sign}${(result.weaponModifier * 100).toFixed(0)}%`,
        category: 'ability',
      });
    }
    if (result.braceDefenseBonus !== 0) {
      triggeredEffects.push({
        label: 'Brace Defense',
        detail: `Defender braced (+${(result.braceDefenseBonus * 100).toFixed(0)}%)`,
        category: 'positioning',
      });
    }
    if (result.ambushAttackBonus !== 0) {
      triggeredEffects.push({
        label: 'Ambush Attack',
        detail: `+${(result.ambushAttackBonus * 100).toFixed(0)}%`,
        category: 'positioning',
      });
    }
    if (result.hiddenAttackBonus !== 0) {
      triggeredEffects.push({
        label: 'Hidden Attack',
        detail: `+${(result.hiddenAttackBonus * 100).toFixed(0)}%`,
        category: 'ability',
      });
    }

    for (const signal of result.signals) {
      if (signal.startsWith('synergy:')) {
        triggeredEffects.push({ label: 'Synergy', detail: signal.replace('synergy:', ''), category: 'synergy' });
      } else if (signal.startsWith('terrain:')) {
        triggeredEffects.push({ label: 'Terrain', detail: signal.replace('terrain:', ''), category: 'positioning' });
      } else if (signal.startsWith('charge:')) {
        triggeredEffects.push({ label: 'Charge', detail: signal.replace('charge:', ''), category: 'ability' });
      } else if (signal.startsWith('aftermath:')) {
        triggeredEffects.push({ label: 'Aftermath', detail: signal.replace('aftermath:', ''), category: 'aftermath' });
      }
    }

    const combatEvent: ReplayCombatEvent = {
      round: this.state.round,
      attackerUnitId: attacker.id,
      defenderUnitId: defender.id,
      attackerFactionId: attacker.factionId,
      defenderFactionId: defender.factionId,
      attackerPrototypeName: attackerPrototype.name,
      defenderPrototypeName: defenderPrototype.name,
      attackerDamage: result.attackerDamage,
      defenderDamage: result.defenderDamage,
      attackerDestroyed: result.attackerDestroyed,
      defenderDestroyed: result.defenderDestroyed,
      attackerRouted: result.attackerRouted,
      defenderRouted: result.defenderRouted,
      attackerFled: result.attackerFled,
      defenderFled: result.defenderFled,
      summary: `${attackerPrototype.name} attacked ${defenderPrototype.name}`,
      breakdown: {
        modifiers: {
          flankingBonus: result.flankingBonus,
          stealthAmbushBonus: 0,
          rearAttackBonus: result.rearAttackBonus,
          finalAttackStrength: result.attackStrength,
          finalDefenseStrength: result.defenseStrength,
        },
        outcome: {
          attackerDamage: result.attackerDamage,
          defenderDamage: result.defenderDamage,
        },
        triggeredEffects,
      },
    };

    return { attackerId, defenderId, result, combatEvent };
  }

  /**
   * Phase 2: Actually apply a pre-resolved combat result to game state.
   * Called after animation completes (human) or immediately (AI).
   */
  applyResolvedCombat(pending: PendingCombat): void {
    const { attackerId, defenderId, result, combatEvent } = pending;
    const attacker = this.state.units.get(attackerId);
    const defender = this.state.units.get(defenderId);
    // Units may have been removed between resolve and apply (edge case); guard
    if (!attacker || !defender) return;

    const nextUnits = new Map(this.state.units);
    let nextAttacker: Unit = {
      ...attacker,
      hp: Math.max(0, attacker.hp - result.attackerDamage),
      morale: Math.max(0, attacker.morale - result.attackerMoraleLoss),
      routed: result.attackerRouted || result.attackerFled,
      attacksRemaining: 0,
      movesRemaining: 0,
      status: 'spent' as const,
    } as Unit;

    // Hit and Run: if attacker survives and has the capability, auto-retreat 1 hex
    const attackerPrototype = this.state.prototypes.get(attacker.prototypeId);
    if (nextAttacker.hp > 0 && attackerPrototype) {
      const attackerFaction = this.state.factions.get(attacker.factionId);
      const attackerDoctrine = attackerFaction
        ? resolveCapabilityDoctrine(this.state.research.get(attacker.factionId), attackerFaction)
        : undefined;
      const hitAndRunEligible =
        attackerDoctrine?.universalHitAndRunEnabled === true
        || (attackerDoctrine?.hitAndRunEnabled === true
            && attackerPrototype.tags?.includes('cavalry') === true
            && attackerPrototype.tags?.includes('skirmish') === true);
      if (hitAndRunEligible) {
        const retreatHex = findRetreatHex(nextAttacker, this.state);
        if (retreatHex) {
          nextAttacker = {
            ...nextAttacker,
            position: retreatHex,
            status: 'ready',
            movesRemaining: Math.max(0, nextAttacker.movesRemaining - 1),
          };
          this.feedback.hitAndRunRetreat = { unitId: attackerId, to: retreatHex };
        }
      }
    }

    // Learn-by-kill: check BEFORE promotion so chance is based on pre-combat veterancy
    if (result.defenderDestroyed && !result.attackerDestroyed && nextAttacker.hp > 0) {
      const learnResult = tryLearnFromKill(nextAttacker, defender, this.state, this.state.rngState);
      nextAttacker = learnResult.unit;
      if (learnResult.learned && learnResult.domainId) {
        this.feedback.lastLearnedDomain = {
          unitId: nextAttacker.id,
          domainId: learnResult.domainId,
        };
        this.record('turn', `${learnResult.domainId} ability learned from ${defender.factionId}!`);
      }
    }

    // Award XP for combat participation and try promotion (after learn roll)
    if (nextAttacker.hp > 0) {
      nextAttacker = awardCombatXP(nextAttacker, result.defenderDestroyed, !result.attackerDestroyed);
      nextAttacker = tryPromoteUnit(nextAttacker, this.registry);
    }

    const nextDefender = {
      ...defender,
      hp: Math.max(0, defender.hp - result.defenderDamage),
      morale: Math.max(0, defender.morale - result.defenderMoraleLoss),
      routed: result.defenderRouted || result.defenderFled,
      status: result.defenderDestroyed ? ('spent' as const) : defender.status,
    };

    if (nextAttacker.hp > 0) {
      nextUnits.set(attackerId, nextAttacker);
    } else {
      nextUnits.delete(attackerId);
    }

    if (nextDefender.hp > 0) {
      nextUnits.set(defenderId, nextDefender);
    } else {
      nextUnits.delete(defenderId);
    }

    this.state = {
      ...this.state,
      units: nextUnits,
      factions: this.removeDeadUnitsFromFactions(nextUnits),
      rngState: result.rngState,
    };
    const attackerFaction = this.state.factions.get(attacker.factionId);
    const attackerDoctrine = attackerFaction
      ? resolveCapabilityDoctrine(this.state.research.get(attacker.factionId), attackerFaction)
      : undefined;
    if (result.defenderFled && nextAttacker.hp > 0 && attackerDoctrine?.captureRetreatEnabled) {
      const retreatCapture = attemptNonCombatCapture(
        this.state,
        attackerId,
        defenderId,
        this.registry,
        0.15,
        0.25,
        0,
        this.state.rngState,
      );
      this.state = retreatCapture.state;
    }
    this.state = applyCombatSignals(this.state, attacker.factionId, result.signals);
    this.state = unlockHybridRecipes(this.state, attacker.factionId, this.registry);
    this.state = this.refreshFogForAllFactions(this.state);
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;

    // Keep last 20 events, newest first
    this.feedback.liveCombatEvents = [combatEvent, ...this.feedback.liveCombatEvents].slice(0, 20);

    this.record(
      'combat',
      `${combatEvent.attackerPrototypeName} attacked ${combatEvent.defenderPrototypeName}: dealt ${result.defenderDamage}, took ${result.attackerDamage}.`,
    );
  }

  getPendingCombat(): PendingCombat | null {
    return this._pendingCombat;
  }

  clearPendingCombat(): void {
    this._pendingCombat = null;
  }

  dequeueAiCombat(): PendingCombat | null {
    const next = this._aiCombatQueue.shift() ?? null;
    if (next) {
      this._pendingCombat = next;
    }
    return next;
  }

  getAiCombatQueueLength(): number {
    return this._aiCombatQueue.length;
  }

  private getImprovementBonus(position: { q: number; r: number }) {
    // Check improvements first (e.g. field forts)
    for (const improvement of this.state.improvements.values()) {
      if (improvement.position.q === position.q && improvement.position.r === position.r) {
        return improvement.defenseBonus ?? 0;
      }
    }
    // Cities give +100% defense
    for (const [, city] of this.state.cities) {
      if (city.position.q === position.q && city.position.r === position.r) {
        return 1;
      }
    }
    // Villages give +50% defense
    for (const [, village] of this.state.villages) {
      if (village.position.q === position.q && village.position.r === position.r) {
        return 0.5;
      }
    }

    return 0;
  }

  private refreshFogForAllFactions(state: GameState) {
    let nextState = state;
    for (const fid of nextState.factions.keys()) {
      nextState = updateFogState(nextState, fid);
    }
    return nextState;
  }

  private removeDeadUnitsFromFactions(nextUnits: GameState['units']) {
    const nextFactions = new Map(this.state.factions);
    for (const [factionId, faction] of nextFactions.entries()) {
      nextFactions.set(factionId, {
        ...faction,
        unitIds: faction.unitIds.filter((unitId) => nextUnits.has(unitId as UnitId)),
      });
    }
    return nextFactions;
  }

  private getPrototypeName(prototypeId: string) {
    return this.state.prototypes.get(prototypeId as never)?.name ?? prototypeId;
  }

  private getActiveFactionName() {
    const activeFactionId = this.state.activeFactionId;
    if (!activeFactionId) {
      return 'no faction';
    }

    return this.state.factions.get(activeFactionId)?.name ?? activeFactionId;
  }

  private isHumanControlledFaction(factionId: string | null) {
    return factionId !== null && this.humanControlledFactionIds.has(factionId);
  }

  /** Check if a combat involves any human-controlled faction */
  isCombatInvolvesHuman(attackerFactionId: string, defenderFactionId: string): boolean {
    return this.isHumanControlledFaction(attackerFactionId) || this.isHumanControlledFaction(defenderFactionId);
  }

  private runAiUntilHumanTurn() {
    let safety = 0;
    while (this.state.activeFactionId && !this.isHumanControlledFaction(this.state.activeFactionId)) {
      if (safety >= 32) {
        this.record('turn', 'AI turn loop stopped early due to safety guard.');
        break;
      }

      this.runAiTurn(this.state.activeFactionId);
      safety += 1;
    }
  }

  private runAiTurn(factionId: string) {
    if (this.state.activeFactionId !== factionId) {
      return;
    }

    const strategy = computeFactionStrategy(this.state, factionId as never, this.registry, this.difficulty);
    this.state = {
      ...this.state,
      factionStrategies: new Map(this.state.factionStrategies).set(factionId as never, strategy),
    };
    const fortsBuiltThisTurn = new Set<string>();

    for (const unitId of this.getAiUnitIds(factionId)) {
      const unit = this.state.units.get(unitId as never);
      if (!unit || unit.hp <= 0 || unit.factionId !== factionId || unit.status !== 'ready') {
        continue;
      }

      if (this.tryAiAttack(unit.id, strategy)) {
        continue;
      }

      if (this.tryAiBuildFort(unit.id, strategy, fortsBuiltThisTurn)) {
        continue;
      }

      const moved = this.tryAiMove(unit.id, strategy);
      if (moved) {
        this.tryAiAttack(unit.id, strategy);
      }
    }

    this.feedback.lastMove = null;
    this.resolveFactionEconomyAndProduction(factionId);
    this.resolveFactionSiege(factionId);
    this.state = applySupplyDeficitPenalties(this.state, factionId as never, this.registry);
    this.state = applyHealingForFaction(this.state, factionId as never, this.registry);
    this.state = this.refreshFogForAllFactions(advanceTurn(this.state));
    this.feedback.lastActiveFactionId = this.state.activeFactionId;
    this.feedback.lastTurnChange = this.state.activeFactionId
      ? { factionId: this.state.activeFactionId }
      : null;
    this.record('turn', `Turn passed to ${this.getActiveFactionName()}.`);
  }

  private setCityProduction(cityId: string, prototypeId: string) {
    const city = this.state.cities.get(cityId as never);
    if (!city || city.factionId !== this.state.activeFactionId || !this.isHumanControlledFaction(city.factionId) || city.besieged) {
      return;
    }

    this.state = unlockHybridRecipes(this.state, city.factionId, this.registry);

    const prototype = this.state.prototypes.get(prototypeId as never);
    if (!prototype || !canProducePrototype(this.state, city.factionId, prototype.id, this.registry)) {
      return;
    }

    const costType = getPrototypeCostType(prototype);
    if (costType === 'villages' && !canPaySettlerVillageCost(this.state, city.factionId)) {
      return;
    }
    const updatedCity = queueUnit(
      city,
      prototype.id,
      prototype.chassisId,
      costType === 'villages' ? getPrototypeQueueCost(prototype) : this.getPrototypeCost(prototype.id),
      costType,
    );
    const nextCities = new Map(this.state.cities);
    nextCities.set(city.id, updatedCity);
    this.state = { ...this.state, cities: nextCities };
    this.record('turn', `${city.name} began training ${prototype.name}.`);
  }

  private cancelCityProduction(cityId: string) {
    const city = this.state.cities.get(cityId as never);
    if (!city || city.factionId !== this.state.activeFactionId || !this.isHumanControlledFaction(city.factionId) || city.besieged) return;
    if (!city.currentProduction) return;

    const { city: updatedCity } = cancelCurrentProduction(city);
    const nextCities = new Map(this.state.cities);
    nextCities.set(city.id, updatedCity);
    this.state = { ...this.state, cities: nextCities };
    this.record('turn', `${city.name} cancelled production.`);
  }

  private removeFromQueue(cityId: string, queueIndex: number) {
    const city = this.state.cities.get(cityId as never);
    if (!city || city.factionId !== this.state.activeFactionId || !this.isHumanControlledFaction(city.factionId)) return;

    const updatedCity = removeFromQueue(city, queueIndex);
    const nextCities = new Map(this.state.cities);
    nextCities.set(city.id, updatedCity);
    this.state = { ...this.state, cities: nextCities };
  }

  private applyStartResearch(nodeId: string) {
    const factionId = this.state.activeFactionId;
    if (!factionId || !this.isHumanControlledFaction(factionId)) return;

    const research = this.state.research.get(factionId as never);
    const faction = this.state.factions.get(factionId as never);
    if (!research || !faction) return;

    // Extract domain from nodeId (e.g. "charge_t2" -> "charge")
    const domainId = nodeId.split('_t')[0];
    const nodeDef = this.registry.getResearchNode(domainId, nodeId);
    if (!nodeDef) return;

    if (!faction.learnedDomains?.includes(domainId)) return;

    const updated = startResearch(
      research,
      nodeId as never,
      nodeDef.prerequisites,
      faction.learnedDomains,
    );
    const nextResearch = new Map(this.state.research);
    nextResearch.set(factionId as never, updated);
    this.state = { ...this.state, research: nextResearch };
    this.record('turn', `Research started: ${nodeDef.name}.`);
  }

  private applyCancelResearch() {
    const factionId = this.state.activeFactionId;
    if (!factionId || !this.isHumanControlledFaction(factionId)) return;

    const research = this.state.research.get(factionId as never);
    if (!research || !research.activeNodeId) return;

    const domainId = research.activeNodeId.split('_t')[0];
    const nodeDef = this.registry.getResearchNode(domainId, research.activeNodeId);
    const nodeName = nodeDef?.name ?? research.activeNodeId;

    const updated = { ...research, activeNodeId: null };
    const nextResearch = new Map(this.state.research);
    nextResearch.set(factionId as never, updated);
    this.state = { ...this.state, research: nextResearch };
    this.record('turn', `Research cancelled: ${nodeName}.`);
  }

  private applySacrifice(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.activeFactionId) return;

    const faction = this.state.factions.get(unit.factionId);
    if (!faction || unit.factionId !== this.state.activeFactionId) return;

    const learnedAbilities = unit.learnedAbilities ?? [];
    if (learnedAbilities.length === 0) return;

    const unitName = this.getPrototypeName(unit.prototypeId);
    const domains = learnedAbilities.map((a) => a.domainId);

    this.state = performSacrifice(unitId as UnitId, unit.factionId, this.state, this.registry);
    this.state = unlockHybridRecipes(this.state, unit.factionId, this.registry);
    this.feedback.lastSacrifice = { unitId, unitName, domains };
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record(
      'turn',
      `${unitName} sacrificed - unlocked domains: ${domains.join(', ')}.`,
    );
  }

  private applyBuildFort(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.activeFactionId || unit.factionId !== this.state.activeFactionId) {
      return;
    }

    const faction = this.state.factions.get(unit.factionId);
    if (!faction || faction.id !== 'hill_clan') {
      return;
    }

    const fortEligibility = this.getFortBuildEligibility(unit);
    if (!fortEligibility.canBuild) {
      return;
    }

    this.state = this.buildFortAtUnit(unit, fortEligibility.defenseBonus);
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record('turn', `${this.getPrototypeName(unit.prototypeId)} built a field fort at ${unit.position.q},${unit.position.r}.`);
  }

  private applyBuildCity(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.activeFactionId || unit.factionId !== this.state.activeFactionId || !this.state.map) {
      return;
    }

    const faction = this.state.factions.get(unit.factionId);
    const prototype = this.state.prototypes.get(unit.prototypeId as never);
    if (!faction || !prototype || !this.isHumanControlledFaction(unit.factionId)) {
      return;
    }
    if (!prototype.tags?.includes('settler') || unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
      return;
    }

    if (getSettlementOccupancyBlocker(this.state, unit.position)) {
      return;
    }

    const cityId = createCityId();
    const cityName = faction.homeCityId ? `${faction.name} Settlement` : `${faction.name} Capital`;
    const cities = new Map(this.state.cities);
    cities.set(cityId, {
      id: cityId,
      factionId: unit.factionId,
      position: { ...unit.position },
      name: cityName,
      productionQueue: [],
      productionProgress: 0,
      territoryRadius: 2,
      wallHP: 100,
      maxWallHP: 100,
      besieged: false,
      turnsUnderSiege: 0,
      isCapital: !faction.homeCityId,
      siteBonuses: createCitySiteBonuses(this.state.map, unit.position, 2),
    });

    const units = new Map(this.state.units);
    units.delete(unitId as UnitId);
    const factions = new Map(this.state.factions);
    factions.set(unit.factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((id) => id !== unitId),
      cityIds: [...new Set([...faction.cityIds, cityId])],
      homeCityId: faction.homeCityId ?? cityId,
    });

    this.state = syncFactionSettlementIds({
      ...this.state,
      cities,
      units,
      factions,
    }, unit.factionId);
    this.state = this.refreshFogForAllFactions(this.state);
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record('turn', `${faction.name} founded ${cityName} at ${unit.position.q},${unit.position.r}.`);
  }

  private resolveFactionEconomyAndProduction(factionId: string) {
    this.resolveFactionResearch(factionId);
    const spentVillageIds: string[] = [];
    this.feedback.lastSettlerVillageSpend = null;

    // Advance capture ramp timers before deriving income
    this.state = advanceCaptureTimers(this.state, factionId as never);

    const economy = deriveResourceIncome(this.state, factionId as never, this.registry);
    let nextState: GameState = {
      ...this.state,
      economy: new Map(this.state.economy).set(factionId as never, economy),
    };

    const cityIds = getFactionCityIds(nextState, factionId as never);
    const cityCount = cityIds.length;
    if (cityCount === 0) {
      this.state = nextState;
      return;
    }

    const cityProductionIncome = economy.productionPool / cityCount;
    for (const cityId of cityIds) {
      let city = nextState.cities.get(cityId);
      if (!city || city.besieged) {
        continue;
      }

      // Auto-queue production for AI cities with idle queues
      if (!city.currentProduction && city.productionQueue.length === 0) {
        const existingStrategy = this.state.factionStrategies.get(factionId as never);
        if (existingStrategy) {
          const choice = chooseStrategicProduction(
            nextState,
            factionId as never,
            existingStrategy,
            this.registry,
            this.difficulty,
          );
          if (choice) {
            city = queueUnit(city, choice.prototypeId, choice.chassisId, choice.cost, choice.costType);
            this.record('turn', `${city.name} queued ${choice.prototypeId} (${choice.reason})`);
            const cities = new Map(nextState.cities);
            cities.set(cityId, city);
            nextState = { ...nextState, cities };
          }
        }
      }

      if (!city.currentProduction) {
        continue;
      }

      let updatedCity = advanceProduction(city, cityProductionIncome);
      let updatedEconomy = nextState.economy.get(factionId as never) ?? economy;
      if (canCompleteCurrentProduction(nextState, cityId as never, this.registry)) {
        const spentProduction = city.currentProduction?.costType === 'villages'
          ? 0
          : city.currentProduction?.cost ?? 0;
        const spentVillageIdsForCity = city.currentProduction?.costType === 'villages'
          ? getNearestFactionVillageIds(nextState, city.factionId, city.position, city.currentProduction.cost)
          : [];
        const cities = new Map(nextState.cities);
        cities.set(cityId, updatedCity);
        nextState = { ...nextState, cities };
        nextState = completeProduction(nextState, cityId as never, this.registry);
        if (spentVillageIdsForCity.length > 0) {
          spentVillageIds.push(...spentVillageIdsForCity);
        }
        updatedEconomy = {
          ...updatedEconomy,
          productionPool: Math.max(0, updatedEconomy.productionPool - spentProduction),
        };
      } else {
        const cities = new Map(nextState.cities);
        cities.set(cityId, updatedCity);
        nextState = { ...nextState, cities };
      }

      nextState = {
        ...nextState,
        economy: new Map(nextState.economy).set(factionId as never, updatedEconomy),
      };
    }

    nextState = evaluateAndSpawnVillage(nextState, factionId as never, this.registry);
    this.state = nextState;
    if (spentVillageIds.length > 0) {
      this.feedback.lastSettlerVillageSpend = {
        factionId,
        villageIds: [...new Set(spentVillageIds)],
      };
    }
  }

  private resolveFactionSiege(factionId: string) {
    let nextState = this.state;
    let siegeCities = new Map(nextState.cities);

    for (const [cityId, city] of siegeCities) {
      if (city.factionId !== factionId) {
        continue;
      }

      if (city.besieged) {
        if (isEncirclementBroken(city, nextState)) {
          siegeCities.set(cityId, { ...city, besieged: false, turnsUnderSiege: 0 });
          this.record('turn', `${city.name} siege broken.`);
          continue;
        }

        const degradedCity = degradeWalls(city, city.factionId === 'coral_people');
        const updatedSiegeCity = {
          ...degradedCity,
          turnsUnderSiege: city.turnsUnderSiege + 1,
        };
        siegeCities.set(cityId, updatedSiegeCity);

        if (isCityVulnerable(updatedSiegeCity, nextState)) {
          const capturingFaction = getCapturingFaction(updatedSiegeCity, nextState);
          if (capturingFaction) {
            nextState = captureCity(updatedSiegeCity, capturingFaction, nextState);
            siegeCities = new Map(nextState.cities);
            this.record('turn', `${city.name} captured by ${capturingFaction}.`);
            continue;
          }
        }

        const warExhaustion = nextState.warExhaustion.get(factionId as never);
        if (warExhaustion) {
          nextState = {
            ...nextState,
            warExhaustion: new Map(nextState.warExhaustion).set(
              factionId as never,
              addExhaustion(warExhaustion, EXHAUSTION_CONFIG.BESIEGED_CITY_PER_TURN),
            ),
          };
        }

        continue;
      }

      const repairedCity = repairWalls(city);
      if (repairedCity.wallHP !== city.wallHP) {
        siegeCities.set(cityId, repairedCity);
      }

      if (isCityEncircled(city, nextState)) {
        siegeCities.set(cityId, {
          ...(siegeCities.get(cityId) ?? city),
          besieged: true,
          turnsUnderSiege: 1,
        });
        this.record('turn', `${city.name} is now besieged.`);
      }
    }

    this.state = {
      ...nextState,
      cities: siegeCities,
    };
  }

  private resolveFactionResearch(factionId: string) {
    const faction = this.state.factions.get(factionId as never);
    let research = this.state.research.get(factionId as never);
    if (!faction || !research) {
      return;
    }

    // Auto-start research if idle — uses same AI decision-making as the simulation
    if (!research.activeNodeId) {
      const strategy = computeFactionStrategy(this.state, factionId as never, this.registry, this.difficulty);
      const decision = chooseStrategicResearch(this.state, factionId as never, strategy, this.registry);
      if (decision) {
        const domainId = decision.nodeId.split('_t')[0];
        const nodeDef = this.registry.getResearchNode(domainId, decision.nodeId);
        if (nodeDef) {
          research = startResearch(
            research,
            decision.nodeId as never,
            nodeDef.prerequisites,
            faction.learnedDomains,
          );
          this.state.research.set(factionId as never, research);
        }
      }
    }

    if (!research.activeNodeId) {
      return;
    }

    const domainId = research.activeNodeId.split('_t')[0];
    const nodeDef = this.registry.getResearchNode(domainId, research.activeNodeId);
    if (!nodeDef) {
      return;
    }

    // Use simplified base rate (researchPerTurn), no capability bonus
    const updatedResearch = addResearchProgress(
      research,
      nodeDef.xpCost,
      research.researchPerTurn,
    );

    this.state = {
      ...this.state,
      research: new Map(this.state.research).set(factionId as never, updatedResearch),
    };

    if (updatedResearch.activeNodeId) {
      return;
    }

    this.feedback.lastResearchCompletion = {
      nodeId: nodeDef.id,
      nodeName: nodeDef.name,
      tier: nodeDef.tier ?? 1,
    };
    this.state = unlockHybridRecipes(this.state, factionId as never, this.registry);
  }

  private getPrototypeCost(prototypeId: string) {
    const prototype = this.state.prototypes.get(prototypeId as never);
    if (!prototype) {
      return 10;
    }

    switch (prototype.chassisId) {
      case 'infantry_frame':
        return 8;
      case 'heavy_infantry_frame':
        return 11;
      case 'ranged_frame':
        return 10;
      case 'cavalry_frame':
        return 14;
      case 'naval_frame':
        return 12;
      case 'camel_frame':
        return 10;
      case 'elephant_frame':
        return 14;
      default:
        return 10;
    }
  }

  private getAiUnitIds(factionId: string) {
    return Array.from(this.state.units.values())
      .filter((unit) => unit.factionId === factionId && unit.hp > 0)
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'ready' ? -1 : 1;
        }

        return left.id.localeCompare(right.id);
      })
      .map((unit) => unit.id);
  }

  private tryAiAttack(unitId: string, strategy: FactionStrategy) {
    const target = this.chooseAiAttackTarget(unitId, strategy);
    if (!target) {
      return false;
    }

    const pending = this.resolveAttack(unitId as UnitId, target.unitId as UnitId);
    if (pending) {
      // Queue for visual display instead of immediately applying
      this._aiCombatQueue.push(pending);
      this._pendingCombat = null;
    }
    return !!pending;
  }

  private tryAiMove(unitId: string, strategy: FactionStrategy) {
    const move = this.chooseAiMove(unitId, strategy);
    if (!move) {
      return false;
    }

    this.applyMove(unitId as UnitId, { q: move.q, r: move.r });
    return true;
  }

  private tryAiBuildFort(unitId: string, strategy: FactionStrategy, fortsBuiltThisTurn: Set<string>) {
    const unit = this.state.units.get(unitId as never);
    if (!unit || fortsBuiltThisTurn.has(unit.factionId)) {
      return false;
    }

    const faction = this.state.factions.get(unit.factionId);
    if (!faction || faction.id !== 'hill_clan') {
      return false;
    }

    const fortEligibility = this.getFortBuildEligibility(unit);
    if (!fortEligibility.canBuild) {
      return false;
    }

    const intent = getUnitIntent(strategy, unit.id as never);
    const nearbyPressure = this.getNearbyUnitPressure(unit.factionId, unit.position, unit.id);
    const nearbyFriendlySupport = this.countFriendlyUnitsNearHex(unit.factionId, unit.position, unit.id, 2);
    const terrain = this.state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? 'plains';
    const nearestCity = getNearestFriendlyCity(this.state, unit.factionId, unit.position);
    const cityDistance = nearestCity ? hexDistance(unit.position, nearestCity.position) : 99;
    const nearbyFortCount = this.countFortificationsNearHex(unit.position, 2);
    const isDefensiveAssignment = intent?.assignment === 'defender' || intent?.assignment === 'recovery' || intent?.assignment === 'reserve';
    const underPressure = nearbyPressure.nearbyEnemies > 0;
    const worthwhile =
      nearbyFriendlySupport > 0
      && nearbyFortCount === 0
      && (
        underPressure
        || (isDefensiveAssignment && terrain === 'hill' && cityDistance <= 3)
      );

    if (!worthwhile) {
      return false;
    }

    this.state = this.buildFortAtUnit(unit, fortEligibility.defenseBonus);
    fortsBuiltThisTurn.add(unit.factionId);
    return true;
  }

  private chooseAiAttackTarget(unitId: string, strategy: FactionStrategy) {
    const unit = this.state.units.get(unitId as never);
    const prototype = unit ? this.state.prototypes.get(unit.prototypeId as never) : null;
    if (!unit || !prototype) {
      return null;
    }

    let bestTarget: AttackTargetView | null = null;
    let bestScore = -Infinity;
    const intent = getUnitIntent(strategy, unit.id as never);
    const nearestFriendlyDist = this.getNearestFriendlyDistanceToHex(unit.factionId, unit.position, unit.id);
    const anchorDistance = intent ? hexDistance(unit.position, intent.anchor) : 0;
    const nearbyPressure = this.getNearbyUnitPressure(unit.factionId, unit.position, unit.id);
    const retreatRisk = computeRetreatRisk({
      hpRatio: unit.hp / Math.max(1, unit.maxHp),
      nearbyEnemies: nearbyPressure.nearbyEnemies,
      nearbyFriendlies: nearbyPressure.nearbyFriendlies,
      nearestFriendlyDistance: nearestFriendlyDist,
      anchorDistance,
    });

    for (const target of this.getAttackTargets(unitId)) {
      const targetUnit = this.state.units.get(target.unitId as never);
      const targetPrototype = targetUnit ? this.state.prototypes.get(targetUnit.prototypeId as never) : null;
      if (!targetUnit || !targetPrototype) {
        continue;
      }

      const targetChassis = this.registry.getChassis(targetPrototype.chassisId);
      const targetMovementClass = targetChassis?.movementClass ?? 'infantry';
      const attackerWeaponTags = prototype.componentIds.flatMap((componentId) => {
        const component = this.registry.getComponent(componentId);
        return component?.slotType === 'weapon' ? (component.tags ?? []) : [];
      });

      const strategicScore = scoreStrategicTarget({
        isFocusTarget: strategy.focusTargetUnitIds.includes(targetUnit.id),
        isAdjacentToPrimaryObjectiveCity: Boolean(
          strategy.primaryCityObjectiveId
          && Array.from(this.state.cities.values()).some(
            (city) =>
              city.id === strategy.primaryCityObjectiveId
              && city.factionId !== unit.factionId
              && hexDistance(city.position, targetUnit.position) <= 1,
          ),
        ),
        isRouted: targetUnit.routed,
        hpRatio: targetUnit.hp / Math.max(1, targetUnit.maxHp),
        attacksFromThreatenedCityHex: isThreatenedCityHex(this.state, strategy, unit.position),
        finishOffPriorityTarget: strategy.absorptionGoal.targetFactionId === targetUnit.factionId
          && strategy.absorptionGoal.finishOffPriority,
        isolatedFromAnchor: Boolean(intent && nearestFriendlyDist > 3 && anchorDistance > 4),
      });

      const attackingIntoFort = this.isFortificationHex(targetUnit.position);
      const friendlySupport = this.countFriendlyUnitsNearHex(unit.factionId, targetUnit.position, unit.id, 2);
      const shouldAvoidFortAttack =
        attackingIntoFort
        && friendlySupport === 0
        && targetUnit.hp / Math.max(1, targetUnit.maxHp) > 0.35
        && !targetUnit.routed;
      if (shouldAvoidFortAttack) {
        continue;
      }

      const score = scoreAttackCandidate({
        roleEffectiveness: getRoleEffectiveness(prototype.derivedStats.role, targetPrototype.derivedStats.role),
        weaponEffectiveness: getWeaponEffectiveness(attackerWeaponTags, targetMovementClass),
        reverseRoleEffectiveness: getRoleEffectiveness(targetPrototype.derivedStats.role, prototype.derivedStats.role),
        targetHpRatio: targetUnit.hp / Math.max(1, targetUnit.maxHp),
        targetRouted: targetUnit.routed,
        strategicTargetScore: strategicScore,
        extraScore: attackingIntoFort
          ? (friendlySupport > 0 ? -4 : -18)
          : 0,
      });

      if (!shouldEngageTarget(strategy.personality, { attackScore: score, retreatRisk })) {
        continue;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }

    return bestTarget;
  }

  private chooseAiMove(unitId: string, strategy: FactionStrategy) {
    const unit = this.state.units.get(unitId as never);
    const intent = unit ? this.getAiIntent(strategy, unitId, unit.position) : null;
    if (!unit || !intent) {
      return null;
    }

    const originSupport = getNearbySupportScore(this.state, unit.factionId, unit.position);
    const waypoint = this.resolveAiWaypoint(intent);
    const originWaypointDistance = hexDistance(unit.position, waypoint);
    const originAnchorDistance = hexDistance(unit.position, intent.anchor);
    let bestMove: ReachableHexView | null = null;
    let bestScore = -Infinity;

    for (const move of this.buildReachableMoves(unit.id)) {
      const waypointDistance = hexDistance(move, waypoint);
      const supportScore = getNearbySupportScore(this.state, unit.factionId, move);
      const terrainScore = scoreStrategicTerrain(this.state, unit.factionId, move);
      const anchorDistance = hexDistance(move, intent.anchor);
      const nearestCity = getNearestFriendlyCity(this.state, unit.factionId, move);
      const cityDistance = nearestCity ? hexDistance(move, nearestCity.position) : 99;
      const fortOccupyBonus = this.getFortOccupyMoveBonus(move, intent.assignment);
      const score = scoreMoveCandidate({
        assignment: intent.assignment,
        originWaypointDistance,
        waypointDistance,
        terrainScore: terrainScore + fortOccupyBonus,
        supportScore,
        originSupport,
        originAnchorDistance,
        anchorDistance,
        cityDistance,
        unsafeAfterMove: this.wouldBeUnsafeAfterMove(unit, move, intent),
      });

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestScore > -Infinity ? bestMove : null;
  }

  private getAiIntent(strategy: FactionStrategy, unitId: string, fallbackHex: { q: number; r: number }): UnitStrategicIntent {
    const unit = this.state.units.get(unitId as never);
    const fallbackCity = unit ? getNearestFriendlyCity(this.state, unit.factionId, fallbackHex) : null;
    const fallbackWaypoint = fallbackCity?.position ?? fallbackHex;

    return getUnitIntent(strategy, unitId as never) ?? {
      assignment: 'reserve',
      waypointKind: 'friendly_city',
      waypoint: fallbackWaypoint,
      anchor: fallbackWaypoint,
      isolationScore: 0,
      isolated: false,
      reason: 'fallback movement toward the nearest friendly city',
    };
  }

  private resolveAiWaypoint(intent: UnitStrategicIntent) {
    if (intent.objectiveUnitId) {
      const liveTarget = this.state.units.get(intent.objectiveUnitId as never);
      if (liveTarget && liveTarget.hp > 0) {
        return liveTarget.position;
      }
    }

    if (intent.objectiveCityId) {
      const city = this.state.cities.get(intent.objectiveCityId as never);
      if (city) {
        return city.position;
      }
    }

    return intent.waypoint;
  }

  private getNearestFriendlyDistanceToHex(factionId: string, hex: { q: number; r: number }, excludedUnitId: string) {
    let nearest = Infinity;
    for (const unit of this.state.units.values()) {
      if (unit.factionId !== factionId || unit.hp <= 0 || unit.id === excludedUnitId) {
        continue;
      }

      nearest = Math.min(nearest, hexDistance(unit.position, hex));
    }

    return nearest === Infinity ? 99 : nearest;
  }

  private getNearbyUnitPressure(factionId: string, hex: { q: number; r: number }, excludedUnitId: string) {
    let nearbyEnemies = 0;
    let nearbyFriendlies = 0;
    for (const unit of this.state.units.values()) {
      if (unit.hp <= 0 || unit.id === excludedUnitId) {
        continue;
      }
      if (hexDistance(hex, unit.position) > 2) {
        continue;
      }
      if (unit.factionId === factionId) {
        nearbyFriendlies += 1;
      } else {
        nearbyEnemies += 1;
      }
    }
    return { nearbyEnemies, nearbyFriendlies };
  }

  private getImprovementAtHex(position: { q: number; r: number }) {
    for (const improvement of this.state.improvements.values()) {
      if (improvement.position.q === position.q && improvement.position.r === position.r) {
        return improvement;
      }
    }

    return null;
  }

  private isFortificationHex(position: { q: number; r: number }) {
    return this.getImprovementAtHex(position)?.type === 'fortification';
  }

  private countFriendlyUnitsNearHex(factionId: string, hex: { q: number; r: number }, excludedUnitId: string, radius: number) {
    let count = 0;

    for (const unit of this.state.units.values()) {
      if (unit.id === excludedUnitId || unit.hp <= 0 || unit.factionId !== factionId) {
        continue;
      }
      if (hexDistance(hex, unit.position) <= radius) {
        count += 1;
      }
    }

    return count;
  }

  private countFortificationsNearHex(hex: { q: number; r: number }, radius: number) {
    let count = 0;

    for (const improvement of this.state.improvements.values()) {
      if (improvement.type !== 'fortification') {
        continue;
      }
      if (hexDistance(hex, improvement.position) <= radius) {
        count += 1;
      }
    }

    return count;
  }

  private getFortOccupyMoveBonus(
    move: { q: number; r: number },
    assignment: UnitStrategicIntent['assignment'],
  ) {
    if (!this.isFortificationHex(move)) {
      return 0;
    }

    const isDefensiveAssignment = assignment === 'defender' || assignment === 'recovery' || assignment === 'reserve';
    return isDefensiveAssignment ? 8 : 4;
  }

  private getFortBuildEligibility(unit: Unit) {
    const faction = this.state.factions.get(unit.factionId);
    const research = this.state.research.get(unit.factionId as never);
    const doctrine = faction ? resolveCapabilityDoctrine(research, faction) : undefined;
    if (!faction || faction.id !== 'hill_clan' || !doctrine?.canBuildFieldForts) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    if (unit.hp <= 0 || unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    const prototype = this.state.prototypes.get(unit.prototypeId as never);
    if (!prototype) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    const movementClass = this.registry.getChassis(prototype.chassisId)?.movementClass;
    const role = prototype.derivedStats.role;
    if (!(movementClass === 'infantry' || role === 'ranged')) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    if (this.getImprovementAtHex(unit.position)) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    const fieldFort = this.registry.getImprovement('field_fort');
    return {
      canBuild: true as const,
      defenseBonus: fieldFort?.defenseBonus ?? 1,
    };
  }

  private buildFortAtUnit(unit: Unit, defenseBonus: number) {
    const fortId = createImprovementId();
    const improvements = new Map(this.state.improvements);
    improvements.set(fortId, {
      id: fortId,
      type: 'fortification',
      position: { ...unit.position },
      ownerFactionId: unit.factionId,
      defenseBonus,
    });

    const units = new Map(this.state.units);
    units.set(unit.id, {
      ...unit,
      movesRemaining: 0,
      attacksRemaining: 0,
      status: 'fortified' as const,
    });

    return {
      ...this.state,
      improvements,
      units,
    };
  }

  private wouldBeUnsafeAfterMove(
    unit: Unit,
    move: { q: number; r: number },
    intent: UnitStrategicIntent,
  ) {
    let nearestFriendly = Infinity;
    let nearbyEnemies = 0;

    for (const other of this.state.units.values()) {
      if (other.id === unit.id || other.hp <= 0) {
        continue;
      }

      const distance = hexDistance(move, other.position);
      if (other.factionId === unit.factionId) {
        nearestFriendly = Math.min(nearestFriendly, distance);
      } else if (distance <= 2) {
        nearbyEnemies += 1;
      }
    }

    return nearestFriendly > 3 && hexDistance(move, intent.anchor) > 4 && nearbyEnemies > 0;
  }

  private record(kind: SessionEvent['kind'], message: string) {
    this.feedback.eventSequence += 1;
    this.events.unshift({
      sequence: this.feedback.eventSequence,
      round: this.state.round,
      kind,
      message,
    });
    if (this.events.length > 16) {
      this.events.length = 16;
    }
  }
}
