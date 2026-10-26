// =============================================================================
// BooleanPanel.ts — Displays the Boolean expression derived from the circuit.
// =============================================================================

import type { CircuitGraph } from '../../engine/CircuitGraph.js';
import { BoolExprGen } from '../../engine/BoolExprGen.js';
import { eventBus } from '../../engine/EventBus.js';

export class BooleanPanel {
  private container: HTMLElement;
  private graph: CircuitGraph;

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
    const results = BoolExprGen.generateAll(this.graph);

    if (results.length === 0) {
      this.container.innerHTML = `
        <div class="panel-empty">
          <span class="panel-empty-icon">𝑓</span>
          <p>No output components found. Add an LED or OUTPUT to generate Boolean expressions.</p>
        </div>`;
      return;
    }

    let html = '<div class="bool-list">';
    for (const r of results) {
      const formatted = this.formatExpression(r.expression);
      html += `
        <div class="bool-expr-block">
          <div class="bool-label">${escHtml(r.outputLabel)}</div>
          <div class="bool-expr">${formatted}</div>
        </div>`;
    }
    html += '</div>';
    this.container.innerHTML = html;
  }

  /**
   * Format the expression for display:
   * - Replace · with a rendered dot
   * - Replace ' with overbar using CSS/HTML
   * - Color operators
   */
  private formatExpression(expr: string): string {
    // 1. Format negated variables: X' -> <span class="bool-var">X</span><sup class="bool-not">'</sup>
    let s = expr.replace(/([A-Za-z_][A-Za-z0-9_]*)'/g, '<span class="bool-var">$1</span><sup class="bool-not">\'</sup>');
    // 2. Format plain variables (guarding against matching inside already created tags)
    s = s.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b(?![^<]*>)/g, '<span class="bool-var">$1</span>');
    // 3. Format operators
    return s
      .replace(/·/g, '<span class="bool-op bool-and"> · </span>')
      .replace(/\+/g, '<span class="bool-op bool-or"> + </span>')
      .replace(/⊕/g, '<span class="bool-op bool-xor"> ⊕ </span>');
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
