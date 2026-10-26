// =============================================================================
// KMapPanel.ts — Renders the Karnaugh Map for a selected output.
// Data sourced entirely from TruthTableGen → KMapSolver.
// =============================================================================

import type { CircuitGraph } from '../../engine/CircuitGraph.js';
import { TruthTableGen } from '../../engine/TruthTableGen.js';
import { KMapSolver } from '../../engine/KMapSolver.js';
import { eventBus } from '../../engine/EventBus.js';

// Gray code column orderings for display
const GRAY2 = ['00','01','11','10'];
const GRAY_ROW_4 = ['00','01','11','10'];
const GRAY_COL_4 = ['00','01','11','10'];

export class KMapPanel {
  private container: HTMLElement;
  private graph: CircuitGraph;
  private selectedOutput: string = '';

  constructor(container: HTMLElement, graph: CircuitGraph) {
    this.container = container;
    this.graph     = graph;

    eventBus.on('circuit:changed', () => this.refresh());
  }

  setGraph(graph: CircuitGraph): void {
    this.graph = graph;
    this.refresh();
  }

  refresh(): void {
    const sinks = this.graph.getSinkComponents();
    if (sinks.length === 0) {
      this.container.innerHTML = `<div class="panel-empty"><span class="panel-empty-icon">K</span><p>No output components to map.</p></div>`;
      return;
    }

    const inputs = this.graph.getSourceComponents().filter(c => c.type === 'INPUT');
    if (inputs.length < 2 || inputs.length > 4) {
      this.container.innerHTML = `<div class="panel-empty"><span class="panel-empty-icon">K</span><p>K-map requires 2–4 INPUT variables (found ${inputs.length}).</p></div>`;
      return;
    }

    // Ensure selected output is valid
    if (!sinks.find(s => s.label === this.selectedOutput)) {
      this.selectedOutput = sinks[0].label;
    }

    const table = TruthTableGen.generate(this.graph);
    if (!table) {
      this.container.innerHTML = `<div class="panel-empty"><span class="panel-empty-icon">K</span><p>Could not generate truth table.</p></div>`;
      return;
    }

    const { minterms, dontCares } = TruthTableGen.getMinterms(table, this.selectedOutput);
    const variables = table.inputLabels;
    const result = KMapSolver.solve(minterms, dontCares, variables);

    // Output selector
    let html = `<div class="kmap-header">`;
    html += `<span class="kmap-title">K-Map for: </span>`;
    html += `<select class="kmap-select" id="kmap-output-sel">`;
    for (const sink of sinks) {
      html += `<option value="${escHtml(sink.label)}" ${sink.label === this.selectedOutput ? 'selected' : ''}>${escHtml(sink.label)}</option>`;
    }
    html += `</select></div>`;

    // K-Map grid
    html += this.renderGrid(result, variables);

    // Groups legend
    if (result.groups.length > 0) {
      html += `<div class="kmap-groups"><strong>Groups:</strong> `;
      html += result.groups.map(g =>
        `<span class="kmap-group-tag">${escHtml(g.implicant)} (m${g.minterms.join(',')})</span>`
      ).join(' ');
      html += `</div>`;
    }

    // Simplified expression
    html += `<div class="kmap-expr">
      Simplified SOP: <span class="kmap-sop">${escHtml(result.simplifiedExpression)}</span>
    </div>`;

    this.container.innerHTML = html;

    // Bind output selector
    const sel = this.container.querySelector<HTMLSelectElement>('#kmap-output-sel');
    sel?.addEventListener('change', () => {
      this.selectedOutput = sel.value;
      this.refresh();
    });
  }

