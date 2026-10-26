// =============================================================================
// KMapSolver.ts — Karnaugh Map solver using Quine-McCluskey algorithm.
//
// Supports 2, 3, and 4 variable K-maps.
// Input: minterms (row indices where output = 1) + don't cares.
// Output: prime implicant groups + simplified SOP expression.
//
// Gray code orderings for K-map cells:
//   2-var: [0,1,3,2]          (AB: 00,01,11,10)
//   3-var: [0,1,3,2,4,5,7,6] (ABC)
//   4-var: standard 4x4 Gray code grid
// =============================================================================

import type { KMapResult, KMapGroup } from './types.js';

// ---------------------------------------------------------------------------
// Gray code index ordering for K-map rows/columns
// ---------------------------------------------------------------------------
const GRAY_2 = [0, 1, 3, 2];
const GRAY_4 = [0, 1, 3, 2, 4, 5, 7, 6, 12, 13, 15, 14, 8, 9, 11, 10];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function countOnes(n: number): number {
  let count = 0;
  while (n) { count += n & 1; n >>= 1; }
  return count;
}

/** Returns true if a and b differ by exactly one bit (can be combined). */
function differByOneBit(a: number, b: number): boolean {
  const diff = a ^ b;
  return diff !== 0 && (diff & (diff - 1)) === 0;
}

/** Returns the bit position where a and b differ (assumes exactly 1 diff). */
function diffBitPos(a: number, b: number): number {
  const diff = a ^ b;
  return Math.log2(diff);
}

// ---------------------------------------------------------------------------
// Implicant
// ---------------------------------------------------------------------------

interface Implicant {
  minterms: number[];   // covered minterms
  mask: number;         // which bits are "don't care" in this implicant
  value: number;        // value of non-masked bits
  used: boolean;        // used in a larger group (mark as not prime)
}

// ---------------------------------------------------------------------------
// KMapSolver
// ---------------------------------------------------------------------------

