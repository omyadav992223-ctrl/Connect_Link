// =============================================================================
// Evaluator.ts — Pure gate evaluation functions.
// NO side effects. NO DOM access. NO state mutation.
// Each function takes logic values and returns a logic value.
// The Propagator calls these; the UI never calls them directly.
// =============================================================================

import type { LogicValue, GateType, Component } from './types.js';

// ---------------------------------------------------------------------------
// Primitive logic functions — the single source of truth for gate behaviour
// ---------------------------------------------------------------------------

export function evalAND(a: LogicValue, b: LogicValue): LogicValue {
  if (a === 0 || b === 0) return 0;
  if (a === 'X' || b === 'X') return 'X';
  return 1;
}

export function evalOR(a: LogicValue, b: LogicValue): LogicValue {
  if (a === 1 || b === 1) return 1;
  if (a === 'X' || b === 'X') return 'X';
  return 0;
}

export function evalNOT(a: LogicValue): LogicValue {
  if (a === 'X') return 'X';
  return a === 1 ? 0 : 1;
}

export function evalNAND(a: LogicValue, b: LogicValue): LogicValue {
  return evalNOT(evalAND(a, b));
}

export function evalNOR(a: LogicValue, b: LogicValue): LogicValue {
  return evalNOT(evalOR(a, b));
}

export function evalXOR(a: LogicValue, b: LogicValue): LogicValue {
  if (a === 'X' || b === 'X') return 'X';
  return a !== b ? 1 : 0;
}

export function evalXNOR(a: LogicValue, b: LogicValue): LogicValue {
  return evalNOT(evalXOR(a, b));
}

/**
 * 2:1 Multiplexer
 * Y = S'·I0 + S·I1
 * When S=0: Y=I0; When S=1: Y=I1
 */
export function evalMUX2(i0: LogicValue, i1: LogicValue, s: LogicValue): LogicValue {
  if (s === 'X') {
    // If both inputs are same, output is deterministic regardless of S
    if (i0 === i1) return i0;
    return 'X';
  }
  return s === 0 ? i0 : i1;
}

/**
 * 1-bit Comparator
 * Returns { gt, eq, lt } where exactly one of the three is 1.
 */
export function evalComparator(a: LogicValue, b: LogicValue): {
  gt: LogicValue;
  eq: LogicValue;
  lt: LogicValue;
} {
  if (a === 'X' || b === 'X') return { gt: 'X', eq: 'X', lt: 'X' };
  if (a === b) return { gt: 0, eq: 1, lt: 0 };
  if (a === 1 && b === 0) return { gt: 1, eq: 0, lt: 0 };
  return { gt: 0, eq: 0, lt: 1 };
}

/**
 * Half Adder: S = A ⊕ B, C = A · B
 */
export function evalHalfAdder(a: LogicValue, b: LogicValue): { s: LogicValue; c: LogicValue } {
  const s = evalXOR(a, b);
  const c = evalAND(a, b);
  return { s, c };
}

/**
 * Full Adder: S = A ⊕ B ⊕ Cin, Cout = (A · B) + (Cin · (A ⊕ B))
 */
export function evalFullAdder(a: LogicValue, b: LogicValue, cin: LogicValue): { s: LogicValue; cout: LogicValue } {
  if (a === 'X' || b === 'X' || cin === 'X') return { s: 'X', cout: 'X' };
  const axorb = (a ^ b) as 0 | 1;
  const s = (axorb ^ cin) as 0 | 1;
  const cout = ((a & b) | (cin & axorb)) as 0 | 1;
  return { s, cout };
}

/**
 * 4:1 Multiplexer
 */
export function evalMUX4(
  i0: LogicValue,
  i1: LogicValue,
  i2: LogicValue,
  i3: LogicValue,
  s0: LogicValue,
  s1: LogicValue,
): LogicValue {
  if (s0 === 'X' || s1 === 'X') return 'X';
  const sel = (s1 << 1) | s0;
  switch (sel) {
    case 0: return i0;
    case 1: return i1;
    case 2: return i2;
    case 3: return i3;
    default: return 'X';
  }
}

