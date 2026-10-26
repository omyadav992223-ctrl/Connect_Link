// =============================================================================
// WaveformEngine.ts — Digital logic waveform sampling and trace storage engine.
// Captures discrete simulation steps, tracks signals, and handles sliding window limits.
// =============================================================================

import type { CircuitGraph } from './CircuitGraph.js';
import type { LogicValue, GateType } from './types.js';

export interface SignalInfo {
  id: string; // Format: `${componentId}::${portId}`
  componentId: string;
  portId: string;
  componentLabel: string;
  componentType: GateType;
  portName: string;
  direction: 'input' | 'output';
  displayName: string;
}

export interface WaveformTrace {
  signal: SignalInfo;
  samples: LogicValue[];
}

export class WaveformEngine {
  private graph: CircuitGraph;
  private maxSteps: number;
  private recording = true;
  private stepCount = 0;
  private stepIndices: number[] = [];
  private selectedSignalIds: Set<string> = new Set();
  private traces: Map<string, LogicValue[]> = new Map();

  constructor(graph: CircuitGraph, maxSteps = 100) {
    this.graph = graph;
    this.maxSteps = Math.max(2, Math.min(1000, maxSteps));
    this.autoSelectSignals();
  }

  setGraph(graph: CircuitGraph): void {
    this.graph = graph;
    this.clear();
    this.autoSelectSignals();
  }

  getMaxSteps(): number {
    return this.maxSteps;
  }

  setMaxSteps(max: number): void {
    this.maxSteps = Math.max(2, Math.min(1000, max));
    this.enforceMaxSteps();
  }

  isRecording(): boolean {
    return this.recording;
  }

  startRecording(): void {
    this.recording = true;
  }

  stopRecording(): void {
    this.recording = false;
  }

  toggleRecording(): boolean {
    this.recording = !this.recording;
    return this.recording;
  }

  getStepCount(): number {
    return this.stepCount;
  }

  getStepIndices(): number[] {
    return [...this.stepIndices];
  }

  /** Clear all recorded traces and reset step counter. */
  clear(): void {
    this.stepCount = 0;
    this.stepIndices = [];
    this.traces.clear();
  }

  /**
   * Discover all recordable signals in the circuit.
   */
  getAvailableSignals(): SignalInfo[] {
    const signals: SignalInfo[] = [];

    for (const comp of this.graph.getAllComponents()) {
      const type = comp.type;
      const lbl  = comp.label || type;

      // Outputs
      for (const p of comp.outputPorts) {
        signals.push({
          id: `${comp.id}::${p.id}`,
          componentId: comp.id,
          portId: p.id,
          componentLabel: lbl,
          componentType: type,
          portName: p.name,
          direction: 'output',
          displayName: ['INPUT', 'BUTTON', 'CLOCK', 'LED', 'OUTPUT', 'BUZZER'].includes(type)
            ? `${lbl}`
            : `${lbl}.${p.name}`,
        });
      }

      // Selected key inputs (clock & sequential next-state inputs, or sink inputs)
      if (['DFF', 'JKFF', 'TFF', 'SR_LATCH'].includes(type)) {
        for (const p of comp.inputPorts) {
          signals.push({
            id: `${comp.id}::${p.id}`,
            componentId: comp.id,
            portId: p.id,
            componentLabel: lbl,
            componentType: type,
            portName: p.name,
            direction: 'input',
            displayName: `${lbl}.${p.name}`,
          });
        }
      } else if (['LED', 'OUTPUT', 'BUZZER'].includes(type)) {
        for (const p of comp.inputPorts) {
          signals.push({
            id: `${comp.id}::${p.id}`,
            componentId: comp.id,
            portId: p.id,
            componentLabel: lbl,
            componentType: type,
            portName: p.name,
            direction: 'input',
            displayName: `${lbl}[in]`,
          });
        }
      }
    }

    return signals;
  }

  getSelectedSignalIds(): string[] {
    return [...this.selectedSignalIds];
  }

  isSignalSelected(id: string): boolean {
    return this.selectedSignalIds.has(id);
  }

  setSelectedSignalIds(ids: string[]): void {
    this.selectedSignalIds = new Set(ids);
  }

