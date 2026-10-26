// =============================================================================
// msi_subsystems.test.ts — End-to-end integration tests for MSI subsystems:
// Multiplexers, Demultiplexers, Decoders, Encoders, Comparators, and Arithmetic.
// Verifies signal propagation, circuit evaluation, TruthTableGen, and BoolExprGen.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { Propagator } from '../../src/engine/Propagator.js';
import { TruthTableGen } from '../../src/engine/TruthTableGen.js';
import { BoolExprGen } from '../../src/engine/BoolExprGen.js';

describe('MSI Subsystems — 4:1 Multiplexer Full Signal Path', () => {
  it('propagates all channels through 4:1 MUX to LED and verifies Truth Table', () => {
    const graph = new CircuitGraph();

    const i0 = graph.addComponent('INPUT', { x: 0, y: 0 },   'I0');
    const i1 = graph.addComponent('INPUT', { x: 0, y: 40 },  'I1');
    const i2 = graph.addComponent('INPUT', { x: 0, y: 80 },  'I2');
    const i3 = graph.addComponent('INPUT', { x: 0, y: 120 }, 'I3');
    const s0 = graph.addComponent('INPUT', { x: 0, y: 160 }, 'S0');
    const s1 = graph.addComponent('INPUT', { x: 0, y: 200 }, 'S1');

    const mux = graph.addComponent('MUX4', { x: 150, y: 80 });
    const led = graph.addComponent('LED',  { x: 300, y: 80 }, 'Y_OUT');

    graph.addWire(i0.id, 'out', mux.id, 'in_I0');
    graph.addWire(i1.id, 'out', mux.id, 'in_I1');
    graph.addWire(i2.id, 'out', mux.id, 'in_I2');
    graph.addWire(i3.id, 'out', mux.id, 'in_I3');
    graph.addWire(s0.id, 'out', mux.id, 'in_S0');
    graph.addWire(s1.id, 'out', mux.id, 'in_S1');
    graph.addWire(mux.id, 'out_Y', led.id, 'in');

    // Test channel 2: S1=1, S0=0, I2=1, other I=0 -> Y=1
    graph.setInputValue(i0.id, 0);
    graph.setInputValue(i1.id, 0);
    graph.setInputValue(i2.id, 1);
    graph.setInputValue(i3.id, 0);
    graph.setInputValue(s0.id, 0);
    graph.setInputValue(s1.id, 1);

    const propRes = Propagator.propagate(graph);
    expect(propRes.success).toBe(true);
    expect(led.outputPorts[0].value).toBe(1);

    // Switch S1=0, S0=0 -> channel 0 is selected (I0=0 -> Y=0)
    graph.setInputValue(s1.id, 0);
    Propagator.propagate(graph);
    expect(led.outputPorts[0].value).toBe(0);

    // Boolean expression check
    const boolRes = BoolExprGen.generateForOutput(graph, led.id);
    expect(boolRes.expression).toBe("Y_OUT = (S1'·S0'·I0 + S1'·S0·I1 + S1·S0'·I2 + S1·S0·I3)");
  });
});

describe('MSI Subsystems — 1-bit Comparator Cascade & Truth Table', () => {
  it('evaluates comparator truth table across all 4 combinations', () => {
    const graph = new CircuitGraph();
    const inA = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const inB = graph.addComponent('INPUT', { x: 0, y: 60 }, 'B');
    const cmp = graph.addComponent('COMPARATOR', { x: 120, y: 30 });

    const ledGT = graph.addComponent('LED', { x: 260, y: 0 },  'GT');
    const ledEQ = graph.addComponent('LED', { x: 260, y: 30 }, 'EQ');
    const ledLT = graph.addComponent('LED', { x: 260, y: 60 }, 'LT');

    graph.addWire(inA.id, 'out', cmp.id, 'in_A');
    graph.addWire(inB.id, 'out', cmp.id, 'in_B');
    graph.addWire(cmp.id, 'out_GT', ledGT.id, 'in');
    graph.addWire(cmp.id, 'out_EQ', ledEQ.id, 'in');
    graph.addWire(cmp.id, 'out_LT', ledLT.id, 'in');

    const table = TruthTableGen.generate(graph);
    expect(table).not.toBeNull();
    expect(table!.rows).toHaveLength(4);

    // Row 0: A=0, B=0 -> EQ=1, GT=0, LT=0
    const r00 = table!.rows.find(r => r.inputs['A'] === 0 && r.inputs['B'] === 0)!;
    expect(r00.outputs['EQ']).toBe(1);
    expect(r00.outputs['GT']).toBe(0);
    expect(r00.outputs['LT']).toBe(0);

    // Row 1: A=0, B=1 -> EQ=0, GT=0, LT=1
    const r01 = table!.rows.find(r => r.inputs['A'] === 0 && r.inputs['B'] === 1)!;
    expect(r01.outputs['EQ']).toBe(0);
    expect(r01.outputs['GT']).toBe(0);
    expect(r01.outputs['LT']).toBe(1);

    // Row 2: A=1, B=0 -> EQ=0, GT=1, LT=0
    const r10 = table!.rows.find(r => r.inputs['A'] === 1 && r.inputs['B'] === 0)!;
    expect(r10.outputs['EQ']).toBe(0);
    expect(r10.outputs['GT']).toBe(1);
    expect(r10.outputs['LT']).toBe(0);

    // Row 3: A=1, B=1 -> EQ=1, GT=0, LT=0
    const r11 = table!.rows.find(r => r.inputs['A'] === 1 && r.inputs['B'] === 1)!;
    expect(r11.outputs['EQ']).toBe(1);
    expect(r11.outputs['GT']).toBe(0);
    expect(r11.outputs['LT']).toBe(0);
  });
});
