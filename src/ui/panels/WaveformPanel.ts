// =============================================================================
// WaveformPanel.ts — Interactive Digital Waveform Viewer for Circuit Link.
// Visualizes multi-channel signal transitions (0, 1, X) over simulation steps.
// =============================================================================

import type { CircuitGraph } from '../../engine/CircuitGraph.js';
import { WaveformEngine, type WaveformTrace, type SignalInfo } from '../../engine/WaveformEngine.js';
import { eventBus } from '../../engine/EventBus.js';
import type { LogicValue } from '../../engine/types.js';

export class WaveformPanel {
  private container: HTMLElement;
  private graph: CircuitGraph;
  private engine: WaveformEngine;
  private showSignalPicker = false;

  constructor(container: HTMLElement, graph: CircuitGraph, engine?: WaveformEngine) {
    this.container = container;
    this.graph     = graph;
    this.engine    = engine ?? new WaveformEngine(graph);

    // Record sample on every propagation event (clock ticks, step, switch toggles, telemetry)
    eventBus.on('signal:updated', () => {
      this.engine.sample();
      this.render();
    });

    eventBus.on('circuit:changed', () => {
      this.render();
    });

    this.render();
  }

  getEngine(): WaveformEngine {
    return this.engine;
  }

  setGraph(graph: CircuitGraph): void {
    this.graph = graph;
    this.engine.setGraph(graph);
    this.render();
  }

  render(): void {
    const traces = this.engine.getTraces();
    const isRecording = this.engine.isRecording();
    const stepCount = this.engine.getStepCount();
    const maxSteps = this.engine.getMaxSteps();
    const available = this.engine.getAvailableSignals();

    this.container.innerHTML = `
      <div class="wave-panel">
        <div class="wave-toolbar">
          <div class="wave-btn-group">
            <button class="btn btn-sm ${isRecording ? 'btn-primary' : 'btn-secondary'}" id="wave-btn-record">
              <span class="material-symbols-outlined" style="font-size:14px">${isRecording ? 'pause' : 'fiber_manual_record'}</span>
              ${isRecording ? 'Recording' : 'Paused'}
            </button>
            <button class="btn btn-sm btn-secondary" id="wave-btn-clear" title="Clear recorded waveform history">
              <span class="material-symbols-outlined" style="font-size:14px">delete_sweep</span> Clear
            </button>
          </div>

          <div class="wave-presets">
            <span style="font-size:11px;color:var(--text-muted);margin-right:2px">Presets:</span>
            <button class="btn-chip" id="wave-pre-seq" title="Show Clock and Flip-Flop signals">⚡ Clocks &amp; FFs</button>
            <button class="btn-chip" id="wave-pre-io" title="Show Inputs &amp; Outputs">🎛 Inputs / Outputs</button>
            <button class="btn-chip" id="wave-pre-all" title="Show all signals">🌐 All</button>
          </div>

          <div style="flex:1"></div>

          <button class="btn btn-sm btn-secondary" id="wave-btn-picker" title="Select signals to record and display">
            <span class="material-symbols-outlined" style="font-size:14px">tune</span> Signals (${traces.length}/${available.length})
          </button>

          <div class="wave-status-badge">
            Step: <strong style="color:var(--sig-high)">${stepCount}</strong> <span style="opacity:0.6">/ ${maxSteps}</span>
          </div>
        </div>

        ${this.showSignalPicker ? this.renderSignalPicker(available) : ''}

        <div class="wave-scroll-wrap" id="wave-scroll-wrap">
          ${traces.length === 0
            ? `<div class="panel-empty" style="padding:40px">
                <span class="material-symbols-outlined panel-empty-icon">show_chart</span>
                <p>No signals selected. Click <strong>Signals</strong> above or choose a preset.</p>
               </div>`
            : `<canvas id="wave-canvas" class="wave-canvas"></canvas>`
          }
        </div>
      </div>
    `;

    this.bindEvents();
    if (traces.length > 0) {
      this.drawCanvas(traces);
    }
  }