  toggleSignal(id: string): boolean {
    if (this.selectedSignalIds.has(id)) {
      this.selectedSignalIds.delete(id);
      return false;
    } else {
      this.selectedSignalIds.add(id);
      // Backfill trace to match current step count if new
      if (!this.traces.has(id)) {
        const lastVal = this.readSignalValue(id);
        const backfill: LogicValue[] = [];
        for (let i = 0; i < this.stepCount; i++) {
          backfill.push(i === this.stepCount - 1 ? lastVal : 'X');
        }
        this.traces.set(id, backfill);
      }
      return true;
    }
  }

  /**
   * Intelligently selects key signals: Clocks, Flip-Flops, Primary Inputs, and Indicators.
   */
  autoSelectSignals(): void {
    this.selectedSignalIds.clear();
    const available = this.getAvailableSignals();

    for (const sig of available) {
      const { componentType, portId, direction } = sig;
      // Clock outputs
      if (componentType === 'CLOCK' && direction === 'output') {
        this.selectedSignalIds.add(sig.id);
      }
      // Flip-Flop Q, QBAR outputs and CLK, D, T, J, K inputs
      else if (['DFF', 'JKFF', 'TFF', 'SR_LATCH'].includes(componentType)) {
        if (portId === 'out_Q' || portId === 'out_QBAR' || portId === 'in_CLK' || portId === 'in_D' || portId === 'in_T') {
          this.selectedSignalIds.add(sig.id);
        }
      }
      // Primary sensor inputs & manual switches
      else if (['INPUT', 'BUTTON'].includes(componentType) && direction === 'output') {
        this.selectedSignalIds.add(sig.id);
      }
      // System outputs & buzzer
      else if (['LED', 'OUTPUT', 'BUZZER'].includes(componentType)) {
        this.selectedSignalIds.add(sig.id);
      }
    }
  }

  /** Select category preset */
  selectCategory(category: 'sequential' | 'io' | 'all'): void {
    this.selectedSignalIds.clear();
    const available = this.getAvailableSignals();

    for (const sig of available) {
      if (category === 'all') {
        this.selectedSignalIds.add(sig.id);
      } else if (category === 'sequential') {
        if (sig.componentType === 'CLOCK' || ['DFF', 'JKFF', 'TFF', 'SR_LATCH'].includes(sig.componentType)) {
          this.selectedSignalIds.add(sig.id);
        }
      } else if (category === 'io') {
        if (['INPUT', 'BUTTON', 'LED', 'OUTPUT', 'BUZZER'].includes(sig.componentType)) {
          this.selectedSignalIds.add(sig.id);
        }
      }
    }
  }

  /**
   * Record one discrete simulation step for all selected signals.
   * Called on simulation events / clock steps.
   */
  sample(): void {
    if (!this.recording) return;

    const available = this.getAvailableSignals();
    const availableMap = new Map(available.map(s => [s.id, s]));

    // Record sample for each selected signal
    for (const id of this.selectedSignalIds) {
      const sig = availableMap.get(id);
      if (!sig) continue;

      const val = this.readSignalValue(id);
      if (!this.traces.has(id)) {
        this.traces.set(id, []);
      }
      this.traces.get(id)!.push(val);
    }

    this.stepIndices.push(this.stepCount);
    this.stepCount++;

    this.enforceMaxSteps();
  }

  private enforceMaxSteps(): void {
    while (this.stepIndices.length > this.maxSteps) {
      this.stepIndices.shift();
      for (const samples of this.traces.values()) {
        if (samples.length > 0) samples.shift();
      }
    }
  }

  readSignalValue(signalId: string): LogicValue {
    const [compId, portId] = signalId.split('::');
    const comp = this.graph.state.components.get(compId);
    if (!comp) return 'X';

    const outPort = comp.outputPorts.find(p => p.id === portId);
    if (outPort) return outPort.value;

    const inPort = comp.inputPorts.find(p => p.id === portId);
    if (inPort) return inPort.value;

    return 'X';
  }

  /**
   * Get all active waveform traces ready for rendering.
   */
  getTraces(): WaveformTrace[] {
    const available = this.getAvailableSignals();
    const availableMap = new Map(available.map(s => [s.id, s]));
    const result: WaveformTrace[] = [];

    for (const id of this.selectedSignalIds) {
      const sig = availableMap.get(id);
      if (!sig) continue;
      const samples = this.traces.get(id) ?? [];
      result.push({
        signal: sig,
        samples: [...samples],
      });
    }

    return result;
  }
}
