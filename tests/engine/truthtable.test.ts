// =============================================================================
// truthtable.test.ts — TruthTableGen produces correct tables from actual circuits.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { Propagator } from '../../src/engine/Propagator.js';
import { TruthTableGen } from '../../src/engine/TruthTableGen.js';
import { loadBlindSpotPreset } from '../../src/ui/presets/BlindSpotPreset.js';

function buildAND() {
  const graph = new CircuitGraph();
  const inA  = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
  const inB  = graph.addComponent('INPUT', { x: 0, y: 80 }, 'B');
  const gate = graph.addComponent('AND', { x: 150, y: 40 });
  const led  = graph.addComponent('LED', { x: 300, y: 40 }, 'Y');
  graph.addWire(inA.id, 'out', gate.id, 'in_A');
  graph.addWire(inB.id, 'out', gate.id, 'in_B');
  graph.addWire(gate.id, 'out_Y', led.id, 'in');
  return graph;
}

function buildOR() {
  const graph = new CircuitGraph();
  const inA  = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
  const inB  = graph.addComponent('INPUT', { x: 0, y: 80 }, 'B');
  const gate = graph.addComponent('OR', { x: 150, y: 40 });
  const led  = graph.addComponent('LED', { x: 300, y: 40 }, 'Y');
  graph.addWire(inA.id, 'out', gate.id, 'in_A');
  graph.addWire(inB.id, 'out', gate.id, 'in_B');
  graph.addWire(gate.id, 'out_Y', led.id, 'in');
  return graph;
}

describe('TruthTableGen — AND gate', () => {
  it('generates 4-row truth table', () => {
    const table = TruthTableGen.generate(buildAND());
    expect(table).not.toBeNull();
    expect(table!.rows).toHaveLength(4);
  });

  it('has correct input labels', () => {
    const table = TruthTableGen.generate(buildAND());
    expect(table!.inputLabels.sort()).toEqual(['A', 'B']);
  });

  it('A=0,B=0 → Y=0', () => {
    const table = TruthTableGen.generate(buildAND())!;
    const row = table.rows.find(r => r.inputs['A'] === 0 && r.inputs['B'] === 0);
    expect(row?.outputs['Y']).toBe(0);
  });

  it('A=1,B=1 → Y=1', () => {
    const table = TruthTableGen.generate(buildAND())!;
    const row = table.rows.find(r => r.inputs['A'] === 1 && r.inputs['B'] === 1);
    expect(row?.outputs['Y']).toBe(1);
  });

  it('only A=1,B=1 gives Y=1', () => {
    const table = TruthTableGen.generate(buildAND())!;
    const oneRows = table.rows.filter(r => r.outputs['Y'] === 1);
    expect(oneRows).toHaveLength(1);
    expect(oneRows[0].inputs['A']).toBe(1);
    expect(oneRows[0].inputs['B']).toBe(1);
  });
});

describe('TruthTableGen — OR gate', () => {
  it('exactly 3 rows have Y=1', () => {
    const table = TruthTableGen.generate(buildOR())!;
    const oneRows = table.rows.filter(r => r.outputs['Y'] === 1);
    expect(oneRows).toHaveLength(3);
  });

  it('A=0,B=0 → Y=0', () => {
    const table = TruthTableGen.generate(buildOR())!;
    const row = table.rows.find(r => r.inputs['A'] === 0 && r.inputs['B'] === 0);
    expect(row?.outputs['Y']).toBe(0);
  });
});

