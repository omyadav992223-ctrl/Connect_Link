// =============================================================================
// ComponentSymbols.ts — Canvas 2D drawing primitives for each gate type.
// IEEE Std 91 / ANSI gate symbol shapes.
// All functions accept a CanvasRenderingContext2D and draw relative to (0,0).
// The caller is responsible for translating/scaling the context.
// =============================================================================

export type LogicVisual = 0 | 1 | 'X';

// ---------------------------------------------------------------------------
// Color scheme
// ---------------------------------------------------------------------------
export const COLORS = {
  gate: {
    body:        '#1e293b',
    bodyHover:   '#334155',
    bodyError:   '#7f1d1d',
    border:      '#475569',
    borderSel:   '#3b82f6',
    borderError: '#ef4444',
    label:       '#94a3b8',
    labelSel:    '#e2e8f0',
  },
  port: {
    input:   '#64748b',
    output:  '#64748b',
    hover:   '#f59e0b',
  },
  signal: {
    high:    '#22c55e',   // GREEN  — logic 1
    low:     '#3b82f6',   // BLUE   — logic 0
    unknown: '#6b7280',   // GREY   — X
    highFill:'#15803d',
    lowFill: '#1d4ed8',
  },
  led: {
    offBody: '#374151',
    onBody:  '#fef08a',
    onGlow:  '#facc15',
    critOn:  '#f87171',
    critGlow:'#ef4444',
  },
  buzzer: {
    off: '#374151',
    on:  '#fb923c',
  },
};

export function signalColor(v: LogicVisual): string {
  if (v === 1) return COLORS.signal.high;
  if (v === 0) return COLORS.signal.low;
  return COLORS.signal.unknown;
}

// ---------------------------------------------------------------------------
// Port dot
// ---------------------------------------------------------------------------
export function drawPortDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: LogicVisual,
  hovered = false,
): void {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = hovered ? COLORS.port.hover : signalColor(value);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// AND gate shape
// ---------------------------------------------------------------------------
export function drawAND(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.5, 0);
  ctx.arc(w * 0.5, h / 2, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(0, h);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// OR gate shape (curved body)
// ---------------------------------------------------------------------------
export function drawOR(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(w * 0.4, 0, w, h / 2);
  ctx.quadraticCurveTo(w * 0.4, h, 0, h);
  ctx.quadraticCurveTo(w * 0.2, h / 2, 0, 0);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// XOR has an extra curved line at the input
// ---------------------------------------------------------------------------
export function drawXOR(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Main OR body
  drawOR(ctx, w, h);
  // Extra curved input line
  ctx.moveTo(-8, 0);
  ctx.quadraticCurveTo(w * 0.2 - 8, h / 2, -8, h);
}

// ---------------------------------------------------------------------------
// NOT (triangle with bubble)
// ---------------------------------------------------------------------------
export function drawNOT(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bw = w - 8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, h);
  ctx.lineTo(bw, h / 2);
  ctx.closePath();
}

export function drawNOTBubble(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.arc(w - 4, h / 2, 4, 0, Math.PI * 2);
}

// ---------------------------------------------------------------------------
// NAND = AND + bubble
// ---------------------------------------------------------------------------
export function drawNANDBubble(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.arc(w - 4, h / 2, 4, 0, Math.PI * 2);
}

// ---------------------------------------------------------------------------
// NOR = OR + bubble
// ---------------------------------------------------------------------------
export function drawNORBubble(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.arc(w - 4, h / 2, 4, 0, Math.PI * 2);
}

// ---------------------------------------------------------------------------
// LED component
// ---------------------------------------------------------------------------
export function drawLED(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  value: LogicVisual,
  isCritical = false,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const r  = Math.min(w, h) / 2 - 4;

  if (value === 1) {
    // Glow effect
    const color = isCritical ? COLORS.led.critGlow : COLORS.led.onGlow;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 8);
    gradient.addColorStop(0, color + 'cc');
    gradient.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // Body
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = value === 1
    ? (isCritical ? COLORS.led.critOn : COLORS.led.onBody)
    : COLORS.led.offBody;
  ctx.fill();
  ctx.strokeStyle = value === 1 ? COLORS.led.onGlow : '#4b5563';
  ctx.lineWidth = 2;
  ctx.stroke();

  // LED symbol (lines inside circle)
  if (value !== 1) {
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.4, cy - r * 0.2);
    ctx.lineTo(cx + r * 0.4, cy - r * 0.2);
    ctx.moveTo(cx - r * 0.4, cy + r * 0.2);
    ctx.lineTo(cx + r * 0.4, cy + r * 0.2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// INPUT toggle switch
// ---------------------------------------------------------------------------
export function drawInput(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  value: LogicVisual,
  _label?: string,
): void {
  const trackW = w - 6;
  const trackH = h - 14;
  const tx = 3;
  const ty = 7;

  // Track
  ctx.beginPath();
  ctx.roundRect(tx, ty, trackW, trackH, trackH / 2);
  ctx.fillStyle = value === 1 ? '#15803d' : '#334155';
  ctx.fill();
  ctx.strokeStyle = value === 1 ? '#22c55e' : '#64748b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Value text on track
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textX = value === 1 ? tx + 14 : tx + trackW - 14;
  ctx.fillText(value === 1 ? '1' : '0', textX, ty + trackH / 2);

  // Knob
  const knobR = (trackH / 2) - 2;
  const knobX = value === 1
    ? tx + trackW - knobR - 2
    : tx + knobR + 2;
  ctx.beginPath();
  ctx.arc(knobX, ty + trackH / 2, knobR, 0, Math.PI * 2);
  ctx.fillStyle = value === 1 ? '#4ade80' : '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// OUTPUT logic probe display
// ---------------------------------------------------------------------------
export function drawOutput(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  value: LogicVisual,
): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 6);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = signalColor(value);
  ctx.lineWidth = 2;
  ctx.stroke();

  if (value === 1) {
    ctx.shadowColor = COLORS.signal.high;
    ctx.shadowBlur = 8;
  }

  ctx.fillStyle = signalColor(value);
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value === 'X' ? 'X' : String(value), w / 2, h / 2);
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// CLOCK pulse generator
// ---------------------------------------------------------------------------
export function drawClock(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  value: LogicVisual,
): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 6);
  ctx.fillStyle = '#1e293b';
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = signalColor(value);
  ctx.lineWidth = 2;
  ctx.beginPath();
  const mid = h / 2;
  ctx.moveTo(8, mid + 6);
  ctx.lineTo(16, mid + 6);
  ctx.lineTo(16, mid - 6);
  ctx.lineTo(26, mid - 6);
  ctx.lineTo(26, mid + 6);
  ctx.lineTo(36, mid + 6);
  ctx.stroke();

  ctx.fillStyle = signalColor(value);
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), w - 8, mid);
}