  private renderSignalPicker(available: SignalInfo[]): string {
    return `
      <div class="wave-picker-box">
        <div style="font-size:11px;font-weight:bold;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px">
          Select Signals to Display
        </div>
        <div class="wave-chips-container">
          ${available.map(sig => {
            const active = this.engine.isSignalSelected(sig.id);
            return `
              <button class="wave-chip ${active ? 'wave-chip-active' : ''}" data-sig-id="${escHtml(sig.id)}">
                <span class="wave-chip-dot ${sig.direction === 'output' ? 'wave-dot-out' : 'wave-dot-in'}"></span>
                ${escHtml(sig.displayName)}
              </button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Record toggle
    this.container.querySelector('#wave-btn-record')?.addEventListener('click', () => {
      this.engine.toggleRecording();
      this.render();
    });

    // Clear
    this.container.querySelector('#wave-btn-clear')?.addEventListener('click', () => {
      this.engine.clear();
      this.render();
    });

    // Presets
    this.container.querySelector('#wave-pre-seq')?.addEventListener('click', () => {
      this.engine.selectCategory('sequential');
      this.render();
    });
    this.container.querySelector('#wave-pre-io')?.addEventListener('click', () => {
      this.engine.selectCategory('io');
      this.render();
    });
    this.container.querySelector('#wave-pre-all')?.addEventListener('click', () => {
      this.engine.selectCategory('all');
      this.render();
    });

    // Signal picker toggle
    this.container.querySelector('#wave-btn-picker')?.addEventListener('click', () => {
      this.showSignalPicker = !this.showSignalPicker;
      this.render();
    });

    // Individual signal chip toggle
    this.container.querySelectorAll('.wave-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset['sigId'];
        if (id) {
          this.engine.toggleSignal(id);
          this.render();
        }
      });
    });
  }

  private drawCanvas(traces: WaveformTrace[]): void {
    const canvas = this.container.querySelector('#wave-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const LABEL_WIDTH   = 160;
    const STEP_WIDTH    = 28;
    const HEADER_HEIGHT = 26;
    const ROW_HEIGHT    = 38;
    const FOOTER_HEIGHT = 20;

    const stepIndices = this.engine.getStepIndices();
    const numSteps    = Math.max(16, stepIndices.length);

    const totalWidth  = LABEL_WIDTH + numSteps * STEP_WIDTH + 30;
    const totalHeight = HEADER_HEIGHT + traces.length * ROW_HEIGHT + FOOTER_HEIGHT;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width  = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;

    ctx.scale(dpr, dpr);

    // 1. Backgrounds
    ctx.fillStyle = '#090d16'; // Deep background
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    ctx.fillStyle = '#0f172a'; // Left gutter
    ctx.fillRect(0, 0, LABEL_WIDTH, totalHeight);

    // Vertical divider line between labels and waveforms
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, 0);
    ctx.lineTo(LABEL_WIDTH, totalHeight);
    ctx.stroke();

    // 2. Time Axis Header
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, totalWidth, HEADER_HEIGHT);
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT);
    ctx.lineTo(totalWidth, HEADER_HEIGHT);
    ctx.stroke();

    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < numSteps; i++) {
      const stepIdx = i < stepIndices.length ? stepIndices[i] : i;
      const x = LABEL_WIDTH + i * STEP_WIDTH;

      // Vertical grid line
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_HEIGHT);
      ctx.lineTo(x, totalHeight - FOOTER_HEIGHT);
      ctx.stroke();

      // Step label in header
      ctx.fillStyle = i < stepIndices.length ? '#94a3b8' : '#475569';
      ctx.fillText(String(stepIdx), x + STEP_WIDTH / 2, HEADER_HEIGHT / 2);
    }

    // 3. Render Each Signal Trace Row
    traces.forEach((trace, rowIdx) => {
      const rowY = HEADER_HEIGHT + rowIdx * ROW_HEIGHT;
      const yHigh = rowY + 9;
      const yLow  = rowY + 29;
      const yMid  = rowY + 19;

      // Row separator
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rowY + ROW_HEIGHT);
      ctx.lineTo(totalWidth, rowY + ROW_HEIGHT);
      ctx.stroke();

      // Guide levels (subtle dotted lines)
      ctx.strokeStyle = '#141d2e';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH, yHigh);
      ctx.lineTo(totalWidth, yHigh);
      ctx.moveTo(LABEL_WIDTH, yLow);
      ctx.lineTo(totalWidth, yLow);
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash

      // Gutter: Signal Name & Latest Value Badge
      const latestVal = trace.samples.length > 0 ? trace.samples[trace.samples.length - 1] : 'X';
      const sigColor = latestVal === 1 ? '#22c55e' : latestVal === 0 ? '#64748b' : '#f59e0b';

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // Trim name if too long
      let displayName = trace.signal.displayName;
      if (ctx.measureText(displayName).width > LABEL_WIDTH - 48) {
        displayName = displayName.slice(0, 14) + '…';
      }
      ctx.fillText(displayName, 12, rowY + ROW_HEIGHT / 2);

      // Value badge
      const badgeX = LABEL_WIDTH - 28;
      const badgeY = rowY + (ROW_HEIGHT - 16) / 2;
      ctx.fillStyle = latestVal === 1 ? 'rgba(34,197,94,0.18)' : latestVal === 0 ? 'rgba(100,116,139,0.18)' : 'rgba(245,158,11,0.18)';
      ctx.strokeStyle = sigColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, 18, 16, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = sigColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(latestVal), badgeX + 9, badgeY + 8);

      // Draw Waveform Transitions
      const samples = trace.samples;
      if (samples.length === 0) return;

      const strokeColor = trace.signal.componentType === 'CLOCK' ? '#38bdf8' : '#10b981';

      ctx.lineWidth = 2;
      ctx.lineJoin  = 'miter';

      for (let s = 0; s < samples.length; s++) {
        const val = samples[s];
        const x0  = LABEL_WIDTH + s * STEP_WIDTH;
        const x1  = x0 + STEP_WIDTH;

        const curY = val === 1 ? yHigh : val === 0 ? yLow : yMid;

        // Draw horizontal sample level
        if (val === 'X') {
          // X / Unknown: hatched amber region or mid-line with "X" label
          ctx.strokeStyle = '#f59e0b';
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.moveTo(x0, yMid);
          ctx.lineTo(x1, yMid);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('X', (x0 + x1) / 2, yMid - 6);
        } else {
          ctx.strokeStyle = val === 1 ? strokeColor : '#64748b';
          ctx.beginPath();
          ctx.moveTo(x0, curY);
          ctx.lineTo(x1, curY);
          ctx.stroke();

          // Fill underneath high level for high legibility
          if (val === 1) {
            ctx.fillStyle = trace.signal.componentType === 'CLOCK'
              ? 'rgba(56, 189, 248, 0.08)'
              : 'rgba(16, 185, 129, 0.08)';
            ctx.fillRect(x0, yHigh, STEP_WIDTH, yLow - yHigh);
          }
        }

        // Draw vertical edge between transitions
        if (s > 0) {
          const prevVal = samples[s - 1];
          if (prevVal !== val) {
            const prevY = prevVal === 1 ? yHigh : prevVal === 0 ? yLow : yMid;
            ctx.strokeStyle = '#94a3b8';
            ctx.beginPath();
            ctx.moveTo(x0, prevY);
            ctx.lineTo(x0, curY);
            ctx.stroke();
          }
        }
      }
    });

    // Auto-scroll waveform container to right as new samples arrive
    const wrap = this.container.querySelector('#wave-scroll-wrap') as HTMLElement | null;
    if (wrap && stepIndices.length * STEP_WIDTH > wrap.clientWidth) {
      wrap.scrollLeft = wrap.scrollWidth;
    }
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
