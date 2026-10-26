// =============================================================================
// sequential.test.ts — Comprehensive verification of sequential logic,
// edge-triggered flip-flops (DFF, JKFF, TFF), SR Latch, clock edge transitions,
// steady clock levels, sequential feedback loops, and counters.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { Propagator } from '../../src/engine/Propagator.js';
import { evaluateComponent } from '../../src/engine/Evaluator.js';

describe('Sequential Logic — D Flip-Flop (DFF) Edge Triggering & Truth Table', () => {
  it('latches D=1 on rising clock edge (0 -> 1) and sets Q=1, QBAR=0', () => {
    const graph = new CircuitGraph();
    const dff = graph.addComponent('DFF', { x: 0, y: 0 });

    dff.inputPorts.find(p => p.id === 'in_D')!.value = 1;
    dff.inputPorts.find(p => p.id === 'in_CLK')!.value = 0;
    evaluateComponent(dff);
    // Clock is 0 -> initial state held
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);

    // Rising edge 0 -> 1
    dff.inputPorts.find(p => p.id === 'in_CLK')!.value = 1;
    evaluateComponent(dff);
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(0);
  });

  it('holds latched state when CLK is held high (repeated clock level 1)', () => {
    const graph = new CircuitGraph();
    const dff = graph.addComponent('DFF', { x: 0, y: 0 });

    // Latch 1
    dff.inputPorts.find(p => p.id === 'in_D')!.value = 1;
    dff.inputPorts.find(p => p.id === 'in_CLK')!.value = 1;
    evaluateComponent(dff);
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);

    // D changes to 0 while CLK is STILL 1
    dff.inputPorts.find(p => p.id === 'in_D')!.value = 0;
    evaluateComponent(dff);
    // Must HOLD Q=1 (no rising edge!)
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(0);
  });

  it('holds state on falling clock edge (1 -> 0)', () => {
    const graph = new CircuitGraph();
    const dff = graph.addComponent('DFF', { x: 0, y: 0 });

    // Latch 1
    dff.inputPorts.find(p => p.id === 'in_D')!.value = 1;
    dff.inputPorts.find(p => p.id === 'in_CLK')!.value = 1;
    evaluateComponent(dff);

    // Falling edge 1 -> 0
    dff.inputPorts.find(p => p.id === 'in_CLK')!.value = 0;
    evaluateComponent(dff);
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(0);
  });

  it('latches D=0 on next rising edge', () => {
    const graph = new CircuitGraph();
    const dff = graph.addComponent('DFF', { x: 0, y: 0 });

    // Latch 1
    dff.inputPorts.find(p => p.id === 'in_D')!.value = 1;
    dff.inputPorts.find(p => p.id === 'in_CLK')!.value = 1;
    evaluateComponent(dff);

    // Drop clock to 0 and set D=0
    dff.inputPorts.find(p => p.id === 'in_CLK')!.value = 0;
    dff.inputPorts.find(p => p.id === 'in_D')!.value = 0;
    evaluateComponent(dff);

    // Next rising edge 0 -> 1
    dff.inputPorts.find(p => p.id === 'in_CLK')!.value = 1;
    evaluateComponent(dff);
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);
  });
});

describe('Sequential Logic — JK Flip-Flop (JKFF) Full Truth Table', () => {
  it('executes HOLD (0,0), RESET (0,1), SET (1,0) and TOGGLE (1,1)', () => {
    const graph = new CircuitGraph();
    const jk = graph.addComponent('JKFF', { x: 0, y: 0 });
    const inJ = jk.inputPorts.find(p => p.id === 'in_J')!;
    const inK = jk.inputPorts.find(p => p.id === 'in_K')!;
    const inClk = jk.inputPorts.find(p => p.id === 'in_CLK')!;
    const outQ = jk.outputPorts.find(p => p.id === 'out_Q')!;
    const outQb = jk.outputPorts.find(p => p.id === 'out_QBAR')!;

    const pulse = (j: 0|1, k: 0|1) => {
      inJ.value = j;
      inK.value = k;
      inClk.value = 0;
      evaluateComponent(jk);
      inClk.value = 1; // Rising edge
      evaluateComponent(jk);
    };

    // 1. SET: J=1, K=0 -> Q=1, Q'=0
    pulse(1, 0);
    expect(outQ.value).toBe(1);
    expect(outQb.value).toBe(0);

    // 2. HOLD: J=0, K=0 -> Q remains 1
    pulse(0, 0);
    expect(outQ.value).toBe(1);
    expect(outQb.value).toBe(0);

    // 3. RESET: J=0, K=1 -> Q=0, Q'=1
    pulse(0, 1);
    expect(outQ.value).toBe(0);
    expect(outQb.value).toBe(1);

    // 4. HOLD: J=0, K=0 -> Q remains 0
    pulse(0, 0);
    expect(outQ.value).toBe(0);
    expect(outQb.value).toBe(1);

    // 5. TOGGLE: J=1, K=1 -> Q toggles to 1
    pulse(1, 1);
    expect(outQ.value).toBe(1);
    expect(outQb.value).toBe(0);

    // 6. TOGGLE again: J=1, K=1 -> Q toggles to 0
    pulse(1, 1);
    expect(outQ.value).toBe(0);
    expect(outQb.value).toBe(1);
  });
});

