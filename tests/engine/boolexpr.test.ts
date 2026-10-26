// =============================================================================
// boolexpr.test.ts — Boolean expression generation & verification for all
// logic components and MSI subsystems.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { BoolExprGen } from '../../src/engine/BoolExprGen.js';

describe('BoolExprGen — Primitive Gates', () => {
  it('generates expression for AND gate', () => {
    const graph = new CircuitGraph();
    const inA = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const inB = graph.addComponent('INPUT', { x: 0, y: 50 }, 'B');
    const gate = graph.addComponent('AND', { x: 100, y: 25 });
    const out = graph.addComponent('OUTPUT', { x: 200, y: 25 }, 'Y');

    graph.addWire(inA.id, 'out', gate.id, 'in_A');
    graph.addWire(inB.id, 'out', gate.id, 'in_B');
    graph.addWire(gate.id, 'out_Y', out.id, 'in');

    const res = BoolExprGen.generateForOutput(graph, out.id);
    expect(res.expression).toBe('Y = (A · B)');
  });

  it('generates expression for OR gate', () => {
    const graph = new CircuitGraph();
    const inA = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const inB = graph.addComponent('INPUT', { x: 0, y: 50 }, 'B');
    const gate = graph.addComponent('OR', { x: 100, y: 25 });
    const out = graph.addComponent('OUTPUT', { x: 200, y: 25 }, 'Y');

    graph.addWire(inA.id, 'out', gate.id, 'in_A');
    graph.addWire(inB.id, 'out', gate.id, 'in_B');
    graph.addWire(gate.id, 'out_Y', out.id, 'in');

    const res = BoolExprGen.generateForOutput(graph, out.id);
    expect(res.expression).toBe('Y = (A + B)');
  });

  it('generates expression for NOT gate', () => {
    const graph = new CircuitGraph();
    const inA = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const gate = graph.addComponent('NOT', { x: 100, y: 0 });
    const out = graph.addComponent('OUTPUT', { x: 200, y: 0 }, 'Y');

    graph.addWire(inA.id, 'out', gate.id, 'in_A');
    graph.addWire(gate.id, 'out_Y', out.id, 'in');

    const res = BoolExprGen.generateForOutput(graph, out.id);
    expect(res.expression).toBe("Y = A'");
  });

  it('generates expression for NAND gate', () => {
    const graph = new CircuitGraph();
    const inA = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const inB = graph.addComponent('INPUT', { x: 0, y: 50 }, 'B');
    const gate = graph.addComponent('NAND', { x: 100, y: 25 });
    const out = graph.addComponent('OUTPUT', { x: 200, y: 25 }, 'Y');

    graph.addWire(inA.id, 'out', gate.id, 'in_A');
    graph.addWire(inB.id, 'out', gate.id, 'in_B');
    graph.addWire(gate.id, 'out_Y', out.id, 'in');

    const res = BoolExprGen.generateForOutput(graph, out.id);
    expect(res.expression).toBe("Y = (A · B)'");
  });

  it('generates expression for XOR and XNOR gates', () => {
    const graph = new CircuitGraph();
    const inA = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const inB = graph.addComponent('INPUT', { x: 0, y: 50 }, 'B');
    const xor = graph.addComponent('XOR', { x: 100, y: 0 });
    const xnor = graph.addComponent('XNOR', { x: 100, y: 80 });
    const out1 = graph.addComponent('OUTPUT', { x: 200, y: 0 }, 'Y_XOR');
    const out2 = graph.addComponent('OUTPUT', { x: 200, y: 80 }, 'Y_XNOR');

    graph.addWire(inA.id, 'out', xor.id, 'in_A');
    graph.addWire(inB.id, 'out', xor.id, 'in_B');
    graph.addWire(xor.id, 'out_Y', out1.id, 'in');

    graph.addWire(inA.id, 'out', xnor.id, 'in_A');
    graph.addWire(inB.id, 'out', xnor.id, 'in_B');
    graph.addWire(xnor.id, 'out_Y', out2.id, 'in');

    expect(BoolExprGen.generateForOutput(graph, out1.id).expression).toBe('Y_XOR = (A ⊕ B)');
    expect(BoolExprGen.generateForOutput(graph, out2.id).expression).toBe("Y_XNOR = (A ⊕ B)'");
  });
});

