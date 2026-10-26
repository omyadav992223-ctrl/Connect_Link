// =============================================================================
// TruthTablePanel.ts — Renders the truth table from the live engine.
// Subscribes to circuit:changed and signal:updated events.
// =============================================================================

import type { CircuitGraph } from '../../engine/CircuitGraph.js';
import { TruthTableGen } from '../../engine/TruthTableGen.js';
import type { TruthTable, LogicValue } from '../../engine/types.js';
import { eventBus } from '../../engine/EventBus.js';

export class TruthTablePanel {
  private container: HTMLElement;
  private graph: CircuitGraph;
  private currentTable: TruthTable | null = null;

  constructor(container: HTMLElement, graph: CircuitGraph) {
    this.container = container;
    this.graph     = graph;

    eventBus.on('circuit:changed', () => this.refresh());
    eventBus.on('signal:updated',  () => this.highlightActiveRow());
  }

  setGraph(graph: CircuitGraph): void {
    this.graph = graph;
    this.refresh();
  }

  refresh(): void {
    this.currentTable = TruthTableGen.generate(this.graph);
    this.render();
  }

  private render(): void {
    const { container } = this;

    if (!this.currentTable) {
      container.innerHTML = `
        <div class="panel-empty">
          <span class="panel-empty-icon">⊡</span>
          <p>Add at least one INPUT and one OUTPUT component to generate a truth table.</p>
        </div>`;
      return;
    }

    const { inputLabels, outputLabels, rows } = this.currentTable;
    const allLabels = [...inputLabels, ...outputLabels];

    let html = `<div class="tt-wrap"><table class="truth-table">
      <thead><tr>`;

    for (const lbl of inputLabels) {
      html += `<th class="tt-input">${escHtml(lbl)}</th>`;
    }
    html += `<th class="tt-sep"></th>`;
    for (const lbl of outputLabels) {
      html += `<th class="tt-output">${escHtml(lbl)}</th>`;
    }
    html += `</tr></thead><tbody>`;

    rows.forEach((row, idx) => {
      html += `<tr data-row="${idx}">`;
      for (const lbl of inputLabels) {
        html += `<td class="tt-input ${valClass(row.inputs[lbl])}">${valStr(row.inputs[lbl])}</td>`;
      }
      html += `<td class="tt-sep"></td>`;
      for (const lbl of outputLabels) {
        html += `<td class="tt-output ${valClass(row.outputs[lbl])}">${valStr(row.outputs[lbl])}</td>`;
      }
      html += `</tr>`;
    });

    html += `</tbody></table></div>
    <div class="tt-footer">
      ${rows.length} rows · ${inputLabels.length} input(s) · ${outputLabels.length} output(s)
    </div>`;

    container.innerHTML = html;
    this.highlightActiveRow();
  }

  private highlightActiveRow(): void {
    if (!this.currentTable) return;

    const inputs = this.graph.getSourceComponents().filter(c => c.type === 'INPUT');
    const sorted = [...inputs].sort((a, b) => a.label.localeCompare(b.label));
    const { inputLabels, rows } = this.currentTable;

    // Build current input state key
    const currentInputs: Record<string, LogicValue> = {};
    for (const inp of sorted) {
      currentInputs[inp.label] = inp.outputPorts[0]?.value ?? 'X';
    }

    // Find matching row
    let activeIdx = -1;
    rows.forEach((row, i) => {
      let match = true;
      for (const lbl of inputLabels) {
        if (row.inputs[lbl] !== currentInputs[lbl]) { match = false; break; }
      }
      if (match) activeIdx = i;
    });

    this.container.querySelectorAll('tr[data-row]').forEach(tr => {
      const rowEl = tr as HTMLElement;
      const idx   = parseInt(rowEl.dataset['row'] ?? '-1');
      rowEl.classList.toggle('tt-active', idx === activeIdx);
    });
  }
}

function valStr(v: LogicValue): string {
  return v === 'X' ? 'X' : String(v);
}

function valClass(v: LogicValue): string {
  if (v === 1) return 'val-1';
  if (v === 0) return 'val-0';
  return 'val-x';
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
