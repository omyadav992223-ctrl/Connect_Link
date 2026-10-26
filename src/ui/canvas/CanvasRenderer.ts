// =============================================================================
// CanvasRenderer.ts — Renders the circuit graph to an HTML5 Canvas.
// Reads from CircuitGraph; never writes to it.
// =============================================================================

import type { CircuitGraph } from '../../engine/CircuitGraph.js';
import type { Component, Wire, Port, LogicValue } from '../../engine/types.js';
import {
  COLORS, drawAND, drawOR, drawNOT, drawNOTBubble,
  drawNANDBubble, drawNORBubble, drawXOR, drawMUX, drawDEMUX, drawComparator,
  drawLED, drawInput, drawOutput, drawClock, drawBuzzer, drawPortDot, drawGateLabel,
  signalColor,
} from './ComponentSymbols.js';

export interface RenderState {
  zoom: number;
  panX: number;
  panY: number;
  selectedIds: Set<string>;
  hoveredComponentId: string | null;
  hoveredPortKey: string | null;   // "compId::portId"
  wireInProgress: { fromCompId: string; fromPortId: string; mouseX: number; mouseY: number } | null;
  logicProbeKey: string | null;    // "compId::portId" or "wireId"
}

const PORT_RADIUS = 5;
const PORT_HIT    = 10;

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas  = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  render(graph: CircuitGraph, state: RenderState): void {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background grid
    this.drawGrid(state);

    // Apply pan/zoom
    ctx.setTransform(state.zoom * dpr, 0, 0, state.zoom * dpr, state.panX * dpr, state.panY * dpr);

    // Wires (drawn below components)
    for (const wire of graph.getAllWires()) {
      this.drawWire(wire, graph, state);
    }

    // Wire in progress
    if (state.wireInProgress) {
      this.drawWireInProgress(state.wireInProgress, graph);
    }

    // Components
    for (const comp of graph.getAllComponents()) {
      this.drawComponent(comp, state);
    }

    // Logic probe tooltip
    if (state.logicProbeKey) {
      this.drawProbeTooltip(state.logicProbeKey, graph, state);
    }
  }

  // -------------------------------------------------------------------------
  // Grid
  // -------------------------------------------------------------------------

  private drawGrid(state: RenderState): void {
    const { ctx, canvas } = this;
    const dpr   = window.devicePixelRatio || 1;
    const w     = canvas.width / dpr;
    const h     = canvas.height / dpr;
    const step  = 20 * state.zoom;
    const offX  = ((state.panX % 20) + 20) % 20 * state.zoom;
    const offY  = ((state.panY % 20) + 20) % 20 * state.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;

    for (let x = offX; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = offY; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  // -------------------------------------------------------------------------
  // Wires
  // -------------------------------------------------------------------------

  private drawWire(wire: Wire, graph: CircuitGraph, state: RenderState): void {
    const { ctx } = this;
    const fromComp = graph.state.components.get(wire.fromComponentId);
    const toComp   = graph.state.components.get(wire.toComponentId);
    if (!fromComp || !toComp) return;

    const from = this.getPortPosition(fromComp, wire.fromPortId, 'output');
    const to   = this.getPortPosition(toComp,   wire.toPortId,   'input');
    if (!from || !to) return;

    const color = signalColor(wire.value as 0 | 1 | 'X');
    const isSelected = state.selectedIds.has(wire.id);

    ctx.beginPath();
    ctx.strokeStyle = isSelected ? '#f59e0b' : color;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.setLineDash(wire.value === 'X' ? [4, 4] : []);

    // Route wire with a horizontal-then-vertical path
    const midX = (from.x + to.x) / 2;
    ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Signal dot on wire midpoint
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    ctx.beginPath();
    ctx.arc(mx, my, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private drawWireInProgress(
    wip: NonNullable<RenderState['wireInProgress']>,
    graph: CircuitGraph,
  ): void {
    const { ctx } = this;
    const comp = graph.state.components.get(wip.fromCompId);
    if (!comp) return;
    const from = this.getPortPosition(comp, wip.fromPortId, 'output');
    if (!from) return;

    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(wip.mouseX, wip.mouseY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // -------------------------------------------------------------------------
  // Components
  // -------------------------------------------------------------------------

  private drawComponent(comp: Component, state: RenderState): void {
    const { ctx } = this;
    const { x, y } = comp.position;
    const { width: w, height: h } = comp.size;
    const selected = state.selectedIds.has(comp.id);
    const hovered  = state.hoveredComponentId === comp.id;
    const hasError = comp.hasError;

    ctx.save();
    ctx.translate(x, y);

    // Body
    this.drawComponentBody(comp, w, h, selected, hovered, hasError);

    // Port dots + labels
    this.drawPorts(comp, w, h, state);

    // Component label (neatly below component)
    this.drawComponentLabel(comp, w, h, selected);

    ctx.restore();
  }

  private drawComponentLabel(
    comp: Component,
    w: number,
    h: number,
    selected: boolean,
  ): void {
    const { ctx } = this;
    const text = comp.label.replace(/_/g, ' ');
    if (!text) return;

    ctx.save();
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const textY = h + 6;
    const textX = w / 2;
    const metrics = ctx.measureText(text);
    const pillW = Math.max(metrics.width + 12, 34);
    const pillH = 18;

    // High legibility background pill on white canvas grid
    ctx.fillStyle = selected ? 'rgba(219, 234, 254, 0.95)' : 'rgba(248, 250, 252, 0.92)';
    ctx.strokeStyle = selected ? '#2563eb' : '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(textX - pillW / 2, textY, pillW, pillH, 4);
    ctx.fill();
    ctx.stroke();

    // High contrast label text
    ctx.fillStyle = selected ? '#1d4ed8' : '#0f172a';
    ctx.fillText(text, textX, textY + 3);
    ctx.restore();
  }

  private drawComponentBody(
    comp: Component,
    w: number,
    h: number,
    selected: boolean,
    hovered: boolean,
    hasError: boolean,
  ): void {
    const { ctx } = this;
    const { type } = comp;

    const borderColor = hasError
      ? COLORS.gate.borderError
      : selected
        ? COLORS.gate.borderSel
        : COLORS.gate.border;

    const bodyColor = hasError
      ? COLORS.gate.bodyError
      : hovered
        ? COLORS.gate.bodyHover
        : COLORS.gate.body;

    // Glow for selected
    if (selected) {
      ctx.shadowColor = COLORS.gate.borderSel;
      ctx.shadowBlur  = 12;
    }

    let pathFn: (() => void) | null = null;

    switch (type) {
      case 'AND':
        pathFn = () => drawAND(ctx, w, h);
        break;
      case 'OR':
        pathFn = () => drawOR(ctx, w, h);
        break;
      case 'XOR':
        pathFn = () => drawXOR(ctx, w, h);
        break;
      case 'XNOR':
        pathFn = () => drawXOR(ctx, w - 8, h);
        break;
      case 'NOT':
        pathFn = () => drawNOT(ctx, w, h);
        break;
      case 'NAND':
        pathFn = () => drawAND(ctx, w - 8, h);
        break;
      case 'NOR':
        pathFn = () => drawOR(ctx, w - 8, h);
        break;
      case 'MUX2':
      case 'MUX4':
        pathFn = () => drawMUX(ctx, w, h);
        break;
      case 'DEMUX1_2':
      case 'DEMUX1_4':
        pathFn = () => drawDEMUX(ctx, w, h);
        break;
      case 'COMPARATOR':
      case 'HALF_ADDER':
      case 'FULL_ADDER':
      case 'HALF_SUBTRACTOR':
      case 'FULL_SUBTRACTOR':
      case 'DECODER2_4':
      case 'ENCODER4_2':
      case 'DFF':
      case 'JKFF':
      case 'TFF':
      case 'SR_LATCH':
        pathFn = () => drawComparator(ctx, w, h);
        break;
      case 'LED': {
        const v = comp.inputPorts[0]?.value ?? 'X';
        const isCrit = comp.label.toUpperCase().includes('CRIT');
        drawLED(ctx, w, h, v as LogicValue, isCrit);
        break;
      }
      case 'BUZZER': {
        const v = comp.inputPorts[0]?.value ?? 'X';
        drawBuzzer(ctx, w, h, v as LogicValue);
        break;
      }
      case 'INPUT':
      case 'BUTTON': {
        const v = comp.outputPorts[0]?.value ?? 'X';
        drawInput(ctx, w, h, v as LogicValue, comp.label);
        break;
      }
      case 'CLOCK': {
        const v = comp.outputPorts[0]?.value ?? 'X';
        drawClock(ctx, w, h, v as LogicValue);
        break;
      }
      case 'OUTPUT': {
        const v = comp.inputPorts[0]?.value ?? 'X';
        drawOutput(ctx, w, h, v as LogicValue);
        break;
      }
      default:
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 4);
        break;
    }

    if (pathFn) {
      pathFn();
      ctx.fillStyle = bodyColor;
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.stroke();

      // Inversion bubble for NOT/NAND/NOR/XNOR
      if (type === 'NOT')  { drawNOTBubble(ctx,  w, h); ctx.fillStyle = bodyColor; ctx.fill(); ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (type === 'NAND') { drawNANDBubble(ctx, w, h); ctx.fillStyle = bodyColor; ctx.fill(); ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (type === 'NOR')  { drawNORBubble(ctx,  w, h); ctx.fillStyle = bodyColor; ctx.fill(); ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (type === 'XNOR') { drawNANDBubble(ctx, w, h); ctx.fillStyle = bodyColor; ctx.fill(); ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5; ctx.stroke(); }

      // Gate-type text labels (crisp white in gate body)
      const gateTexts: Partial<Record<string, string>> = {
        AND: 'AND', OR: 'OR', NAND: 'NAND', NOR: 'NOR',
        XOR: 'XOR', XNOR: 'XNOR', NOT: 'NOT',
        MUX2: 'MUX 2:1', MUX4: 'MUX 4:1',
        DEMUX1_2: 'DEMUX 1:2', DEMUX1_4: 'DEMUX 1:4',
        DECODER2_4: 'DEC 2:4', ENCODER4_2: 'ENC 4:2',
        COMPARATOR: 'CMP',
        HALF_ADDER: 'HALF ADD', FULL_ADDER: 'FULL ADD',
        HALF_SUBTRACTOR: 'HALF SUB', FULL_SUBTRACTOR: 'FULL SUB',
        DFF: 'D-FF', JKFF: 'JK-FF', TFF: 'T-FF', SR_LATCH: 'SR LATCH',
      };
      const gt = gateTexts[type];
      if (gt) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = `bold 10px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textX = (type === 'NOT' || type === 'NAND' || type === 'NOR' || type === 'XNOR') ? (w - 8) / 2 : w / 2;
        ctx.fillText(gt, textX, h / 2);
      }
    }

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  private drawPorts(
    comp: Component,
    w: number,
    h: number,
    state: RenderState,
  ): void {
    const { ctx } = this;

    for (const port of comp.inputPorts) {
      const pos = this.getPortPosition(comp, port.id, 'input');
      if (!pos) continue;
      const lx = pos.x - comp.position.x;
      const ly = pos.y - comp.position.y;
      const hk = `${comp.id}::${port.id}`;
      drawPortDot(ctx, lx, ly, port.value as 0 | 1 | 'X', state.hoveredPortKey === hk);

      // Port name - dark contrast
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(port.name, lx - 8, ly);
    }

    for (const port of comp.outputPorts) {
      const pos = this.getPortPosition(comp, port.id, 'output');
      if (!pos) continue;
      const lx = pos.x - comp.position.x;
      const ly = pos.y - comp.position.y;
      const hk = `${comp.id}::${port.id}`;
      drawPortDot(ctx, lx, ly, port.value as 0 | 1 | 'X', state.hoveredPortKey === hk);

      // Port name - dark contrast
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(port.name, lx + 8, ly);
    }
  }

  // -------------------------------------------------------------------------
  // Logic probe tooltip
  // -------------------------------------------------------------------------

  private drawProbeTooltip(
    key: string,
    graph: CircuitGraph,
    state: RenderState,
  ): void {
    const { ctx } = this;
    let value: LogicValue = 'X';
    let label = key;
    let px = 0;
    let py = 0;

    // Check if it's a wire
    const wire = graph.state.wires.get(key);
    if (wire) {
      value = wire.value;
      label = `Wire: ${wire.value === 'X' ? 'Unknown' : wire.value === 1 ? 'HIGH (1)' : 'LOW (0)'}`;
      const fromComp = graph.state.components.get(wire.fromComponentId);
      if (fromComp) {
        const pos = this.getPortPosition(fromComp, wire.fromPortId, 'output');
        if (pos) { px = pos.x + 20; py = pos.y - 30; }
      }
    } else {
      const [compId, portId] = key.split('::');
      const comp = graph.state.components.get(compId);
      if (comp) {
        const port = [...comp.inputPorts, ...comp.outputPorts].find(p => p.id === portId);
        if (port) {
          value = port.value;
          label = `${comp.label}.${port.name}: ${value === 'X' ? 'Unknown' : value === 1 ? 'HIGH (1)' : 'LOW (0)'}`;
          const pos = this.getPortPosition(comp, portId, port.direction);
          if (pos) { px = pos.x + 10; py = pos.y - 30; }
        }
      }
    }

    // Draw tooltip
    const pad = 8;
    ctx.font = '11px monospace';
    const tw = ctx.measureText(label).width + pad * 2;
    const th = 22;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = signalColor(value);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px, py, tw, th, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + pad, py + th / 2);
  }

  // -------------------------------------------------------------------------
  // Port position calculation
  // -------------------------------------------------------------------------

  /** Get the absolute canvas position of a port. */
  getPortPosition(
    comp: Component,
    portId: string,
    direction: 'input' | 'output',
  ): { x: number; y: number } | null {
    const { x, y } = comp.position;
    const { width: w, height: h } = comp.size;
    const ports = direction === 'input' ? comp.inputPorts : comp.outputPorts;
    const idx   = ports.findIndex(p => p.id === portId);
    if (idx === -1) return null;

    const n = ports.length;

    if (direction === 'input') {
      // 2:1 Multiplexer
      if (comp.type === 'MUX2') {
        if (portId === 'in_S') return { x: x + w / 2, y: y + h };
        const muxIdx = portId === 'in_I0' ? 0 : 1;
        return { x, y: y + (h / 3) * (muxIdx + 1) };
      }

      // 4:1 Multiplexer
      if (comp.type === 'MUX4') {
        if (portId === 'in_S0') return { x: x + w * 0.35, y: y + h };
        if (portId === 'in_S1') return { x: x + w * 0.65, y: y + h };
        const dataMap: Record<string, number> = { in_I0: 0, in_I1: 1, in_I2: 2, in_I3: 3 };
        const dIdx = dataMap[portId] ?? 0;
        return { x, y: y + (h / 5) * (dIdx + 1) };
      }

      // 1:2 Demultiplexer
      if (comp.type === 'DEMUX1_2') {
        if (portId === 'in_S') return { x: x + w / 2, y: y + h };
        if (portId === 'in_D') return { x, y: y + h / 2 };
      }

      // 1:4 Demultiplexer
      if (comp.type === 'DEMUX1_4') {
        if (portId === 'in_S0') return { x: x + w * 0.35, y: y + h };
        if (portId === 'in_S1') return { x: x + w * 0.65, y: y + h };
        if (portId === 'in_D') return { x, y: y + h / 2 };
      }

      // 2-to-4 Decoder with Enable
      if (comp.type === 'DECODER2_4') {
        if (portId === 'in_EN') return { x: x + w / 2, y: y + h };
        if (portId === 'in_A0') return { x, y: y + (h / 3) * 1 };
        if (portId === 'in_A1') return { x, y: y + (h / 3) * 2 };
      }

      // 4-to-2 Priority Encoder
      if (comp.type === 'ENCODER4_2') {
        const dMap: Record<string, number> = { in_D0: 0, in_D1: 1, in_D2: 2, in_D3: 3 };
        const dIdx = dMap[portId] ?? idx;
        return { x, y: y + (h / 5) * (dIdx + 1) };
      }

      // Flip-flops & Latches
      if (comp.type === 'DFF') {
        if (portId === 'in_D') return { x, y: y + h * 0.35 };
        if (portId === 'in_CLK') return { x, y: y + h * 0.65 };
      }
      if (comp.type === 'JKFF') {
        if (portId === 'in_J') return { x, y: y + h * 0.25 };
        if (portId === 'in_CLK') return { x, y: y + h * 0.50 };
        if (portId === 'in_K') return { x, y: y + h * 0.75 };
      }
      if (comp.type === 'TFF') {
        if (portId === 'in_T') return { x, y: y + h * 0.35 };
        if (portId === 'in_CLK') return { x, y: y + h * 0.65 };
      }
      if (comp.type === 'SR_LATCH') {
        if (portId === 'in_S') return { x, y: y + h * 0.35 };
        if (portId === 'in_R') return { x, y: y + h * 0.65 };
      }

      // Default inputs evenly spaced on left side
      const portY = n === 1 ? h / 2 : (h / (n + 1)) * (idx + 1);
      return { x, y: y + portY };
    } else {
      // Flip-flops & Latches outputs
      if (['DFF', 'JKFF', 'TFF', 'SR_LATCH'].includes(comp.type)) {
        if (portId === 'out_Q') return { x: x + w, y: y + h * 0.35 };
        if (portId === 'out_QBAR') return { x: x + w, y: y + h * 0.65 };
      }

      // Default outputs evenly spaced on right side
      const portY = n === 1 ? h / 2 : (h / (n + 1)) * (idx + 1);
      return { x: x + w, y: y + portY };
    }
  }

  /** Find which port (if any) is near a canvas position. */
  hitTestPort(
    graph: CircuitGraph,
    cx: number,
    cy: number,
  ): { componentId: string; portId: string; direction: 'input' | 'output' } | null {
    for (const comp of graph.getAllComponents()) {
      for (const port of comp.inputPorts) {
        const pos = this.getPortPosition(comp, port.id, 'input');
        if (pos && Math.hypot(pos.x - cx, pos.y - cy) <= PORT_HIT) {
          return { componentId: comp.id, portId: port.id, direction: 'input' };
        }
      }
      for (const port of comp.outputPorts) {
        const pos = this.getPortPosition(comp, port.id, 'output');
        if (pos && Math.hypot(pos.x - cx, pos.y - cy) <= PORT_HIT) {
          return { componentId: comp.id, portId: port.id, direction: 'output' };
        }
      }
    }
    return null;
  }

  /** Find which component body contains the point. */
  hitTestComponent(
    graph: CircuitGraph,
    cx: number,
    cy: number,
  ): Component | null {
    // Iterate in reverse to pick topmost (last rendered) component
    const comps = [...graph.getAllComponents()].reverse();
    for (const comp of comps) {
      const { x, y } = comp.position;
      const { width: w, height: h } = comp.size;
      if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) return comp;
    }
    return null;
  }

  /** Convert screen coordinates to circuit canvas coordinates. */
  screenToCanvas(
    screenX: number,
    screenY: number,
    state: RenderState,
  ): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (screenX - rect.left - state.panX) / state.zoom,
      y: (screenY - rect.top  - state.panY) / state.zoom,
    };
  }

  /** Resize canvas to match its CSS display size (DPI aware). */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
  }
}
