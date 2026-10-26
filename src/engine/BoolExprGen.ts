// =============================================================================
// BoolExprGen.ts — Generate a Boolean expression string by recursively
// tracing the circuit graph backwards from an output component.
//
// Rules:
//   AND  → (A · B)
//   OR   → (A + B)
//   NOT  → A'
//   NAND → (A · B)'
//   NOR  → (A + B)'
//   XOR  → (A ⊕ B)
//   XNOR → (A ⊕ B)'
//   MUX2 → (S'·I0 + S·I1)
//   INPUT → its label (leaf node)
//   Unconnected input → 'X'
// =============================================================================

import type { CircuitGraph } from './CircuitGraph.js';
import type { Component, BooleanExprResult } from './types.js';

export class BoolExprGen {
  /**
   * Generate boolean expressions for all sink (output) components.
   */
  static generateAll(graph: CircuitGraph): BooleanExprResult[] {
    const results: BooleanExprResult[] = [];
    for (const sink of graph.getSinkComponents()) {
      results.push(BoolExprGen.generateForOutput(graph, sink.id));
    }
    return results;
  }

  /**
   * Generate the boolean expression for a specific output component.
   */
  static generateForOutput(graph: CircuitGraph, outputComponentId: string): BooleanExprResult {
    const comp = graph.state.components.get(outputComponentId);
    if (!comp) {
      return { outputId: outputComponentId, outputLabel: '?', expression: '?' };
    }

    const visited = new Set<string>();
    const expr = BoolExprGen.traceInput(graph, comp, 'in', visited, 0);

    return {
      outputId: outputComponentId,
      outputLabel: comp.label,
      expression: `${comp.label} = ${expr}`,
    };
  }

  /**
   * Recursively trace the circuit graph backwards from a component's input port.
   * Returns the sub-expression string feeding that port.
   */
  private static traceInput(
    graph: CircuitGraph,
    comp: Component,
    portId: string,
    visited: Set<string>,
    depth: number,
  ): string {
    if (depth > 50) return '(...)'; // Guard against infinite recursion

    const wire = graph.getWireTo(comp.id, portId);
    if (!wire) return 'X'; // Unconnected

    const upstream = graph.state.components.get(wire.fromComponentId);
    if (!upstream) return 'X';

    return BoolExprGen.exprForComponent(graph, upstream, wire.fromPortId, visited, depth + 1);
  }

