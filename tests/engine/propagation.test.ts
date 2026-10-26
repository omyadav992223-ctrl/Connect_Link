// =============================================================================
// propagation.test.ts — End-to-end signal propagation tests.
// Tests the full chain: input → gate(s) → output via Propagator.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { Propagator } from '../../src/engine/Propagator.js';

describe('Single AND gate propagation', () => {
  let graph: CircuitGraph;
  let inA: ReturnType<CircuitGraph['addComponent']>;
  let inB: ReturnType<CircuitGraph['addComponent']>;
  let gate: ReturnType<CircuitGraph['addComponent']>;
  let led: ReturnType<CircuitGraph['addComponent']>;

  beforeEach(() => {
    graph = new CircuitGraph();
    inA  = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    inB  = graph.addComponent('INPUT', { x: 0, y: 80 }, 'B');
    gate = graph.addComponent('AND', { x: 150, y: 40 });
    led  = graph.addComponent('LED', { x: 300, y: 40 });

    graph.addWire(inA.id, 'out', gate.id, 'in_A');
    graph.addWire(inB.id, 'out', gate.id, 'in_B');
    graph.addWire(gate.id, 'out_Y', led.id, 'in');
  });

  it('A=0,B=0 → LED=0', () => {
    graph.setInputValue(inA.id, 0);
    graph.setInputValue(inB.id, 0);
    Propagator.propagate(graph);
    expect(led.outputPorts[0].value).toBe(0);
  });

  it('A=0,B=1 → LED=0', () => {
    graph.setInputValue(inA.id, 0);
    graph.setInputValue(inB.id, 1);
    Propagator.propagate(graph);
    expect(led.outputPorts[0].value).toBe(0);
  });

  it('A=1,B=0 → LED=0', () => {
    graph.setInputValue(inA.id, 1);
    graph.setInputValue(inB.id, 0);
    Propagator.propagate(graph);
    expect(led.outputPorts[0].value).toBe(0);
  });

  it('A=1,B=1 → LED=1', () => {
    graph.setInputValue(inA.id, 1);
    graph.setInputValue(inB.id, 1);
    Propagator.propagate(graph);
    expect(led.outputPorts[0].value).toBe(1);
  });
});

describe('NOT gate propagation', () => {
  it('inverts the input through a chain', () => {
    const graph = new CircuitGraph();
    const inp  = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const not1 = graph.addComponent('NOT',   { x: 100, y: 0 });
    const not2 = graph.addComponent('NOT',   { x: 200, y: 0 }); // double inversion → same as input
    const out  = graph.addComponent('OUTPUT', { x: 300, y: 0 });

    graph.addWire(inp.id,  'out',   not1.id, 'in_A');
    graph.addWire(not1.id, 'out_Y', not2.id, 'in_A');
    graph.addWire(not2.id, 'out_Y', out.id,  'in');

    graph.setInputValue(inp.id, 1);
    Propagator.propagate(graph);
    expect(out.outputPorts[0].value).toBe(1); // NOT(NOT(1)) = 1

    graph.setInputValue(inp.id, 0);
    Propagator.propagate(graph);
    expect(out.outputPorts[0].value).toBe(0); // NOT(NOT(0)) = 0
  });
});