// ---------------------------------------------------------------------------
// BUZZER
// ---------------------------------------------------------------------------
export function drawBuzzer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  value: LogicVisual,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const r  = Math.min(w, h) / 2 - 6;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = value === 1 ? COLORS.buzzer.on : COLORS.buzzer.off;
  ctx.fill();
  ctx.strokeStyle = value === 1 ? '#fb923c' : '#4b5563';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Sound wave arcs when active
  if (value === 1) {
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + i * 6, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// MUX body (trapezoid narrowing left to right)
// ---------------------------------------------------------------------------
export function drawMUX(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const inset = 10;
  ctx.beginPath();
  ctx.moveTo(0, inset);
  ctx.lineTo(0, h - inset);
  ctx.lineTo(w, h - inset * 0.4);
  ctx.lineTo(w, inset * 0.4);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// DEMUX body (trapezoid expanding left to right)
// ---------------------------------------------------------------------------
export function drawDEMUX(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const inset = 10;
  ctx.beginPath();
  ctx.moveTo(0, inset * 0.4);
  ctx.lineTo(0, h - inset * 0.4);
  ctx.lineTo(w, h - inset);
  ctx.lineTo(w, inset);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// COMPARATOR body (rectangle)
// ---------------------------------------------------------------------------
export function drawComparator(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 4);
}

// ---------------------------------------------------------------------------
// IC Block Body (rectangle with notch on top)
// ---------------------------------------------------------------------------
export function drawICBlock(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 6);
}

// ---------------------------------------------------------------------------
// Generic component label
// ---------------------------------------------------------------------------
export function drawGateLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
  color = COLORS.gate.label,
): void {
  ctx.fillStyle = color;
  ctx.font = `bold 11px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}