/**
 * 2-to-4 Decoder with Enable
 */
export function evalDecoder2_4(
  a0: LogicValue,
  a1: LogicValue,
  en: LogicValue,
): { y0: LogicValue; y1: LogicValue; y2: LogicValue; y3: LogicValue } {
  // If enable is explicitly 0, all outputs disabled (0)
  if (en === 0) return { y0: 0, y1: 0, y2: 0, y3: 0 };
  if (a0 === 'X' || a1 === 'X') return { y0: 'X', y1: 'X', y2: 'X', y3: 'X' };
  const sel = (a1 << 1) | a0;
  return {
    y0: sel === 0 ? 1 : 0,
    y1: sel === 1 ? 1 : 0,
    y2: sel === 2 ? 1 : 0,
    y3: sel === 3 ? 1 : 0,
  };
}

/**
 * 1:2 Demultiplexer
 */
export function evalDemux1_2(d: LogicValue, s: LogicValue): { y0: LogicValue; y1: LogicValue } {
  if (s === 'X') return { y0: 'X', y1: 'X' };
  return {
    y0: s === 0 ? d : 0,
    y1: s === 1 ? d : 0,
  };
}

/**
 * 1:4 Demultiplexer
 */
export function evalDemux1_4(
  d: LogicValue,
  s0: LogicValue,
  s1: LogicValue,
): { y0: LogicValue; y1: LogicValue; y2: LogicValue; y3: LogicValue } {
  if (s0 === 'X' || s1 === 'X') return { y0: 'X', y1: 'X', y2: 'X', y3: 'X' };
  const sel = (s1 << 1) | s0;
  return {
    y0: sel === 0 ? d : 0,
    y1: sel === 1 ? d : 0,
    y2: sel === 2 ? d : 0,
    y3: sel === 3 ? d : 0,
  };
}

/**
 * 4-to-2 Priority Encoder (D3 highest priority)
 */
export function evalEncoder4_2(
  d0: LogicValue,
  d1: LogicValue,
  d2: LogicValue,
  d3: LogicValue,
): { a1: LogicValue; a0: LogicValue; v: LogicValue } {
  if (d3 === 1) return { a1: 1, a0: 1, v: 1 };
  if (d2 === 1) return { a1: 1, a0: 0, v: 1 };
  if (d1 === 1) return { a1: 0, a0: 1, v: 1 };
  if (d0 === 1) return { a1: 0, a0: 0, v: 1 };
  if (d3 === 'X' || d2 === 'X' || d1 === 'X' || d0 === 'X') {
    return { a1: 'X', a0: 'X', v: 'X' };
  }
  return { a1: 0, a0: 0, v: 0 };
}

/**
 * Half Subtractor: Diff = A ⊕ B, Bout = A' · B
 */
export function evalHalfSubtractor(a: LogicValue, b: LogicValue): { diff: LogicValue; bout: LogicValue } {
  const diff = evalXOR(a, b);
  const notA = evalNOT(a);
  const bout = evalAND(notA, b);
  return { diff, bout };
}

/**
 * Full Subtractor: Diff = A ⊕ B ⊕ Bin, Bout = (A' · B) + ((A ⊕ B)' · Bin)
 */
export function evalFullSubtractor(
  a: LogicValue,
  b: LogicValue,
  bin: LogicValue,
): { diff: LogicValue; bout: LogicValue } {
  if (a === 'X' || b === 'X' || bin === 'X') return { diff: 'X', bout: 'X' };
  const axorb = (a ^ b) as 0 | 1;
  const diff = (axorb ^ bin) as 0 | 1;
  const notA = (a === 1 ? 0 : 1);
  const notAxorb = (axorb === 1 ? 0 : 1);
  const bout = ((notA & b) | (notAxorb & bin)) as 0 | 1;
  return { diff, bout };
}

// ---------------------------------------------------------------------------
// N-input generalisation (for gates with >2 inputs, if added later)
// ---------------------------------------------------------------------------

export function evalANDN(inputs: LogicValue[]): LogicValue {
  return inputs.reduce<LogicValue>((acc, v) => evalAND(acc, v), 1);
}

