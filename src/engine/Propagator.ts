// =============================================================================
// Propagator.ts — Signal propagation using Kahn's topological sort algorithm.
//
// Algorithm:
//   1. Build adjacency list (component → downstream components).
//   2. Compute in-degree for each component.
//   3. Start with all components whose in-degree is 0 (source nodes).
//   4. Process queue: evaluate each component, propagate wire values,
//      decrement in-degree of downstream neighbours.
//   5. If processed count < total components → cycle detected.
//
// The Propagator is stateless — it runs over the graph each time called.
// =============================================================================

import type { CircuitGraph } from './CircuitGraph.js';
import type { Component, PropagationResult, CircuitError, GateType } from './types.js';
import { evaluateComponent } from './Evaluator.js';
import { eventBus } from './EventBus.js';

/**
 * Checks whether an input port is a sequential data/control port of an edge-triggered component.
 * These ports receive next-state signals and do not create combinational dependencies in Kahn's algorithm.
 */
export function isSequentialDataPort(type: GateType, portId: string): boolean {
  if (type === 'DFF') return portId === 'in_D';
  if (type === 'JKFF') return portId === 'in_J' || portId === 'in_K';
  if (type === 'TFF') return portId === 'in_T';
  return false;
}

export class Propagator {
  /**
   * Propagate signals through the circuit.
   * Modifies component port values and wire values in the graph in-place.
   * Emits 'signal:updated' on the event bus when done.
   */
  static propagate(graph: CircuitGraph, emitSignal = true): PropagationResult {
    const components = graph.getAllComponents();
    const wires      = graph.getAllWires();
    const result: PropagationResult = {
      success: true,
      errors: [],
      updatedComponentIds: [],
      updatedWireIds: [],
    };

    if (components.length === 0) {
      if (emitSignal) eventBus.emit('signal:updated', result);
      return result;
    }

    // ------------------------------------------------------------------
    // Step 0: Snapshot sequential input ports (setup-time values at clock edge)
    // ------------------------------------------------------------------
    for (const comp of components) {
      if (comp.type === 'DFF') {
        comp.config['_sampledD'] = comp.inputPorts.find(p => p.id === 'in_D')?.value;
      } else if (comp.type === 'JKFF') {
        comp.config['_sampledJ'] = comp.inputPorts.find(p => p.id === 'in_J')?.value;
        comp.config['_sampledK'] = comp.inputPorts.find(p => p.id === 'in_K')?.value;
      } else if (comp.type === 'TFF') {
        comp.config['_sampledT'] = comp.inputPorts.find(p => p.id === 'in_T')?.value;
      }
    }

    // ------------------------------------------------------------------
    // Step 1: Build in-degree map and adjacency list
    // ------------------------------------------------------------------
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>(); // id → [downstream ids]

    for (const comp of components) {
      if (!inDegree.has(comp.id)) inDegree.set(comp.id, 0);
      if (!adjacency.has(comp.id)) adjacency.set(comp.id, []);
    }

    for (const wire of wires) {
      const from = wire.fromComponentId;
      const to   = wire.toComponentId;
      adjacency.get(from)?.push(to);

      const toComp = graph.state.components.get(to);
      const isSeqPort = toComp ? isSequentialDataPort(toComp.type, wire.toPortId) : false;
      if (!isSeqPort) {
        inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
      }
    }

    // ------------------------------------------------------------------
    // Step 2: Initialise queue with zero-in-degree nodes (sources first)
    // ------------------------------------------------------------------
    const queue: Component[] = [];
    for (const comp of components) {
      if ((inDegree.get(comp.id) ?? 0) === 0) {
        queue.push(comp);
      }
    }

    // Sort sources so INPUT types come first (deterministic order)
    queue.sort((a, b) => {
      const priority: Record<string, number> = { INPUT: 0, BUTTON: 0, CLOCK: 0 };
      return (priority[a.type] ?? 1) - (priority[b.type] ?? 1);
    });

    // ------------------------------------------------------------------
    // Step 3: Kahn's BFS topological process
    // ------------------------------------------------------------------
    const processed = new Set<string>();
    let head = 0;

    while (head < queue.length) {
      const comp = queue[head++];
      processed.add(comp.id);

      // Evaluate the component (source nodes are skipped — their output is
      // already set by setInputValue/toggleInput/hardware controller)
      const isSource = ['INPUT', 'BUTTON', 'CLOCK'].includes(comp.type);
      if (!isSource) {
        const changed = evaluateComponent(comp);
        if (changed) result.updatedComponentIds.push(comp.id);
      } else {
        result.updatedComponentIds.push(comp.id);
      }

      // Propagate output values through all outgoing wires
      for (const outPort of comp.outputPorts) {
        const outWires = graph.getWiresFrom(comp.id, outPort.id);
        for (const wire of outWires) {
          const oldValue = wire.value;
          wire.value = outPort.value;
          if (wire.value !== oldValue) result.updatedWireIds.push(wire.id);

          // Update the receiving component's input port value
          const toComp = graph.state.components.get(wire.toComponentId);
          if (toComp) {
            const toPort = toComp.inputPorts.find(p => p.id === wire.toPortId);
            if (toPort) toPort.value = wire.value;
          }

          const isSeqPort = toComp ? isSequentialDataPort(toComp.type, wire.toPortId) : false;
          if (!isSeqPort) {
            // Decrement in-degree of downstream component
            const newDeg = (inDegree.get(wire.toComponentId) ?? 1) - 1;
            inDegree.set(wire.toComponentId, newDeg);

            if (newDeg === 0) {
              const downstream = graph.state.components.get(wire.toComponentId);
              if (downstream && !processed.has(downstream.id)) {
                queue.push(downstream);
              }
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 4: Cycle detection
    // ------------------------------------------------------------------
    if (processed.size < components.length) {
      const cycleNodes = components.filter(c => !processed.has(c.id));
      const err: CircuitError = {
        id: generateErrorId(),
        severity: 'error',
        message: `Combinational cycle detected involving: ${cycleNodes.map(c => c.label).join(', ')}.`,
      };
      result.errors.push(err);
      result.success = false;
      eventBus.emit('error:detected', [err]);
    }

    // Clean up temporary setup-time sampled keys
    for (const comp of components) {
      if (comp.type === 'DFF') delete comp.config['_sampledD'];
      else if (comp.type === 'JKFF') { delete comp.config['_sampledJ']; delete comp.config['_sampledK']; }
      else if (comp.type === 'TFF') delete comp.config['_sampledT'];
    }

    // Emit signal:updated so UI re-renders current state (unless silent)
    if (emitSignal) {
      eventBus.emit('signal:updated', result);
    }
    return result;
  }
}

let _errId = 0;
function generateErrorId(): string {
  return `err_${_errId++}`;
}
