// =============================================================================
// App.ts — Root orchestrator, wired to the new CircuitVerse-style HTML.
// All simulation features remain fully functional.
// =============================================================================

import { CircuitGraph } from '../engine/CircuitGraph.js';
import { Propagator } from '../engine/Propagator.js';
import { CircuitSerializer, type SerializedCircuit } from '../engine/CircuitSerializer.js';
import { ErrorChecker } from '../engine/ErrorChecker.js';
import { eventBus } from '../engine/EventBus.js';
import { HardwareController } from '../hardware/HardwareController.js';
import { CanvasRenderer, type RenderState } from './canvas/CanvasRenderer.js';
import { CanvasInteraction } from './canvas/CanvasInteraction.js';
import { TruthTablePanel } from './panels/TruthTablePanel.js';
import { BooleanPanel } from './panels/BooleanPanel.js';
import { KMapPanel } from './panels/KMapPanel.js';
import { WaveformPanel } from './panels/WaveformPanel.js';
import { HardwarePanel } from './panels/HardwarePanel.js';
import { VehicleVizPanel } from './panels/VehicleVizPanel.js';
import { loadBlindSpotPreset } from './presets/BlindSpotPreset.js';
import type { GateType } from '../engine/types.js';

export class App {
  private graph: CircuitGraph;
  private hardware: HardwareController;
  private renderer: CanvasRenderer;
  private interaction: CanvasInteraction;
  private renderState: RenderState;

  private ttPanel!: TruthTablePanel;
  private boolPanel!: BooleanPanel;
  private kmapPanel!: KMapPanel;
  private wavePanel!: WaveformPanel;
  private hwPanel!: HardwarePanel;
  private vizPanel!: VehicleVizPanel;

  private consoleLines: string[] = [];
  private dockCollapsed = false;

  private undoStack: SerializedCircuit[] = [];
  private redoStack: SerializedCircuit[] = [];
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    (window as any).__app = this;
    this.graph    = new CircuitGraph('Blind-Spot System');
    this.hardware = new HardwareController(this.graph);

    const canvas  = document.getElementById('circuit-canvas') as HTMLCanvasElement;
    this.renderer = new CanvasRenderer(canvas);

    this.renderState = {
      zoom: 1,
      panX: 40,
      panY: 40,
      selectedIds: new Set(),
      hoveredComponentId: null,
      hoveredPortKey: null,
      wireInProgress: null,
      logicProbeKey: null,
    };

    this.interaction = new CanvasInteraction(
      canvas, this.graph, this.renderer, this.renderState,
      {
        onRender:          () => this.renderCanvas(),
        onSelectComponent: (id) => this.onSelectComponent(id),
        onError:           (msg) => this.logError(msg),
        onRecordHistory:   () => this.pushHistory(),
        onUndo:            () => this.undo(),
        onRedo:            () => this.redo(),
      },
    );

    this.initPanels();
    this.initToolbar();
    this.initTopBar();
    this.initDock();
    this.initAccordion();
    this.initZoomSlider();
    this.bindEngineEvents();
    this.bindCanvasHint();

    // Pre-load blind-spot detection circuit preset so it's ready immediately
    loadBlindSpotPreset(this.graph);

    Propagator.propagate(this.graph);
    this.renderer.resize();
    this.renderCanvas();

    window.addEventListener('resize', () => { this.renderer.resize(); this.renderCanvas(); });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Panel init
  // ─────────────────────────────────────────────────────────────────────────