export function evalORN(inputs: LogicValue[]): LogicValue {
  return inputs.reduce<LogicValue>((acc, v) => evalOR(acc, v), 0);
}

/**
 * Detects whether there is a rising edge (0 -> 1) on the clock port.
 * Updates component.config['_prevClk'] to the current clock value.
 */
export function checkClockRisingEdge(comp: Component, currentClk: LogicValue): boolean {
  const prevClk = (comp.config['_prevClk'] as LogicValue | undefined) ?? 0;
  const isRising = (prevClk === 0 || prevClk === 'X') && currentClk === 1;
  comp.config['_prevClk'] = currentClk;
  return isRising;
}

// ---------------------------------------------------------------------------
// Component evaluator — called by Propagator for each component in order
// Reads component.inputPorts, writes component.outputPorts in place.
// Returns true if any output value changed (used for change detection).
// ---------------------------------------------------------------------------

export function evaluateComponent(component: Component): boolean {
  const { type, inputPorts, outputPorts } = component;
  let changed = false;

  /**
   * Helper: set an output port value; track whether it changed.
   */
  function setOutput(portId: string, value: LogicValue): void {
    const port = outputPorts.find(p => p.id === portId);
    if (!port) return;
    if (port.value !== value) {
      port.value = value;
      changed = true;
    }
  }

  /** Read an input port's current value (or 'X' if not found). */
  function getInput(portId: string): LogicValue {
    return inputPorts.find(p => p.id === portId)?.value ?? 'X';
  }

  switch (type) {
    // ------------------------------------------------------------------
    // Pass-throughs: INPUT, BUTTON, CLOCK — their output = their input,
    // but actually their output port IS their value; set by user/hardware.
    // We just propagate the output's value through unchanged.
    // (Handled in Propagator by not running eval for INPUT-type nodes.)
    // ------------------------------------------------------------------
    case 'INPUT':
    case 'BUTTON':
    case 'CLOCK':
      // Source nodes — their output value is set by user or hardware directly.
      // No evaluation needed here; Propagator treats them as sources.
      break;

    // ------------------------------------------------------------------
    // Sink nodes: LED, OUTPUT, BUZZER — copy first input to output (for probe)
    // ------------------------------------------------------------------
    case 'LED':
    case 'OUTPUT':
    case 'BUZZER': {
      const inVal = getInput('in');
      setOutput('out', inVal);
      break;
    }

    // ------------------------------------------------------------------
    // Basic gates
    // ------------------------------------------------------------------
    case 'AND': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      setOutput('out_Y', evalAND(a, b));
      break;
    }
    case 'OR': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      setOutput('out_Y', evalOR(a, b));
      break;
    }
    case 'NOT': {
      const a = getInput('in_A');
      setOutput('out_Y', evalNOT(a));
      break;
    }
    case 'NAND': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      setOutput('out_Y', evalNAND(a, b));
      break;
    }
    case 'NOR': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      setOutput('out_Y', evalNOR(a, b));
      break;
    }
    case 'XOR': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      setOutput('out_Y', evalXOR(a, b));
      break;
    }
    case 'XNOR': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      setOutput('out_Y', evalXNOR(a, b));
      break;
    }

    // ------------------------------------------------------------------
    // 2:1 MUX
    // ------------------------------------------------------------------
    case 'MUX2': {
      const i0 = getInput('in_I0');
      const i1 = getInput('in_I1');
      const s  = getInput('in_S');
      setOutput('out_Y', evalMUX2(i0, i1, s));
      break;
    }

    // ------------------------------------------------------------------
    // 1-bit Comparator
    // ------------------------------------------------------------------
    case 'COMPARATOR': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      const { gt, eq, lt } = evalComparator(a, b);
      setOutput('out_GT', gt);
      setOutput('out_EQ', eq);
      setOutput('out_LT', lt);
      break;
    }

    // ------------------------------------------------------------------
    // Half Adder
    // ------------------------------------------------------------------
    case 'HALF_ADDER': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      const { s, c } = evalHalfAdder(a, b);
      setOutput('out_S', s);
      setOutput('out_C', c);
      break;
    }

    // ------------------------------------------------------------------
    // Full Adder
    // ------------------------------------------------------------------
    case 'FULL_ADDER': {
      const a   = getInput('in_A');
      const b   = getInput('in_B');
      const cin = getInput('in_Cin');
      const { s, cout } = evalFullAdder(a, b, cin);
      setOutput('out_S', s);
      setOutput('out_Cout', cout);
      break;
    }

    // ------------------------------------------------------------------
    // 4:1 MUX
    // ------------------------------------------------------------------
    case 'MUX4': {
      const i0 = getInput('in_I0');
      const i1 = getInput('in_I1');
      const i2 = getInput('in_I2');
      const i3 = getInput('in_I3');
      const s0 = getInput('in_S0');
      const s1 = getInput('in_S1');
      setOutput('out_Y', evalMUX4(i0, i1, i2, i3, s0, s1));
      break;
    }

    // ------------------------------------------------------------------
    // 2-to-4 Decoder
    // ------------------------------------------------------------------
    case 'DECODER2_4': {
      const a0 = getInput('in_A0');
      const a1 = getInput('in_A1');
      const en = getInput('in_EN');
      const { y0, y1, y2, y3 } = evalDecoder2_4(a0, a1, en === 'X' ? 1 : en);
      setOutput('out_Y0', y0);
      setOutput('out_Y1', y1);
      setOutput('out_Y2', y2);
      setOutput('out_Y3', y3);
      break;
    }

    // ------------------------------------------------------------------
    // D Flip-Flop (Edge-Triggered: rising clock edge 0 -> 1)
    // ------------------------------------------------------------------
    case 'DFF': {
      const clk = getInput('in_CLK');
      const isRising = checkClockRisingEdge(component, clk);
      if (isRising) {
        const d = (component.config['_sampledD'] as LogicValue | undefined) ?? getInput('in_D');
        if (d === 0 || d === 1) {
          setOutput('out_Q', d);
          setOutput('out_QBAR', (d === 1 ? 0 : 1) as LogicValue);
        } else {
          setOutput('out_Q', 'X');
          setOutput('out_QBAR', 'X');
        }
      }
      break;
    }

    // ------------------------------------------------------------------
    // 1:2 Demultiplexer
    // ------------------------------------------------------------------
    case 'DEMUX1_2': {
      const d = getInput('in_D');
      const s = getInput('in_S');
      const { y0, y1 } = evalDemux1_2(d, s);
      setOutput('out_Y0', y0);
      setOutput('out_Y1', y1);
      break;
    }

    // ------------------------------------------------------------------
    // 1:4 Demultiplexer
    // ------------------------------------------------------------------
    case 'DEMUX1_4': {
      const d  = getInput('in_D');
      const s0 = getInput('in_S0');
      const s1 = getInput('in_S1');
      const { y0, y1, y2, y3 } = evalDemux1_4(d, s0, s1);
      setOutput('out_Y0', y0);
      setOutput('out_Y1', y1);
      setOutput('out_Y2', y2);
      setOutput('out_Y3', y3);
      break;
    }

    // ------------------------------------------------------------------
    // 4-to-2 Priority Encoder
    // ------------------------------------------------------------------
    case 'ENCODER4_2': {
      const d0 = getInput('in_D0');
      const d1 = getInput('in_D1');
      const d2 = getInput('in_D2');
      const d3 = getInput('in_D3');
      const { a1, a0, v } = evalEncoder4_2(d0, d1, d2, d3);
      setOutput('out_A1', a1);
      setOutput('out_A0', a0);
      setOutput('out_V', v);
      break;
    }

    // ------------------------------------------------------------------
    // Half Subtractor
    // ------------------------------------------------------------------
    case 'HALF_SUBTRACTOR': {
      const a = getInput('in_A');
      const b = getInput('in_B');
      const { diff, bout } = evalHalfSubtractor(a, b);
      setOutput('out_Diff', diff);
      setOutput('out_Bout', bout);
      break;
    }

    // ------------------------------------------------------------------
    // Full Subtractor
    // ------------------------------------------------------------------
    case 'FULL_SUBTRACTOR': {
      const a   = getInput('in_A');
      const b   = getInput('in_B');
      const bin = getInput('in_Bin');
      const { diff, bout } = evalFullSubtractor(a, b, bin);
      setOutput('out_Diff', diff);
      setOutput('out_Bout', bout);
      break;
    }

    // ------------------------------------------------------------------
    // JK Flip-Flop (Edge-Triggered: rising clock edge 0 -> 1)
    // ------------------------------------------------------------------
    case 'JKFF': {
      const clk = getInput('in_CLK');
      const isRising = checkClockRisingEdge(component, clk);
      if (isRising) {
        const j = (component.config['_sampledJ'] as LogicValue | undefined) ?? getInput('in_J');
        const k = (component.config['_sampledK'] as LogicValue | undefined) ?? getInput('in_K');
        const curQ = outputPorts.find(p => p.id === 'out_Q')?.value ?? 0;
        if (j === 0 && k === 0) {
          // HOLD — maintain previous state
        } else if (j === 0 && k === 1) {
          // RESET
          setOutput('out_Q', 0);
          setOutput('out_QBAR', 1);
        } else if (j === 1 && k === 0) {
          // SET
          setOutput('out_Q', 1);
          setOutput('out_QBAR', 0);
        } else if (j === 1 && k === 1) {
          // TOGGLE
          if (curQ === 0 || curQ === 1) {
            const nextQ = (curQ === 1 ? 0 : 1) as LogicValue;
            setOutput('out_Q', nextQ);
            setOutput('out_QBAR', (nextQ === 1 ? 0 : 1) as LogicValue);
          } else {
            setOutput('out_Q', 'X');
            setOutput('out_QBAR', 'X');
          }
        } else {
          setOutput('out_Q', 'X');
          setOutput('out_QBAR', 'X');
        }
      }
      break;
    }

    // ------------------------------------------------------------------
    // T Flip-Flop (Edge-Triggered: rising clock edge 0 -> 1)
    // ------------------------------------------------------------------
    case 'TFF': {
      const clk = getInput('in_CLK');
      const isRising = checkClockRisingEdge(component, clk);
      if (isRising) {
        const t = (component.config['_sampledT'] as LogicValue | undefined) ?? getInput('in_T');
        const curQ = outputPorts.find(p => p.id === 'out_Q')?.value ?? 0;
        if (t === 0) {
          // HOLD — maintain previous state
        } else if (t === 1) {
          // TOGGLE
          if (curQ === 0 || curQ === 1) {
            const nextQ = (curQ === 1 ? 0 : 1) as LogicValue;
            setOutput('out_Q', nextQ);
            setOutput('out_QBAR', (nextQ === 1 ? 0 : 1) as LogicValue);
          } else {
            setOutput('out_Q', 'X');
            setOutput('out_QBAR', 'X');
          }
        } else {
          setOutput('out_Q', 'X');
          setOutput('out_QBAR', 'X');
        }
      }
      break;
    }

    // ------------------------------------------------------------------
    // SR Latch (Asynchronous level-sensitive latch)
    // ------------------------------------------------------------------
    case 'SR_LATCH': {
      const s = getInput('in_S');
      const r = getInput('in_R');
      if (s === 1 && r === 0) {
        setOutput('out_Q', 1);
        setOutput('out_QBAR', 0);
      } else if (s === 0 && r === 1) {
        setOutput('out_Q', 0);
        setOutput('out_QBAR', 1);
      } else if (s === 1 && r === 1) {
        setOutput('out_Q', 'X');
        setOutput('out_QBAR', 'X');
      } else if (s === 0 && r === 0) {
        // HOLD — maintain previous state
      } else {
        setOutput('out_Q', 'X');
        setOutput('out_QBAR', 'X');
      }
      break;
    }

    default:
      // Unknown gate type — mark outputs as X
      for (const port of outputPorts) {
        if (port.value !== 'X') { port.value = 'X'; changed = true; }
      }
      break;
  }

  return changed;
}
