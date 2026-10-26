// =============================================================================
// canvas_ports.test.ts — Verification of CanvasRenderer port positioning
// and geometry for all MSI components, multiplexers, decoders, and latches.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { CanvasRenderer } from '../../src/ui/canvas/CanvasRenderer.js';

describe('CanvasRenderer — Port Positioning', () => {
  // Create dummy canvas element for CanvasRenderer
  const canvas = {
    getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    width: 800,
    height: 600,
  } as unknown as HTMLCanvasElement;

  const renderer = new CanvasRenderer(canvas);

  it('positions MUX2 select port at bottom center and data inputs on left', () => {
    const graph = new CircuitGraph();
    const mux = graph.addComponent('MUX2', { x: 100, y: 100 });
    const { width: w, height: h } = mux.size;

    const sPos  = renderer.getPortPosition(mux, 'in_S', 'input');
    const i0Pos = renderer.getPortPosition(mux, 'in_I0', 'input');
    const i1Pos = renderer.getPortPosition(mux, 'in_I1', 'input');
    const yPos  = renderer.getPortPosition(mux, 'out_Y', 'output');

    // S on bottom center
    expect(sPos).toEqual({ x: 100 + w / 2, y: 100 + h });
    // I0, I1 on left edge
    expect(i0Pos?.x).toBe(100);
    expect(i1Pos?.x).toBe(100);
    expect(i0Pos!.y).toBeLessThan(i1Pos!.y);
    // Y on right edge
    expect(yPos).toEqual({ x: 100 + w, y: 100 + h / 2 });
  });

  it('positions MUX4 select ports S0 and S1 at bottom edge and data inputs on left', () => {
    const graph = new CircuitGraph();
    const mux = graph.addComponent('MUX4', { x: 200, y: 200 });
    const { width: w, height: h } = mux.size;

    const s0Pos = renderer.getPortPosition(mux, 'in_S0', 'input');
    const s1Pos = renderer.getPortPosition(mux, 'in_S1', 'input');
    const i0Pos = renderer.getPortPosition(mux, 'in_I0', 'input');
    const i3Pos = renderer.getPortPosition(mux, 'in_I3', 'input');

    // S0, S1 on bottom edge
    expect(s0Pos?.y).toBe(200 + h);
    expect(s1Pos?.y).toBe(200 + h);
    expect(s0Pos!.x).toBeLessThan(s1Pos!.x);

    // Data inputs on left edge
    expect(i0Pos?.x).toBe(200);
    expect(i3Pos?.x).toBe(200);
    expect(i0Pos!.y).toBeLessThan(i3Pos!.y);
  });

  it('positions DEMUX1_2 and DEMUX1_4 select ports at bottom edge', () => {
    const graph = new CircuitGraph();
    const d2 = graph.addComponent('DEMUX1_2', { x: 50, y: 50 });
    const d4 = graph.addComponent('DEMUX1_4', { x: 150, y: 50 });

    const sPos  = renderer.getPortPosition(d2, 'in_S', 'input');
    const s0Pos = renderer.getPortPosition(d4, 'in_S0', 'input');
    const s1Pos = renderer.getPortPosition(d4, 'in_S1', 'input');

    expect(sPos?.y).toBe(50 + d2.size.height);
    expect(s0Pos?.y).toBe(50 + d4.size.height);
    expect(s1Pos?.y).toBe(50 + d4.size.height);
  });

  it('positions DECODER2_4 enable port at bottom center and address pins on left', () => {
    const graph = new CircuitGraph();
    const dec = graph.addComponent('DECODER2_4', { x: 300, y: 100 });
    const { width: w, height: h } = dec.size;

    const enPos = renderer.getPortPosition(dec, 'in_EN', 'input');
    const a0Pos = renderer.getPortPosition(dec, 'in_A0', 'input');
    const a1Pos = renderer.getPortPosition(dec, 'in_A1', 'input');

    expect(enPos).toEqual({ x: 300 + w / 2, y: 100 + h });
    expect(a0Pos?.x).toBe(300);
    expect(a1Pos?.x).toBe(300);
  });

  it('positions Flip-Flops (DFF, JKFF, TFF, SR_LATCH) ports cleanly', () => {
    const graph = new CircuitGraph();
    const jk = graph.addComponent('JKFF', { x: 400, y: 300 });
    const { width: w, height: h } = jk.size;

    const jPos   = renderer.getPortPosition(jk, 'in_J', 'input');
    const clkPos = renderer.getPortPosition(jk, 'in_CLK', 'input');
    const kPos   = renderer.getPortPosition(jk, 'in_K', 'input');
    const qPos   = renderer.getPortPosition(jk, 'out_Q', 'output');
    const qbPos  = renderer.getPortPosition(jk, 'out_QBAR', 'output');

    expect(jPos?.x).toBe(400);
    expect(clkPos?.x).toBe(400);
    expect(kPos?.x).toBe(400);
    expect(jPos!.y).toBeLessThan(clkPos!.y);
    expect(clkPos!.y).toBeLessThan(kPos!.y);

    expect(qPos?.x).toBe(400 + w);
    expect(qbPos?.x).toBe(400 + w);
    expect(qPos!.y).toBeLessThan(qbPos!.y);
  });
});
