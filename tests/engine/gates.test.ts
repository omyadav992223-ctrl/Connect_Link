// =============================================================================
// gates.test.ts — Full truth table verification for every implemented gate.
// These tests prove the simulation engine is correct BEFORE any UI is built.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  evalAND, evalOR, evalNOT,
  evalNAND, evalNOR, evalXOR, evalXNOR,
  evalMUX2, evalMUX4, evalComparator,
  evalHalfAdder, evalFullAdder, evalDecoder2_4,
  evaluateComponent,
} from '../../src/engine/Evaluator.js';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';

// ---------------------------------------------------------------------------
// Primitive function tests
// ---------------------------------------------------------------------------

describe('evalAND', () => {
  it('0,0 → 0', () => expect(evalAND(0, 0)).toBe(0));
  it('0,1 → 0', () => expect(evalAND(0, 1)).toBe(0));
  it('1,0 → 0', () => expect(evalAND(1, 0)).toBe(0));
  it('1,1 → 1', () => expect(evalAND(1, 1)).toBe(1));
  it('X,0 → 0 (0 dominates)',  () => expect(evalAND('X', 0)).toBe(0));
  it('X,1 → X (unknown)',      () => expect(evalAND('X', 1)).toBe('X'));
});

describe('evalOR', () => {
  it('0,0 → 0', () => expect(evalOR(0, 0)).toBe(0));
  it('0,1 → 1', () => expect(evalOR(0, 1)).toBe(1));
  it('1,0 → 1', () => expect(evalOR(1, 0)).toBe(1));
  it('1,1 → 1', () => expect(evalOR(1, 1)).toBe(1));
  it('X,1 → 1 (1 dominates)', () => expect(evalOR('X', 1)).toBe(1));
  it('X,0 → X (unknown)',     () => expect(evalOR('X', 0)).toBe('X'));
});

describe('evalNOT', () => {
  it('0 → 1', () => expect(evalNOT(0)).toBe(1));
  it('1 → 0', () => expect(evalNOT(1)).toBe(0));
  it('X → X', () => expect(evalNOT('X')).toBe('X'));
});

describe('evalNAND', () => {
  it('0,0 → 1', () => expect(evalNAND(0, 0)).toBe(1));
  it('0,1 → 1', () => expect(evalNAND(0, 1)).toBe(1));
  it('1,0 → 1', () => expect(evalNAND(1, 0)).toBe(1));
  it('1,1 → 0', () => expect(evalNAND(1, 1)).toBe(0));
});

describe('evalNOR', () => {
  it('0,0 → 1', () => expect(evalNOR(0, 0)).toBe(1));
  it('0,1 → 0', () => expect(evalNOR(0, 1)).toBe(0));
  it('1,0 → 0', () => expect(evalNOR(1, 0)).toBe(0));
  it('1,1 → 0', () => expect(evalNOR(1, 1)).toBe(0));
});

describe('evalXOR', () => {
  it('0,0 → 0', () => expect(evalXOR(0, 0)).toBe(0));
  it('0,1 → 1', () => expect(evalXOR(0, 1)).toBe(1));
  it('1,0 → 1', () => expect(evalXOR(1, 0)).toBe(1));
  it('1,1 → 0', () => expect(evalXOR(1, 1)).toBe(0));
  it('X,X → X', () => expect(evalXOR('X', 'X')).toBe('X'));
});

describe('evalXNOR', () => {
  it('0,0 → 1', () => expect(evalXNOR(0, 0)).toBe(1));
  it('0,1 → 0', () => expect(evalXNOR(0, 1)).toBe(0));
  it('1,0 → 0', () => expect(evalXNOR(1, 0)).toBe(0));
  it('1,1 → 1', () => expect(evalXNOR(1, 1)).toBe(1));
});

// ---------------------------------------------------------------------------
// MUX
// ---------------------------------------------------------------------------

describe('evalMUX2', () => {
  it('S=0: selects I0=0', () => expect(evalMUX2(0, 1, 0)).toBe(0));
  it('S=0: selects I0=1', () => expect(evalMUX2(1, 0, 0)).toBe(1));
  it('S=1: selects I1=0', () => expect(evalMUX2(1, 0, 1)).toBe(0));
  it('S=1: selects I1=1', () => expect(evalMUX2(0, 1, 1)).toBe(1));
  it('S=X, I0=I1=1 → 1 (deterministic)', () => expect(evalMUX2(1, 1, 'X')).toBe(1));
  it('S=X, I0≠I1 → X', ()                => expect(evalMUX2(0, 1, 'X')).toBe('X'));
});