describe('Blind-spot circuit propagation', () => {
  // L AND R AND LC → Critical
  let graph: CircuitGraph;
  let inL: ReturnType<CircuitGraph['addComponent']>;
  let inR: ReturnType<CircuitGraph['addComponent']>;
  let inLC: ReturnType<CircuitGraph['addComponent']>;
  let critLed: ReturnType<CircuitGraph['addComponent']>;

  beforeEach(() => {
    graph = new CircuitGraph();
    inL  = graph.addComponent('INPUT', { x: 0, y: 0 },   'L');
    inR  = graph.addComponent('INPUT', { x: 0, y: 80 },  'R');
    inLC = graph.addComponent('INPUT', { x: 0, y: 160 }, 'LC');

    const and1 = graph.addComponent('AND', { x: 150, y: 40 });   // L AND R
    const and2 = graph.addComponent('AND', { x: 300, y: 80 });   // (L AND R) AND LC
    critLed    = graph.addComponent('LED', { x: 450, y: 80 }, 'CRITICAL');

    graph.addWire(inL.id,  'out',   and1.id, 'in_A');
    graph.addWire(inR.id,  'out',   and1.id, 'in_B');
    graph.addWire(and1.id, 'out_Y', and2.id, 'in_A');
    graph.addWire(inLC.id, 'out',   and2.id, 'in_B');
    graph.addWire(and2.id, 'out_Y', critLed.id, 'in');
  });

  const cases: Array<[0|1, 0|1, 0|1, 0|1]> = [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [1, 1, 0, 0],
    [1, 0, 1, 0],
    [0, 1, 1, 0],
    [1, 1, 1, 1], // Only this should activate critical warning
  ];

  for (const [l, r, lc, expected] of cases) {
    it(`L=${l},R=${r},LC=${lc} → Critical=${expected}`, () => {
      graph.setInputValue(inL.id,  l);
      graph.setInputValue(inR.id,  r);
      graph.setInputValue(inLC.id, lc);
      Propagator.propagate(graph);
      expect(critLed.outputPorts[0].value).toBe(expected);
    });
  }
});

describe('MUX propagation', () => {
  it('selects correct data line based on select signal', () => {
    const graph = new CircuitGraph();
    const i0  = graph.addComponent('INPUT', { x: 0, y: 0 },  'I0');
    const i1  = graph.addComponent('INPUT', { x: 0, y: 60 }, 'I1');
    const s   = graph.addComponent('INPUT', { x: 0, y: 120 }, 'S');
    const mux = graph.addComponent('MUX2', { x: 150, y: 60 });
    const out = graph.addComponent('OUTPUT', { x: 300, y: 60 });

    graph.addWire(i0.id,  'out',   mux.id, 'in_I0');
    graph.addWire(i1.id,  'out',   mux.id, 'in_I1');
    graph.addWire(s.id,   'out',   mux.id, 'in_S');
    graph.addWire(mux.id, 'out_Y', out.id, 'in');

    graph.setInputValue(i0.id, 0);
    graph.setInputValue(i1.id, 1);
    graph.setInputValue(s.id, 0);  // S=0 → select I0
    Propagator.propagate(graph);
    expect(out.outputPorts[0].value).toBe(0);

    graph.setInputValue(s.id, 1);  // S=1 → select I1
    Propagator.propagate(graph);
    expect(out.outputPorts[0].value).toBe(1);
  });
});

describe('Wire removal breaks propagation', () => {
  it('LED goes unknown after wire is removed', () => {
    const graph = new CircuitGraph();
    const inp = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const led = graph.addComponent('LED', { x: 150, y: 0 });

    const result = graph.addWire(inp.id, 'out', led.id, 'in');
    if (!('wire' in result)) throw new Error('Wire not created');

    graph.setInputValue(inp.id, 1);
    Propagator.propagate(graph);
    expect(led.outputPorts[0].value).toBe(1);

    // Remove the wire — LED input reverts to X
    graph.removeWire(result.wire.id);
    led.inputPorts[0].value = 'X';
    Propagator.propagate(graph);
    expect(led.outputPorts[0].value).toBe('X');
  });
});

describe('Multiple outputs fan-out', () => {
  it('one output drives two LEDs', () => {
    const graph = new CircuitGraph();
    const inp  = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const led1 = graph.addComponent('LED', { x: 150, y: 0 });
    const led2 = graph.addComponent('LED', { x: 150, y: 80 });

    graph.addWire(inp.id, 'out', led1.id, 'in');
    graph.addWire(inp.id, 'out', led2.id, 'in');

    graph.setInputValue(inp.id, 1);
    Propagator.propagate(graph);

    expect(led1.outputPorts[0].value).toBe(1);
    expect(led2.outputPorts[0].value).toBe(1);
  });
});

