// =============================================================================
// CircuitGraph.ts — Component and wire registry.
// The single mutable store for circuit topology.
// All structural mutations go through this class.
// =============================================================================

import type {
  Component,
  Wire,
  CircuitState,
  GateType,
  LogicValue,
  Port,
  Position,
} from './types.js';
import { eventBus } from './EventBus.js';
import { isSequentialDataPort } from './Propagator.js';

// ---------------------------------------------------------------------------
// Component port templates — defines which ports each gate type has
// ---------------------------------------------------------------------------

function makePort(id: string, name: string, direction: 'input' | 'output'): Port {
  return { id, name, direction, value: 'X' };
}

export function createPortsForType(type: GateType): { inputPorts: Port[]; outputPorts: Port[] } {
  switch (type) {
    case 'AND':
    case 'OR':
    case 'NAND':
    case 'NOR':
    case 'XOR':
    case 'XNOR':
      return {
        inputPorts: [makePort('in_A', 'A', 'input'), makePort('in_B', 'B', 'input')],
        outputPorts: [makePort('out_Y', 'Y', 'output')],
      };
    case 'NOT':
      return {
        inputPorts: [makePort('in_A', 'A', 'input')],
        outputPorts: [makePort('out_Y', 'Y', 'output')],
      };
    case 'INPUT':
    case 'BUTTON':
    case 'CLOCK':
      return {
        inputPorts: [],
        outputPorts: [{ id: 'out', name: 'Q', direction: 'output', value: 0 }],
      };
    case 'LED':
    case 'OUTPUT':
    case 'BUZZER':
      return {
        inputPorts: [makePort('in', 'in', 'input')],
        outputPorts: [makePort('out', 'Q', 'output')], // mirror for probing
      };
    case 'MUX2':
      return {
        inputPorts: [
          makePort('in_I0', 'I0', 'input'),
          makePort('in_I1', 'I1', 'input'),
          makePort('in_S', 'S', 'input'),
        ],
        outputPorts: [makePort('out_Y', 'Y', 'output')],
      };
    case 'COMPARATOR':
      return {
        inputPorts: [makePort('in_A', 'A', 'input'), makePort('in_B', 'B', 'input')],
        outputPorts: [
          makePort('out_GT', 'A>B', 'output'),
          makePort('out_EQ', 'A=B', 'output'),
          makePort('out_LT', 'A<B', 'output'),
        ],
      };
    case 'HALF_ADDER':
      return {
        inputPorts: [makePort('in_A', 'A', 'input'), makePort('in_B', 'B', 'input')],
        outputPorts: [
          makePort('out_S', 'S', 'output'),
          makePort('out_C', 'C', 'output'),
        ],
      };
    case 'FULL_ADDER':
      return {
        inputPorts: [
          makePort('in_A', 'A', 'input'),
          makePort('in_B', 'B', 'input'),
          makePort('in_Cin', 'Cin', 'input'),
        ],
        outputPorts: [
          makePort('out_S', 'S', 'output'),
          makePort('out_Cout', 'Cout', 'output'),
        ],
      };
    case 'MUX4':
      return {
        inputPorts: [
          makePort('in_I0', 'I0', 'input'),
          makePort('in_I1', 'I1', 'input'),
          makePort('in_I2', 'I2', 'input'),
          makePort('in_I3', 'I3', 'input'),
          makePort('in_S0', 'S0', 'input'),
          makePort('in_S1', 'S1', 'input'),
        ],
        outputPorts: [makePort('out_Y', 'Y', 'output')],
      };
    case 'DECODER2_4':
      return {
        inputPorts: [
          makePort('in_A0', 'A0', 'input'),
          makePort('in_A1', 'A1', 'input'),
          makePort('in_EN', 'EN', 'input'),
        ],
        outputPorts: [
          makePort('out_Y0', 'Y0', 'output'),
          makePort('out_Y1', 'Y1', 'output'),
          makePort('out_Y2', 'Y2', 'output'),
          makePort('out_Y3', 'Y3', 'output'),
        ],
      };
    case 'DFF':
      return {
        inputPorts: [makePort('in_D', 'D', 'input'), makePort('in_CLK', 'CLK', 'input')],
        outputPorts: [
          { id: 'out_Q', name: 'Q', direction: 'output', value: 0 },
          { id: 'out_QBAR', name: "Q'", direction: 'output', value: 1 },
        ],
      };
    case 'JKFF':
      return {
        inputPorts: [
          makePort('in_J', 'J', 'input'),
          makePort('in_CLK', 'CLK', 'input'),
          makePort('in_K', 'K', 'input'),
        ],
        outputPorts: [
          { id: 'out_Q', name: 'Q', direction: 'output', value: 0 },
          { id: 'out_QBAR', name: "Q'", direction: 'output', value: 1 },
        ],
      };
    case 'TFF':
      return {
        inputPorts: [makePort('in_T', 'T', 'input'), makePort('in_CLK', 'CLK', 'input')],
        outputPorts: [
          { id: 'out_Q', name: 'Q', direction: 'output', value: 0 },
          { id: 'out_QBAR', name: "Q'", direction: 'output', value: 1 },
        ],
      };
    case 'SR_LATCH':
      return {
        inputPorts: [makePort('in_S', 'S', 'input'), makePort('in_R', 'R', 'input')],
        outputPorts: [
          { id: 'out_Q', name: 'Q', direction: 'output', value: 0 },
          { id: 'out_QBAR', name: "Q'", direction: 'output', value: 1 },
        ],
      };
    case 'DEMUX1_2':
      return {
        inputPorts: [makePort('in_D', 'D', 'input'), makePort('in_S', 'S', 'input')],
        outputPorts: [
          makePort('out_Y0', 'Y0', 'output'),
          makePort('out_Y1', 'Y1', 'output'),
        ],
      };
    case 'DEMUX1_4':
      return {
        inputPorts: [
          makePort('in_D', 'D', 'input'),
          makePort('in_S0', 'S0', 'input'),
          makePort('in_S1', 'S1', 'input'),
        ],
        outputPorts: [
          makePort('out_Y0', 'Y0', 'output'),
          makePort('out_Y1', 'Y1', 'output'),
          makePort('out_Y2', 'Y2', 'output'),
          makePort('out_Y3', 'Y3', 'output'),
        ],
      };
    case 'ENCODER4_2':
      return {
        inputPorts: [
          makePort('in_D0', 'D0', 'input'),
          makePort('in_D1', 'D1', 'input'),
          makePort('in_D2', 'D2', 'input'),
          makePort('in_D3', 'D3', 'input'),
        ],
        outputPorts: [
          makePort('out_A1', 'A1', 'output'),
          makePort('out_A0', 'A0', 'output'),
          makePort('out_V', 'V', 'output'),
        ],
      };
    case 'HALF_SUBTRACTOR':
      return {
        inputPorts: [makePort('in_A', 'A', 'input'), makePort('in_B', 'B', 'input')],
        outputPorts: [
          makePort('out_Diff', 'Diff', 'output'),
          makePort('out_Bout', 'Bout', 'output'),
        ],
      };
    case 'FULL_SUBTRACTOR':
      return {
        inputPorts: [
          makePort('in_A', 'A', 'input'),
          makePort('in_B', 'B', 'input'),
          makePort('in_Bin', 'Bin', 'input'),
        ],
        outputPorts: [
          makePort('out_Diff', 'Diff', 'output'),
          makePort('out_Bout', 'Bout', 'output'),
        ],
      };
    default:
      return { inputPorts: [], outputPorts: [] };
  }
}

