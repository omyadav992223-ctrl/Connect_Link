// =============================================================================
// ErrorChecker.ts — Validates a circuit graph before / during propagation.
// Returns structured CircuitError[] rather than throwing.
// =============================================================================

import type { CircuitGraph } from './CircuitGraph.js';
import type { CircuitError } from './types.js';

let _id = 0;
function eid(): string { return `ec_${_id++}`; }

export class ErrorChecker {
  /**
   * Run all validation checks on the given graph.
   * Returns an empty array if the circuit is valid.
   */
  static validate(graph: CircuitGraph): CircuitError[] {
    const errors: CircuitError[] = [];

    errors.push(...ErrorChecker.checkUnconnectedInputs(graph));
    errors.push(...ErrorChecker.checkMultipleDrivers(graph));
    // Note: cycle check is done in Propagator (requires full BFS)

    return errors;
  }

  /** Check for required input ports that have no wire connected. */
  private static checkUnconnectedInputs(graph: CircuitGraph): CircuitError[] {
    const errors: CircuitError[] = [];

    for (const comp of graph.getAllComponents()) {
      // Source components have no required input ports
      if (['INPUT', 'BUTTON', 'CLOCK'].includes(comp.type)) continue;

      for (const port of comp.inputPorts) {
        const wire = graph.getWireTo(comp.id, port.id);
        if (!wire) {
          errors.push({
            id: eid(),
            severity: 'warning',
            componentId: comp.id,
            portId: port.id,
            message: `'${comp.label}' — input '${port.name}' is not connected. It will be treated as unknown (X).`,
          });
        }
      }
    }

    return errors;
  }

  /** Check for input ports driven by more than one wire. */
  private static checkMultipleDrivers(graph: CircuitGraph): CircuitError[] {
    const errors: CircuitError[] = [];
    const portDriverCount = new Map<string, number>();

    for (const wire of graph.getAllWires()) {
      const key = `${wire.toComponentId}::${wire.toPortId}`;
      portDriverCount.set(key, (portDriverCount.get(key) ?? 0) + 1);
    }

    for (const [key, count] of portDriverCount) {
      if (count > 1) {
        const [compId, portId] = key.split('::');
        const comp = graph.state.components.get(compId);
        const port = comp?.inputPorts.find(p => p.id === portId);
        errors.push({
          id: eid(),
          severity: 'error',
          componentId: compId,
          portId,
          message: `'${comp?.label ?? compId}' — input '${port?.name ?? portId}' is driven by ${count} wires. Only one driver is allowed per input.`,
        });
      }
    }

    return errors;
  }

  /** Check that at least one output component exists. */
  static hasOutputs(graph: CircuitGraph): boolean {
    return graph.getSinkComponents().length > 0;
  }

  /** Check that at least one input component exists. */
  static hasInputs(graph: CircuitGraph): boolean {
    return graph.getSourceComponents().length > 0;
  }
}
