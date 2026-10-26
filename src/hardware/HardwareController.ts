// =============================================================================
// HardwareController.ts — Bridges serial data ↔ circuit graph.
// Auto-switches to hardware mode on connection, applies inputs, runs propagation.
// =============================================================================

import type { CircuitGraph } from '../engine/CircuitGraph.js';
import type { HardwareMessage } from '../engine/types.js';
import { Propagator } from '../engine/Propagator.js';
import { SerialAdapter } from './SerialAdapter.js';
import { MessageParser } from './MessageParser.js';
import { eventBus } from '../engine/EventBus.js';
import type { SerialStatus } from './SerialAdapter.js';

/** Circuit INPUT labels that map to each hardware channel. Supports both L/R and F/S. */
const LABEL_MAP = {
  left:           ['L', 'LEFT', 'IN1', 'LEFT_SENSOR', 'F', 'FRONT', 'IN_FRONT'],
  right:          ['R', 'RIGHT', 'IN2', 'RIGHT_SENSOR', 'S', 'SIDE', 'IN_SIDE'],
  // Indicators are manual-only canvas toggles by default.
  // If Arduino ever sends IL=/IR= fields, they will be applied here too.
  leftIndicator:  ['IL', 'LEFT_IND', 'LIND', 'INDICATOR_L'],
  rightIndicator: ['IR', 'RIGHT_IND', 'RIND', 'INDICATOR_R'],
  laneChange:     ['LC', 'LANE', 'LANE_CHANGE'],
};

export class HardwareController {
  private graph: CircuitGraph;
  private adapter: SerialAdapter;
  public mode: 'simulation' | 'hardware' = 'simulation'; // simulation until Arduino connects
  public lastMessage: HardwareMessage | null = null;
  public serialStatus: SerialStatus = 'disconnected';
  public statusMessage = '';
  private lastBuzzValue = -1;

  constructor(graph: CircuitGraph) {
    this.graph = graph;

    this.adapter = new SerialAdapter({
      onData: (line) => this.handleData(line),
      onStatusChange: (status, msg) => {
        this.serialStatus = status;
        this.statusMessage = msg ?? '';
        this.lastBuzzValue = -1;
        if (status === 'connected') {
          this.setMode('hardware');
        }
        eventBus.emit('hardware:data', this.lastMessage ?? {
          left: 'X', right: 'X', leftIndicator: 'X', rightIndicator: 'X', laneChange: 'X', rawText: `[${status}]`,
        });
      },
    });
  }

  setGraph(graph: CircuitGraph): void {
    this.graph = graph;
    this.lastBuzzValue = -1;
  }

  setMode(mode: 'simulation' | 'hardware'): void {
    this.mode = mode;
    this.lastBuzzValue = -1;
    eventBus.emit('mode:changed', mode);
  }

  static isWebSerialAvailable(): boolean {
    return SerialAdapter.isAvailable();
  }

  async connect(): Promise<void> {
    await this.adapter.connect(9600);
    this.setMode('hardware');
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
    this.lastBuzzValue = -1;
  }

  async sendTestPing(): Promise<void> {
    await this.adapter.sendCommand('PING');
  }

  getThreshold(): number {
    return MessageParser.getThreshold();
  }

  async setThreshold(cm: number): Promise<void> {
    MessageParser.setThreshold(cm);
    if (this.serialStatus === 'connected') {
      await this.adapter.sendCommand(`THRESH=${cm}`);
    }
  }

  async resetThreshold(): Promise<void> {
    MessageParser.resetThreshold();
    if (this.serialStatus === 'connected') {
      await this.adapter.sendCommand(`THRESH=${MessageParser.DEFAULT_THRESHOLD_CM}`);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private handleData(line: string): void {
    const msg = MessageParser.parse(line);
    if (!msg) return;

    this.lastMessage = msg;

    // Apply sensor values directly to matching INPUT components on the canvas
    this.applyMessage(msg);

    // Run logic circuit gates
    Propagator.propagate(this.graph);

    // Notify UI panels and canvas to re-render
    eventBus.emit('hardware:data', msg);

    // Send buzzer feedback back to Arduino
    this.sendBuzzerFeedback();
  }

  private applyMessage(msg: HardwareMessage): void {
    type Channel = 'left' | 'right' | 'leftIndicator' | 'rightIndicator' | 'laneChange';
    const channels: Array<[Channel, string[]]> = [
      ['left',           LABEL_MAP.left],
      ['right',          LABEL_MAP.right],
      ['leftIndicator',  LABEL_MAP.leftIndicator],
      ['rightIndicator', LABEL_MAP.rightIndicator],
      ['laneChange',     LABEL_MAP.laneChange],
    ];

    for (const [channel, labels] of channels) {
      const val = msg[channel];
      // Manual controls: if indicator or lane-change key is absent ('X'), preserve the manual canvas state
      if (['leftIndicator', 'rightIndicator', 'laneChange'].includes(channel) && val === 'X') {
        continue;
      }

      for (const comp of this.graph.getSourceComponents()) {
        if (labels.includes(comp.label.toUpperCase())) {
          this.graph.setInputValue(comp.id, val);
          break;
        }
      }
    }
  }

  /** Read the BUZZER output from the circuit and send BUZZ=0/1 to Arduino. */
  public sendBuzzerFeedback(): void {
    if (this.serialStatus !== 'connected') return;
    let buzzValue = 0;

    for (const comp of this.graph.getAllComponents()) {
      if (comp.type === 'BUZZER' || comp.label.toUpperCase().includes('BUZZ')) {
        const inPort = comp.inputPorts.find(p => p.id === 'in');
        if (inPort && inPort.value === 1) {
          buzzValue = 1;
          break;
        }
      }
    }

    if (buzzValue !== this.lastBuzzValue) {
      this.lastBuzzValue = buzzValue;
      this.adapter.sendCommand(`BUZZ=${buzzValue}`).catch(() => {});
    }
  }
}