  private initPanels(): void {
    this.ttPanel   = new TruthTablePanel(document.getElementById('panel-tt')!,   this.graph);
    this.boolPanel = new BooleanPanel(document.getElementById('panel-bool')!,     this.graph);
    this.kmapPanel = new KMapPanel(document.getElementById('panel-kmap')!,        this.graph);
    this.wavePanel = new WaveformPanel(document.getElementById('panel-wave')!,    this.graph);
    this.hwPanel   = new HardwarePanel(document.getElementById('panel-hw')!,      this.hardware);
    this.vizPanel  = new VehicleVizPanel(document.getElementById('panel-viz')!,   this.graph);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Left toolbar — component accordion tiles
  // ─────────────────────────────────────────────────────────────────────────

  private initToolbar(): void {
    const container = document.getElementById('toolbar-components')!;

    // Bind drag start on all .comp-tile elements
    container.querySelectorAll<HTMLElement>('.comp-tile').forEach(tile => {
      tile.addEventListener('dragstart', (e) => {
        const type  = tile.dataset['type'] as GateType;
        const label = tile.dataset['label'] ?? '';
        e.dataTransfer?.setData('component-type', type);
        if (label) e.dataTransfer?.setData('component-label', label);
      });

      tile.addEventListener('click', () => {
        const type  = tile.dataset['type'] as GateType;
        const label = tile.dataset['label'] ?? '';
        const canvas = document.getElementById('circuit-canvas') as HTMLCanvasElement;
        const dpr = window.devicePixelRatio || 1;
        const cx = (canvas.width / dpr / 2 - this.renderState.panX) / this.renderState.zoom;
        const cy = (canvas.height / dpr / 2 - this.renderState.panY) / this.renderState.zoom;
        const nx = Math.round(cx / 10) * 10;
        const ny = Math.round(cy / 10) * 10;
        const comp = this.graph.addComponent(type, { x: nx, y: ny }, label || undefined);
        this.renderState.selectedIds.clear();
        this.renderState.selectedIds.add(comp.id);
        this.onSelectComponent(comp.id);
        Propagator.propagate(this.graph);
        this.pushHistory();
        this.renderCanvas();
        this.updateCanvasHint();
      });
    });

    // Component search filter
    document.getElementById('component-search')?.addEventListener('input', (e) => {
      const q = (e.target as HTMLInputElement).value.toLowerCase();
      container.querySelectorAll<HTMLElement>('.comp-tile').forEach(tile => {
        const name = tile.textContent?.toLowerCase() ?? '';
        tile.style.display = name.includes(q) ? '' : 'none';
      });
      // Open all groups when searching
      if (q.length > 0) {
        container.querySelectorAll<HTMLElement>('.accordion-body').forEach(b => {
          b.style.display = 'block';
        });
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Top bar buttons + dropdown menus
  // ─────────────────────────────────────────────────────────────────────────

  private initTopBar(): void {
    // Project name
    const nameEl = document.getElementById('project-name') as HTMLInputElement;
    nameEl?.addEventListener('change', () => {
      this.graph.state.name = nameEl.value;
    });

    // ⚡ Preset button (top bar)
    document.getElementById('btn-preset')?.addEventListener('click', () => {
      this.pushHistory();
      this.doLoadPreset();
    });

    // Dropdown — Project menu toggle
    this.bindDropdown('nav-project', 'dropdown-project');
    this.bindDropdown('nav-presets', 'dropdown-presets');

    // Dropdown items
    document.getElementById('dd-save')?.addEventListener('click', () => {
      CircuitSerializer.downloadAsFile(this.graph);
      this.logInfo(`Saved: ${this.graph.state.name}`);
    });

    document.getElementById('dd-load')?.addEventListener('click', async () => {
      try {
        const loaded = await CircuitSerializer.loadFromFile();
        this.switchGraph(loaded);
        this.logInfo(`Loaded: ${loaded.state.name}`);
      } catch (err) {
        this.logError(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    document.getElementById('dd-clear')?.addEventListener('click', () => {
      if (confirm('Clear all components and wires?')) {
        this.pauseClock();
        this.pushHistory();
        this.graph.clear();
        Propagator.propagate(this.graph);
        this.renderState.selectedIds.clear();
        this.onSelectComponent(null);
        this.renderCanvas();
        this.updateCanvasHint();
      }
    });

    document.getElementById('dd-preset')?.addEventListener('click', () => {
      this.pushHistory();
      this.doLoadPreset();
      (document.getElementById('dropdown-presets') as HTMLElement).classList.remove('open');
    });

    // CAD toolbar buttons
    document.getElementById('btn-save')?.addEventListener('click', () => {
      CircuitSerializer.downloadAsFile(this.graph);
      this.logInfo(`Saved: ${this.graph.state.name}`);
    });

    document.getElementById('btn-load-file')?.addEventListener('click', async () => {
      try {
        const loaded = await CircuitSerializer.loadFromFile();
        this.pushHistory();
        this.switchGraph(loaded);
        this.logInfo(`Loaded: ${loaded.state.name}`);
      } catch (err) {
        this.logError(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    document.getElementById('btn-undo')?.addEventListener('click', () => {
      this.undo();
    });

    document.getElementById('btn-redo')?.addEventListener('click', () => {
      this.redo();
    });

    // Clock controls
    document.getElementById('btn-clock-step')?.addEventListener('click', () => {
      this.stepClock();
    });

    document.getElementById('btn-clock-play')?.addEventListener('click', () => {
      this.toggleAutoClock();
    });

    document.getElementById('btn-clock-reset')?.addEventListener('click', () => {
      this.resetClocks();
    });

    document.getElementById('btn-clear')?.addEventListener('click', () => {
      if (confirm('Clear all components and wires?')) {
        this.pauseClock();
        this.pushHistory();
        this.graph.clear();
        Propagator.propagate(this.graph);
        this.renderState.selectedIds.clear();
        this.onSelectComponent(null);
        this.renderCanvas();
        this.updateCanvasHint();
      }
    });

    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
      this.renderState.zoom = 1;
      this.renderState.panX = 40;
      this.renderState.panY = 40;
      this.updateZoomDisplay();
      this.renderCanvas();
    });

    // Mode toggle
    const simBtn = document.getElementById('btn-sim-mode') as HTMLButtonElement;
    const hwBtn  = document.getElementById('btn-hw-mode')  as HTMLButtonElement;
    const dockStatus = document.getElementById('dock-status')!;

    simBtn?.addEventListener('click', () => {
      simBtn.classList.add('mode-btn-active');
      hwBtn.classList.remove('mode-btn-active');
      this.graph.state.simulationMode = 'simulation';
      this.hardware.setMode('simulation');
      dockStatus.textContent = '● Simulation Mode';
      dockStatus.style.color = 'var(--sig-high)';
      this.logInfo('Switched to Simulation Mode');
    });

    hwBtn?.addEventListener('click', () => {
      hwBtn.classList.add('mode-btn-active');
      simBtn.classList.remove('mode-btn-active');
      this.graph.state.simulationMode = 'hardware';
      this.hardware.setMode('hardware');
      dockStatus.textContent = '🔴 Hardware Mode';
      dockStatus.style.color = 'var(--alert)';
      this.logInfo('Switched to Hardware Mode');
    });

    // Arduino serial connect button (top-bar icon)
    document.getElementById('btn-connect-serial')?.addEventListener('click', async () => {
      await this.hardware.connect();
      this.updateArduinoBadge();
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-menu') && !target.closest('.nav-btn')) {
        document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  private bindDropdown(btnId: string, menuId: string): void {
    const btn  = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      const isOpen = menu.classList.contains('open');

      // Close all first
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));

      if (!isOpen) {
        menu.style.top  = `${rect.bottom + 2}px`;
        menu.style.left = `${rect.left}px`;
        menu.classList.add('open');
      }
    });
  }

  private doLoadPreset(): void {
    this.pauseClock();
    this.renderState.selectedIds.clear();
    this.onSelectComponent(null);
    loadBlindSpotPreset(this.graph);
    Propagator.propagate(this.graph);
    this.renderState.zoom = 0.88;
    this.renderState.panX = 20;
    this.renderState.panY = 20;
    this.updateZoomDisplay();
    this.renderCanvas();
    this.updateCanvasHint();
    const nameEl = document.getElementById('project-name') as HTMLInputElement;
    if (nameEl) nameEl.value = 'Blind-Spot Warning System';
    this.graph.state.name = 'Blind-Spot Warning System';
    this.logInfo('Loaded: Smart Blind-Spot Warning preset');
  }

  public propagate(): void {
    Propagator.propagate(this.graph);
    this.renderCanvas();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Clock Controls
  // ─────────────────────────────────────────────────────────────────────────

  public stepClock(): void {
    if (this.graph.state.running) {
      this.pauseClock();
    }
    const hadClocks = this.graph.tickClocks();
    if (!hadClocks) {
      this.logInfo('No CLOCK component found. Add a Pulse Clock from the Input elements.');
      return;
    }
    Propagator.propagate(this.graph);
    this.renderCanvas();
    this.logInfo('Clock step (toggled)');
  }

  public startClock(hz = 1): void {
    this.pauseClock();
    if (this.graph.getClockComponents().length === 0) {
      this.logInfo('No CLOCK component on canvas to drive.');
      return;
    }

    this.graph.state.running = true;
    const playIcon = document.getElementById('icon-clock-play');
    if (playIcon) playIcon.textContent = 'pause';

    const halfPeriodMs = Math.max(50, Math.round(1000 / (hz * 2)));
    this.clockTimer = setInterval(() => {
      if (this.graph.getClockComponents().length === 0) {
        this.pauseClock();
        this.logInfo('Auto clock paused: no CLOCK components remaining.');
        return;
      }
      this.graph.tickClocks();
      Propagator.propagate(this.graph);
      this.renderCanvas();
    }, halfPeriodMs);

    this.logInfo(`Auto clock started (${hz} Hz)`);
  }

  public pauseClock(): void {
    if (this.clockTimer !== null) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
    this.graph.state.running = false;
    const playIcon = document.getElementById('icon-clock-play');
    if (playIcon) playIcon.textContent = 'play_arrow';
  }

  public toggleAutoClock(): void {
    if (this.graph.state.running) {
      this.pauseClock();
      this.logInfo('Auto clock paused');
    } else {
      this.startClock();
    }
  }

  public resetClocks(): void {
    this.pauseClock();
    this.graph.resetClocks();
    this.graph.resetSequentialState();
    Propagator.propagate(this.graph);
    this.renderCanvas();
    this.logInfo('Clock and sequential state reset to initial (0)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bottom dock — tab switching
  // ─────────────────────────────────────────────────────────────────────────

  private initDock(): void {
    const tabs   = document.querySelectorAll<HTMLElement>('.dock-tab');
    const panels = document.querySelectorAll<HTMLElement>('.dock-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset['tab']!;
        tabs.forEach(t => t.classList.remove('dock-tab-active'));
        panels.forEach(p => { p.classList.remove('dock-panel-active'); });
        tab.classList.add('dock-tab-active');
        const panel = document.getElementById(`panel-${target}`);
        if (panel) panel.classList.add('dock-panel-active');

        // Refresh on tab focus
        if (target === 'tt')      this.ttPanel.refresh();
        if (target === 'bool')    this.boolPanel.refresh();
        if (target === 'kmap')    this.kmapPanel.refresh();
        if (target === 'wave')    this.wavePanel.render();
        if (target === 'hw')      this.hwPanel.render();
        if (target === 'viz')     this.vizPanel.render();
      });
    });

    // Dock expand/collapse toggle
    const dock      = document.querySelector<HTMLElement>('.bottom-dock')!;
    const toggleBtn = document.getElementById('dock-toggle')!;
    const icon      = toggleBtn.querySelector('.material-symbols-outlined')!;

    toggleBtn.addEventListener('click', () => {
      this.dockCollapsed = !this.dockCollapsed;
      dock.classList.toggle('dock-collapsed', this.dockCollapsed);
      icon.textContent = this.dockCollapsed ? 'expand_more' : 'expand_less';
      this.renderer.resize();
      this.renderCanvas();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accordion toggling
  // ─────────────────────────────────────────────────────────────────────────

  private initAccordion(): void {
    document.querySelectorAll<HTMLElement>('.accordion-header').forEach(header => {
      // Skip already-open accent groups
      if (header.classList.contains('accordion-header-accent')) return;

      header.addEventListener('click', () => {
        const body  = header.nextElementSibling as HTMLElement;
        const caret = header.querySelector<HTMLElement>('.acc-caret')!;
        const isOpen = body.classList.contains('accordion-body-open');

        if (isOpen) {
          body.classList.remove('accordion-body-open');
          body.style.display = 'none';
          caret.textContent = '▸';
        } else {
          body.classList.add('accordion-body-open');
          body.style.display = 'block';
          caret.textContent = '▾';
          caret.style.color = 'var(--sig-high)';
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Zoom slider sync
  // ─────────────────────────────────────────────────────────────────────────

  private initZoomSlider(): void {
    const slider = document.getElementById('zoom-slider') as HTMLInputElement;
    slider?.addEventListener('input', () => {
      this.renderState.zoom = parseInt(slider.value) / 100;
      this.updateZoomDisplay();
      this.renderCanvas();
    });
  }

  private updateZoomDisplay(): void {
    const slider  = document.getElementById('zoom-slider') as HTMLInputElement;
    const pctBtn  = document.getElementById('btn-reset-view') as HTMLButtonElement;
    const pct     = Math.round(this.renderState.zoom * 100);
    if (slider) slider.value = String(pct);
    if (pctBtn) pctBtn.textContent = `${pct}%`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Properties panel
  // ─────────────────────────────────────────────────────────────────────────

  private onSelectComponent(id: string | null): void {
    const propsEl = document.getElementById('props-content')!;

    const comp = id ? this.graph.state.components.get(id) : null;
    if (!comp) {
      if (id) this.renderState.selectedIds.delete(id);
      propsEl.innerHTML = `
        <div class="props-empty">
          <span class="material-symbols-outlined props-empty-icon">touch_app</span>
          <p>Click a component on the canvas to inspect it.</p>
        </div>`;
      return;
    }

    const TTL_MAP: Record<string, string> = {
      AND: '7408 (1 Gate / Quad 2-In AND)',
      OR: '7432 (1 Gate / Quad 2-In OR)',
      NOT: '7404 (1 Inverter / Hex NOT)',
      NAND: '7400 (1 Gate / Quad 2-In NAND)',
      NOR: '7402 (1 Gate / Quad 2-In NOR)',
      XOR: '7486 (1 Gate / Quad 2-In XOR)',
      XNOR: '74266 (1 Gate / Quad 2-In XNOR)',
      MUX2: '74157 (1 Unit / Quad 2:1 MUX)',
      MUX4: '74153 (1 Unit / Dual 4:1 MUX)',
      DEMUX1_2: '74155 (1 Unit / Dual 1:2 Demux)',
      DEMUX1_4: '74155 (1:4 Demux Mode)',
      DECODER2_4: '74139 (1 Unit / Dual 2:4 Decoder)',
      ENCODER4_2: '74148 (4-Input Priority Encoder)',
      COMPARATOR: '1-Bit Magnitude Comparator',
      HALF_ADDER: 'Discrete Subsystem (XOR + AND)',
      FULL_ADDER: '1-Bit Full Adder (7483 slice)',
      HALF_SUBTRACTOR: 'Discrete Subsystem (XOR + NOT + AND)',
      FULL_SUBTRACTOR: '1-Bit Full Subtractor',
      DFF: '7474 (1 Unit / Dual D-Type FF)',
      JKFF: '7476 (1 Unit / Dual JK-Type FF)',
      TFF: 'Toggle Flip-Flop (JK / D configured)',
      SR_LATCH: '74279 (1 Unit / Quad SR Latch)',
    };

    const pinRows = (ports: typeof comp.inputPorts) =>
      ports.map(p =>
        `<div class="pin-row">
          <span>${escHtml(p.name)}</span>
          <span class="${sigClass(p.value)}">${p.value === 1 ? '1 [HIGH]' : p.value === 0 ? '0 [LOW]' : 'X'}</span>
        </div>`
      ).join('');

    propsEl.innerHTML = `
      <div class="props-section">
        <div class="props-section-title">Component</div>
        <div class="props-row">
          <span class="props-key">Type</span>
          <span class="props-val">${escHtml(comp.type)}</span>
        </div>
        ${TTL_MAP[comp.type] ? `
        <div class="props-row">
          <span class="props-key">TTL Part</span>
          <span class="props-val" style="color:var(--brand-accent);font-weight:600">${escHtml(TTL_MAP[comp.type])}</span>
        </div>` : ''}
        <div class="props-row">
          <span class="props-key">ID</span>
          <span class="props-val" style="font-size:10.5px;word-break:break-all">${escHtml(comp.id)}</span>
        </div>
        <div style="padding:4px 0">
          <label class="props-label">Label</label>
          <input class="props-input" id="prop-label" value="${escHtml(comp.label)}" />
        </div>
        <div class="props-row">
          <span class="props-key">Position</span>
          <span class="props-val">(${comp.position.x}, ${comp.position.y})</span>
        </div>
      </div>

      <div class="pin-monitor">
        <div class="pin-monitor-title">Pin Status Monitor</div>
        ${comp.inputPorts.length > 0
          ? `<div style="font:700 10px var(--font-ui);color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Inputs</div>
             ${pinRows(comp.inputPorts)}`
          : '<div style="color:var(--text-muted);font-size:11px">— Source component (no inputs)</div>'
        }
        ${comp.outputPorts.length > 0
          ? `<div style="font:700 10px var(--font-ui);color:var(--text-muted);margin:5px 0 3px;text-transform:uppercase;letter-spacing:.06em;border-top:1px solid var(--border);padding-top:5px">Outputs</div>
             ${pinRows(comp.outputPorts)}`
          : ''
        }
      </div>

      ${comp.hasError
        ? `<div class="props-error">${escHtml(comp.errorMessage ?? 'Circuit error')}</div>`
        : ''
      }

      <div class="props-actions">
        <button class="btn-props btn-props-secondary" id="prop-toggle">
          <span class="material-symbols-outlined" style="font-size:15px">sync</span> Toggle Value
        </button>
        <button class="btn-props btn-props-danger" id="prop-delete">
          <span class="material-symbols-outlined" style="font-size:15px">delete</span> Delete Component
        </button>
      </div>`;

    const compId = comp.id;

    // Label edit
    document.getElementById('prop-label')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLInputElement).value.trim();
      if (val) { this.graph.setLabel(compId, val); this.renderCanvas(); }
    });

    // Toggle (INPUT/BUTTON/CLOCK)
    document.getElementById('prop-toggle')?.addEventListener('click', () => {
      if (['INPUT', 'BUTTON', 'CLOCK'].includes(comp.type)) {
        this.graph.toggleInput(compId);
        Propagator.propagate(this.graph);
        this.onSelectComponent(compId); // refresh props
        this.renderCanvas();
      }
    });

    // Delete
    document.getElementById('prop-delete')?.addEventListener('click', () => {
      this.graph.removeComponent(compId);
      Propagator.propagate(this.graph);
      this.renderState.selectedIds.delete(compId);
      this.onSelectComponent(null);
      this.renderCanvas();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Engine events
  // ─────────────────────────────────────────────────────────────────────────

  private bindEngineEvents(): void {
    eventBus.on('signal:updated', () => {
      const errors = ErrorChecker.validate(this.graph);
      for (const comp of this.graph.getAllComponents()) {
        comp.hasError = false; comp.errorMessage = undefined;
      }
      for (const err of errors) {
        if (err.componentId) {
          const c = this.graph.state.components.get(err.componentId);
          if (c) { c.hasError = true; c.errorMessage = err.message; }
        }
        if (err.severity === 'error') this.logError(err.message);
      }
      // Refresh props panel live values
      const sel = [...this.renderState.selectedIds][0];
      if (sel) this.onSelectComponent(sel);

      // Keep physical hardware buzzer in sync with circuit output
      this.hardware.sendBuzzerFeedback();

      this.renderCanvas();
    });

    eventBus.on('error:detected', (errs) => {
      for (const e of errs) this.logError(e.message);
    });

    eventBus.on('hardware:data', () => {
      this.updateArduinoBadge();
      this.renderCanvas();
    });

    eventBus.on('mode:changed', (mode: 'simulation' | 'hardware') => {
      const simBtn = document.getElementById('btn-sim-mode');
      const hwBtn  = document.getElementById('btn-hw-mode');
      const dockStatus = document.getElementById('dock-status');
      if (mode === 'hardware') {
        hwBtn?.classList.add('mode-btn-active');
        simBtn?.classList.remove('mode-btn-active');
        if (dockStatus) {
          dockStatus.textContent = '🔴 Hardware Mode';
          dockStatus.style.color = 'var(--alert)';
        }
      } else {
        simBtn?.classList.add('mode-btn-active');
        hwBtn?.classList.remove('mode-btn-active');
        if (dockStatus) {
          dockStatus.textContent = '● Simulation Mode';
          dockStatus.style.color = 'var(--sig-high)';
        }
      }
    });

  }

  // ─────────────────────────────────────────────────────────────────────────
  // Canvas hint (hide once components exist)
  // ─────────────────────────────────────────────────────────────────────────

  private bindCanvasHint(): void {
    eventBus.on('circuit:changed', () => this.updateCanvasHint());
    this.updateCanvasHint();
  }

  private updateCanvasHint(): void {
    const hint = document.getElementById('canvas-hint') as HTMLElement;
    if (!hint) return;
    hint.style.display = this.graph.getAllComponents().length > 0 ? 'none' : 'block';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Arduino badge update
  // ─────────────────────────────────────────────────────────────────────────

  private updateArduinoBadge(): void {
    const dot   = document.getElementById('arduino-dot')!;
    const label = document.getElementById('arduino-label')!;
    const status = this.hardware.serialStatus;

    dot.className = 'arduino-dot' + (status === 'connected' ? ' arduino-dot-online' : '');
    label.textContent = {
      connected:    'Arduino: Connected',
      connecting:   'Arduino: Connecting…',
      error:        'Arduino: Error',
      disconnected: 'Disconnected',
    }[status] ?? 'Disconnected';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private switchGraph(newGraph: CircuitGraph): void {
    this.pauseClock();
    this.renderState.selectedIds.clear();
    this.onSelectComponent(null);
    this.graph = newGraph;
    this.hardware.setGraph(newGraph);
    this.interaction.setGraph(newGraph);
    this.ttPanel.setGraph(newGraph);
    this.boolPanel.setGraph(newGraph);
    this.kmapPanel.setGraph(newGraph);
    this.wavePanel.setGraph(newGraph);
    this.vizPanel.setGraph(newGraph);
    const nameEl = document.getElementById('project-name') as HTMLInputElement;
    if (nameEl) nameEl.value = newGraph.state.name;
    Propagator.propagate(newGraph);
    this.renderCanvas();
    this.updateCanvasHint();
  }

  private renderCanvas(): void {
    this.renderer.render(this.graph, this.renderState);
    this.updateZoomDisplay();
  }

  private logInfo(msg: string): void  { this.appendConsole(`[INFO] ${msg}`, 'log-info'); }
  private logError(msg: string): void { this.appendConsole(`[ERROR] ${msg}`, 'log-error'); }

  private appendConsole(text: string, cls: string): void {
    this.consoleLines.unshift(`<div class="${cls}">${escHtml(text)}</div>`);
    if (this.consoleLines.length > 60) this.consoleLines.pop();
    const el = document.getElementById('panel-console');
    if (el) el.innerHTML = this.consoleLines.join('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Undo / Redo History
  // ─────────────────────────────────────────────────────────────────────────

  pushHistory(): void {
    const snapshot = CircuitSerializer.serialize(this.graph);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.updateUndoRedoUI();
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    const current = CircuitSerializer.serialize(this.graph);
    this.redoStack.push(current);
    const prev = this.undoStack.pop()!;
    this.restoreSnapshot(prev);
    this.updateUndoRedoUI();
    this.logInfo('Undo');
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const current = CircuitSerializer.serialize(this.graph);
    this.undoStack.push(current);
    const next = this.redoStack.pop()!;
    this.restoreSnapshot(next);
    this.updateUndoRedoUI();
    this.logInfo('Redo');
  }

  private restoreSnapshot(snapshot: SerializedCircuit): void {
    const newGraph = CircuitSerializer.deserialize(snapshot);
    this.switchGraph(newGraph);
  }

  private updateUndoRedoUI(): void {
    const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement | null;
    const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement | null;
    if (btnUndo) btnUndo.disabled = this.undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
  }
}

function sigClass(v: 0 | 1 | 'X'): string {
  if (v === 1) return 'pin-val-high';
  if (v === 0) return 'pin-val-low';
  return 'pin-val-x';
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