  /**
   * Build the expression string for a component's output.
   */
  private static exprForComponent(
    graph: CircuitGraph,
    comp: Component,
    outPortId: string,
    visited: Set<string>,
    depth: number,
  ): string {
    // Leaf: INPUT-type components return their label
    if (['INPUT', 'BUTTON', 'CLOCK'].includes(comp.type)) {
      return comp.label;
    }

    // Memoization key (avoid re-expanding shared subexpressions)
    const key = `${comp.id}::${outPortId}`;
    if (visited.has(key)) {
      return `[${comp.label}]`; // Back-reference to shared node
    }
    visited.add(key);

    const trace = (portId: string) =>
      BoolExprGen.traceInput(graph, comp, portId, new Set(visited), depth);

    let expr: string;

    switch (comp.type) {
      case 'AND':
        expr = `(${trace('in_A')} · ${trace('in_B')})`;
        break;
      case 'OR':
        expr = `(${trace('in_A')} + ${trace('in_B')})`;
        break;
      case 'NOT':
        expr = `${trace('in_A')}'`;
        break;
      case 'NAND':
        expr = `(${trace('in_A')} · ${trace('in_B')})'`;
        break;
      case 'NOR':
        expr = `(${trace('in_A')} + ${trace('in_B')})'`;
        break;
      case 'XOR':
        expr = `(${trace('in_A')} ⊕ ${trace('in_B')})`;
        break;
      case 'XNOR':
        expr = `(${trace('in_A')} ⊕ ${trace('in_B')})'`;
        break;
      case 'MUX2': {
        const s  = trace('in_S');
        const i0 = trace('in_I0');
        const i1 = trace('in_I1');
        expr = `(${s}'·${i0} + ${s}·${i1})`;
        break;
      }
      case 'MUX4': {
        const s0 = trace('in_S0');
        const s1 = trace('in_S1');
        const i0 = trace('in_I0');
        const i1 = trace('in_I1');
        const i2 = trace('in_I2');
        const i3 = trace('in_I3');
        expr = `(${s1}'·${s0}'·${i0} + ${s1}'·${s0}·${i1} + ${s1}·${s0}'·${i2} + ${s1}·${s0}·${i3})`;
        break;
      }
      case 'HALF_ADDER': {
        if (outPortId === 'out_C') expr = `(${trace('in_A')} · ${trace('in_B')})`;
        else expr = `(${trace('in_A')} ⊕ ${trace('in_B')})`;
        break;
      }
      case 'HALF_SUBTRACTOR': {
        if (outPortId === 'out_Bout') expr = `(${trace('in_A')}' · ${trace('in_B')})`;
        else expr = `(${trace('in_A')} ⊕ ${trace('in_B')})`;
        break;
      }
      case 'FULL_ADDER': {
        if (outPortId === 'out_S') expr = `(${trace('in_A')} ⊕ ${trace('in_B')} ⊕ ${trace('in_Cin')})`;
        else expr = `((${trace('in_A')}·${trace('in_B')}) + (${trace('in_Cin')}·(${trace('in_A')}⊕${trace('in_B')})))`;
        break;
      }
      case 'FULL_SUBTRACTOR': {
        const a   = trace('in_A');
        const b   = trace('in_B');
        const bin = trace('in_Bin');
        if (outPortId === 'out_Diff') {
          expr = `(${a} ⊕ ${b} ⊕ ${bin})`;
        } else {
          expr = `((${a}' · ${b}) + ((${a} ⊕ ${b})' · ${bin}))`;
        }
        break;
      }
      case 'DEMUX1_2': {
        if (outPortId === 'out_Y1') expr = `(${trace('in_S')} · ${trace('in_D')})`;
        else expr = `(${trace('in_S')}' · ${trace('in_D')})`;
        break;
      }
      case 'DEMUX1_4': {
        const d  = trace('in_D');
        const s0 = trace('in_S0');
        const s1 = trace('in_S1');
        if (outPortId === 'out_Y0') expr = `(${s1}' · ${s0}' · ${d})`;
        else if (outPortId === 'out_Y1') expr = `(${s1}' · ${s0} · ${d})`;
        else if (outPortId === 'out_Y2') expr = `(${s1} · ${s0}' · ${d})`;
        else expr = `(${s1} · ${s0} · ${d})`;
        break;
      }
      case 'DECODER2_4': {
        const a0 = trace('in_A0');
        const a1 = trace('in_A1');
        const en = trace('in_EN');
        if (outPortId === 'out_Y0') expr = `(${en} · ${a1}' · ${a0}')`;
        else if (outPortId === 'out_Y1') expr = `(${en} · ${a1}' · ${a0})`;
        else if (outPortId === 'out_Y2') expr = `(${en} · ${a1} · ${a0}')`;
        else expr = `(${en} · ${a1} · ${a0})`;
        break;
      }
      case 'ENCODER4_2': {
        const d0 = trace('in_D0');
        const d1 = trace('in_D1');
        const d2 = trace('in_D2');
        const d3 = trace('in_D3');
        if (outPortId === 'out_A1') expr = `(${d3} + ${d2})`;
        else if (outPortId === 'out_A0') expr = `(${d3} + (${d2}' · ${d1}))`;
        else expr = `(${d3} + ${d2} + ${d1} + ${d0})`;
        break;
      }
      case 'COMPARATOR': {
        const a = trace('in_A');
        const b = trace('in_B');
        if (outPortId === 'out_GT') expr = `(${a} · ${b}')`;
        else if (outPortId === 'out_LT') expr = `(${a}' · ${b})`;
        else expr = `(${a} ⊕ ${b})'`;
        break;
      }
      case 'LED':
      case 'OUTPUT':
      case 'BUZZER':
        expr = trace('in');
        break;
      default:
        expr = `[${comp.label || comp.type}]`;
        break;
    }

    visited.delete(key); // Allow re-use in different branches
    return expr;
  }
}