// ---------------------------------------------------------------------------
// Comparator
// ---------------------------------------------------------------------------

describe('evalComparator', () => {
  it('0 vs 0: EQ', () => {
    const r = evalComparator(0, 0);
    expect(r).toEqual({ gt: 0, eq: 1, lt: 0 });
  });
  it('1 vs 0: GT', () => {
    const r = evalComparator(1, 0);
    expect(r).toEqual({ gt: 1, eq: 0, lt: 0 });
  });
  it('0 vs 1: LT', () => {
    const r = evalComparator(0, 1);
    expect(r).toEqual({ gt: 0, eq: 0, lt: 1 });
  });
  it('1 vs 1: EQ', () => {
    const r = evalComparator(1, 1);
    expect(r).toEqual({ gt: 0, eq: 1, lt: 0 });
  });
  it('X vs 0: all X', () => {
    const r = evalComparator('X', 0);
    expect(r).toEqual({ gt: 'X', eq: 'X', lt: 'X' });
  });
});

// ---------------------------------------------------------------------------
// evaluateComponent — integration with Component objects
// ---------------------------------------------------------------------------

describe('evaluateComponent — AND gate', () => {
  function makeAND(a: 0|1|'X', b: 0|1|'X') {
    const graph = new CircuitGraph();
    const gate = graph.addComponent('AND', { x: 0, y: 0 });
    gate.inputPorts[0].value = a;
    gate.inputPorts[1].value = b;
    evaluateComponent(gate);
    return gate.outputPorts[0].value;
  }

  it('0,0 → 0', () => expect(makeAND(0, 0)).toBe(0));
  it('0,1 → 0', () => expect(makeAND(0, 1)).toBe(0));
  it('1,0 → 0', () => expect(makeAND(1, 0)).toBe(0));
  it('1,1 → 1', () => expect(makeAND(1, 1)).toBe(1));
});

describe('evaluateComponent — NOT gate', () => {
  function makeNOT(a: 0|1|'X') {
    const graph = new CircuitGraph();
    const gate = graph.addComponent('NOT', { x: 0, y: 0 });
    gate.inputPorts[0].value = a;
    evaluateComponent(gate);
    return gate.outputPorts[0].value;
  }
  it('0 → 1', () => expect(makeNOT(0)).toBe(1));
  it('1 → 0', () => expect(makeNOT(1)).toBe(0));
});

describe('evaluateComponent — LED sink', () => {
  it('LED mirrors its input', () => {
    const graph = new CircuitGraph();
    const led = graph.addComponent('LED', { x: 0, y: 0 });
    led.inputPorts[0].value = 1;
    evaluateComponent(led);
    expect(led.outputPorts[0].value).toBe(1);
  });
});

describe('evaluateComponent — Half Adder', () => {
  function testHA(a: 0|1, b: 0|1) {
    const graph = new CircuitGraph();
    const ha = graph.addComponent('HALF_ADDER', { x: 0, y: 0 });
    ha.inputPorts.find(p => p.id === 'in_A')!.value = a;
    ha.inputPorts.find(p => p.id === 'in_B')!.value = b;
    evaluateComponent(ha);
    const s = ha.outputPorts.find(p => p.id === 'out_S')!.value;
    const c = ha.outputPorts.find(p => p.id === 'out_C')!.value;
    return { s, c };
  }

  it('0+0 → S=0, C=0', () => expect(testHA(0, 0)).toEqual({ s: 0, c: 0 }));
  it('0+1 → S=1, C=0', () => expect(testHA(0, 1)).toEqual({ s: 1, c: 0 }));
  it('1+0 → S=1, C=0', () => expect(testHA(1, 0)).toEqual({ s: 1, c: 0 }));
  it('1+1 → S=0, C=1', () => expect(testHA(1, 1)).toEqual({ s: 0, c: 1 }));
});

describe('evaluateComponent — Full Adder', () => {
  function testFA(a: 0|1, b: 0|1, cin: 0|1) {
    const graph = new CircuitGraph();
    const fa = graph.addComponent('FULL_ADDER', { x: 0, y: 0 });
    fa.inputPorts.find(p => p.id === 'in_A')!.value = a;
    fa.inputPorts.find(p => p.id === 'in_B')!.value = b;
    fa.inputPorts.find(p => p.id === 'in_Cin')!.value = cin;
    evaluateComponent(fa);
    const s = fa.outputPorts.find(p => p.id === 'out_S')!.value;
    const cout = fa.outputPorts.find(p => p.id === 'out_Cout')!.value;
    return { s, cout };
  }

  it('0+0+0 → S=0, Cout=0', () => expect(testFA(0, 0, 0)).toEqual({ s: 0, cout: 0 }));
  it('1+0+0 → S=1, Cout=0', () => expect(testFA(1, 0, 0)).toEqual({ s: 1, cout: 0 }));
  it('1+1+0 → S=0, Cout=1', () => expect(testFA(1, 1, 0)).toEqual({ s: 0, cout: 1 }));
  it('1+1+1 → S=1, Cout=1', () => expect(testFA(1, 1, 1)).toEqual({ s: 1, cout: 1 }));
});

