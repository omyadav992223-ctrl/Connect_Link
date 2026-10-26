// =============================================================================
// hardware_circuit_integration.test.ts — End-to-end integration & regression tests.
// Tests:
// 1. Loading circuits/blind_spot_detection.json and verifying all 16 input combinations.
// 2. Telemetry ingestion, circuit propagation, and outgoing buzzer command dispatch.
// 3. Serial fail-safe disconnect and malformed packet rejection.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import blindSpotData from '../../circuits/blind_spot_detection.json';
import { CircuitSerializer, type SerializedCircuit } from '../../src/engine/CircuitSerializer.js';
import { CircuitGraph } from '../../src/engine/CircuitGraph.js';
import { Propagator } from '../../src/engine/Propagator.js';
import { HardwareController } from '../../src/hardware/HardwareController.js';
import { SerialAdapter } from '../../src/hardware/SerialAdapter.js';

describe('Blind-Spot Saved JSON Preset Verification', () => {
  it('deserializes circuits/blind_spot_detection.json successfully', () => {
    const graph = CircuitSerializer.deserialize(blindSpotData as SerializedCircuit);
    expect(graph).toBeInstanceOf(CircuitGraph);
    expect(graph.getAllComponents()).toHaveLength(14);
    expect(graph.getAllWires()).toHaveLength(14);
  });

  it('contains expected labeled inputs and outputs with correct port routing', () => {
    const graph = CircuitSerializer.deserialize(blindSpotData as SerializedCircuit);
    const labels = graph.getAllComponents().map(c => c.label);

    expect(labels).toContain('L');
    expect(labels).toContain('R');
    expect(labels).toContain('IL');
    expect(labels).toContain('IR');
    expect(labels).toContain('W_L');
    expect(labels).toContain('W_R');
    expect(labels).toContain('ALERT');
    expect(labels).toContain('SAFE');
    expect(labels).toContain('BUZZER');
  });

  it('evaluates all 16 input combinations correctly through the loaded JSON circuit', () => {
    const graph = CircuitSerializer.deserialize(blindSpotData as SerializedCircuit);

    const getComp = (label: string) =>
      graph.getAllComponents().find(c => c.label.toUpperCase() === label.toUpperCase())!;

    const inL  = getComp('L');
    const inR  = getComp('R');
    const inIL = getComp('IL');
    const inIR = getComp('IR');

    const ledWL     = getComp('W_L');
    const ledWR     = getComp('W_R');
    const ledAlert  = getComp('ALERT');
    const ledSafe   = getComp('SAFE');
    const outBuzzer = getComp('BUZZER');

    for (let l = 0; l <= 1; l++) {
      for (let r = 0; r <= 1; r++) {
        for (let il = 0; il <= 1; il++) {
          for (let ir = 0; ir <= 1; ir++) {
            graph.setInputValue(inL.id, l as 0 | 1);
            graph.setInputValue(inR.id, r as 0 | 1);
            graph.setInputValue(inIL.id, il as 0 | 1);
            graph.setInputValue(inIR.id, ir as 0 | 1);

            Propagator.propagate(graph);

            const expectedWL     = l & il;
            const expectedWR     = r & ir;
            const expectedAlert  = l | r;
            const expectedSafe   = (l | r) === 0 ? 1 : 0;
            const expectedBuzzer = expectedWL | expectedWR;

            expect(ledWL.inputPorts[0].value).toBe(expectedWL);
            expect(ledWR.inputPorts[0].value).toBe(expectedWR);
            expect(ledAlert.inputPorts[0].value).toBe(expectedAlert);
            expect(ledSafe.inputPorts[0].value).toBe(expectedSafe);
            expect(outBuzzer.inputPorts[0].value).toBe(expectedBuzzer);
          }
        }
      }
    }
  });

  it('performs full CircuitSerializer roundtrip (toJSON -> fromJSON) preserving all components, wires and evaluation', () => {
    const originalGraph = CircuitSerializer.deserialize(blindSpotData as SerializedCircuit);
    const jsonStr = CircuitSerializer.toJSON(originalGraph);
    const restoredGraph = CircuitSerializer.fromJSON(jsonStr);

    expect(restoredGraph.getAllComponents()).toHaveLength(originalGraph.getAllComponents().length);
    expect(restoredGraph.getAllWires()).toHaveLength(originalGraph.getAllWires().length);

    // Verify evaluation on the restored graph matches specification
    const inL = restoredGraph.getAllComponents().find(c => c.label === 'L')!;
    const inIL = restoredGraph.getAllComponents().find(c => c.label === 'IL')!;
    const ledWL = restoredGraph.getAllComponents().find(c => c.label === 'W_L')!;
    const outBuzzer = restoredGraph.getAllComponents().find(c => c.label === 'BUZZER')!;

    restoredGraph.setInputValue(inL.id, 1);
    restoredGraph.setInputValue(inIL.id, 1);
    Propagator.propagate(restoredGraph);

    expect(ledWL.inputPorts[0].value).toBe(1);
    expect(outBuzzer.inputPorts[0].value).toBe(1);
  });
});

