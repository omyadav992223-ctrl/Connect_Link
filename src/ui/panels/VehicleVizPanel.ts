// =============================================================================
// VehicleVizPanel.ts — Road and blind-spot visualization.
// Reads circuit output node values — never has its own logic.
// =============================================================================

import type { CircuitGraph } from '../../engine/CircuitGraph.js';
import type { LogicValue } from '../../engine/types.js';
import { eventBus } from '../../engine/EventBus.js';

export class VehicleVizPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private graph: CircuitGraph;
  private animFrame = 0;
  private blinkOn = false;

  constructor(container: HTMLElement, graph: CircuitGraph) {
    this.graph  = graph;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width  = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    this.ctx = ctx;

    eventBus.on('signal:updated', () => this.render());

    const ro = new ResizeObserver(() => { this.resize(); this.render(); });
    ro.observe(container);

    this.resize();
    this.render();
    this.startBlink();
  }

  setGraph(graph: CircuitGraph): void {
    this.graph = graph;
    this.render();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private startBlink(): void {
    setInterval(() => {
      this.blinkOn = !this.blinkOn;
      const L  = this.getSignal('L');
      const R  = this.getSignal('R');
      const buzz = this.getBuzzer();
      if (L === 1 || R === 1 || buzz === 1) this.render();
    }, 400);
  }

  private getSignal(label: string): LogicValue {
    for (const comp of this.graph.getSourceComponents()) {
      if (comp.label.toUpperCase() === label) {
        return comp.outputPorts[0]?.value ?? 'X';
      }
    }
    return 'X';
  }

  private getCritical(): LogicValue {
    // Read the BUZZER component input — this is the authoritative "alert active" signal.
    for (const sink of this.graph.getSinkComponents()) {
      if (sink.type === 'BUZZER' || sink.label.toUpperCase().includes('BUZZ')) {
        return sink.inputPorts[0]?.value ?? 'X';
      }
    }
    // Fallback: read W_L or W_R LEDs
    for (const sink of this.graph.getSinkComponents()) {
      if (sink.label.toUpperCase().includes('W_L') || sink.label.toUpperCase().includes('W_R')) {
        if (sink.inputPorts[0]?.value === 1) return 1;
      }
    }
    return 0;
  }

  private getBuzzer(): LogicValue {
    return this.getCritical();
  }

  render(): void {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.width  / dpr;
    const H   = canvas.height / dpr;

    const L    = this.getSignal('L');
    const R    = this.getSignal('R');
    const IL   = this.getSignal('IL');
    const IR   = this.getSignal('IR');
    const crit = this.getCritical();

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    const roadLeft  = W * 0.2;
    const roadRight = W * 0.8;
    const roadW     = roadRight - roadLeft;
    const laneW     = roadW / 3;
    const laneL     = roadLeft;
    const laneC     = roadLeft + laneW;
    const laneR     = roadLeft + laneW * 2;

    // Road surface
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(roadLeft, 0, roadW, H);

    // Lane markings
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 15]);
    ctx.beginPath();
    ctx.moveTo(laneC, 0); ctx.lineTo(laneC, H);
    ctx.moveTo(laneR, 0); ctx.lineTo(laneR, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Road edges
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(roadLeft, 0); ctx.lineTo(roadLeft, H);
    ctx.moveTo(roadRight, 0); ctx.lineTo(roadRight, H);
    ctx.stroke();

    const egoX = laneC + laneW / 2 - 18;
    const egoY = H * 0.55;
    const egoW = 36;
    const egoH = 60;

    // Left blind-spot zone
    const leftSpotActive = L === 1;
    this.drawBlindSpot(ctx, laneL + 4, egoY - 10, laneW - 8, egoH + 20, leftSpotActive, '◀ BLIND SPOT');

    // Right blind-spot zone
    const rightSpotActive = R === 1;
    this.drawBlindSpot(ctx, laneR + 4, egoY - 10, laneW - 8, egoH + 20, rightSpotActive, 'BLIND SPOT ▶');

    // Left vehicle (if L=1)
    if (L === 1) {
      this.drawVehicle(ctx, laneL + laneW / 2 - 15, egoY + 5, 30, 55, '#ef4444', 'THREAT');
    }

    // Right vehicle (if R=1)
    if (R === 1) {
      this.drawVehicle(ctx, laneR + laneW / 2 - 15, egoY + 5, 30, 55, '#ef4444', 'THREAT');
    }

    // Ego vehicle — show indicator arrows based on IL/IR
    const indicatingLeft  = IL === 1;
    const indicatingRight = IR === 1;
    this.drawEgoVehicle(ctx, egoX, egoY, egoW, egoH, indicatingLeft || indicatingRight);

    // Indicator text
    if (IL === 1) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('◀ LEFT INDICATOR', laneC + laneW / 2, egoY - 25);
    }
    if (IR === 1) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RIGHT INDICATOR ▶', laneC + laneW / 2, egoY - 25);
    }

    // Critical warning overlay
    if (crit === 1 && this.blinkOn) {
      ctx.fillStyle = 'rgba(239,68,68,0.15)';
      ctx.fillRect(roadLeft, 0, roadW, H);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ CRITICAL WARNING ⚠', W / 2, 30);
      ctx.fillText('COLLISION RISK DETECTED', W / 2, 50);
    }

    // Status bar
    this.drawStatusBar(ctx, W, H, L, R, IL, IR, crit);
  }

  private drawBlindSpot(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    active: boolean,
    label: string,
  ): void {
    ctx.save();
    ctx.fillStyle = active ? 'rgba(239,68,68,0.25)' : 'rgba(100,116,139,0.1)';
    ctx.strokeStyle = active ? '#ef4444' : '#334155';
    ctx.lineWidth = active ? 2 : 1;
    ctx.setLineDash(active ? [] : [6, 4]);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = active ? '#fca5a5' : '#475569';
    ctx.font = `bold ${active ? '10' : '9'}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.restore();
  }

  private drawVehicle(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: string,
    label: string,
  ): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.stroke();

    // Windows
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 4, y + 8, w - 8, 14);

    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h - 8);
  }

  private drawEgoVehicle(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    laneChanging: boolean,
  ): void {
    // Body
    ctx.fillStyle = laneChanging ? '#3b82f6' : '#22c55e';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

    // Windshield
    ctx.fillStyle = '#bfdbfe';
    ctx.fillRect(x + 4, y + 6, w - 8, 14);

    // Rear window
    ctx.fillStyle = '#bfdbfe';
    ctx.fillRect(x + 4, y + h - 20, w - 8, 10);

    // Sensor dots
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(x + 3, y + h * 0.5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 3, y + h * 0.5, 3, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', x + w / 2, y + h / 2 + 3);
  }

  private drawStatusBar(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    L: LogicValue,
    R: LogicValue,
    IL: LogicValue,
    IR: LogicValue,
    crit: LogicValue,
  ): void {
    const barH = 28;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, H - barH, W, barH);

    const items = [
      { label: 'L',    value: L    },
      { label: 'R',    value: R    },
      { label: 'IL',   value: IL   },
      { label: 'IR',   value: IR   },
      { label: 'BUZZ', value: crit },
    ];

    const itemW = W / items.length;
    items.forEach((item, i) => {
      const x = i * itemW + itemW / 2;
      const color = item.value === 1 ? '#22c55e' : item.value === 0 ? '#3b82f6' : '#6b7280';
      ctx.fillStyle = color;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${item.label}: ${item.value === 'X' ? '?' : item.value}`, x, H - barH / 2 + 4);
    });
  }
}