export class KMapSolver {
  /**
   * Solve K-map for the given minterms and don't cares.
   * @param minterms   Row indices where output = 1
   * @param dontCares  Row indices where output = X
   * @param variables  Variable names in MSB→LSB order (e.g. ['A','B','C'])
   */
  static solve(
    minterms: number[],
    dontCares: number[],
    variables: string[],
  ): KMapResult {
    const n = variables.length;

    if (n < 2 || n > 4) {
      return {
        variableCount: n,
        variables,
        minterms,
        dontCares,
        groups: [],
        simplifiedExpression: 'K-map supports 2–4 variables only.',
      };
    }

    if (minterms.length === 0) {
      return {
        variableCount: n,
        variables,
        minterms: [],
        dontCares,
        groups: [],
        simplifiedExpression: '0',
      };
    }

    const totalCells = 1 << n;
    const allOnes = new Set([...minterms, ...dontCares]);

    // All minterms are 1 → tautology
    if (minterms.length === totalCells) {
      return {
        variableCount: n,
        variables,
        minterms,
        dontCares,
        groups: [{ minterms, implicant: '1' }],
        simplifiedExpression: '1',
      };
    }

    // ------------------------------------------------------------------
    // Quine-McCluskey — Step 1: Build initial implicants from minterms + DCs
    // ------------------------------------------------------------------
    let implicants: Implicant[] = [...allOnes].map(m => ({
      minterms: [m],
      mask: 0,
      value: m,
      used: false,
    }));

    const primeImplicants: Implicant[] = [];

    // Iteratively combine implicants
    for (let round = 0; round < n; round++) {
      const nextRound: Implicant[] = [];
      const combined = new Set<string>();

      for (let i = 0; i < implicants.length; i++) {
        for (let j = i + 1; j < implicants.length; j++) {
          const a = implicants[i];
          const b = implicants[j];

          // Can combine if masks are identical and values differ by 1 bit
          if (a.mask !== b.mask) continue;
          if (!differByOneBit(a.value, b.value)) continue;

          const diffBit = 1 << diffBitPos(a.value, b.value);
          const newMask = a.mask | diffBit;
          const newValue = a.value & ~diffBit; // Clear the differing bit

          const key = `${newMask}_${newValue}`;
          if (!combined.has(key)) {
            combined.add(key);
            const newMinterms = [...new Set([...a.minterms, ...b.minterms])];
            nextRound.push({ minterms: newMinterms, mask: newMask, value: newValue, used: false });
          }

          a.used = true;
          b.used = true;
        }
      }

      // Collect prime implicants (unused ones from this round)
      for (const imp of implicants) {
        if (!imp.used) primeImplicants.push(imp);
      }

      if (nextRound.length === 0) break;
      implicants = nextRound;
    }

    // Remaining implicants (from last round) are also prime
    for (const imp of implicants) {
      if (!imp.used) primeImplicants.push(imp);
    }

    // ------------------------------------------------------------------
    // Step 2: Essential prime implicants (cover minterms not in don't cares)
    // ------------------------------------------------------------------
    const mintermSet = new Set(minterms);

    // Which prime implicants cover each minterm?
    const coverage = new Map<number, Implicant[]>();
    for (const m of minterms) coverage.set(m, []);
    for (const pi of primeImplicants) {
      for (const m of pi.minterms) {
        if (mintermSet.has(m)) coverage.get(m)?.push(pi);
      }
    }

    const selected = new Set<Implicant>();
    const coveredMinterms = new Set<number>();

    // Essential: minterms covered by exactly one prime implicant
    for (const [m, pis] of coverage) {
      if (pis.length === 1) {
        const pi = pis[0];
        if (!selected.has(pi)) {
          selected.add(pi);
          for (const cm of pi.minterms) {
            if (mintermSet.has(cm)) coveredMinterms.add(cm);
          }
        }
      }
    }

    // Greedy cover for remaining uncovered minterms
    const uncovered = minterms.filter(m => !coveredMinterms.has(m));
    if (uncovered.length > 0) {
      // Sort prime implicants by coverage count (descending)
      const remaining = primeImplicants
        .filter(pi => !selected.has(pi))
        .sort((a, b) => {
          const aCount = a.minterms.filter(m => mintermSet.has(m)).length;
          const bCount = b.minterms.filter(m => mintermSet.has(m)).length;
          return bCount - aCount;
        });

      const stillUncovered = new Set(uncovered);
      for (const pi of remaining) {
        if (stillUncovered.size === 0) break;
        const covers = pi.minterms.filter(m => stillUncovered.has(m));
        if (covers.length > 0) {
          selected.add(pi);
          for (const m of covers) stillUncovered.delete(m);
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 3: Convert selected implicants to expression terms
    // ------------------------------------------------------------------
    const groups: KMapGroup[] = [];
    const terms: string[] = [];

    for (const pi of selected) {
      const term = implicantToTerm(pi, variables);
      const groupMinterms = pi.minterms.filter(m => mintermSet.has(m));
      groups.push({ minterms: groupMinterms, implicant: term });
      terms.push(term);
    }

    const simplifiedExpression = terms.length === 0 ? '0' : terms.join(' + ');

    return {
      variableCount: n,
      variables,
      minterms,
      dontCares,
      groups,
      simplifiedExpression,
    };
  }

  /**
   * Get the K-map cell index in Gray-code order for display purposes.
   * Returns an array of { minterm, grayIndex } for rendering the K-map grid.
   */
  static getGrayOrder(varCount: number): number[] {
    if (varCount === 2) return GRAY_2;
    if (varCount === 4) return GRAY_4;
    // 3 variables: first 8 entries of 4-var gray
    return GRAY_4.slice(0, 8);
  }
}

// ---------------------------------------------------------------------------
// Convert an implicant to a product term string
// ---------------------------------------------------------------------------

function implicantToTerm(imp: Implicant, variables: string[]): string {
  const n = variables.length;
  const parts: string[] = [];

  for (let i = 0; i < n; i++) {
    const bitPos = n - 1 - i; // MSB is leftmost variable
    const bitMask = 1 << bitPos;

    if (imp.mask & bitMask) {
      // This bit is don't care in the implicant — variable eliminated
      continue;
    }

    const bitValue = (imp.value >> bitPos) & 1;
    parts.push(bitValue === 1 ? variables[i] : `${variables[i]}'`);
  }

  return parts.length === 0 ? '1' : parts.join('·');
}
