import Phaser from 'phaser';
import type { GameController } from '../../controller/GameController';
import type { ClientState } from '../../types/clientState';
import type { UnitView } from '../../types/worldView';
import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from '../assets/keys';
import { BorderRenderer } from '../systems/BorderRenderer';
import { CombatAnimator } from '../systems/CombatAnimator';
import { FogRenderer } from '../systems/FogRenderer';
import { ImprovementRenderer } from '../systems/ImprovementRenderer';
import { PathRenderer } from '../systems/PathRenderer';
import { SelectionRenderer } from '../systems/SelectionRenderer';
import { SettlementRenderer } from '../systems/SettlementRenderer';
import { TileLayerRenderer } from '../systems/TileLayerRenderer';
import { UnitRenderer } from '../systems/UnitRenderer';

export class MapScene extends Phaser.Scene {
  private unsubscribe: (() => void) | null = null;
  private tileLayer!: Phaser.GameObjects.Container;
  private borderLayer!: Phaser.GameObjects.Container;
  private settlementLayer!: Phaser.GameObjects.Container;
  private improvementLayer!: Phaser.GameObjects.Container;
  private pathLayer!: Phaser.GameObjects.Container;
  private unitLayer!: Phaser.GameObjects.Container;
  private combatOverlayLayer!: Phaser.GameObjects.Container;
  private selectionLayer!: Phaser.GameObjects.Container;
  private fogLayer!: Phaser.GameObjects.Container;
  private combatAnimator!: CombatAnimator;
  private tileRenderer!: TileLayerRenderer;
  private borderRenderer!: BorderRenderer;
  private settlementRenderer!: SettlementRenderer;
  private improvementRenderer!: ImprovementRenderer;
  private unitRenderer!: UnitRenderer;
  private pathRenderer!: PathRenderer;
  private selectionRenderer!: SelectionRenderer;
  private fogRenderer!: FogRenderer;
  private dragOrigin: { x: number; y: number } | null = null;
  private rightButtonDownThisFrame = false;
  private cameraInitialized = false;
  private latestState: ClientState | null = null;
  private lastLeftClickTime = 0;
  private lastLeftClickKey = '';