/** Default canvas size for each component type [width, height]. */
const DEFAULT_SIZES: Partial<Record<GateType, { width: number; height: number }>> = {
  AND: { width: 80, height: 60 },
  OR:  { width: 80, height: 60 },
  NOT: { width: 60, height: 50 },
  NAND:{ width: 80, height: 60 },
  NOR: { width: 80, height: 60 },
  XOR: { width: 80, height: 60 },
  XNOR:{ width: 80, height: 60 },
  INPUT:  { width: 60, height: 40 },
  BUTTON: { width: 60, height: 40 },
  CLOCK:  { width: 60, height: 40 },
  LED:    { width: 50, height: 50 },
  OUTPUT: { width: 60, height: 40 },
  BUZZER: { width: 60, height: 50 },
  MUX2:            { width: 80, height: 80 },
  MUX4:            { width: 90, height: 110 },
  DEMUX1_2:        { width: 80, height: 70 },
  DEMUX1_4:        { width: 90, height: 100 },
  DECODER2_4:      { width: 100, height: 100 },
  ENCODER4_2:      { width: 90, height: 100 },
  COMPARATOR:      { width: 90, height: 80 },
  HALF_ADDER:      { width: 90, height: 70 },
  FULL_ADDER:      { width: 100, height: 80 },
  HALF_SUBTRACTOR: { width: 90, height: 70 },
  FULL_SUBTRACTOR: { width: 100, height: 80 },
  DFF:             { width: 80, height: 70 },
  JKFF:            { width: 80, height: 80 },
  TFF:             { width: 80, height: 70 },
  SR_LATCH:        { width: 80, height: 70 },
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _idCounter = 0;
export function generateId(prefix = 'c'): string {
  return `${prefix}_${Date.now()}_${_idCounter++}`;
}

/** Reset counter (used in tests). */
export function resetIdCounter(): void {
  _idCounter = 0;
}

// ---------------------------------------------------------------------------
// CircuitGraph
// ---------------------------------------------------------------------------

export class CircuitGraph {
  readonly state: CircuitState;

  constructor(name = 'Untitled Circuit') {
    this.state = {
      name,
      components: new Map(),
      wires: new Map(),
      simulationMode: 'simulation',
      running: false,
    };
  }

  // -----------------------------------------------------------------------
  // Component operations
  // -----------------------------------------------------------------------

  /** Add a new component of the given type at position. Returns the component. */
  addComponent(type: GateType, position: Position, label?: string): Component {
    const id = generateId('comp');
    const { inputPorts, outputPorts } = createPortsForType(type);
    const size = DEFAULT_SIZES[type] ?? { width: 80, height: 60 };

    const component: Component = {
      id,
      type,
      label: label ?? this.generateLabel(type),
      position: { ...position },
      size,
      inputPorts,
      outputPorts,
      hasError: false,
      config: ['DFF', 'JKFF', 'TFF'].includes(type) ? { _prevClk: 0 } : {},
    };

    this.state.components.set(id, component);
    eventBus.emit('circuit:changed');
    return component;
  }

  /** Remove a component and all wires connected to it. */
  removeComponent(id: string): boolean {
    if (!this.state.components.has(id)) return false;

    // Remove all connected wires
    for (const wire of [...this.state.wires.values()]) {
      if (wire.fromComponentId === id || wire.toComponentId === id) {
        this.state.wires.delete(wire.id);
      }
    }

    this.state.components.delete(id);
    eventBus.emit('circuit:changed');
    return true;
  }

  /** Move a component to a new position. */
  moveComponent(id: string, position: Position): boolean {
    const comp = this.state.components.get(id);
    if (!comp) return false;
    comp.position = { ...position };
    eventBus.emit('circuit:changed');
    return true;
  }

  /** Update a component's label. */
  setLabel(id: string, label: string): boolean {
    const comp = this.state.components.get(id);
    if (!comp) return false;
    comp.label = label;
    eventBus.emit('circuit:changed');
    return true;
  }

  // -----------------------------------------------------------------------
  // Wire operations
  // -----------------------------------------------------------------------

  /**
   * Connect an output port to an input port.
   * Returns { wire } on success or { error } on failure.
   */
  addWire(
    fromComponentId: string,
    fromPortId: string,
    toComponentId: string,
    toPortId: string,
  ): { wire: Wire } | { error: string } {
    // Validate components exist
    const fromComp = this.state.components.get(fromComponentId);
    const toComp   = this.state.components.get(toComponentId);
    if (!fromComp) return { error: `Source component '${fromComponentId}' not found.` };
    if (!toComp)   return { error: `Destination component '${toComponentId}' not found.` };

    // Validate ports exist and have correct direction
    const fromPort = fromComp.outputPorts.find(p => p.id === fromPortId);
    const toPort   = toComp.inputPorts.find(p => p.id === toPortId);
    if (!fromPort) return { error: `Output port '${fromPortId}' not found on '${fromComp.label}'.` };
    if (!toPort)   return { error: `Input port '${toPortId}' not found on '${toComp.label}'.` };

    // Prevent self-loop on combinational gates.
    // Edge-triggered flip-flops (DFF, JKFF, TFF) allow valid sequential feedback (e.g. Q' -> D).
    if (fromComponentId === toComponentId) {
      const isSeqFeedback = ['DFF', 'JKFF', 'TFF'].includes(fromComp.type) && isSequentialDataPort(toComp.type, toPortId);
      if (!isSeqFeedback) {
        return { error: 'Cannot connect a component to itself.' };
      }
    }

    // Prevent duplicate wire
    for (const w of this.state.wires.values()) {
      if (
        w.fromComponentId === fromComponentId &&
        w.fromPortId === fromPortId &&
        w.toComponentId === toComponentId &&
        w.toPortId === toPortId
      ) {
        return { error: 'This connection already exists.' };
      }
    }

    // Prevent multiple drivers on one input port
    for (const w of this.state.wires.values()) {
      if (w.toComponentId === toComponentId && w.toPortId === toPortId) {
        return {
          error: `Input port '${toPort.name}' on '${toComp.label}' is already driven by another wire. Multiple outputs cannot drive the same input.`,
        };
      }
    }

    const wire: Wire = {
      id: generateId('wire'),
      fromComponentId,
      fromPortId,
      toComponentId,
      toPortId,
      value: fromPort.value,
    };

    this.state.wires.set(wire.id, wire);
    eventBus.emit('circuit:changed');
    return { wire };
  }

  /** Remove a wire by ID. */
  removeWire(id: string): boolean {
    if (!this.state.wires.has(id)) return false;
    this.state.wires.delete(id);
    eventBus.emit('circuit:changed');
    return true;
  }

  // -----------------------------------------------------------------------
  // Input value control
  // -----------------------------------------------------------------------

  /**
   * Set the output value of a source component (INPUT, BUTTON, CLOCK).
   * Only valid for source-type components.
   */
  setInputValue(componentId: string, value: LogicValue): boolean {
    const comp = this.state.components.get(componentId);
    if (!comp) return false;
    const isSource = ['INPUT', 'BUTTON', 'CLOCK'].includes(comp.type);
    if (!isSource) return false;

    const outPort = comp.outputPorts.find(p => p.id === 'out');
    if (!outPort) return false;
    outPort.value = value;
    return true;
  }

  /** Toggle a binary source component (INPUT, BUTTON, CLOCK) between 0 and 1. */
  toggleInput(componentId: string): boolean {
    const comp = this.state.components.get(componentId);
    if (!comp || !['INPUT', 'BUTTON', 'CLOCK'].includes(comp.type)) return false;
    const outPort = comp.outputPorts.find(p => p.id === 'out');
    if (!outPort) return false;
    outPort.value = outPort.value === 1 ? 0 : 1;
    eventBus.emit('circuit:changed');
    return true;
  }

  /** Get all CLOCK source components. */
  getClockComponents(): Component[] {
    return [...this.state.components.values()].filter(c => c.type === 'CLOCK');
  }

  /** Toggle all CLOCK components (or a specific one). Returns true if at least one clock was toggled. */
  tickClocks(clockId?: string): boolean {
    const clocks = clockId
      ? [this.state.components.get(clockId)].filter((c): c is Component => !!c && c.type === 'CLOCK')
      : this.getClockComponents();
    if (clocks.length === 0) return false;

    for (const clk of clocks) {
      const port = clk.outputPorts.find(p => p.id === 'out');
      if (port) {
        port.value = port.value === 1 ? 0 : 1;
      }
    }
    eventBus.emit('circuit:changed');
    return true;
  }

  /** Reset all CLOCK components to 0 (LOW). */
  resetClocks(): void {
    for (const clk of this.getClockComponents()) {
      const port = clk.outputPorts.find(p => p.id === 'out');
      if (port) port.value = 0;
    }
    eventBus.emit('circuit:changed');
  }

  /** Reset all flip-flops and latches to initial state (Q=0, Q'=1, _prevClk=0). */
  resetSequentialState(): void {
    for (const comp of this.state.components.values()) {
      if (['DFF', 'JKFF', 'TFF', 'SR_LATCH'].includes(comp.type)) {
        const q = comp.outputPorts.find(p => p.id === 'out_Q');
        const qb = comp.outputPorts.find(p => p.id === 'out_QBAR');
        if (q) q.value = 0;
        if (qb) qb.value = 1;
        comp.config['_prevClk'] = 0;
      }
    }
    eventBus.emit('circuit:changed');
  }

  // -----------------------------------------------------------------------
  // Query helpers (used by Propagator, TruthTableGen, BoolExprGen, etc.)
  // -----------------------------------------------------------------------

  /** All source components (INPUT, BUTTON, CLOCK) in insertion order. */
  getSourceComponents(): Component[] {
    return [...this.state.components.values()].filter(c =>
      ['INPUT', 'BUTTON', 'CLOCK'].includes(c.type),
    );
  }

  /** All sink components (LED, OUTPUT, BUZZER). */
  getSinkComponents(): Component[] {
    return [...this.state.components.values()].filter(c =>
      ['LED', 'OUTPUT', 'BUZZER'].includes(c.type),
    );
  }

  /** Get all wires that originate from a specific output port. */
  getWiresFrom(componentId: string, portId: string): Wire[] {
    return [...this.state.wires.values()].filter(
      w => w.fromComponentId === componentId && w.fromPortId === portId,
    );
  }

  /** Get the wire driving a specific input port (at most one). */
  getWireTo(componentId: string, portId: string): Wire | undefined {
    return [...this.state.wires.values()].find(
      w => w.toComponentId === componentId && w.toPortId === portId,
    );
  }

  /** Get all components directly downstream of the given component. */
  getDownstreamComponents(componentId: string): Component[] {
    const comp = this.state.components.get(componentId);
    if (!comp) return [];
    const result: Component[] = [];
    for (const outPort of comp.outputPorts) {
      for (const wire of this.getWiresFrom(componentId, outPort.id)) {
        const downstream = this.state.components.get(wire.toComponentId);
        if (downstream) result.push(downstream);
      }
    }
    return result;
  }

  /** Get all components directly upstream (driving inputs) of this component. */
  getUpstreamComponents(componentId: string): Component[] {
    const comp = this.state.components.get(componentId);
    if (!comp) return [];
    const result: Component[] = [];
    for (const inPort of comp.inputPorts) {
      const wire = this.getWireTo(componentId, inPort.id);
      if (wire) {
        const upstream = this.state.components.get(wire.fromComponentId);
        if (upstream) result.push(upstream);
      }
    }
    return result;
  }

  /** All components as an array (insertion order). */
  getAllComponents(): Component[] {
    return [...this.state.components.values()];
  }

  /** All wires as an array. */
  getAllWires(): Wire[] {
    return [...this.state.wires.values()];
  }

  /** Clear the entire circuit. */
  clear(): void {
    this.state.components.clear();
    this.state.wires.clear();
    eventBus.emit('circuit:changed');
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private generateLabel(type: GateType): string {
    const count = [...this.state.components.values()].filter(c => c.type === type).length;
    const prefixes: Partial<Record<GateType, string>> = {
      AND: 'AND', OR: 'OR', NOT: 'NOT',
      NAND: 'NAND', NOR: 'NOR', XOR: 'XOR', XNOR: 'XNOR',
      INPUT: 'IN', BUTTON: 'BTN', CLOCK: 'CLK',
      LED: 'LED', OUTPUT: 'OUT', BUZZER: 'BUZ',
      MUX2: 'MUX', COMPARATOR: 'CMP',
    };
    const prefix = prefixes[type] ?? type;
    return `${prefix}${count + 1}`;
  }
}