describe('Sequential Logic — T Flip-Flop (TFF)', () => {
  it('holds state when T=0 and toggles when T=1 on rising edges', () => {
    const graph = new CircuitGraph();
    const tff = graph.addComponent('TFF', { x: 0, y: 0 });
    const inT = tff.inputPorts.find(p => p.id === 'in_T')!;
    const inClk = tff.inputPorts.find(p => p.id === 'in_CLK')!;
    const outQ = tff.outputPorts.find(p => p.id === 'out_Q')!;

    // Initial state Q=0
    expect(outQ.value).toBe(0);

    // T=0 on rising edge -> Hold Q=0
    inT.value = 0;
    inClk.value = 0; evaluateComponent(tff);
    inClk.value = 1; evaluateComponent(tff);
    expect(outQ.value).toBe(0);

    // T=1 on rising edge -> Toggle Q to 1
    inT.value = 1;
    inClk.value = 0; evaluateComponent(tff);
    inClk.value = 1; evaluateComponent(tff);
    expect(outQ.value).toBe(1);

    // T=1 with steady CLK=1 -> Hold Q=1
    evaluateComponent(tff);
    expect(outQ.value).toBe(1);

    // T=1 on next rising edge -> Toggle Q to 0
    inClk.value = 0; evaluateComponent(tff);
    inClk.value = 1; evaluateComponent(tff);
    expect(outQ.value).toBe(0);
  });
});

describe('Sequential Logic — SR Latch (SR_LATCH)', () => {
  it('implements SET, RESET, HOLD and INVALID states', () => {
    const graph = new CircuitGraph();
    const sr = graph.addComponent('SR_LATCH', { x: 0, y: 0 });
    const inS = sr.inputPorts.find(p => p.id === 'in_S')!;
    const inR = sr.inputPorts.find(p => p.id === 'in_R')!;
    const outQ = sr.outputPorts.find(p => p.id === 'out_Q')!;
    const outQb = sr.outputPorts.find(p => p.id === 'out_QBAR')!;

    // SET: S=1, R=0
    inS.value = 1; inR.value = 0;
    evaluateComponent(sr);
    expect(outQ.value).toBe(1);
    expect(outQb.value).toBe(0);

    // HOLD: S=0, R=0
    inS.value = 0; inR.value = 0;
    evaluateComponent(sr);
    expect(outQ.value).toBe(1);
    expect(outQb.value).toBe(0);

    // RESET: S=0, R=1
    inS.value = 0; inR.value = 1;
    evaluateComponent(sr);
    expect(outQ.value).toBe(0);
    expect(outQb.value).toBe(1);

    // HOLD: S=0, R=0
    inS.value = 0; inR.value = 0;
    evaluateComponent(sr);
    expect(outQ.value).toBe(0);
    expect(outQb.value).toBe(1);

    // INVALID: S=1, R=1
    inS.value = 1; inR.value = 1;
    evaluateComponent(sr);
    expect(outQ.value).toBe('X');
    expect(outQb.value).toBe('X');
  });
});