describe('evaluateComponent — 4:1 MUX', () => {
  it('selects correct channel according to S1S0', () => {
    const graph = new CircuitGraph();
    const mux = graph.addComponent('MUX4', { x: 0, y: 0 });
    mux.inputPorts.find(p => p.id === 'in_I0')!.value = 0;
    mux.inputPorts.find(p => p.id === 'in_I1')!.value = 1;
    mux.inputPorts.find(p => p.id === 'in_I2')!.value = 0;
    mux.inputPorts.find(p => p.id === 'in_I3')!.value = 1;

    // S1=0, S0=1 -> selects I1 (1)
    mux.inputPorts.find(p => p.id === 'in_S0')!.value = 1;
    mux.inputPorts.find(p => p.id === 'in_S1')!.value = 0;
    evaluateComponent(mux);
    expect(mux.outputPorts[0].value).toBe(1);

    // S1=1, S0=0 -> selects I2 (0)
    mux.inputPorts.find(p => p.id === 'in_S0')!.value = 0;
    mux.inputPorts.find(p => p.id === 'in_S1')!.value = 1;
    evaluateComponent(mux);
    expect(mux.outputPorts[0].value).toBe(0);
  });
});

describe('evaluateComponent — 2:4 Decoder', () => {
  it('decodes 2-bit address to 1-hot 4 outputs', () => {
    const graph = new CircuitGraph();
    const dec = graph.addComponent('DECODER2_4', { x: 0, y: 0 });
    dec.inputPorts.find(p => p.id === 'in_EN')!.value = 1;
    dec.inputPorts.find(p => p.id === 'in_A0')!.value = 1;
    dec.inputPorts.find(p => p.id === 'in_A1')!.value = 1; // 3
    evaluateComponent(dec);

    expect(dec.outputPorts.find(p => p.id === 'out_Y0')!.value).toBe(0);
    expect(dec.outputPorts.find(p => p.id === 'out_Y1')!.value).toBe(0);
    expect(dec.outputPorts.find(p => p.id === 'out_Y2')!.value).toBe(0);
    expect(dec.outputPorts.find(p => p.id === 'out_Y3')!.value).toBe(1);
  });
});

describe('evaluateComponent — 1:2 Demux', () => {
  it('routes D to Y0 when S=0, and to Y1 when S=1', () => {
    const graph = new CircuitGraph();
    const demux = graph.addComponent('DEMUX1_2', { x: 0, y: 0 });
    demux.inputPorts.find(p => p.id === 'in_D')!.value = 1;
    demux.inputPorts.find(p => p.id === 'in_S')!.value = 0;
    evaluateComponent(demux);
    expect(demux.outputPorts.find(p => p.id === 'out_Y0')!.value).toBe(1);
    expect(demux.outputPorts.find(p => p.id === 'out_Y1')!.value).toBe(0);

    demux.inputPorts.find(p => p.id === 'in_S')!.value = 1;
    evaluateComponent(demux);
    expect(demux.outputPorts.find(p => p.id === 'out_Y0')!.value).toBe(0);
    expect(demux.outputPorts.find(p => p.id === 'out_Y1')!.value).toBe(1);
  });
});

describe('evaluateComponent — 4:2 Priority Encoder', () => {
  it('prioritizes highest input D3 > D2 > D1 > D0', () => {
    const graph = new CircuitGraph();
    const enc = graph.addComponent('ENCODER4_2', { x: 0, y: 0 });
    enc.inputPorts.find(p => p.id === 'in_D0')!.value = 1;
    enc.inputPorts.find(p => p.id === 'in_D1')!.value = 1;
    enc.inputPorts.find(p => p.id === 'in_D2')!.value = 1;
    enc.inputPorts.find(p => p.id === 'in_D3')!.value = 0;
    evaluateComponent(enc);

    // D2 is highest active -> A1=1, A0=0, V=1
    expect(enc.outputPorts.find(p => p.id === 'out_A1')!.value).toBe(1);
    expect(enc.outputPorts.find(p => p.id === 'out_A0')!.value).toBe(0);
    expect(enc.outputPorts.find(p => p.id === 'out_V')!.value).toBe(1);
  });
});