describe('BoolExprGen — Advanced Multiplexers', () => {
  it('generates expression for 2:1 Multiplexer (MUX2)', () => {
    const graph = new CircuitGraph();
    const i0 = graph.addComponent('INPUT', { x: 0, y: 0 }, 'D0');
    const i1 = graph.addComponent('INPUT', { x: 0, y: 40 }, 'D1');
    const s  = graph.addComponent('INPUT', { x: 0, y: 80 }, 'SEL');
    const mux = graph.addComponent('MUX2', { x: 120, y: 40 });
    const out = graph.addComponent('OUTPUT', { x: 240, y: 40 }, 'M_OUT');

    graph.addWire(i0.id, 'out', mux.id, 'in_I0');
    graph.addWire(i1.id, 'out', mux.id, 'in_I1');
    graph.addWire(s.id, 'out', mux.id, 'in_S');
    graph.addWire(mux.id, 'out_Y', out.id, 'in');

    const res = BoolExprGen.generateForOutput(graph, out.id);
    expect(res.expression).toBe("M_OUT = (SEL'·D0 + SEL·D1)");
  });

  it('generates expression for 4:1 Multiplexer (MUX4)', () => {
    const graph = new CircuitGraph();
    const i0 = graph.addComponent('INPUT', { x: 0, y: 0 }, 'D0');
    const i1 = graph.addComponent('INPUT', { x: 0, y: 30 }, 'D1');
    const i2 = graph.addComponent('INPUT', { x: 0, y: 60 }, 'D2');
    const i3 = graph.addComponent('INPUT', { x: 0, y: 90 }, 'D3');
    const s0 = graph.addComponent('INPUT', { x: 0, y: 120 }, 'S0');
    const s1 = graph.addComponent('INPUT', { x: 0, y: 150 }, 'S1');
    const mux = graph.addComponent('MUX4', { x: 120, y: 70 });
    const out = graph.addComponent('OUTPUT', { x: 240, y: 70 }, 'Y');

    graph.addWire(i0.id, 'out', mux.id, 'in_I0');
    graph.addWire(i1.id, 'out', mux.id, 'in_I1');
    graph.addWire(i2.id, 'out', mux.id, 'in_I2');
    graph.addWire(i3.id, 'out', mux.id, 'in_I3');
    graph.addWire(s0.id, 'out', mux.id, 'in_S0');
    graph.addWire(s1.id, 'out', mux.id, 'in_S1');
    graph.addWire(mux.id, 'out_Y', out.id, 'in');

    const res = BoolExprGen.generateForOutput(graph, out.id);
    expect(res.expression).toBe("Y = (S1'·S0'·D0 + S1'·S0·D1 + S1·S0'·D2 + S1·S0·D3)");
  });
});