describe('Switch toggle through various gates', () => {
  it('toggleInput toggles INPUT component and propagates to NOT gate and LED', () => {
    const graph = new CircuitGraph();
    const sw = graph.addComponent('INPUT', { x: 0, y: 0 }, 'Switch');
    const notGate = graph.addComponent('NOT', { x: 100, y: 0 });
    const led = graph.addComponent('LED', { x: 200, y: 0 });

    // Initial value is 0
    expect(sw.outputPorts[0].value).toBe(0);

    graph.addWire(sw.id, 'out', notGate.id, 'in_A');
    graph.addWire(notGate.id, 'out_Y', led.id, 'in');

    Propagator.propagate(graph);
    // 0 into NOT -> 1 into LED
    expect(notGate.outputPorts[0].value).toBe(1);
    expect(led.outputPorts[0].value).toBe(1);

    // Toggle switch: 0 -> 1
    const toggled = graph.toggleInput(sw.id);
    expect(toggled).toBe(true);
    expect(sw.outputPorts[0].value).toBe(1);

    Propagator.propagate(graph);
    // 1 into NOT -> 0 into LED
    expect(notGate.outputPorts[0].value).toBe(0);
    expect(led.outputPorts[0].value).toBe(0);

    // Toggle switch again: 1 -> 0
    graph.toggleInput(sw.id);
    expect(sw.outputPorts[0].value).toBe(0);
    Propagator.propagate(graph);
    expect(notGate.outputPorts[0].value).toBe(1);
    expect(led.outputPorts[0].value).toBe(1);
  });

  it('toggleInput works on BUTTON and CLOCK components', () => {
    const graph = new CircuitGraph();
    const btn = graph.addComponent('BUTTON', { x: 0, y: 0 });
    const clk = graph.addComponent('CLOCK', { x: 0, y: 50 });

    expect(btn.outputPorts[0].value).toBe(0);
    expect(clk.outputPorts[0].value).toBe(0);

    graph.toggleInput(btn.id);
    expect(btn.outputPorts[0].value).toBe(1);

    graph.toggleInput(clk.id);
    expect(clk.outputPorts[0].value).toBe(1);
  });

  it('toggleInput on two switches driving AND gate', () => {
    const graph = new CircuitGraph();
    const sw1 = graph.addComponent('INPUT', { x: 0, y: 0 }, 'S1');
    const sw2 = graph.addComponent('INPUT', { x: 0, y: 50 }, 'S2');
    const andGate = graph.addComponent('AND', { x: 120, y: 25 });
    const out = graph.addComponent('OUTPUT', { x: 220, y: 25 });

    graph.addWire(sw1.id, 'out', andGate.id, 'in_A');
    graph.addWire(sw2.id, 'out', andGate.id, 'in_B');
    graph.addWire(andGate.id, 'out_Y', out.id, 'in');

    // Both start at 0
    Propagator.propagate(graph);
    expect(andGate.outputPorts[0].value).toBe(0);
    expect(out.outputPorts[0].value).toBe(0);

    // Turn sw1 ON
    graph.toggleInput(sw1.id);
    Propagator.propagate(graph);
    expect(andGate.outputPorts[0].value).toBe(0);

    // Turn sw2 ON
    graph.toggleInput(sw2.id);
    Propagator.propagate(graph);
    expect(andGate.outputPorts[0].value).toBe(1);
    expect(out.outputPorts[0].value).toBe(1);

    // Turn sw1 OFF
    graph.toggleInput(sw1.id);
    Propagator.propagate(graph);
    expect(andGate.outputPorts[0].value).toBe(0);
    expect(out.outputPorts[0].value).toBe(0);
  });
});