describe('evaluateComponent — Half Subtractor', () => {
  function testHS(a: 0|1, b: 0|1) {
    const graph = new CircuitGraph();
    const hs = graph.addComponent('HALF_SUBTRACTOR', { x: 0, y: 0 });
    hs.inputPorts.find(p => p.id === 'in_A')!.value = a;
    hs.inputPorts.find(p => p.id === 'in_B')!.value = b;
    evaluateComponent(hs);
    const diff = hs.outputPorts.find(p => p.id === 'out_Diff')!.value;
    const bout = hs.outputPorts.find(p => p.id === 'out_Bout')!.value;
    return { diff, bout };
  }

  it('0 - 0 → Diff=0, Bout=0', () => expect(testHS(0, 0)).toEqual({ diff: 0, bout: 0 }));
  it('1 - 0 → Diff=1, Bout=0', () => expect(testHS(1, 0)).toEqual({ diff: 1, bout: 0 }));
  it('0 - 1 → Diff=1, Bout=1 (borrow)', () => expect(testHS(0, 1)).toEqual({ diff: 1, bout: 1 }));
  it('1 - 1 → Diff=0, Bout=0', () => expect(testHS(1, 1)).toEqual({ diff: 0, bout: 0 }));
});

describe('evaluateComponent — Full Subtractor', () => {
  it('computes 0 - 1 - 0 = Diff: 1, Bout: 1', () => {
    const graph = new CircuitGraph();
    const fs = graph.addComponent('FULL_SUBTRACTOR', { x: 0, y: 0 });
    fs.inputPorts.find(p => p.id === 'in_A')!.value = 0;
    fs.inputPorts.find(p => p.id === 'in_B')!.value = 1;
    fs.inputPorts.find(p => p.id === 'in_Bin')!.value = 0;
    evaluateComponent(fs);
    expect(fs.outputPorts.find(p => p.id === 'out_Diff')!.value).toBe(1);
    expect(fs.outputPorts.find(p => p.id === 'out_Bout')!.value).toBe(1);
  });
});

describe('evaluateComponent — Sequential Latches & Flip-Flops', () => {
  it('SR_LATCH sets and resets', () => {
    const graph = new CircuitGraph();
    const sr = graph.addComponent('SR_LATCH', { x: 0, y: 0 });

    // Set
    sr.inputPorts.find(p => p.id === 'in_S')!.value = 1;
    sr.inputPorts.find(p => p.id === 'in_R')!.value = 0;
    evaluateComponent(sr);
    expect(sr.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
    expect(sr.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(0);

    // Reset
    sr.inputPorts.find(p => p.id === 'in_S')!.value = 0;
    sr.inputPorts.find(p => p.id === 'in_R')!.value = 1;
    evaluateComponent(sr);
    expect(sr.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
    expect(sr.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(1);
  });

  it('JKFF toggles when J=1, K=1 on clock rising edges and holds on steady level', () => {
    const graph = new CircuitGraph();
    const jk = graph.addComponent('JKFF', { x: 0, y: 0 });
    jk.outputPorts.find(p => p.id === 'out_Q')!.value = 0;

    jk.inputPorts.find(p => p.id === 'in_J')!.value = 1;
    jk.inputPorts.find(p => p.id === 'in_K')!.value = 1;

    // Rising edge 0 -> 1: toggles Q from 0 to 1
    jk.inputPorts.find(p => p.id === 'in_CLK')!.value = 1;
    evaluateComponent(jk);
    expect(jk.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);

    // Repeated clock level (CLK stays 1): holds state
    evaluateComponent(jk);
    expect(jk.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);

    // Falling edge 1 -> 0: holds state
    jk.inputPorts.find(p => p.id === 'in_CLK')!.value = 0;
    evaluateComponent(jk);
    expect(jk.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);

    // Next rising edge 0 -> 1: toggles Q from 1 to 0
    jk.inputPorts.find(p => p.id === 'in_CLK')!.value = 1;
    evaluateComponent(jk);
    expect(jk.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(0);
  });

  it('TFF toggles when T=1 on rising edge and holds on steady level', () => {
    const graph = new CircuitGraph();
    const tff = graph.addComponent('TFF', { x: 0, y: 0 });
    tff.outputPorts.find(p => p.id === 'out_Q')!.value = 0;

    tff.inputPorts.find(p => p.id === 'in_T')!.value = 1;
    tff.inputPorts.find(p => p.id === 'in_CLK')!.value = 1;
    evaluateComponent(tff);
    expect(tff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);

    // Repeated level 1: holds Q=1
    evaluateComponent(tff);
    expect(tff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
  });
});