describe('BoolExprGen — Demultiplexers and Decoders', () => {
  it('generates expressions for 1:2 Demultiplexer (DEMUX1_2)', () => {
    const graph = new CircuitGraph();
    const d = graph.addComponent('INPUT', { x: 0, y: 0 }, 'DATA');
    const s = graph.addComponent('INPUT', { x: 0, y: 50 }, 'SEL');
    const demux = graph.addComponent('DEMUX1_2', { x: 120, y: 25 });
    const out0 = graph.addComponent('OUTPUT', { x: 240, y: 0 }, 'OUT0');
    const out1 = graph.addComponent('OUTPUT', { x: 240, y: 50 }, 'OUT1');

    graph.addWire(d.id, 'out', demux.id, 'in_D');
    graph.addWire(s.id, 'out', demux.id, 'in_S');
    graph.addWire(demux.id, 'out_Y0', out0.id, 'in');
    graph.addWire(demux.id, 'out_Y1', out1.id, 'in');

    expect(BoolExprGen.generateForOutput(graph, out0.id).expression).toBe("OUT0 = (SEL' · DATA)");
    expect(BoolExprGen.generateForOutput(graph, out1.id).expression).toBe('OUT1 = (SEL · DATA)');
  });

  it('generates expressions for 1:4 Demultiplexer (DEMUX1_4)', () => {
    const graph = new CircuitGraph();
    const d  = graph.addComponent('INPUT', { x: 0, y: 0 }, 'D');
    const s0 = graph.addComponent('INPUT', { x: 0, y: 40 }, 'S0');
    const s1 = graph.addComponent('INPUT', { x: 0, y: 80 }, 'S1');
    const demux = graph.addComponent('DEMUX1_4', { x: 120, y: 40 });
    const y0 = graph.addComponent('OUTPUT', { x: 240, y: 0 }, 'Y0');
    const y1 = graph.addComponent('OUTPUT', { x: 240, y: 30 }, 'Y1');
    const y2 = graph.addComponent('OUTPUT', { x: 240, y: 60 }, 'Y2');
    const y3 = graph.addComponent('OUTPUT', { x: 240, y: 90 }, 'Y3');

    graph.addWire(d.id, 'out', demux.id, 'in_D');
    graph.addWire(s0.id, 'out', demux.id, 'in_S0');
    graph.addWire(s1.id, 'out', demux.id, 'in_S1');
    graph.addWire(demux.id, 'out_Y0', y0.id, 'in');
    graph.addWire(demux.id, 'out_Y1', y1.id, 'in');
    graph.addWire(demux.id, 'out_Y2', y2.id, 'in');
    graph.addWire(demux.id, 'out_Y3', y3.id, 'in');

    expect(BoolExprGen.generateForOutput(graph, y0.id).expression).toBe("Y0 = (S1' · S0' · D)");
    expect(BoolExprGen.generateForOutput(graph, y1.id).expression).toBe("Y1 = (S1' · S0 · D)");
    expect(BoolExprGen.generateForOutput(graph, y2.id).expression).toBe("Y2 = (S1 · S0' · D)");
    expect(BoolExprGen.generateForOutput(graph, y3.id).expression).toBe("Y3 = (S1 · S0 · D)");
  });

  it('generates expressions for 2-to-4 Decoder (DECODER2_4)', () => {
    const graph = new CircuitGraph();
    const a0 = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A0');
    const a1 = graph.addComponent('INPUT', { x: 0, y: 40 }, 'A1');
    const en = graph.addComponent('INPUT', { x: 0, y: 80 }, 'EN');
    const dec = graph.addComponent('DECODER2_4', { x: 120, y: 40 });
    const y2 = graph.addComponent('OUTPUT', { x: 240, y: 60 }, 'Y2');

    graph.addWire(a0.id, 'out', dec.id, 'in_A0');
    graph.addWire(a1.id, 'out', dec.id, 'in_A1');
    graph.addWire(en.id, 'out', dec.id, 'in_EN');
    graph.addWire(dec.id, 'out_Y2', y2.id, 'in');

    // For channel 2 (binary 10: A1=1, A0=0)
    expect(BoolExprGen.generateForOutput(graph, y2.id).expression).toBe("Y2 = (EN · A1 · A0')");
  });
});

describe('BoolExprGen — Encoders and Comparators', () => {
  it('generates expressions for 4-to-2 Priority Encoder (ENCODER4_2)', () => {
    const graph = new CircuitGraph();
    const d0 = graph.addComponent('INPUT', { x: 0, y: 0 }, 'D0');
    const d1 = graph.addComponent('INPUT', { x: 0, y: 30 }, 'D1');
    const d2 = graph.addComponent('INPUT', { x: 0, y: 60 }, 'D2');
    const d3 = graph.addComponent('INPUT', { x: 0, y: 90 }, 'D3');
    const enc = graph.addComponent('ENCODER4_2', { x: 120, y: 45 });
    const outA1 = graph.addComponent('OUTPUT', { x: 240, y: 0 }, 'A1');
    const outA0 = graph.addComponent('OUTPUT', { x: 240, y: 40 }, 'A0');
    const outV  = graph.addComponent('OUTPUT', { x: 240, y: 80 }, 'V');

    graph.addWire(d0.id, 'out', enc.id, 'in_D0');
    graph.addWire(d1.id, 'out', enc.id, 'in_D1');
    graph.addWire(d2.id, 'out', enc.id, 'in_D2');
    graph.addWire(d3.id, 'out', enc.id, 'in_D3');
    graph.addWire(enc.id, 'out_A1', outA1.id, 'in');
    graph.addWire(enc.id, 'out_A0', outA0.id, 'in');
    graph.addWire(enc.id, 'out_V',  outV.id,  'in');

    expect(BoolExprGen.generateForOutput(graph, outA1.id).expression).toBe('A1 = (D3 + D2)');
    expect(BoolExprGen.generateForOutput(graph, outA0.id).expression).toBe("A0 = (D3 + (D2' · D1))");
    expect(BoolExprGen.generateForOutput(graph, outV.id).expression).toBe('V = (D3 + D2 + D1 + D0)');
  });

  it('generates expressions for 1-bit Comparator (COMPARATOR)', () => {
    const graph = new CircuitGraph();
    const inA = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const inB = graph.addComponent('INPUT', { x: 0, y: 50 }, 'B');
    const cmp = graph.addComponent('COMPARATOR', { x: 120, y: 25 });
    const gt = graph.addComponent('OUTPUT', { x: 240, y: 0 }, 'GT');
    const eq = graph.addComponent('OUTPUT', { x: 240, y: 30 }, 'EQ');
    const lt = graph.addComponent('OUTPUT', { x: 240, y: 60 }, 'LT');

    graph.addWire(inA.id, 'out', cmp.id, 'in_A');
    graph.addWire(inB.id, 'out', cmp.id, 'in_B');
    graph.addWire(cmp.id, 'out_GT', gt.id, 'in');
    graph.addWire(cmp.id, 'out_EQ', eq.id, 'in');
    graph.addWire(cmp.id, 'out_LT', lt.id, 'in');

    expect(BoolExprGen.generateForOutput(graph, gt.id).expression).toBe("GT = (A · B')");
    expect(BoolExprGen.generateForOutput(graph, eq.id).expression).toBe("EQ = (A ⊕ B)'");
    expect(BoolExprGen.generateForOutput(graph, lt.id).expression).toBe("LT = (A' · B)");
  });
});

