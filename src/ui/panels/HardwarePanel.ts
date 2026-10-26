// =============================================================================
// HardwarePanel.ts — Arduino connection status, controls, and live data display.
// =============================================================================

import { HardwareController } from '../../hardware/HardwareController.js';
import { SerialAdapter } from '../../hardware/SerialAdapter.js';
import type { HardwareMessage } from '../../engine/types.js';
import { eventBus } from '../../engine/EventBus.js';

export class HardwarePanel {
  private container: HTMLElement;
  private ctrl: HardwareController;
  private rawLog: string[] = [];

  constructor(container: HTMLElement, ctrl: HardwareController) {
    this.container = container;
    this.ctrl      = ctrl;

    eventBus.on('hardware:data', (msg) => this.onHardwareData(msg));
    eventBus.on('mode:changed',  ()    => this.render());

    this.render();
  }

  private onHardwareData(msg: HardwareMessage): void {
    this.rawLog.unshift(msg.rawText);
    if (this.rawLog.length > 20) this.rawLog.pop();
    this.render();
  }

  render(): void {
    const status    = this.ctrl.serialStatus;
    const statusMsg = this.ctrl.statusMessage;
    const msg       = this.ctrl.lastMessage;
    const available = HardwareController.isWebSerialAvailable();
    const mode      = this.ctrl['mode'] as string;

    const statusDot  = { disconnected: '🔴', connecting: '🟡', connected: '🟢', error: '🔴' }[status] ?? '🔴';
    const statusText = status.toUpperCase();

    this.container.innerHTML = `
      <div class="hw-panel">
        <div class="hw-status-bar">
          <span class="hw-dot">${statusDot}</span>
          <span class="hw-status-text">${statusText}</span>
          ${statusMsg ? `<span class="hw-status-msg">${escHtml(statusMsg)}</span>` : ''}
        </div>

        ${!available ? `<div class="hw-warning">⚠ Web Serial API not available. Use Chrome or Edge.</div>` : ''}

        <div class="hw-info-box">
          <strong>⚠ Important — Before uploading to Arduino:</strong><br>
          Click <strong>Disconnect</strong> below first, then upload in Arduino IDE.<br>
          Only one program can use the COM port at a time.
          <hr style="margin:6px 0;border-color:#334155">
          <strong>How the bridge works:</strong><br>
          Left sensor (pins 7/6) → circuit input <strong>L</strong> &nbsp;|&nbsp;
          Right sensor (pins 5/4) → circuit input <strong>R</strong><br>
          Left indicator → input <strong>IL</strong> &nbsp;|&nbsp; Right indicator → input <strong>IR</strong><br>
          Buzzer fires when <strong>W_L = (L AND IL) = 1</strong> or <strong>W_R = (R AND IR) = 1</strong>
        </div>

        <div class="hw-controls">
          <button class="btn btn-primary" id="hw-connect" ${status === 'connected' || !available ? 'disabled' : ''}>
            ${status === 'connecting' ? 'Connecting…' : '⚡ Connect Arduino'}
          </button>
          <button class="btn btn-danger" id="hw-disconnect" ${status !== 'connected' ? 'disabled' : ''}>
            ✕ Disconnect
          </button>
          <button class="btn btn-secondary" id="hw-test" ${status !== 'connected' ? 'disabled' : ''}>
            ⟳ Test (PING)
          </button>
          <div class="hw-threshold-control" style="display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:11px;color:#cbd5e1;">
            <span>Threshold:</span>
            <input type="range" id="hw-thresh-slider" min="5" max="45" value="${this.ctrl.getThreshold()}" style="width:100px;cursor:pointer;vertical-align:middle;">
            <span id="hw-thresh-val" style="font-weight:bold;color:#38bdf8;min-width:38px;">${this.ctrl.getThreshold()} cm</span>
          </div>
        </div>

        <div class="hw-sensor-grid hw-sensor-grid-4">
          ${this.sensorCard('LEFT SENSOR',     msg?.left            ?? 'X', '◀',  'Pins 7 / 6', 'L', msg?.leftDist)}
          ${this.sensorCard('RIGHT SENSOR',    msg?.right           ?? 'X', '▶',  'Pins 5 / 4', 'R', msg?.rightDist)}
          ${this.sensorCard('LEFT INDICATOR',  msg?.leftIndicator   ?? 'X', '↰',  'Manual / IL', 'IL')}
          ${this.sensorCard('RIGHT INDICATOR', msg?.rightIndicator  ?? 'X', '↱',  'Manual / IR', 'IR')}
        </div>

        <div class="hw-serial-log">
          <div class="hw-log-header">
            Raw Serial Input
            ${status === 'connected' ? '<span class="hw-live-badge">LIVE</span>' : ''}
          </div>
          <div class="hw-log-body">
            ${this.rawLog.length === 0
              ? '<span class="hw-log-empty">No data received. Connect Arduino to see live sensor readings.</span>'
              : this.rawLog.map(l => `<div class="hw-log-line">${escHtml(l)}</div>`).join('')
            }
          </div>
        </div>

        <div class="hw-mode-note">
          <strong>Mode:</strong>
          ${mode === 'hardware'
            ? '🔴 Hardware Mode — Arduino sensors control L, R, LC inputs live'
            : '🔵 Simulation Mode — Click L, R, LC inputs on the canvas to toggle'}
        </div>
      </div>`;

    this.container.querySelector('#hw-connect')?.addEventListener('click', async () => {
      await this.ctrl.connect();
    });

    this.container.querySelector('#hw-disconnect')?.addEventListener('click', async () => {
      await this.ctrl.disconnect();
      this.render();
    });

    this.container.querySelector('#hw-test')?.addEventListener('click', async () => {
      await this.ctrl.sendTestPing();
    });

    const slider = this.container.querySelector('#hw-thresh-slider') as HTMLInputElement | null;
    slider?.addEventListener('input', async (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      const valEl = this.container.querySelector('#hw-thresh-val');
      if (valEl) valEl.textContent = `${val} cm`;
      await this.ctrl.setThreshold(val);
    });
  }

  private sensorCard(
    title: string,
    value: 0 | 1 | 'X',
    icon: string,
    pins: string,
    circuitLabel: string,
    distCm?: number,
  ): string {
    const on  = value === 1;
    const cls = on ? 'sensor-detected' : value === 0 ? 'sensor-clear' : 'sensor-unknown';
    const distText = distCm !== undefined && distCm < 999 ? ` · ${distCm}cm` : '';
    const lbl = on ? `⚠ DETECTED${distText}` : value === 0 ? `✓ CLEAR${distText}` : '— WAITING';
    return `
      <div class="hw-sensor-card ${cls}">
        <div class="sensor-icon">${icon}</div>
        <div class="sensor-title">${title}</div>
        <div class="sensor-value">${value === 'X' ? '—' : value}</div>
        <div class="sensor-label">${lbl}</div>
        <div class="sensor-pins">${pins} · Circuit: <strong>${circuitLabel}</strong></div>
      </div>`;
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
