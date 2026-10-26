// =============================================================================
// CanvasInteraction.ts — Handles all mouse/keyboard events on the circuit canvas.
// Translates user gestures into CircuitGraph mutations + state updates.
// =============================================================================

import type { CircuitGraph } from '../../engine/CircuitGraph.js';
import type { GateType } from '../../engine/types.js';
import { Propagator } from '../../engine/Propagator.js';
import { CanvasRenderer, type RenderState } from './CanvasRenderer.js';
import { eventBus } from '../../engine/EventBus.js';

export interface InteractionCallbacks {
  onRender: () => void;
  onSelectComponent: (id: string | null) => void;
  onError: (msg: string) => void;
  onRecordHistory?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; startPanX: number; startPanY: number }
  | { kind: 'move'; componentId: string; offsetX: number; offsetY: number; startScreenX: number; startScreenY: number; hasMoved: boolean }
  | { kind: 'wire'; fromCompId: string; fromPortId: string }
  | { kind: 'drop'; type: GateType; x: number; y: number };

export class CanvasInteraction {
  private canvas: HTMLCanvasElement;
  private graph: CircuitGraph;
  private renderer: CanvasRenderer;
  private renderState: RenderState;
  private callbacks: InteractionCallbacks;
  private drag: DragMode = { kind: 'none' };

  constructor(
    canvas: HTMLCanvasElement,
    graph: CircuitGraph,
    renderer: CanvasRenderer,
    renderState: RenderState,
    callbacks: InteractionCallbacks,
  ) {
    this.canvas      = canvas;
    this.graph       = graph;
    this.renderer    = renderer;
    this.renderState = renderState;
    this.callbacks   = callbacks;

    this.bindEvents();
  }

  /** Update graph reference (after load). */
  setGraph(graph: CircuitGraph): void {
    this.graph = graph;
  }

  // -------------------------------------------------------------------------
  // Event binding
  // -------------------------------------------------------------------------

  private bindEvents(): void {
    const c = this.canvas;
    c.addEventListener('mousedown',  this.onMouseDown);
    c.addEventListener('mousemove',  this.onMouseMove);
    c.addEventListener('mouseup',    this.onMouseUp);
    c.addEventListener('mouseleave', this.onMouseLeave);
    c.addEventListener('wheel',      this.onWheel, { passive: false });
    c.addEventListener('contextmenu',this.onContextMenu);
    c.addEventListener('dblclick',   this.onDblClick);

    // Drag-from-toolbar drop
    c.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    c.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    c.addEventListener('drop', this.onDrop);

    window.addEventListener('keydown', this.onKeyDown);
  }

  // -------------------------------------------------------------------------
  // Mouse events
  // -------------------------------------------------------------------------

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();

    const cp = this.renderer.screenToCanvas(e.clientX, e.clientY, this.renderState);

    // Middle button or Alt+drag = pan
    if (e.button === 1 || e.altKey) {
      this.drag = {
        kind: 'pan',
        startX: e.clientX, startY: e.clientY,
        startPanX: this.renderState.panX,
        startPanY: this.renderState.panY,
      };
      return;
    }

    // Check port hit first (start wire)
    const portHit = this.renderer.hitTestPort(this.graph, cp.x, cp.y);
    if (portHit && portHit.direction === 'output') {
      this.drag = { kind: 'wire', fromCompId: portHit.componentId, fromPortId: portHit.portId };
      return;
    }

    // Check component hit (move / select / toggle)
    const comp = this.renderer.hitTestComponent(this.graph, cp.x, cp.y);
    if (comp) {
      this.renderState.selectedIds.clear();
      this.renderState.selectedIds.add(comp.id);
      this.callbacks.onSelectComponent(comp.id);

      this.drag = {
        kind: 'move',
        componentId: comp.id,
        offsetX: cp.x - comp.position.x,
        offsetY: cp.y - comp.position.y,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        hasMoved: false,
      };
      this.callbacks.onRender();
      return;
    }

    // Click on empty canvas → deselect
    this.renderState.selectedIds.clear();
    this.renderState.logicProbeKey = null;
    this.callbacks.onSelectComponent(null);

    // Start pan
    this.drag = {
      kind: 'pan',
      startX: e.clientX, startY: e.clientY,
      startPanX: this.renderState.panX,
      startPanY: this.renderState.panY,
    };

