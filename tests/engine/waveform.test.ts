// =============================================================================
// waveform.test.ts — Unit tests for WaveformEngine sampling, traces, limits & X states.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { Propagator } from '../../src/engine/Propagator.js';
import { WaveformEngine } from '../../src/engine/WaveformEngine.js';

describe('WaveformEngine — Sampling, Recording & Trace Limits', () => {
  it('discovers available signals and auto-selects clocks, FFs, inputs and outputs', () => {
    const graph = new CircuitGraph();
    const clk = graph.addComponent('CLOCK', { x: 0, y: 0 }, 'CLK');
    const dff = graph.addComponent('DFF', { x: 100, y: 0 }, 'FF0');
    const led = graph.addComponent('LED', { x: 200, y: 0 }, 'Q_LED');

    const engine = new WaveformEngine(graph);
    const available = engine.getAvailableSignals();

    expect(available.length).toBeGreaterThan(0);
    expect(available.some(s => s.componentType === 'CLOCK')).toBe(true);
    expect(available.some(s => s.componentType === 'DFF' && s.portId === 'out_Q')).toBe(true);
    expect(available.some(s => s.componentType === 'LED')).toBe(true);

    const selected = engine.getSelectedSignalIds();
    expect(selected).toContain(`${clk.id}::out`);
    expect(selected).toContain(`${dff.id}::out_Q`);
    expect(selected).toContain(`${dff.id}::out_QBAR`);
  });

  it('samples discrete simulation steps without fabricating wall-clock transitions', () => {
    const graph = new CircuitGraph();
    const clk = graph.addComponent('CLOCK', { x: 0, y: 0 }, 'CLK');
    const dff = graph.addComponent('DFF', { x: 100, y: 0 }, 'FF0');
    graph.addWire(clk.id, 'out', dff.id, 'in_CLK');
    graph.addWire(dff.id, 'out_QBAR', dff.id, 'in_D');

    const engine = new WaveformEngine(graph);
    engine.setSelectedSignalIds([`${clk.id}::out`, `${dff.id}::out_Q`, `${dff.id}::out_QBAR`]);

    // Initial propagation (Step 0)
    Propagator.propagate(graph);
    engine.sample();

    expect(engine.getStepCount()).toBe(1);
    let traces = engine.getTraces();
    const clkTrace = traces.find(t => t.signal.componentType === 'CLOCK')!;
    const qTrace   = traces.find(t => t.signal.portId === 'out_Q')!;
    expect(clkTrace.samples).toEqual([0]);
    expect(qTrace.samples).toEqual([0]);

    // Clock step 1: Rising edge 0 -> 1 (Step 1)
    graph.tickClocks();
    Propagator.propagate(graph);
    engine.sample();

    expect(engine.getStepCount()).toBe(2);
    traces = engine.getTraces();
    expect(traces.find(t => t.signal.componentType === 'CLOCK')!.samples).toEqual([0, 1]);
    expect(traces.find(t => t.signal.portId === 'out_Q')!.samples).toEqual([0, 1]);

    // Clock step 2: Falling edge 1 -> 0 (Step 2, Q holds 1)
    graph.tickClocks();
    Propagator.propagate(graph);
    engine.sample();

    expect(engine.getStepCount()).toBe(3);
    traces = engine.getTraces();
    expect(traces.find(t => t.signal.componentType === 'CLOCK')!.samples).toEqual([0, 1, 0]);
    expect(traces.find(t => t.signal.portId === 'out_Q')!.samples).toEqual([0, 1, 1]);

    // Clock step 3: Second rising edge 0 -> 1 (Step 3, Q toggles to 0)
    graph.tickClocks();
    Propagator.propagate(graph);
    engine.sample();

    expect(engine.getStepCount()).toBe(4);
    traces = engine.getTraces();
    expect(traces.find(t => t.signal.componentType === 'CLOCK')!.samples).toEqual([0, 1, 0, 1]);
    expect(traces.find(t => t.signal.portId === 'out_Q')!.samples).toEqual([0, 1, 1, 0]);
  });

  it('records X (unknown / fault) states accurately', () => {
    const graph = new CircuitGraph();
    const sr = graph.addComponent('SR_LATCH', { x: 0, y: 0 });

    const engine = new WaveformEngine(graph);
    engine.setSelectedSignalIds([`${sr.id}::out_Q`, `${sr.id}::out_QBAR`]);

    // Invalid condition S=1, R=1 -> Q='X', QBAR='X'
    sr.inputPorts.find(p => p.id === 'in_S')!.value = 1;
    sr.inputPorts.find(p => p.id === 'in_R')!.value = 1;
    Propagator.propagate(graph);
    engine.sample();

    const traces = engine.getTraces();
    expect(traces.find(t => t.signal.portId === 'out_Q')!.samples).toEqual(['X']);
    expect(traces.find(t => t.signal.portId === 'out_QBAR')!.samples).toEqual(['X']);
  });

  it('honors start, stop, pause, and clear controls', () => {
    const graph = new CircuitGraph();
    const inp = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');

    const engine = new WaveformEngine(graph);
    engine.setSelectedSignalIds([`${inp.id}::out`]);

    // Sample 1
    engine.sample();
    expect(engine.getStepCount()).toBe(1);

    // Stop recording
    engine.stopRecording();
    expect(engine.isRecording()).toBe(false);

    // Sample while stopped -> ignored
    graph.setInputValue(inp.id, 1);
    engine.sample();
    expect(engine.getStepCount()).toBe(1);
    expect(engine.getTraces()[0].samples).toEqual([0]);

    // Resume recording
    engine.startRecording();
    expect(engine.isRecording()).toBe(true);
    engine.sample();
    expect(engine.getStepCount()).toBe(2);
    expect(engine.getTraces()[0].samples).toEqual([0, 1]);

    // Clear trace
    engine.clear();
    expect(engine.getStepCount()).toBe(0);
    expect(engine.getTraces()[0].samples).toEqual([]);
  });

  it('enforces maxSteps limit via sliding window without unbounded memory growth', () => {
    const graph = new CircuitGraph();
    const clk = graph.addComponent('CLOCK', { x: 0, y: 0 }, 'CLK');

    const maxSteps = 5;
    const engine = new WaveformEngine(graph, maxSteps);
    engine.setSelectedSignalIds([`${clk.id}::out`]);

    for (let i = 0; i < 12; i++) {
      graph.tickClocks();
      engine.sample();
    }

    // Must be capped at maxSteps
    expect(engine.getStepIndices().length).toBe(maxSteps);
    const trace = engine.getTraces()[0];
    expect(trace.samples.length).toBe(maxSteps);
  });

  it('does not mutate or alter circuit graph state during sampling', () => {
    const graph = new CircuitGraph();
    const inp = graph.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    graph.setInputValue(inp.id, 1);
    Propagator.propagate(graph);

    const engine = new WaveformEngine(graph);
    engine.sample();

    // Circuit state is preserved
    expect(inp.outputPorts[0].value).toBe(1);
    expect(graph.getAllComponents().length).toBe(1);
    expect(graph.getAllWires().length).toBe(0);
  });

  it('pausing, clearing, toggling signals and switching graphs does not alter circuit state', () => {
    const graph1 = new CircuitGraph('Circuit 1');
    const inA = graph1.addComponent('INPUT', { x: 0, y: 0 }, 'A');
    const dff = graph1.addComponent('DFF', { x: 100, y: 0 }, 'DFF');
    graph1.setInputValue(inA.id, 1);
    dff.outputPorts.find(p => p.id === 'out_Q')!.value = 1;
    dff.outputPorts.find(p => p.id === 'out_QBAR')!.value = 0;
    dff.config['_prevClk'] = 1;

    const engine = new WaveformEngine(graph1);
    engine.selectCategory('all');
    engine.sample();
    expect(engine.getStepCount()).toBe(1);

    // Pause recording
    engine.toggleRecording();
    expect(engine.isRecording()).toBe(false);

    // Clear traces
    engine.clear();
    expect(engine.getStepCount()).toBe(0);

    // Toggle specific signal selection
    const signalId = `${dff.id}::out_Q`;
    engine.toggleSignal(signalId);
    expect(engine.isSignalSelected(signalId)).toBe(false);
    engine.toggleSignal(signalId);
    expect(engine.isSignalSelected(signalId)).toBe(true);

    // Resume recording
    engine.toggleRecording();
    expect(engine.isRecording()).toBe(true);

    // Verify circuit 1 state was completely unaffected by all waveform operations
    expect(inA.outputPorts[0].value).toBe(1);
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
    expect(dff.outputPorts.find(p => p.id === 'out_QBAR')!.value).toBe(0);
    expect(dff.config['_prevClk']).toBe(1);

    // Switch to another graph
    const graph2 = new CircuitGraph('Circuit 2');
    const clk = graph2.addComponent('CLOCK', { x: 0, y: 0 }, 'CLK');
    clk.outputPorts[0].value = 1;

    engine.setGraph(graph2);
    engine.selectCategory('sequential');
    engine.clear();

    // Verify neither graph1 nor graph2 had their circuit state modified
    expect(inA.outputPorts[0].value).toBe(1);
    expect(dff.outputPorts.find(p => p.id === 'out_Q')!.value).toBe(1);
    expect(clk.outputPorts[0].value).toBe(1);
  });
});
