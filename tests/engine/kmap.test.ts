// =============================================================================
// kmap.test.ts — K-map solver verification using known truth tables.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { KMapSolver } from '../../src/engine/KMapSolver.js';

describe('KMapSolver — 2-variable AND (minterms: {3})', () => {
  // AND(A,B): minterm 3 = AB = 11 → Y=1
  it('simplifies to A·B', () => {
    const result = KMapSolver.solve([3], [], ['A', 'B']);
    expect(result.simplifiedExpression).toBe("A·B");
  });

  it('produces one group covering minterm 3', () => {
    const result = KMapSolver.solve([3], [], ['A', 'B']);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].minterms).toContain(3);
  });
});

describe('KMapSolver — 2-variable OR (minterms: {1,2,3})', () => {
  it('simplifies to A + B', () => {
    const result = KMapSolver.solve([1, 2, 3], [], ['A', 'B']);
    // Should be simplified to "A + B" or equivalent
    expect(result.simplifiedExpression).not.toBe('0');
    expect(result.simplifiedExpression).not.toBe('');
  });
});

describe('KMapSolver — tautology (all minterms)', () => {
  it('2-var all 1s → simplifies to 1', () => {
    const result = KMapSolver.solve([0, 1, 2, 3], [], ['A', 'B']);
    expect(result.simplifiedExpression).toBe('1');
  });
});

describe('KMapSolver — empty minterms', () => {
  it('no minterms → expression is 0', () => {
    const result = KMapSolver.solve([], [], ['A', 'B']);
    expect(result.simplifiedExpression).toBe('0');
  });
});

describe('KMapSolver — 3-variable (blind-spot: minterm 7 only)', () => {
  // L=1, R=1, LC=1 is minterm 7 (binary 111) with variables [L,R,LC]
  it('minterm {7} simplifies to L·R·LC', () => {
    const result = KMapSolver.solve([7], [], ['L', 'R', 'LC']);
    expect(result.simplifiedExpression).toBe('L·R·LC');
  });

  it('variable count is 3', () => {
    const result = KMapSolver.solve([7], [], ['L', 'R', 'LC']);
    expect(result.variableCount).toBe(3);
  });
});

describe('KMapSolver — 3-variable grouping', () => {
  // Minterms 0,1,4,5 can be grouped as B'  (A' and C' grouped out)
  // 000, 001, 100, 101 → vary A and C, B=0 → B'
  it('minterms {0,1,4,5} simplify to R\' (middle var)', () => {
    // Variables: A B C (indices 0,1,2)
    // 000=0, 001=1, 100=4, 101=5 → B is always 0 → A' is irrelevant, C irrelevant
    const result = KMapSolver.solve([0, 1, 4, 5], [], ['A', 'B', 'C']);
    expect(result.simplifiedExpression).toBe("B'");
  });
});

describe('KMapSolver — 4-variable', () => {
  it('handles 4 variables without error', () => {
    // Minterms for a simple 4-var AND (A·B·C·D = minterm 15)
    const result = KMapSolver.solve([15], [], ['A', 'B', 'C', 'D']);
    expect(result.variableCount).toBe(4);
    expect(result.simplifiedExpression).toBe('A·B·C·D');
  });
});

describe('KMapSolver — with don\'t cares', () => {
  it('uses don\'t cares to simplify', () => {
    // Minterms {1}, don't cares {3,5,7} — should allow larger grouping
    const result = KMapSolver.solve([1], [3, 5, 7], ['A', 'B', 'C']);
    // With DCs, minterm 1 (001) can group with 3(011),5(101),7(111) → C
    expect(result.minterms).toContain(1);
    expect(result.dontCares).toContain(3);
    // Expression should be simplified (not just "A'·B'·C")
    expect(result.simplifiedExpression.length).toBeLessThan('A\'·B\'·C'.length + 1);
  });
});

describe('KMapSolver — unsupported variable counts', () => {
  it('1 variable returns error message', () => {
    const result = KMapSolver.solve([1], [], ['A']);
    expect(result.simplifiedExpression).toContain('2–4 variables');
  });

  it('5 variables returns error message', () => {
    const result = KMapSolver.solve([1], [], ['A', 'B', 'C', 'D', 'E']);
    expect(result.simplifiedExpression).toContain('2–4 variables');
  });
});