    this.callbacks.onRender();
  };

  private onMouseMove = (e: MouseEvent): void => {
    const cp = this.renderer.screenToCanvas(e.clientX, e.clientY, this.renderState);
    let needRender = false;

    // Update hover state
    const portHit = this.renderer.hitTestPort(this.graph, cp.x, cp.y);
    const newPortKey = portHit ? `${portHit.componentId}::${portHit.portId}` : null;
    if (this.renderState.hoveredPortKey !== newPortKey) {
      this.renderState.hoveredPortKey = newPortKey;
      needRender = true;
    }

    const compHit = this.renderer.hitTestComponent(this.graph, cp.x, cp.y);
    const newHovId = compHit?.id ?? null;
    if (this.renderState.hoveredComponentId !== newHovId) {
      this.renderState.hoveredComponentId = newHovId;
      needRender = true;
    }

    // Cursor style
    this.canvas.style.cursor = portHit
      ? 'crosshair'
      : compHit
        ? 'grab'
        : this.drag.kind === 'pan'
          ? 'grabbing'
          : 'default';

    switch (this.drag.kind) {
      case 'pan': {
        const dx = e.clientX - this.drag.startX;
        const dy = e.clientY - this.drag.startY;
        this.renderState.panX = this.drag.startPanX + dx;
        this.renderState.panY = this.drag.startPanY + dy;
        needRender = true;
        break;
      }
      case 'move': {
        const dist = Math.hypot(e.clientX - this.drag.startScreenX, e.clientY - this.drag.startScreenY);
        if (dist > 3) {
          this.drag.hasMoved = true;
        }
        const comp = this.graph.state.components.get(this.drag.componentId);
        if (comp) {
          // Snap to 10px grid
          const nx = Math.round((cp.x - this.drag.offsetX) / 10) * 10;
          const ny = Math.round((cp.y - this.drag.offsetY) / 10) * 10;
          comp.position = { x: nx, y: ny };
          needRender = true;
        }
        break;
      }
      case 'wire': {
        this.renderState.wireInProgress = {
          fromCompId: this.drag.fromCompId,
          fromPortId: this.drag.fromPortId,
          mouseX: cp.x,
          mouseY: cp.y,
        };
        needRender = true;
        break;
      }
    }

    if (needRender) this.callbacks.onRender();
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (this.drag.kind === 'wire') {
      const cp = this.renderer.screenToCanvas(e.clientX, e.clientY, this.renderState);
      const portHit = this.renderer.hitTestPort(this.graph, cp.x, cp.y);

      if (portHit && portHit.direction === 'input') {
        const result = this.graph.addWire(
          this.drag.fromCompId,
          this.drag.fromPortId,
          portHit.componentId,
          portHit.portId,
        );
        if ('error' in result) {
          this.callbacks.onError(result.error);
        } else {
          Propagator.propagate(this.graph);
          this.callbacks.onRecordHistory?.();
        }
      }

      this.renderState.wireInProgress = null;
    }

    if (this.drag.kind === 'move') {
      const comp = this.graph.state.components.get(this.drag.componentId);
      if (!this.drag.hasMoved && comp && ['INPUT', 'BUTTON', 'CLOCK'].includes(comp.type)) {
        // Clicked without dragging -> toggle switch!
        this.graph.toggleInput(comp.id);
        Propagator.propagate(this.graph);
        this.callbacks.onRecordHistory?.();
      } else if (this.drag.hasMoved) {
        Propagator.propagate(this.graph);
        this.callbacks.onRecordHistory?.();
      }
    }

    this.drag = { kind: 'none' };
    this.callbacks.onRender();
  };

  private onMouseLeave = (): void => {
    this.drag = { kind: 'none' };
    this.renderState.wireInProgress = null;
    this.renderState.hoveredComponentId = null;
    this.renderState.hoveredPortKey = null;
    this.callbacks.onRender();
  };

  // -------------------------------------------------------------------------
  // Wheel — zoom
  // -------------------------------------------------------------------------

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect   = this.canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;

    // Zoom toward mouse position
    this.renderState.panX = mx - (mx - this.renderState.panX) * factor;
    this.renderState.panY = my - (my - this.renderState.panY) * factor;
    this.renderState.zoom = Math.max(0.2, Math.min(4, this.renderState.zoom * factor));

    this.callbacks.onRender();
  };

  // -------------------------------------------------------------------------
  // Right-click context menu
  // -------------------------------------------------------------------------

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const cp   = this.renderer.screenToCanvas(e.clientX, e.clientY, this.renderState);
    const comp = this.renderer.hitTestComponent(this.graph, cp.x, cp.y);

    if (comp) {
      this.showContextMenu(e.clientX, e.clientY, comp.id);
    }
  };

  private showContextMenu(x: number, y: number, compId: string): void {
    // Remove existing
    document.getElementById('ctx-menu')?.remove();

    const menu = document.createElement('div');
    menu.id = 'ctx-menu';
    menu.className = 'ctx-menu';
    menu.style.left = `${x}px`;
    menu.style.top  = `${y}px`;

    const deleteItem = document.createElement('div');
    deleteItem.className = 'ctx-menu-item ctx-menu-danger';
    deleteItem.textContent = '🗑 Delete Component';
    deleteItem.onclick = () => {
      this.graph.removeComponent(compId);
      Propagator.propagate(this.graph);
      this.renderState.selectedIds.delete(compId);
      this.callbacks.onSelectComponent(null);
      this.callbacks.onRecordHistory?.();
      this.callbacks.onRender();
      menu.remove();
    };
    menu.appendChild(deleteItem);

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  }

  // -------------------------------------------------------------------------
  // Double-click — logic probe
  // -------------------------------------------------------------------------

  private onDblClick = (e: MouseEvent): void => {
    const cp     = this.renderer.screenToCanvas(e.clientX, e.clientY, this.renderState);
    const portHit = this.renderer.hitTestPort(this.graph, cp.x, cp.y);

    if (portHit) {
      this.renderState.logicProbeKey = `${portHit.componentId}::${portHit.portId}`;
      this.callbacks.onRender();
      return;
    }

    // Check wires (approximate hit test using midpoint)
    for (const wire of this.graph.getAllWires()) {
      const fc = this.graph.state.components.get(wire.fromComponentId);
      const tc = this.graph.state.components.get(wire.toComponentId);
      if (!fc || !tc) continue;
      const fp = this.renderer.getPortPosition(fc, wire.fromPortId, 'output');
      const tp = this.renderer.getPortPosition(tc, wire.toPortId, 'input');
      if (!fp || !tp) continue;

      const mx = (fp.x + tp.x) / 2;
      const my = (fp.y + tp.y) / 2;
      if (Math.hypot(mx - cp.x, my - cp.y) < 15) {
        this.renderState.logicProbeKey = wire.id;
        this.callbacks.onRender();
        return;
      }
    }

    this.renderState.logicProbeKey = null;
    this.callbacks.onRender();
  };

  // -------------------------------------------------------------------------
  // Keyboard — delete, escape, reset view, undo, redo
  // -------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }

    // Undo: Ctrl+Z (or Cmd+Z)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        this.callbacks.onRedo?.();
      } else {
        this.callbacks.onUndo?.();
      }
      return;
    }

    // Redo: Ctrl+Y (or Cmd+Y)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.callbacks.onRedo?.();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.renderState.selectedIds.size > 0) {
        for (const id of this.renderState.selectedIds) {
          this.graph.removeComponent(id);
        }
        this.renderState.selectedIds.clear();
        Propagator.propagate(this.graph);
        this.callbacks.onSelectComponent(null);
        this.callbacks.onRecordHistory?.();
        this.callbacks.onRender();
      }
    }

    if (e.key === 'Escape') {
      this.renderState.selectedIds.clear();
      this.renderState.wireInProgress = null;
      this.renderState.logicProbeKey = null;
      this.drag = { kind: 'none' };
      this.callbacks.onRender();
    }

    // Reset view
    if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.renderState.zoom = 1;
      this.renderState.panX = 40;
      this.renderState.panY = 40;
      this.callbacks.onRender();
    }
  };

  // -------------------------------------------------------------------------
  // Drag-and-drop from toolbar
  // -------------------------------------------------------------------------

  private onDrop = (e: DragEvent): void => {
    e.preventDefault();
    const type = e.dataTransfer?.getData('component-type') as GateType | undefined;
    if (!type) return;
    const label = e.dataTransfer?.getData('component-label') ?? '';

    const cp = this.renderer.screenToCanvas(e.clientX, e.clientY, this.renderState);
    // Snap to 10px grid
    const nx = Math.round(cp.x / 10) * 10;
    const ny = Math.round(cp.y / 10) * 10;

    const comp = this.graph.addComponent(type, { x: nx, y: ny }, label || undefined);
    this.renderState.selectedIds.clear();
    this.renderState.selectedIds.add(comp.id);
    this.callbacks.onSelectComponent(comp.id);
    Propagator.propagate(this.graph);
    this.callbacks.onRecordHistory?.();
    this.callbacks.onRender();
  };
}
