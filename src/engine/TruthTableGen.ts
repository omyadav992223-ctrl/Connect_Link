// =============================================================================
// TruthTableGen.ts — Generate a truth table by evaluating the actual circuit
// for every possible combination of input values.
//
// Process:
//   1. Identify all INPUT-type source components (ordered by label).
//   2. For 2^n combinations, set each input's output port to the bit value.
//   3. Run Propagator.propagate().
//   4. Read all sink (LED/OUTPUT/BUZZER) component output values.
//   5. Collect row into TruthTable.
//   6. Restore original input values and re-propagate.
// =============================================================================

import type { TruthTable, TruthTableRow, LogicValue } from './types.js';
import type { CircuitGraph } from './CircuitGraph.js';
import { Propagator } from './Propagator.js';

export class TruthTableGen {
  /**
   * Generate the full truth table for the current circuit.
   * Returns null if there are no inputs or outputs.
   */
  static generate(graph: CircuitGraph): TruthTable | null {
    const inputs  = graph.getSourceComponents().filter(c => c.type === 'INPUT');
    const outputs = graph.getSinkComponents();

    if (inputs.length === 0 || outputs.length === 0) return null;
    // Guard against combinatorial explosion (>16 inputs = 65536+ rows)
    if (inputs.length > 16) return null;

    // Sort inputs and outputs by label for deterministic ordering
    const sortedInputs  = [...inputs].sort((a, b) => a.label.localeCompare(b.label));
    const sortedOutputs = [...outputs].sort((a, b) => a.label.localeCompare(b.label));

    const inputLabels  = sortedInputs.map(c => c.label);
    const outputLabels = sortedOutputs.map(c => c.label);

    // Save original input values and component states to restore after evaluation
    const originalValues = new Map<string, LogicValue>();
    for (const inp of sortedInputs) {
      originalValues.set(inp.id, inp.outputPorts[0]?.value ?? 0);
    }

    const savedStates = new Map<string, { outputs: Record<string, LogicValue>; config: Record<string, unknown> }>();
    for (const comp of graph.getAllComponents()) {
      const outputs: Record<string, LogicValue> = {};
      for (const p of comp.outputPorts) {
        outputs[p.id] = p.value;
      }
      savedStates.set(comp.id, { outputs, config: { ...comp.config } });
    }

    const rows: TruthTableRow[] = [];
    const rowCount = 1 << sortedInputs.length; // 2^n

    for (let mask = 0; mask < rowCount; mask++) {
      // Set each input based on current bit of mask
      for (let i = 0; i < sortedInputs.length; i++) {
        const bitPos = sortedInputs.length - 1 - i; // MSB first
        const bit: LogicValue = ((mask >> bitPos) & 1) as LogicValue;
        const outPort = sortedInputs[i].outputPorts[0];
        if (outPort) outPort.value = bit;
      }

      // Propagate silently through the entire circuit (suppress UI signal events)
      Propagator.propagate(graph, false);

      // Read output values
      const inputValues: Record<string, LogicValue> = {};
      for (let i = 0; i < sortedInputs.length; i++) {
        const bitPos = sortedInputs.length - 1 - i;
        inputValues[inputLabels[i]] = ((mask >> bitPos) & 1) as LogicValue;
      }

      const outputValues: Record<string, LogicValue> = {};
      for (const out of sortedOutputs) {
        // Read the mirrored output port (probe value)
        const outPort = out.outputPorts[0];
        outputValues[out.label] = outPort?.value ?? 'X';
      }

      rows.push({ inputs: inputValues, outputs: outputValues });
    }

    // Restore original input values
    for (const inp of sortedInputs) {
      const orig = originalValues.get(inp.id) ?? 0;
      const outPort = inp.outputPorts[0];
      if (outPort) outPort.value = orig;
    }

    // Restore original component outputs and config (preserves sequential states)
    for (const comp of graph.getAllComponents()) {
      const saved = savedStates.get(comp.id);
      if (saved) {
        for (const p of comp.outputPorts) {
          if (saved.outputs[p.id] !== undefined) p.value = saved.outputs[p.id];
        }
        comp.config = { ...saved.config };
      }
    }

    // Re-propagate silently to restore the circuit to its user-set state
    Propagator.propagate(graph, false);

    return { inputLabels, outputLabels, rows };
  }

  /**
   * Get the minterms for a specific output column in the truth table.
   * A minterm is the row index where the output is 1.
   * Returns { minterms, dontCares } for K-map use.
   */
  static getMinterms(
    table: TruthTable,
    outputLabel: string,
  ): { minterms: number[]; dontCares: number[] } {
    const minterms: number[] = [];
    const dontCares: number[] = [];

    table.rows.forEach((row, idx) => {
      const val = row.outputs[outputLabel];
      if (val === 1) minterms.push(idx);
      else if (val === 'X') dontCares.push(idx);
    });

    return { minterms, dontCares };
  }
}