describe('Sequential Feedback — End-to-End Circuit Propagation', () => {
  it('propagates D-Flip-Flop divide-by-2 toggle circuit without false cycle error', () => {
    const graph = new CircuitGraph();

    const clk = graph.addComponent('CLOCK', { x: 0, y: 50 });
    const dff = graph.addComponent('DFF',   { x: 150, y: 50 });
    const led = graph.addComponent('LED',   { x: 300, y: 50 }, 'Q_OUT');

    // Connect clock
    graph.addWire(clk.id, 'out', dff.id, 'in_CLK');
    // Connect feedback Q' -> D
    graph.addWire(dff.id, 'out_QBAR', dff.id, 'in_D');
    // Connect output to LED
    graph.addWire(dff.id, 'out_Q', led.id, 'in');

    // Initial propagation (CLK is 0)
    const initRes = Propagator.propagate(graph);
    expect(initRes.success).toBe(true);
    expect(initRes.errors).toHaveLength(0);
    expect(led.outputPorts[0].value).toBe(0);
    // D input port should have received settled value from QBAR (1)
    expect(dff.inputPorts.find(p => p.id === 'in_D')!.value).toBe(1);

    // Clock Tick 1: CLK goes 0 -> 1 (Rising edge!)
    graph.setInputValue(clk.id, 1);
    const tick1 = Propagator.propagate(graph);
    expect(tick1.success).toBe(true);
    expect(tick1.errors).toHaveLength(0);
    expect(led.outputPorts[0].value).toBe(1);
    // Next state at D is now 0 (from QBAR)
    expect(dff.inputPorts.find(p => p.id === 'in_D')!.value).toBe(0);

    // Clock Tick 2: CLK goes 1 -> 0 (Falling edge!)
    graph.setInputValue(clk.id, 0);
    const tick2 = Propagator.propagate(graph);
    expect(tick2.success).toBe(true);
    // Q holds 1
    expect(led.outputPorts[0].value).toBe(1);

    // Clock Tick 3: CLK goes 0 -> 1 (Second rising edge!)
    graph.setInputValue(clk.id, 1);
    const tick3 = Propagator.propagate(graph);
    expect(tick3.success).toBe(true);
    // Q toggles to 0!
    expect(led.outputPorts[0].value).toBe(0);
    // Next state at D is now 1
    expect(dff.inputPorts.find(p => p.id === 'in_D')!.value).toBe(1);
  });

  it('propagates 2-bit ripple counter dividing frequency across two flip-flops', () => {
    const graph = new CircuitGraph();

    const clk  = graph.addComponent('CLOCK', { x: 0, y: 50 });
    const ff0  = graph.addComponent('DFF',   { x: 120, y: 50 }, 'FF0');
    const ff1  = graph.addComponent('DFF',   { x: 260, y: 50 }, 'FF1');
    const led0 = graph.addComponent('LED',   { x: 200, y: 150 }, 'BIT0');
    const led1 = graph.addComponent('LED',   { x: 360, y: 150 }, 'BIT1');

    // FF0: CLK -> FF0.CLK, FF0.QBAR -> FF0.D, FF0.Q -> led0
    graph.addWire(clk.id, 'out', ff0.id, 'in_CLK');
    graph.addWire(ff0.id, 'out_QBAR', ff0.id, 'in_D');
    graph.addWire(ff0.id, 'out_Q', led0.id, 'in');

    // FF1 clocked by FF0.Q (ripple counter): FF0.Q -> FF1.CLK, FF1.QBAR -> FF1.D, FF1.Q -> led1
    graph.addWire(ff0.id, 'out_Q', ff1.id, 'in_CLK');
    graph.addWire(ff1.id, 'out_QBAR', ff1.id, 'in_D');
    graph.addWire(ff1.id, 'out_Q', led1.id, 'in');

    // Initialize (CLK = 0)
    Propagator.propagate(graph);
    expect(led0.outputPorts[0].value).toBe(0);
    expect(led1.outputPorts[0].value).toBe(0);

    // Helper: pulse clock (0 -> 1 -> 0)
    const clockPulse = () => {
      graph.setInputValue(clk.id, 1);
      Propagator.propagate(graph);
      graph.setInputValue(clk.id, 0);
      Propagator.propagate(graph);
    };

    // Pulse 1: FF0 toggles to 1 (BIT0=1, BIT1=0)
    // FF0.Q went 0 -> 1, triggering FF1 rising edge! FF1 toggles to 1!
    clockPulse();
    expect(led0.outputPorts[0].value).toBe(1);
    expect(led1.outputPorts[0].value).toBe(1);

    // Pulse 2: FF0 toggles back to 0 (BIT0=0).
    // FF0.Q went 1 -> 0 (falling edge on FF1), so FF1 holds 1!
    clockPulse();
    expect(led0.outputPorts[0].value).toBe(0);
    expect(led1.outputPorts[0].value).toBe(1);

    // Pulse 3: FF0 toggles to 1.
    // FF0.Q went 0 -> 1, triggering FF1 rising edge! FF1 toggles to 0!
    clockPulse();
    expect(led0.outputPorts[0].value).toBe(1);
    expect(led1.outputPorts[0].value).toBe(0);
  });

  it('still detects true combinational cycles without flip-flops', () => {
    const graph = new CircuitGraph();
    const and1 = graph.addComponent('AND', { x: 50, y: 50 });
    const or1  = graph.addComponent('OR',  { x: 150, y: 50 });

    // Pure combinational loop: AND -> OR -> AND
    graph.addWire(and1.id, 'out_Y', or1.id, 'in_A');
    graph.addWire(or1.id, 'out_Y', and1.id, 'in_A');

    const res = Propagator.propagate(graph);
    expect(res.success).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0].message).toContain('Combinational cycle detected');
  });

  it('propagates 3-stage synchronous shift register shifting serial data on each clock cycle', () => {
    const graph = new CircuitGraph();

    const dataIn = graph.addComponent('INPUT', { x: 0, y: 0 }, 'DIN');
    const clk    = graph.addComponent('CLOCK', { x: 0, y: 100 }, 'CLK');

    const ff0 = graph.addComponent('DFF', { x: 150, y: 50 }, 'FF0');
    const ff1 = graph.addComponent('DFF', { x: 300, y: 50 }, 'FF1');
    const ff2 = graph.addComponent('DFF', { x: 450, y: 50 }, 'FF2');

    const led0 = graph.addComponent('LED', { x: 220, y: 150 }, 'Q0');
    const led1 = graph.addComponent('LED', { x: 370, y: 150 }, 'Q1');
    const led2 = graph.addComponent('LED', { x: 520, y: 150 }, 'Q2');

    // Shared clock to all flip-flops
    graph.addWire(clk.id, 'out', ff0.id, 'in_CLK');
    graph.addWire(clk.id, 'out', ff1.id, 'in_CLK');
    graph.addWire(clk.id, 'out', ff2.id, 'in_CLK');

    // Shift data path: DIN -> FF0 -> FF1 -> FF2
    graph.addWire(dataIn.id, 'out', ff0.id, 'in_D');
    graph.addWire(ff0.id, 'out_Q', ff1.id, 'in_D');
    graph.addWire(ff1.id, 'out_Q', ff2.id, 'in_D');

    // Outputs to LEDs
    graph.addWire(ff0.id, 'out_Q', led0.id, 'in');
    graph.addWire(ff1.id, 'out_Q', led1.id, 'in');
    graph.addWire(ff2.id, 'out_Q', led2.id, 'in');

    // Initial state: DIN=1, CLK=0 -> all Qs are 0
    graph.setInputValue(dataIn.id, 1);
    graph.setInputValue(clk.id, 0);
    Propagator.propagate(graph);

    expect(led0.outputPorts[0].value).toBe(0);
    expect(led1.outputPorts[0].value).toBe(0);
    expect(led2.outputPorts[0].value).toBe(0);

    const pulse = () => {
      graph.setInputValue(clk.id, 1);
      Propagator.propagate(graph);
      graph.setInputValue(clk.id, 0);
      Propagator.propagate(graph);
    };

    // Cycle 1: DIN=1 shifts into FF0 -> Q0=1, Q1=0, Q2=0
    pulse();
    expect(led0.outputPorts[0].value).toBe(1);
    expect(led1.outputPorts[0].value).toBe(0);
    expect(led2.outputPorts[0].value).toBe(0);

    // Change DIN to 0 for subsequent shifts
    graph.setInputValue(dataIn.id, 0);
    Propagator.propagate(graph);

    // Cycle 2: 1 shifts into FF1, 0 into FF0 -> Q0=0, Q1=1, Q2=0
    pulse();
    expect(led0.outputPorts[0].value).toBe(0);
    expect(led1.outputPorts[0].value).toBe(1);
    expect(led2.outputPorts[0].value).toBe(0);

    // Cycle 3: 1 shifts into FF2 -> Q0=0, Q1=0, Q2=1
    pulse();
    expect(led0.outputPorts[0].value).toBe(0);
    expect(led1.outputPorts[0].value).toBe(0);
    expect(led2.outputPorts[0].value).toBe(1);

    // Cycle 4: 0 shifts into FF2 -> all 0
    pulse();
    expect(led0.outputPorts[0].value).toBe(0);
    expect(led1.outputPorts[0].value).toBe(0);
    expect(led2.outputPorts[0].value).toBe(0);
  });

  it('evaluates flip-flop with combinational logic in the feedback path', () => {
    const graph = new CircuitGraph();

    const clk = graph.addComponent('CLOCK', { x: 0, y: 0 });
    const dff = graph.addComponent('DFF', { x: 150, y: 50 });
    const notGate = graph.addComponent('NOT', { x: 300, y: 50 });
    const led = graph.addComponent('LED', { x: 450, y: 50 });

    // DFF.out_Q -> NOT -> DFF.in_D (Inverting feedback)
    graph.addWire(clk.id, 'out', dff.id, 'in_CLK');
    graph.addWire(dff.id, 'out_Q', notGate.id, 'in_A');
    graph.addWire(notGate.id, 'out_Y', dff.id, 'in_D');
    graph.addWire(dff.id, 'out_Q', led.id, 'in');

    // Initial propagation: Q is 0, so NOT outputs 1 to in_D
    Propagator.propagate(graph);
    expect(led.outputPorts[0].value).toBe(0);
    expect(dff.inputPorts.find(p => p.id === 'in_D')!.value).toBe(1);

    // Clock pulse 1: Q becomes 1 -> NOT outputs 0 to in_D
    graph.setInputValue(clk.id, 1);
    Propagator.propagate(graph);
    graph.setInputValue(clk.id, 0);
    Propagator.propagate(graph);

    expect(led.outputPorts[0].value).toBe(1);
    expect(dff.inputPorts.find(p => p.id === 'in_D')!.value).toBe(0);

    // Clock pulse 2: Q becomes 0 -> NOT outputs 1 to in_D
    graph.setInputValue(clk.id, 1);
    Propagator.propagate(graph);
    graph.setInputValue(clk.id, 0);
    Propagator.propagate(graph);

    expect(led.outputPorts[0].value).toBe(0);
    expect(dff.inputPorts.find(p => p.id === 'in_D')!.value).toBe(1);
  });
});

