// =============================================================================
// CircuitSerializer.ts — Save and load circuit state as JSON.
// The saved format is a plain-data snapshot; Maps are serialized as arrays.
// =============================================================================

import type { CircuitState, Component, Wire } from './types.js';
import { CircuitGraph } from './CircuitGraph.js';

// ---------------------------------------------------------------------------
// Serialized (JSON-safe) format
// ---------------------------------------------------------------------------

interface SerializedPort {
  id: string;
  name: string;
  direction: 'input' | 'output';
  value: 0 | 1 | 'X';
}

interface SerializedComponent {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  inputPorts: SerializedPort[];
  outputPorts: SerializedPort[];
  config: Record<string, unknown>;
}

interface SerializedWire {
  id: string;
  fromComponentId: string;
  fromPortId: string;
  toComponentId: string;
  toPortId: string;
  value: 0 | 1 | 'X';
}

export interface SerializedCircuit {
  version: '1.0';
  name: string;
  components: SerializedComponent[];
  wires: SerializedWire[];
}

// ---------------------------------------------------------------------------
// CircuitSerializer
// ---------------------------------------------------------------------------

export class CircuitSerializer {
  /** Serialize the circuit graph to a plain JSON-safe object. */
  static serialize(graph: CircuitGraph): SerializedCircuit {
    const { state } = graph;

    const components: SerializedComponent[] = [...state.components.values()].map(c => ({
      id: c.id,
      type: c.type,
      label: c.label,
      position: { ...c.position },
      size: { ...c.size },
      inputPorts: c.inputPorts.map(p => ({ ...p })),
      outputPorts: c.outputPorts.map(p => ({ ...p })),
      config: { ...c.config },
    }));

    const wires: SerializedWire[] = [...state.wires.values()].map(w => ({ ...w }));

    return {
      version: '1.0',
      name: state.name,
      components,
      wires,
    };
  }

  /** Deserialize a saved circuit and return a new CircuitGraph. */
  static deserialize(data: SerializedCircuit): CircuitGraph {
    const graph = new CircuitGraph(data.name);

    // Restore components (bypass addComponent to preserve original IDs)
    for (const sc of data.components) {
      const comp: Component = {
        id: sc.id,
        type: sc.type as Component['type'],
        label: sc.label,
        position: { ...sc.position },
        size: { ...sc.size },
        inputPorts: sc.inputPorts.map(p => ({ ...p })),
        outputPorts: sc.outputPorts.map(p => ({ ...p })),
        hasError: false,
        config: { ...sc.config },
      };
      graph.state.components.set(comp.id, comp);
    }

    // Restore wires
    for (const sw of data.wires) {
      const wire: Wire = { ...sw };
      graph.state.wires.set(wire.id, wire);
    }

    return graph;
  }

  /** Download the circuit as a .json file in the browser. */
  static downloadAsFile(graph: CircuitGraph): void {
    const data = CircuitSerializer.serialize(graph);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${graph.state.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Load a circuit from a user-selected .json file. Returns the graph or throws. */
  static async loadFromFile(): Promise<CircuitGraph> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type  = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { reject(new Error('No file selected')); return; }
        try {
          const text = await file.text();
          const data = JSON.parse(text) as SerializedCircuit;
          if (data.version !== '1.0') throw new Error('Unsupported circuit file version.');
          resolve(CircuitSerializer.deserialize(data));
        } catch (e) {
          reject(e);
        }
      };
      input.click();
    });
  }

  /** Serialize to JSON string. */
  static toJSON(graph: CircuitGraph): string {
    return JSON.stringify(CircuitSerializer.serialize(graph), null, 2);
  }

  /** Deserialize from JSON string. */
  static fromJSON(json: string): CircuitGraph {
    return CircuitSerializer.deserialize(JSON.parse(json) as SerializedCircuit);
  }
}