describe('BoolExprGen — Arithmetic Subsystems (Adders & Subtractors)', () => {
  it('generates expressions for Full Adder (FULL_ADDER)', () => {
    const graph = new CircuitGraph();
    const inA   = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const inB   = graph.addComponent('INPUT', { x: 0, y: 40 }, 'B');
    const inCin = graph.addComponent('INPUT', { x: 0, y: 80 }, 'Cin');
    const fa    = graph.addComponent('FULL_ADDER', { x: 120, y: 40 });
    const outS  = graph.addComponent('OUTPUT', { x: 240, y: 20 }, 'SUM');
    const outC  = graph.addComponent('OUTPUT', { x: 240, y: 60 }, 'COUT');

    graph.addWire(inA.id, 'out', fa.id, 'in_A');
    graph.addWire(inB.id, 'out', fa.id, 'in_B');
    graph.addWire(inCin.id, 'out', fa.id, 'in_Cin');
    graph.addWire(fa.id, 'out_S', outS.id, 'in');
    graph.addWire(fa.id, 'out_Cout', outC.id, 'in');

    expect(BoolExprGen.generateForOutput(graph, outS.id).expression).toBe('SUM = (A ⊕ B ⊕ Cin)');
    expect(BoolExprGen.generateForOutput(graph, outC.id).expression).toBe('COUT = ((A·B) + (Cin·(A⊕B)))');
  });

  it('generates expressions for Full Subtractor (FULL_SUBTRACTOR)', () => {
    const graph = new CircuitGraph();
    const inA   = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const inB   = graph.addComponent('INPUT', { x: 0, y: 40 }, 'B');
    const inBin = graph.addComponent('INPUT', { x: 0, y: 80 }, 'Bin');
    const fs    = graph.addComponent('FULL_SUBTRACTOR', { x: 120, y: 40 });
    const outD  = graph.addComponent('OUTPUT', { x: 240, y: 20 }, 'DIFF');
    const outB  = graph.addComponent('OUTPUT', { x: 240, y: 60 }, 'BOUT');

    graph.addWire(inA.id, 'out', fs.id, 'in_A');
    graph.addWire(inB.id, 'out', fs.id, 'in_B');
    graph.addWire(inBin.id, 'out', fs.id, 'in_Bin');
    graph.addWire(fs.id, 'out_Diff', outD.id, 'in');
    graph.addWire(fs.id, 'out_Bout', outB.id, 'in');

    expect(BoolExprGen.generateForOutput(graph, outD.id).expression).toBe('DIFF = (A ⊕ B ⊕ Bin)');
    expect(BoolExprGen.generateForOutput(graph, outB.id).expression).toBe("BOUT = ((A' · B) + ((A ⊕ B)' · Bin))");
  });
});