describe('TruthTableGen — 3-input blind-spot circuit', () => {
  function buildBlindSpot() {
    const graph = new CircuitGraph();
    const inL  = graph.addComponent('INPUT', { x: 0, y: 0 },   'L');
    const inR  = graph.addComponent('INPUT', { x: 0, y: 80 },  'R');
    const inLC = graph.addComponent('INPUT', { x: 0, y: 160 }, 'LC');
    const and1 = graph.addComponent('AND', { x: 150, y: 40 });
    const and2 = graph.addComponent('AND', { x: 300, y: 80 });
    const led  = graph.addComponent('LED', { x: 450, y: 80 }, 'CRITICAL');
    graph.addWire(inL.id,  'out',   and1.id, 'in_A');
    graph.addWire(inR.id,  'out',   and1.id, 'in_B');
    graph.addWire(and1.id, 'out_Y', and2.id, 'in_A');
    graph.addWire(inLC.id, 'out',   and2.id, 'in_B');
    graph.addWire(and2.id, 'out_Y', led.id,  'in');
    return graph;
  }

  it('generates 8-row truth table', () => {
    const table = TruthTableGen.generate(buildBlindSpot())!;
    expect(table.rows).toHaveLength(8);
  });

  it('only L=1,R=1,LC=1 gives CRITICAL=1', () => {
    const table = TruthTableGen.generate(buildBlindSpot())!;
    const critRows = table.rows.filter(r => r.outputs['CRITICAL'] === 1);
    expect(critRows).toHaveLength(1);
    expect(critRows[0].inputs['L']).toBe(1);
    expect(critRows[0].inputs['R']).toBe(1);
    expect(critRows[0].inputs['LC']).toBe(1);
  });

  it('getMinterms returns [7] for CRITICAL output', () => {
    const table = TruthTableGen.generate(buildBlindSpot())!;
    const { minterms, dontCares } = TruthTableGen.getMinterms(table, 'CRITICAL');
    expect(minterms).toEqual([7]);
    expect(dontCares).toHaveLength(0);
  });
});

describe('TruthTableGen — returns null for empty circuits', () => {
  it('null when no inputs', () => {
    const graph = new CircuitGraph();
    graph.addComponent('LED', { x: 0, y: 0 });
    expect(TruthTableGen.generate(graph)).toBeNull();
  });

  it('null when no outputs', () => {
    const graph = new CircuitGraph();
    graph.addComponent('INPUT', { x: 0, y: 0 });
    expect(TruthTableGen.generate(graph)).toBeNull();
  });
});

describe('TruthTableGen — BlindSpotPreset (all 16 input combinations)', () => {
  it('generates 16 rows and matches all Boolean specifications', () => {
    const graph = new CircuitGraph();
    loadBlindSpotPreset(graph);
    const table = TruthTableGen.generate(graph);

    expect(table).not.toBeNull();
    expect(table!.rows).toHaveLength(16);
    expect(table!.inputLabels).toEqual(['IL', 'IR', 'L', 'R']);

    for (const row of table!.rows) {
      const L  = row.inputs['L'] as number;
      const R  = row.inputs['R'] as number;
      const IL = row.inputs['IL'] as number;
      const IR = row.inputs['IR'] as number;

      const expectedWL     = L & IL;
      const expectedWR     = R & IR;
      const expectedAlert  = L | R;
      const expectedSafe   = (L | R) === 0 ? 1 : 0;
      const expectedBuzzer = expectedWL | expectedWR;

      expect(row.outputs['W_L']).toBe(expectedWL);
      expect(row.outputs['W_R']).toBe(expectedWR);
      expect(row.outputs['ALERT']).toBe(expectedAlert);
      expect(row.outputs['SAFE']).toBe(expectedSafe);
      expect(row.outputs['BUZZER']).toBe(expectedBuzzer);
    }
  });

  it('preserves flip-flop state and does not corrupt latched values when generating truth table', () => {
    const graph = new CircuitGraph();
    const inA = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const clk = graph.addComponent('CLOCK', { x: 0, y: 80 }, 'CLK');
    const dff = graph.addComponent('DFF', { x: 150, y: 40 }, 'DFF1');
    const led = graph.addComponent('LED', { x: 300, y: 40 }, 'OUT_Y');

    graph.addWire(inA.id, 'out', dff.id, 'in_D');
    graph.addWire(clk.id, 'out', dff.id, 'in_CLK');
    graph.addWire(dff.id, 'out_Q', led.id, 'in');

    // Latch D=1 into DFF
    graph.setInputValue(inA.id, 1);
    graph.setInputValue(clk.id, 0);
    Propagator.propagate(graph);
    graph.setInputValue(clk.id, 1); // Rising edge!
    Propagator.propagate(graph);

    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(0);

    // Generate truth table (evaluates inputs over 2^n iterations)
    const table = TruthTableGen.generate(graph);
    expect(table).not.toBeNull();

    // Verify DFF state was preserved (still Q=1, QBAR=0)
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(0);
    expect(led.inputPorts[0].value).toBe(1);
  });
});