  private renderGrid(result: ReturnType<typeof KMapSolver.solve>, variables: string[]): string {
    const n = variables.length;
    const mintermSet  = new Set(result.minterms);
    const dontCareSet = new Set(result.dontCares);

    // Assign colors to groups
    const groupColors = ['#1d4ed8','#15803d','#b45309','#7c3aed','#be185d'];
    const mintermGroup: Record<number, number> = {};
    result.groups.forEach((g, gi) => {
      for (const m of g.minterms) {
        mintermGroup[m] = gi;
      }
    });

    if (n === 2) {
      // 2x2 grid
      // Rows: A (MSB), Columns: B (LSB)
      const [vA, vB] = variables;
      let html = `<div class="kmap-grid-wrap"><table class="kmap-table">
        <thead><tr><th class="kmap-corner">${escHtml(vA)} \\ ${escHtml(vB)}</th>
        <th>0</th><th>1</th></tr></thead><tbody>`;

      for (let a = 0; a <= 1; a++) {
        html += `<tr><th>${a}</th>`;
        for (let b = 0; b <= 1; b++) {
          const m = (a << 1) | b;
          html += this.renderCell(m, mintermSet, dontCareSet, mintermGroup, groupColors);
        }
        html += `</tr>`;
      }
      html += `</tbody></table></div>`;
      return html;
    }

    if (n === 3) {
      // 2x4 grid: rows = A, columns = BC in Gray order
      const [vA, vB, vC] = variables;
      const colOrder = [0b00, 0b01, 0b11, 0b10]; // BC gray code
      let html = `<div class="kmap-grid-wrap"><table class="kmap-table">
        <thead><tr><th class="kmap-corner">${escHtml(vA)} \\ ${escHtml(vB)}${escHtml(vC)}</th>
        ${colOrder.map(bc => `<th>${bc.toString(2).padStart(2,'0')}</th>`).join('')}
        </tr></thead><tbody>`;

      for (let a = 0; a <= 1; a++) {
        html += `<tr><th>${a}</th>`;
        for (const bc of colOrder) {
          const m = (a << 2) | bc;
          html += this.renderCell(m, mintermSet, dontCareSet, mintermGroup, groupColors);
        }
        html += `</tr>`;
      }
      html += `</tbody></table></div>`;
      return html;
    }

    // n === 4: 4x4 grid, rows = AB (Gray), cols = CD (Gray)
    const [vA, vB, vC, vD] = variables;
    const rowOrder = [0b00, 0b01, 0b11, 0b10];
    const colOrder = [0b00, 0b01, 0b11, 0b10];

    let html = `<div class="kmap-grid-wrap"><table class="kmap-table">
      <thead><tr><th class="kmap-corner">${escHtml(vA)}${escHtml(vB)} \\ ${escHtml(vC)}${escHtml(vD)}</th>
      ${colOrder.map(cd => `<th>${cd.toString(2).padStart(2,'0')}</th>`).join('')}
      </tr></thead><tbody>`;

    for (const ab of rowOrder) {
      html += `<tr><th>${ab.toString(2).padStart(2,'0')}</th>`;
      for (const cd of colOrder) {
        const m = (ab << 2) | cd;
        html += this.renderCell(m, mintermSet, dontCareSet, mintermGroup, groupColors);
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    return html;
  }

  private renderCell(
    m: number,
    mintermSet: Set<number>,
    dontCareSet: Set<number>,
    mintermGroup: Record<number, number>,
    groupColors: string[],
  ): string {
    const isOne      = mintermSet.has(m);
    const isDontCare = dontCareSet.has(m);
    const groupIdx   = mintermGroup[m] ?? -1;
    const bgColor    = groupIdx >= 0 ? groupColors[groupIdx % groupColors.length] : '';

    const cellClass = isOne ? 'kmap-cell-1' : isDontCare ? 'kmap-cell-dc' : 'kmap-cell-0';
    const style     = bgColor ? ` style="outline: 2px solid ${bgColor}; outline-offset:-2px;"` : '';
    const label     = isDontCare ? 'X' : isOne ? '1' : '0';
    const sub       = `<sub style="font-size:8px;opacity:0.5">m${m}</sub>`;

    return `<td class="kmap-cell ${cellClass}"${style}>${label}${sub}</td>`;
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