describe('CircuitGraph — Clock Control Methods', () => {
  it('toggles clock with tickClocks and resets with resetClocks', () => {
    const graph = new CircuitGraph();
    const clk = graph.addComponent('CLOCK', { x: 0, y: 0 });

    expect(clk.outputPorts[0].value).toBe(0);

    // Tick 1 -> 1
    const toggled1 = graph.tickClocks();
    expect(toggled1).toBe(true);
    expect(clk.outputPorts[0].value).toBe(1);

    // Tick 2 -> 0
    const toggled2 = graph.tickClocks();
    expect(toggled2).toBe(true);
    expect(clk.outputPorts[0].value).toBe(0);

    // Set to 1, then reset -> 0
    graph.tickClocks();
    expect(clk.outputPorts[0].value).toBe(1);
    graph.resetClocks();
    expect(clk.outputPorts[0].value).toBe(0);
  });

  it('resets sequential state across flip-flops with resetSequentialState', () => {
    const graph = new CircuitGraph();
    const dff = graph.addComponent('DFF', { x: 0, y: 0 });
    const jk  = graph.addComponent('JKFF', { x: 100, y: 0 });

    dff.outputPorts.find(p => p.id === 'out_Q')!.value = 1;
    dff.outputPorts.find(p => p.id === 'out_QBAR')!.value = 0;
    dff.config['_prevClk'] = 1;

    jk.outputPorts.find(p => p.id === 'out_Q')!.value = 1;
    jk.outputPorts.find(p => p.id === 'out_QBAR')!.value = 0;
    jk.config['_prevClk'] = 1;

    graph.resetSequentialState();

    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);
    expect(dff.config['_prevClk']).toBe(0);

    expect(jk.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(jk.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);
    expect(jk.config['_prevClk']).toBe(0);
  });
});