describe('Hardware-in-the-Loop Simulation & Telemetry Flow', () => {
  it('flows telemetry into L/R while preserving user IL/IR switches and actuates buzzer command', () => {
    const graph = CircuitSerializer.deserialize(blindSpotData as SerializedCircuit);
    const sentCommands: string[] = [];

    const mockAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn().mockImplementation((cmd: string) => {
        sentCommands.push(cmd);
        return Promise.resolve();
      }),
      getStatus: () => 'connected',
    } as unknown as SerialAdapter;

    const controller = new HardwareController(graph);
    (controller as any).adapter = mockAdapter;
    (controller as any).serialStatus = 'connected';

    // 1. Initial manual switch states: IL=0, IR=0
    const inIL = graph.getAllComponents().find(c => c.label === 'IL')!;
    const inIR = graph.getAllComponents().find(c => c.label === 'IR')!;
    graph.setInputValue(inIL.id, 0);
    graph.setInputValue(inIR.id, 0);
    Propagator.propagate(graph);

    // 2. Incoming sensor telemetry: Left obstacle detected (15cm <= 20cm threshold)
    (controller as any).handleData('L=1,R=0,DIST_L=15,DIST_R=38');

    // L should now be 1 on graph
    const inL = graph.getAllComponents().find(c => c.label === 'L')!;
    expect(inL.outputPorts[0].value).toBe(1);

    // Indicator switches IL and IR should NOT be overwritten (remained 0)
    expect(inIL.outputPorts[0].value).toBe(0);
    expect(inIR.outputPorts[0].value).toBe(0);

    // ALERT is 1, but BUZZER is 0 because left turn signal was not on
    const buzzer = graph.getAllComponents().find(c => c.label === 'BUZZER')!;
    expect(buzzer.inputPorts[0].value).toBe(0);
    expect(sentCommands).toContain('BUZZ=0');

    // 3. User turns ON left indicator switch IL on canvas
    graph.setInputValue(inIL.id, 1);
    Propagator.propagate(graph);
    controller.sendBuzzerFeedback();

    // Now W_L = 1 and BUZZER = 1 -> dispatched BUZZ=1 to serial
    expect(buzzer.inputPorts[0].value).toBe(1);
    expect(sentCommands[sentCommands.length - 1]).toBe('BUZZ=1');

    // 4. Sensor telemetry: Obstacle moves away (40cm > 20cm)
    (controller as any).handleData('L=0,R=0,DIST_L=40,DIST_R=42');
    expect(inL.outputPorts[0].value).toBe(0);
    expect(buzzer.inputPorts[0].value).toBe(0);
    expect(sentCommands[sentCommands.length - 1]).toBe('BUZZ=0');
  });

  it('rejects invalid or corrupted messages without throwing or corrupting inputs', () => {
    const graph = CircuitSerializer.deserialize(blindSpotData as SerializedCircuit);
    const controller = new HardwareController(graph);

    const inL = graph.getAllComponents().find(c => c.label === 'L')!;
    graph.setInputValue(inL.id, 1);
    Propagator.propagate(graph);

    // Corrupted or incomplete strings
    (controller as any).handleData('');
    (controller as any).handleData('BAD_TELEMETRY');
    (controller as any).handleData('{bad_json: 123');
    (controller as any).handleData('???---###');

    // Input state should remain intact
    expect(inL.outputPorts[0].value).toBe(1);
  });

  it('evaluates threshold boundary conditions (below, at, and above 20 cm) through the full circuit', () => {
    const graph = CircuitSerializer.deserialize(blindSpotData as SerializedCircuit);
    const sentCommands: string[] = [];
    const mockAdapter = {
      sendCommand: vi.fn().mockImplementation((cmd: string) => {
        sentCommands.push(cmd);
        return Promise.resolve();
      }),
    };

    const controller = new HardwareController(graph);
    (controller as any).adapter = mockAdapter;
    (controller as any).serialStatus = 'connected';

    // Driver turns ON Left Indicator
    const inIL = graph.getAllComponents().find(c => c.label === 'IL')!;
    graph.setInputValue(inIL.id, 1);
    Propagator.propagate(graph);

    const inL = graph.getAllComponents().find(c => c.label === 'L')!;
    const inR = graph.getAllComponents().find(c => c.label === 'R')!;
    const outBuzzer = graph.getAllComponents().find(c => c.label === 'BUZZER')!;
    const ledSafe = graph.getAllComponents().find(c => c.label === 'SAFE')!;

    // 1. Boundary: Exactly at 20 cm threshold -> Obstacle detected (L=1), Buzzer fires (BUZZ=1)
    (controller as any).handleData('L=20,R=21');
    expect(inL.outputPorts[0].value).toBe(1);
    expect(inR.outputPorts[0].value).toBe(0);
    expect(outBuzzer.inputPorts[0].value).toBe(1);
    expect(ledSafe.inputPorts[0].value).toBe(0);
    expect(sentCommands[sentCommands.length - 1]).toBe('BUZZ=1');

    // 2. Boundary: Just above threshold (21 cm) -> Clear (L=0), Buzzer silenced (BUZZ=0)
    (controller as any).handleData('L=21,R=21');
    expect(inL.outputPorts[0].value).toBe(0);
    expect(inR.outputPorts[0].value).toBe(0);
    expect(outBuzzer.inputPorts[0].value).toBe(0);
    expect(ledSafe.inputPorts[0].value).toBe(1);
    expect(sentCommands[sentCommands.length - 1]).toBe('BUZZ=0');

    // 3. Below threshold (5 cm) -> Obstacle detected (L=1), Buzzer fires (BUZZ=1)
    (controller as any).handleData('L=5,R=999');
    expect(inL.outputPorts[0].value).toBe(1);
    expect(inR.outputPorts[0].value).toBe(0);
    expect(outBuzzer.inputPorts[0].value).toBe(1);
    expect(sentCommands[sentCommands.length - 1]).toBe('BUZZ=1');

    // 4. Open road / no-echo (999 cm) on both sides -> Clear (L=0, R=0)
    (controller as any).handleData('L=999,R=999');
    expect(inL.outputPorts[0].value).toBe(0);
    expect(inR.outputPorts[0].value).toBe(0);
    expect(outBuzzer.inputPorts[0].value).toBe(0);
    expect(ledSafe.inputPorts[0].value).toBe(1);
    expect(sentCommands[sentCommands.length - 1]).toBe('BUZZ=0');
  });

  it('fails safely when receiving sensor faults or negative distances without asserting false-clear', () => {
    const graph = CircuitSerializer.deserialize(blindSpotData as SerializedCircuit);
    const sentCommands: string[] = [];
    const mockAdapter = {
      sendCommand: vi.fn().mockImplementation((cmd: string) => {
        sentCommands.push(cmd);
        return Promise.resolve();
      }),
    };

    const controller = new HardwareController(graph);
    (controller as any).adapter = mockAdapter;
    (controller as any).serialStatus = 'connected';

    const inL = graph.getAllComponents().find(c => c.label === 'L')!;
    const inR = graph.getAllComponents().find(c => c.label === 'R')!;
    const ledSafe = graph.getAllComponents().find(c => c.label === 'SAFE')!;
    const outBuzzer = graph.getAllComponents().find(c => c.label === 'BUZZER')!;

    // Sensor fault on left: L=-1 error code, right is clear 50 cm
    (controller as any).handleData('L=-1,R=50');
    expect(inL.outputPorts[0].value).toBe('X');
    expect(inR.outputPorts[0].value).toBe(0);

    // CRITICAL SAFETY CHECK: SAFE output must NOT be 1 (never false clear on sensor fault)
    expect(ledSafe.inputPorts[0].value).toBe('X');
    expect(outBuzzer.inputPorts[0].value).toBe(0); // Buzzer not triggered false-positive on fault

    // Sensor fault token "ERR" on both sensors
    (controller as any).handleData('L=ERR,R=TIMEOUT');
    expect(inL.outputPorts[0].value).toBe('X');
    expect(inR.outputPorts[0].value).toBe('X');
    expect(ledSafe.inputPorts[0].value).toBe('X');
  });
});

describe('Serial Disconnect Fail-Safe', () => {
  it('sends BUZZ=0 before closing writable port stream', async () => {
    const writtenData: string[] = [];

    const mockWriter = {
      write: vi.fn().mockImplementation((chunk: Uint8Array) => {
        writtenData.push(new TextDecoder().decode(chunk));
        return Promise.resolve();
      }),
      releaseLock: vi.fn(),
    };

    const mockPort = {
      writable: {
        getWriter: () => mockWriter,
      },
      close: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new SerialAdapter({
      onStatusChange: () => {},
      onData: () => {},
    });

    (adapter as any).port = mockPort;

    await adapter.disconnect();

    expect(writtenData).toContain('BUZZ=0\n');
    expect(mockPort.close).toHaveBeenCalled();
  });
});