  constructor(private readonly controller: GameController) {
    super('MapScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#17130e');

    this.tileLayer = this.add.container().setDepth(0);
    this.borderLayer = this.add.container().setDepth(1);
    this.settlementLayer = this.add.container().setDepth(2);
    this.improvementLayer = this.add.container().setDepth(3);
    this.pathLayer = this.add.container().setDepth(4);
    this.unitLayer = this.add.container().setDepth(5);
    this.combatOverlayLayer = this.add.container().setDepth(6);
    this.selectionLayer = this.add.container().setDepth(7);
    this.fogLayer = this.add.container().setDepth(8);

    this.tileRenderer = new TileLayerRenderer(this, this.tileLayer, this.worldToScreen);
    this.borderRenderer = new BorderRenderer(this, this.borderLayer, this.worldToScreen);
    this.settlementRenderer = new SettlementRenderer(this, this.settlementLayer, this.worldToScreen);
    this.improvementRenderer = new ImprovementRenderer(this, this.improvementLayer, this.worldToScreen);
    this.unitRenderer = new UnitRenderer(this, this.unitLayer, this.worldToScreen);
    this.combatAnimator = new CombatAnimator(this, this.worldToScreen);
    this.pathRenderer = new PathRenderer(this, this.pathLayer, this.worldToScreen);
    this.selectionRenderer = new SelectionRenderer(this, this.selectionLayer, this.worldToScreen);
    this.fogRenderer = new FogRenderer(this, this.fogLayer, this.worldToScreen);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!event.shiftKey) return;
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!arrowKeys.includes(event.key)) return;
      event.preventDefault();
      const nextId = this.controller.getNextAvailableUnit();
      if (nextId) this.controller.dispatch({ type: 'select_unit', unitId: nextId });
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      const nextZoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.45, 1.65);
      this.cameras.main.setZoom(nextZoom);
      this.controller.setZoom(nextZoom);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragOrigin = { x: pointer.x, y: pointer.y };
      // Track if right button was pressed this frame (check via DOM event button: 2 = right)
      this.rightButtonDownThisFrame = pointer.event instanceof MouseEvent && pointer.event.button === 2;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragOrigin || !pointer.isDown) {
        return;
      }
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.dragOrigin.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.dragOrigin.y) / camera.zoom;
      this.dragOrigin = { x: pointer.x, y: pointer.y };
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.rightButtonDownThisFrame) {
        this.handleRightClick(pointer);
      }
      this.rightButtonDownThisFrame = false;
      this.dragOrigin = null;
    });

    // Block right-click from triggering any default browser behavior or move actions.
    this.input.mouse?.disableContextMenu();

    // Additional: prevent context menu directly on the game canvas
    const canvas = this.game.canvas;
    if (canvas) {
      canvas.oncontextmenu = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
      };
    }

    this.input.keyboard?.on('keydown-A', () => {
      const state = this.latestState;
      const selectedUnitId = state?.selected?.type === 'unit' ? state.selected.unitId : null;
      const activeUnitId = state?.actions.selectedUnitId ?? selectedUnitId;
      if (!state || state.mode !== 'play' || !activeUnitId) {
        return;
      }

      this.controller.dispatch({
        type: 'set_targeting_mode',
        mode: state.actions.targetingMode === 'attack' ? 'move' : 'attack',
      });
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      const state = this.latestState;
      if (!state || state.mode !== 'play') {
        return;
      }

      // Priority 1: Cancel attack mode
      if (state.actions.targetingMode === 'attack') {
        this.controller.dispatch({ type: 'set_targeting_mode', mode: 'move' });
        return;
      }

      // Priority 2: Cancel move queue
      if (state.actions.queuedUnitId) {
        this.controller.dispatch({ type: 'cancel_queue', unitId: state.actions.queuedUnitId });
        return;
      }

      // Priority 3: Deselect
      this.controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
    });

    this.input.keyboard?.on('keydown-ENTER', () => {
      const state = this.latestState;
      if (!state || state.mode !== 'play') {
        return;
      }

      this.controller.dispatch({ type: 'end_turn' });
    });

    this.input.keyboard?.on('keydown-B', () => {
      const state = this.latestState;
      const selectedUnitId = state?.selected?.type === 'unit' ? state.selected.unitId : null;
      const activeUnitId = state?.actions.selectedUnitId ?? selectedUnitId;
      const unit = activeUnitId ? state?.world.units.find((entry) => entry.id === activeUnitId) : null;
      if (!state || state.mode !== 'play' || !activeUnitId || !unit?.isSettler || !unit.isActiveFaction) {
        return;
      }

      this.controller.dispatch({ type: 'build_city', unitId: activeUnitId });
    });

    this.unsubscribe = this.controller.subscribe(() => this.renderFromState(this.controller.getState()));
    this.renderFromState(this.controller.getState());
    this.scale.on('resize', this.handleResize, this);
  }

  shutdown() {
    this.unsubscribe?.();
    this.scale.off('resize', this.handleResize, this);
  }

  private readonly worldToScreen = (q: number, r: number) => ({
    x: (q - r) * TILE_HALF_WIDTH,
    y: (q + r) * TILE_HALF_HEIGHT,
  });

  private renderFromState(state: ClientState) {
    this.latestState = state;

    this.tileRenderer.render(state.world, state, {
      onHexSelected: (q, r, pointer) => this.handleHexClick(state, q, r, pointer),
      onHexHovered: (key) => this.controller.setHoveredHex(key),
    });

    this.borderRenderer.render(state.world);

    this.settlementRenderer.render(state.world, {
      onCitySelected: (cityId, pointer) => this.handleCitySelection(state, cityId, pointer),
      onVillageSelected: (villageId, pointer) => this.handleVillageSelection(state, villageId, pointer),
    });

    this.improvementRenderer.render(state.world);

    this.pathRenderer.render(state.world);

    this.unitRenderer.render(state.world, state, {
      onUnitSelected: (unitId, pointer) => this.handleUnitSelection(state, unitId, pointer),
      onUnitPointerDown: (unitId, pointer) => this.handleUnitPointerDown(state, unitId, pointer),
      skipUnitIds: this.combatAnimator.getAnimatedUnitIds(),
    });

    this.selectionRenderer.render(
      state.world,
      state.selected,
      state.inspectedTerrain ? `${state.inspectedTerrain.q},${state.inspectedTerrain.r}` : null,
      state.hoveredHex ? `${state.hoveredHex.q},${state.hoveredHex.r}` : null,
    );
    this.fogRenderer.render(state.world);

    this.layoutCamera(state);
  }

  private handleHexClick(state: ClientState, q: number, r: number, pointer?: Phaser.Input.Pointer) {
    if (this.combatAnimator.isAnimating()) return;
    // Right-click is handled by handleRightClick — ignore here to avoid eating the selection
    if (MapScene.isRightClick(pointer)) return;

    // Ctrl+Click → open terrain inspector for this hex
    if (MapScene.isCtrlClick(pointer)) {
      this.controller.dispatch({ type: 'inspect_terrain', q, r });
      return;
    }

    const key = `${q},${r}`;
    const selectedUnitId = state.actions.selectedUnitId;
    const attackTarget = state.actions.attackTargets.find((target) => target.key === key) ?? null;
    const clickedUnit = state.world.units.find((unit) => unit.q === q && unit.r === r);

    // Double-click on hex with a unit in a city → open city production popup
    if (clickedUnit && this.isDoubleClick(key)) {
      const city = this.findCityAtHex(state, q, r);
      if (city) {
        this.controller.dispatch({ type: 'select_city', cityId: city.id });
        return;
      }
    }

    // Left-click on own unit → select (show side popout)
    if (state.mode === 'play' && clickedUnit?.isActiveFaction) {
      this.controller.dispatch({ type: 'select_unit', unitId: clickedUnit.id });
      return;
    }

    if (state.mode === 'play' && selectedUnitId && state.actions.targetingMode === 'attack' && attackTarget) {
      this.controller.dispatch({
        type: 'attack_unit',
        attackerId: selectedUnitId,
        defenderId: attackTarget.unitId,
      });
      return;
    }

    // Clicking empty terrain deselects — collapses the sidebar
    this.controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
  }

  private layoutCamera(state: ClientState) {
    const points = state.world.map.hexes.map((hex) => this.worldToScreen(hex.q, hex.r));
    const minX = Math.min(...points.map((point) => point.x - 96));
    const maxX = Math.max(...points.map((point) => point.x + 96));
    const minY = Math.min(...points.map((point) => point.y - 96));
    const maxY = Math.max(...points.map((point) => point.y + 96));

    this.cameras.main.setBounds(minX, minY, maxX - minX, maxY - minY);
    if (!this.cameraInitialized) {
      const startPos = this.findPlayerStart(state);
      const screenPos = this.worldToScreen(startPos.q, startPos.r);
      this.cameras.main.centerOn(screenPos.x, screenPos.y);
      this.cameraInitialized = true;
    }
    this.cameras.main.setZoom(state.camera.zoom);
  }

  /** Find the player's starting position: home city of active faction, or any active-faction unit */
  private findPlayerStart(state: ClientState): { q: number; r: number } {
    // Prefer the active faction's home city
    const activeFaction = state.world.factions.find((f) => f.id === state.world.activeFactionId);
    if (activeFaction?.homeCityId) {
      const homeCity = state.world.cities.find((c) => c.id === activeFaction.homeCityId);
      if (homeCity) return { q: homeCity.q, r: homeCity.r };
    }

    // Fall back to any city owned by the active faction
    const factionCity = state.world.cities.find(
      (c) => c.factionId === state.world.activeFactionId && c.visible,
    );
    if (factionCity) return { q: factionCity.q, r: factionCity.r };

    // Fall back to any visible unit belonging to the active faction
    const activeUnit = state.world.units.find(
      (u) => u.isActiveFaction && u.visible,
    );
    if (activeUnit) return { q: activeUnit.q, r: activeUnit.r };

    // Last resort: map center
    return { q: 0, r: 0 };
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.cameras.resize(gameSize.width, gameSize.height);
  }

  private handleUnitSelection(state: ClientState, unitId: string, pointer?: Phaser.Input.Pointer) {
    if (this.combatAnimator.isAnimating()) return;
    // Right-click is handled by handleRightClick — ignore here to avoid eating the selection
    if (MapScene.isRightClick(pointer)) return;

    const unit = state.world.units.find((entry) => entry.id === unitId);
    if (!unit) {
      return;
    }

    // Ctrl+Click on a unit → inspect the terrain under the unit
    if (MapScene.isCtrlClick(pointer)) {
      this.controller.dispatch({ type: 'inspect_terrain', q: unit.q, r: unit.r });
      return;
    }

    const key = `${unit.q},${unit.r}`;

    // Single left-click on any unit → open unit inspector side panel
    const city = this.findCityAtHex(state, unit.q, unit.r);
    if (city) {
      this.controller.dispatch({ type: 'select_city', cityId: city.id });
    } else {
      this.controller.dispatch({ type: 'select_unit', unitId });
    }
    return;
  }

  private handleCitySelection(state: ClientState, cityId: string, pointer?: Phaser.Input.Pointer) {
    if (this.combatAnimator.isAnimating()) return;
    if (MapScene.isRightClick(pointer)) return;

    const city = state.world.cities.find((entry) => entry.id === cityId);
    if (!city) {
      return;
    }

    if (MapScene.isCtrlClick(pointer)) {
      this.controller.dispatch({ type: 'inspect_terrain', q: city.q, r: city.r });
      return;
    }

    if (this.isDoubleClick(`${city.q},${city.r}`)) {
      this.controller.dispatch({ type: 'select_city', cityId });
      return;
    }

    const occupyingUnit = state.world.units.find((unit) => unit.q === city.q && unit.r === city.r);
    if (occupyingUnit) {
      this.handleSingleClickUnit(state, occupyingUnit.id);
      return;
    }

    this.controller.dispatch({ type: 'select_city', cityId });
  }

  private handleVillageSelection(state: ClientState, villageId: string, pointer?: Phaser.Input.Pointer) {
    if (this.combatAnimator.isAnimating()) return;
    if (MapScene.isRightClick(pointer)) return;

    const village = state.world.villages.find((entry) => entry.id === villageId);
    if (!village) {
      return;
    }

    if (MapScene.isCtrlClick(pointer)) {
      this.controller.dispatch({ type: 'inspect_terrain', q: village.q, r: village.r });
      return;
    }

    this.controller.dispatch({ type: 'select_village', villageId });
  }

  private handleSingleClickUnit(state: ClientState, unitId: string) {
    const unit = state.world.units.find((entry) => entry.id === unitId);
    if (!unit) {
      return;
    }

    // Left-click: only handle attack targeting; unit selection (popout) is via right-click.
    if (
      state.mode === 'play'
      && state.actions.targetingMode === 'attack'
      && !unit.isActiveFaction
      && state.actions.selectedUnitId
    ) {
      this.controller.dispatch({
        type: 'attack_unit',
        attackerId: state.actions.selectedUnitId,
        defenderId: unitId,
      });
      return;
    }

    // Left-click on own unit → select (show side popout)
    if (state.mode === 'play' && unit.isActiveFaction) {
      this.controller.dispatch({ type: 'select_unit', unitId });
      return;
    }
    // Left-click on enemy unit → no-op
  }

  private handleUnitPointerDown(_state: ClientState, _unitId: string, _pointer: Phaser.Input.Pointer) {
    // Left-click selection is handled by handleUnitSelection.
    // Drag-to-move has been removed; use right-click to issue move commands.
  }

  private handleRightClick(pointer: Phaser.Input.Pointer) {
    if (this.combatAnimator.isAnimating()) return;

    const state = this.latestState;
    if (!state || state.mode !== 'play') {
      return;
    }

    const coord = this.screenToWorld(pointer.worldX, pointer.worldY + 8);
    if (!coord) {
      return;
    }

    const key = `${coord.q},${coord.r}`;
    const selectedUnitId = state.actions.selectedUnitId;
    const clickedUnit = state.world.units.find((u) => u.q === coord.q && u.r === coord.r);

    // Right-click on enemy unit with friendly selected → attack if in range, else move towards
    if (clickedUnit && !clickedUnit.isActiveFaction && selectedUnitId) {
      const attackTarget = state.actions.attackTargets.find((t) => t.unitId === clickedUnit.id);
      if (attackTarget) {
        this.controller.dispatch({
          type: 'attack_unit',
          attackerId: selectedUnitId,
          defenderId: clickedUnit.id,
        });
        return;
      }
      // Not in range → queue move towards enemy
      this.controller.dispatch({
        type: 'queue_move',
        unitId: selectedUnitId,
        destination: { q: coord.q, r: coord.r },
      });
      return;
    }

    // Right-click on own unit → select it
    if (clickedUnit && clickedUnit.isActiveFaction) {
      this.controller.dispatch({ type: 'select_unit', unitId: clickedUnit.id });
      return;
    }

    // Right-click on a legal move destination → move the selected unit
    if (selectedUnitId) {
      const target = state.actions.legalMoves.find((hex) => hex.key === key);
      if (target) {
        this.controller.dispatch({
          type: 'move_unit',
          unitId: selectedUnitId,
          destination: { q: target.q, r: target.r },
        });
        return;
      }

      // Right-click beyond reachable range → queue multi-turn move
      const clickedHex = state.world.map.hexes.find((h) => h.key === key);
      if (clickedHex && (clickedHex.visibility === 'visible' || clickedHex.visibility === 'explored')) {
        this.controller.dispatch({
          type: 'queue_move',
          unitId: selectedUnitId,
          destination: { q: coord.q, r: coord.r },
        });
        return;
      }
    }

    // Right-click on empty tile with no unit selected → tile popout
    // Right-click elsewhere → deselect
    if (!selectedUnitId) {
      this.controller.dispatch({ type: 'select_hex', q: coord.q, r: coord.r });
    } else {
      this.controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
    }
  }

  /** Check if a pointer event is a right-click (button 2) */
  private static isRightClick(pointer?: Phaser.Input.Pointer): boolean {
    return pointer?.event instanceof MouseEvent && pointer.event.button === 2;
  }

  /** Check if a pointer event has Ctrl (or Meta on Mac) held */
  private static isCtrlClick(pointer?: Phaser.Input.Pointer): boolean {
    if (!(pointer?.event instanceof MouseEvent)) return false;
    return pointer.event.ctrlKey || pointer.event.metaKey;
  }

  /** Detect double-click on the same hex (within 400ms) */
  private isDoubleClick(key: string): boolean {
    const now = performance.now();
    const isDbl = now - this.lastLeftClickTime < 400 && this.lastLeftClickKey === key;
    this.lastLeftClickTime = now;
    this.lastLeftClickKey = key;
    return isDbl;
  }

  /** Find a city at the given hex coordinates */
  private findCityAtHex(state: ClientState, q: number, r: number) {
    return state.world.cities.find((c) => c.q === q && c.r === r);
  }

  private screenToWorld(x: number, y: number) {
    const q = Math.round(((x / TILE_HALF_WIDTH) + (y / TILE_HALF_HEIGHT)) / 2);
    const r = Math.round(((y / TILE_HALF_HEIGHT) - (x / TILE_HALF_WIDTH)) / 2);
    return Number.isFinite(q) && Number.isFinite(r) ? { q, r } : null;
  }

  /** Called by GameController/GameShell to start a combat animation */
  startCombatAnimation(
    data: import('../systems/CombatAnimator').CombatAnimData,
    attackerView: UnitView,
    defenderView: UnitView,
    onComplete: () => void,
    skipAnimation = false,
    aiInitiated = false,
  ): void {
    if (aiInitiated && !skipAnimation) {
      // Pan camera to combat midpoint so the player can see AI-initiated attacks
      const attPos = this.worldToScreen(attackerView.q, attackerView.r);
      const defPos = this.worldToScreen(defenderView.q, defenderView.r);
      const targetX = (attPos.x + defPos.x) / 2;
      const targetY = (attPos.y + defPos.y) / 2;

      this.cameras.main.pan(targetX, targetY, 350, 'Sine.easeInOut', true);

      const camera = this.cameras.main;
      camera.once('camerapancomplete', () => {
        this.combatAnimator.playCombat(data, attackerView, defenderView, onComplete, skipAnimation);
      });
    } else {
      this.combatAnimator.playCombat(data, attackerView, defenderView, onComplete, skipAnimation);
    }
  }

  isCombatAnimating(): boolean {
    return this.combatAnimator.isAnimating();
  }

  cancelCombatAnimation(): void {
    this.cameras.main.resetFX();
    this.combatAnimator.cancel();
  }
}
