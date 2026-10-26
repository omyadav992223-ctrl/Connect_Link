// =============================================================================
// types.ts — Core type definitions for the Smart Logic Lab simulation engine
// ALL engine files import from here. UI code may also read (never write) these.
// =============================================================================

/**
 * A logic signal value.
 * 0   = LOW
 * 1   = HIGH
 * 'X' = Unknown / unconnected / error state
 */
export type LogicValue = 0 | 1 | 'X';

/** Direction of a port on a component. */
export type PortDirection = 'input' | 'output';

/**
 * A single connection point on a component.
 * Input ports read from wires; output ports write to wires.
 */
export interface Port {
  id: string;           // Unique within the component, e.g. "in_A", "out_Y"
  name: string;         // Human-readable label, e.g. "A", "Y", "S"
  direction: PortDirection;
  value: LogicValue;    // Current signal value — set by Propagator
}

/** All supported gate / component types. */
export type GateType =
  // Basic logic gates
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'NAND'
  | 'NOR'
  | 'XOR'
  | 'XNOR'
  // Inputs
  | 'INPUT'        // Manual toggle (or hardware-driven)
  | 'BUTTON'       // Momentary push button
  | 'CLOCK'        // Oscillating input (for future use)
  // Outputs
  | 'LED'
  | 'OUTPUT'       // Generic output probe
  | 'BUZZER'
  // Advanced / MSI components
  | 'MUX2'            // 2:1 Multiplexer (I0, I1, S → Y)
  | 'MUX4'            // 4:1 Multiplexer (I0, I1, I2, I3, S0, S1 → Y)
  | 'DEMUX1_2'        // 1:2 Demultiplexer (D, S → Y0, Y1)
  | 'DEMUX1_4'        // 1:4 Demultiplexer (D, S0, S1 → Y0..Y3)
  | 'DECODER2_4'      // 2-to-4 Decoder with Enable (A0, A1, EN → Y0..Y3)
  | 'ENCODER4_2'      // 4-to-2 Priority Encoder (D0..D3 → A1, A0, V)
  | 'COMPARATOR'      // 1-bit comparator (A, B → GT, EQ, LT)
  | 'HALF_ADDER'      // Half Adder (A, B → S, C)
  | 'FULL_ADDER'      // Full Adder (A, B, Cin → S, Cout)
  | 'HALF_SUBTRACTOR' // Half Subtractor (A, B → Diff, Bout)
  | 'FULL_SUBTRACTOR' // Full Subtractor (A, B, Bin → Diff, Bout)
  | 'DFF'             // D Flip-Flop (D, CLK → Q, Q')
  | 'JKFF'            // JK Flip-Flop (J, K, CLK → Q, Q')
  | 'TFF'             // T Flip-Flop (T, CLK → Q, Q')
  | 'SR_LATCH'        // SR Latch (S, R → Q, Q')
  ;

/** Spatial position on the circuit canvas. */
export interface Position {
  x: number;
  y: number;
}

/**
 * A logic component in the circuit graph.
 * The simulation engine is the only authority on port values.
 */
export interface Component {
  id: string;
  type: GateType;
  label: string;
  position: Position;
  /** Width × height in canvas units (used for rendering + hit testing). */
  size: { width: number; height: number };
  inputPorts: Port[];
  outputPorts: Port[];
  /**
   * If true, this component is in an error state (e.g. unconnected input).
   * Set by ErrorChecker; used by renderer.
   */
  hasError: boolean;
  errorMessage?: string;
  /**
   * Extra configuration bag for component-specific settings.
   * e.g. { "activeLow": true } for certain sensor inputs.
   */
  config: Record<string, unknown>;
}

/**
 * A wire connecting one output port to one input port.
 * Multiple wires can fan-out from one output port.
 * Only ONE wire may drive a given input port (enforced by ErrorChecker).
 */
export interface Wire {
  id: string;
  fromComponentId: string;
  fromPortId: string;
  toComponentId: string;
  toPortId: string;
  /** Current signal value — propagated from the source output port. */
  value: LogicValue;
}

/**
 * The complete circuit state — the single source of truth.
 * Serializable to/from JSON by CircuitSerializer.
 */
export interface CircuitState {
  /** Human-readable name of this circuit / project. */
  name: string;
  /** Map from component ID to Component. */
  components: Map<string, Component>;
  /** Map from wire ID to Wire. */
  wires: Map<string, Wire>;
  /** Active simulation mode. */
  simulationMode: 'simulation' | 'hardware';
  /** Whether the simulation is currently running (clock-driven updates). */
  running: boolean;
}

// =============================================================================
// Truth Table
// =============================================================================

export interface TruthTableRow {
  inputs: Record<string, LogicValue>;   // { "A": 0, "B": 1 }
  outputs: Record<string, LogicValue>;  // { "Y": 0 }
}

export interface TruthTable {
  inputLabels: string[];    // Ordered input variable names
  outputLabels: string[];   // Ordered output variable names
  rows: TruthTableRow[];
}

// =============================================================================
// Boolean Expression
// =============================================================================

export interface BooleanExprResult {
  outputId: string;
  outputLabel: string;
  expression: string;     // e.g. "Y = (A · B) + C'"
}

// =============================================================================
// K-Map
// =============================================================================

export interface KMapGroup {
  minterms: number[];       // Which minterms are in this group
  implicant: string;        // Simplified product term, e.g. "A·B'"
}

export interface KMapResult {
  variableCount: number;    // 2, 3, or 4
  variables: string[];      // Variable names in order
  minterms: number[];       // All minterms (output = 1)
  dontCares: number[];      // Don't-care positions (output = 'X')
  groups: KMapGroup[];      // Prime implicant groups
  simplifiedExpression: string;  // Final SOP expression
}

// =============================================================================
// Error types
// =============================================================================

export type ErrorSeverity = 'error' | 'warning';

export interface CircuitError {
  id: string;
  severity: ErrorSeverity;
  componentId?: string;
  portId?: string;
  wireId?: string;
  message: string;
}

// =============================================================================
// Propagation result
// =============================================================================

export interface PropagationResult {
  success: boolean;
  errors: CircuitError[];
  updatedComponentIds: string[];
  updatedWireIds: string[];
}

// =============================================================================
// Hardware / serial message
// =============================================================================

export interface HardwareMessage {
  /** Left-side ultrasonic sensor: 1 = obstacle in left blind spot (≤ threshold), 0 = clear */
  left: LogicValue;
  /** Right-side ultrasonic sensor: 1 = obstacle in right blind spot (≤ threshold), 0 = clear */
  right: LogicValue;
  /** Measured distance in cm from left sensor, if available */
  leftDist?: number;
  /** Measured distance in cm from right sensor, if available */
  rightDist?: number;
  /** Left indicator (IL): 1 = driver signalling left turn. Hardware or manual toggle. */
  leftIndicator: LogicValue;
  /** Right indicator (IR): 1 = driver signalling right turn. Hardware or manual toggle. */
  rightIndicator: LogicValue;
  /** Legacy lane-change field kept for backward-compat with old Arduino firmware. */
  laneChange: LogicValue;
  rawText: string;
}
