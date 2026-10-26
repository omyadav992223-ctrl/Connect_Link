// =============================================================================
// clocking_ui_lifecycle.test.ts — Regression & integration tests for clock
// controls, sequential component state cycles, and safe lifecycle management.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { Propagator } from '../../src/engine/Propagator.js';
import { evaluateComponent } from '../../src/engine/Evaluator.js';
import { loadBlindSpotPreset } from '../../src/ui/presets/BlindSpotPreset.js';

describe('Clock Control & Lifecycle Integration', () => {
  it('returns false from tickClocks when no CLOCK component is present', () => {
    const graph = new CircuitGraph();
    loadBlindSpotPreset(graph);
    expect(graph.getClockComponents()).toHaveLength(0);

    const toggled = graph.tickClocks();
    expect(toggled).toBe(false);
  });

  it('toggles multiple clocks independently or in tandem', () => {
    const graph = new CircuitGraph();
    const clk1 = graph.addComponent('CLOCK', { x: 0, y: 0 }, 'CLK1');
    const clk2 = graph.addComponent('CLOCK', { x: 0, y: 100 }, 'CLK2');

    expect(clk1.outputPorts[0].value).toBe(0);
    expect(clk2.outputPorts[0].value).toBe(0);

    // Tandem toggle
    const toggled = graph.tickClocks();
    expect(toggled).toBe(true);
    expect(clk1.outputPorts[0].value).toBe(1);
    expect(clk2.outputPorts[0].value).toBe(1);

    // Specific toggle
    graph.tickClocks(clk1.id);
    expect(clk1.outputPorts[0].value).toBe(0);
    expect(clk2.outputPorts[0].value).toBe(1);

    // Reset clocks
    graph.resetClocks();
    expect(clk1.outputPorts[0].value).toBe(0);
    expect(clk2.outputPorts[0].value).toBe(0);
  });

  it('resets sequential state across DFF, JKFF, TFF, and SR_LATCH simultaneously', () => {
    const graph = new CircuitGraph();
    const dff = graph.addComponent('DFF', { x: 0, y: 0 });
    const jk  = graph.addComponent('JKFF', { x: 100, y: 0 });
    const t   = graph.addComponent('TFF', { x: 200, y: 0 });
    const sr  = graph.addComponent('SR_LATCH', { x: 300, y: 0 });

    // Set all to Q=1
    dff.outputPorts.find(p => p.id === 'out_Q')!.value = 1;
    dff.outputPorts.find(p => p.id === 'out_QBAR')!.value = 0;
    dff.config['_prevClk'] = 1;

    jk.outputPorts.find(p => p.id === 'out_Q')!.value = 1;
    jk.outputPorts.find(p => p.id === 'out_QBAR')!.value = 0;
    jk.config['_prevClk'] = 1;

    t.outputPorts.find(p => p.id === 'out_Q')!.value = 1;
    t.outputPorts.find(p => p.id === 'out_QBAR')!.value = 0;
    t.config['_prevClk'] = 1;

    sr.outputPorts.find(p => p.id === 'out_Q')!.value = 1;
    sr.outputPorts.find(p => p.id === 'out_QBAR')!.value = 0;

    // Reset sequential state
    graph.resetSequentialState();

    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);
    expect(dff.config['_prevClk']).toBe(0);

    expect(jk.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(jk.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);
    expect(jk.config['_prevClk']).toBe(0);

    expect(t.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(t.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);
    expect(t.config['_prevClk']).toBe(0);

    expect(sr.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(sr.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);
  });

  it('safely breaks feedback cycles at sequential register boundaries while catching pure combinational cycles', () => {
    const graph = new CircuitGraph();

    // 1. Valid sequential self-loop
    const dff = graph.addComponent('DFF', { x: 0, y: 0 });
    const wireRes = graph.addWire(dff.id, 'out_QBAR', dff.id, 'in_D');
    expect('error' in wireRes).toBe(false);

    // 2. Pure combinational self-loop on an AND gate should be rejected at wiring or flagged during propagation
    const and1 = graph.addComponent('AND', { x: 100, y: 0 });
    const combWireRes = graph.addWire(and1.id, 'out_Y', and1.id, 'in_A');
    expect('error' in combWireRes).toBe(true);

    // 3. Multi-gate combinational cycle: OR -> AND -> OR
    const or1 = graph.addComponent('OR', { x: 200, y: 0 });
    graph.addWire(and1.id, 'out_Y', or1.id, 'in_A');
    graph.addWire(or1.id, 'out_Y', and1.id, 'in_B');

    const propRes = Propagator.propagate(graph);
    expect(propRes.success).toBe(false);
    expect(propRes.errors[0].message).toContain('Combinational cycle detected');
  });

  it('SR Latch maintains hold state across propagation steps and handles invalid condition', () => {
    const graph = new CircuitGraph();
    const inS = graph.addComponent('INPUT', { x: 0, y: 0 }, 'S');
    const inR = graph.addComponent('INPUT', { x: 0, y: 80 }, 'R');
    const sr  = graph.addComponent('SR_LATCH', { x: 150, y: 40 });
    const ledQ = graph.addComponent('LED', { x: 300, y: 20 }, 'Q');
    const ledQb = graph.addComponent('LED', { x: 300, y: 60 }, 'QBAR');

    graph.addWire(inS.id, 'out', sr.id, 'in_S');
    graph.addWire(inR.id, 'out', sr.id, 'in_R');
    graph.addWire(sr.id, 'out_Q', ledQ.id, 'in');
    graph.addWire(sr.id, 'out_QBAR', ledQb.id, 'in');

    // 1. Set (S=1, R=0) -> Q=1, QBAR=0
    graph.setInputValue(inS.id, 1);
    graph.setInputValue(inR.id, 0);
    Propagator.propagate(graph);
    expect(ledQ.outputPorts[0].value).toBe(1);
    expect(ledQb.outputPorts[0].value).toBe(0);

    // 2. Hold (S=0, R=0) -> Q remains 1
    graph.setInputValue(inS.id, 0);
    Propagator.propagate(graph);
    expect(ledQ.outputPorts[0].value).toBe(1);
    expect(ledQb.outputPorts[0].value).toBe(0);

    // 3. Reset (S=0, R=1) -> Q=0, QBAR=1
    graph.setInputValue(inR.id, 1);
    Propagator.propagate(graph);
    expect(ledQ.outputPorts[0].value).toBe(0);
    expect(ledQb.outputPorts[0].value).toBe(1);

    // 4. Hold (S=0, R=0) -> Q remains 0
    graph.setInputValue(inR.id, 0);
    Propagator.propagate(graph);
    expect(ledQ.outputPorts[0].value).toBe(0);
    expect(ledQb.outputPorts[0].value).toBe(1);

    // 5. Invalid (S=1, R=1) -> Q='X', QBAR='X'
    graph.setInputValue(inS.id, 1);
    graph.setInputValue(inR.id, 1);
    Propagator.propagate(graph);
    expect(ledQ.outputPorts[0].value).toBe('X');
    expect(ledQb.outputPorts[0].value).toBe('X');
  });
});
