// =============================================================================
// parser.test.ts — MessageParser coverage for blind-spot detection system.
//
// Channels: L (left sensor), R (right sensor), LC (lane-change button)
// Formats: binary CSV, JSON, verbose distance text
// =============================================================================

import { describe, it, expect } from 'vitest';
import { MessageParser } from '../../src/hardware/MessageParser.js';

// ---------------------------------------------------------------------------
// Format 1: Binary CSV "L=1,R=0,LC=1"
// ---------------------------------------------------------------------------
describe('MessageParser — binary CSV format', () => {
  it('parses L=1,R=0,LC=1', () => {
    const msg = MessageParser.parse('L=1,R=0,LC=1');
    expect(msg).not.toBeNull();
    expect(msg!.left).toBe(1);
    expect(msg!.right).toBe(0);
    expect(msg!.laneChange).toBe(1);
  });

  it('parses L=0,R=1,LC=0', () => {
    const msg = MessageParser.parse('L=0,R=1,LC=0');
    expect(msg!.left).toBe(0);
    expect(msg!.right).toBe(1);
    expect(msg!.laneChange).toBe(0);
  });

  it('parses with trailing newline', () => {
    const msg = MessageParser.parse('L=1,R=0,LC=1\n');
    expect(msg).not.toBeNull();
    expect(msg!.left).toBe(1);
  });

  it('parses lowercase keys l=0,r=1,lc=0', () => {
    const msg = MessageParser.parse('l=0,r=1,lc=0');
    expect(msg!.left).toBe(0);
    expect(msg!.right).toBe(1);
    expect(msg!.laneChange).toBe(0);
  });

  it('defaults LC to 0 when missing', () => {
    const msg = MessageParser.parse('L=1,R=0');
    expect(msg).not.toBeNull();
    expect(msg!.left).toBe(1);
    expect(msg!.right).toBe(0);
    expect(msg!.laneChange).toBe(0);
  });

  it('returns null for empty string', () => {
    expect(MessageParser.parse('')).toBeNull();
  });

  it('returns null for garbage text', () => {
    expect(MessageParser.parse('hello world')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Format 2: JSON
// ---------------------------------------------------------------------------
describe('MessageParser — JSON format', () => {
  it('parses {"left":1,"right":0,"laneChange":1}', () => {
    const msg = MessageParser.parse('{"left":1,"right":0,"laneChange":1}');
    expect(msg!.left).toBe(1);
    expect(msg!.right).toBe(0);
    expect(msg!.laneChange).toBe(1);
  });

  it('parses capital alias keys {"L":0,"R":1,"LC":0}', () => {
    const msg = MessageParser.parse('{"L":0,"R":1,"LC":0}');
    expect(msg!.left).toBe(0);
    expect(msg!.right).toBe(1);
    expect(msg!.laneChange).toBe(0);
  });

  it('returns null for invalid JSON', () => {
    expect(MessageParser.parse('{bad json}')).toBeNull();
  });

  it('returns null for JSON with no sensor keys', () => {
    expect(MessageParser.parse('{"x":1,"y":0}')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Format 3: Verbose distance text "Left: 15 cm  Right: 30 cm"
// ---------------------------------------------------------------------------
describe('MessageParser — verbose distance format', () => {
  it('detects car in left blind spot (≤ 20 cm)', () => {
    const msg = MessageParser.parse('Left: 15 cm  Right: 50 cm');
    expect(msg!.left).toBe(1);   // 15 ≤ 20 → detected
    expect(msg!.right).toBe(0);  // 50 > 20 → clear
    expect(msg!.laneChange).toBe(0);
  });

  it('detects car in right blind spot (≤ 20 cm)', () => {
    const msg = MessageParser.parse('Left: 80 cm  Right: 12 cm');
    expect(msg!.left).toBe(0);
    expect(msg!.right).toBe(1);
  });

  it('both sides clear (> 20 cm)', () => {
    const msg = MessageParser.parse('Left: 100 cm  Right: 80 cm');
    expect(msg!.left).toBe(0);
    expect(msg!.right).toBe(0);
  });

  it('boundary exactly at 20 cm → detected', () => {
    const msg = MessageParser.parse('Left: 20 cm  Right: 21 cm');
    expect(msg!.left).toBe(1);
    expect(msg!.right).toBe(0);
  });

  it('treats 999 cm (no echo) as clear', () => {
    const msg = MessageParser.parse('Left: 999 cm  Right: 999 cm');
    expect(msg!.left).toBe(0);
    expect(msg!.right).toBe(0);
  });

  it('parses LC=1 appended to distance string', () => {
    const msg = MessageParser.parse('Left: 10 cm  Right: 50 cm  LC=1');
    expect(msg!.left).toBe(1);
    expect(msg!.right).toBe(0);
    expect(msg!.laneChange).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// All 8 binary combinations for L, R
// ---------------------------------------------------------------------------
describe('MessageParser — all L/R/LC combinations', () => {
  it.each([
    ['L=0,R=0,LC=0', 0, 0, 0],
    ['L=0,R=0,LC=1', 0, 0, 1],
    ['L=0,R=1,LC=0', 0, 1, 0],
    ['L=0,R=1,LC=1', 0, 1, 1],
    ['L=1,R=0,LC=0', 1, 0, 0],
    ['L=1,R=0,LC=1', 1, 0, 1],
    ['L=1,R=1,LC=0', 1, 1, 0],
    ['L=1,R=1,LC=1', 1, 1, 1],
  ])('%s', (raw, l, r, lc) => {
    const msg = MessageParser.parse(raw);
    expect(msg).not.toBeNull();
    expect(msg!.left).toBe(l);
    expect(msg!.right).toBe(r);
    expect(msg!.laneChange).toBe(lc);
  });
});

// ---------------------------------------------------------------------------
// Format 4: Directional Indicators IL, IR
// ---------------------------------------------------------------------------
describe('MessageParser — IL and IR indicators', () => {
  it('parses L=1,R=0,IL=1,IR=0', () => {
    const msg = MessageParser.parse('L=1,R=0,IL=1,IR=0');
    expect(msg).not.toBeNull();
    expect(msg!.left).toBe(1);
    expect(msg!.right).toBe(0);
    expect(msg!.leftIndicator).toBe(1);
    expect(msg!.rightIndicator).toBe(0);
  });

  it('parses JSON with IL and IR', () => {
    const msg = MessageParser.parse('{"L":0,"R":1,"IL":0,"IR":1}');
    expect(msg).not.toBeNull();
    expect(msg!.left).toBe(0);
    expect(msg!.right).toBe(1);
    expect(msg!.leftIndicator).toBe(0);
    expect(msg!.rightIndicator).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Format 5: Live Distance Telemetry, Standard 20 cm Threshold & Boundary Tests
// ---------------------------------------------------------------------------
describe('MessageParser — Distance telemetry, 20 cm threshold & boundary conditions', () => {
  it('parses DIST_L and DIST_R from CSV', () => {
    const msg = MessageParser.parse('L=1,R=0,DIST_L=14,DIST_R=42');
    expect(msg).not.toBeNull();
    expect(msg!.left).toBe(1);
    expect(msg!.right).toBe(0);
    expect(msg!.leftDist).toBe(14);
    expect(msg!.rightDist).toBe(42);
  });

  it('standardizes on 20 cm default threshold', () => {
    expect(MessageParser.DEFAULT_THRESHOLD_CM).toBe(20);
    expect(MessageParser.getThreshold()).toBe(20);
  });

  it('evaluates distance below threshold (< 20 cm) as obstacle detected (1)', () => {
    MessageParser.resetThreshold();
    const msg1 = MessageParser.parse('L=3,R=19');
    expect(msg1!.left).toBe(1);  // 3 cm >= 3 and <= 20
    expect(msg1!.right).toBe(1); // 19 cm <= 20

    const msg2 = MessageParser.parse('Left: 10 cm  Right: 15 cm');
    expect(msg2!.left).toBe(1);
    expect(msg2!.right).toBe(1);

    const msg3 = MessageParser.parse('{"L": 5, "R": 18}');
    expect(msg3!.left).toBe(1);
    expect(msg3!.right).toBe(1);
  });

  it('evaluates distance exactly at threshold (20 cm) as obstacle detected (1) for both sensors', () => {
    MessageParser.resetThreshold();
    const msgCSV = MessageParser.parse('L=20,R=20');
    expect(msgCSV!.left).toBe(1);
    expect(msgCSV!.right).toBe(1);

    const msgText = MessageParser.parse('Left: 20 cm  Right: 20 cm');
    expect(msgText!.left).toBe(1);
    expect(msgText!.right).toBe(1);

    const msgJSON = MessageParser.parse('{"left": 20, "right": 20}');
    expect(msgJSON!.left).toBe(1);
    expect(msgJSON!.right).toBe(1);
  });

  it('evaluates distance above threshold (> 20 cm) as clear (0)', () => {
    MessageParser.resetThreshold();
    const msgCSV = MessageParser.parse('L=21,R=50');
    expect(msgCSV!.left).toBe(0);
    expect(msgCSV!.right).toBe(0);

    const msgText = MessageParser.parse('Left: 21 cm  Right: 100 cm');
    expect(msgText!.left).toBe(0);
    expect(msgText!.right).toBe(0);
  });

  it('evaluates no-echo reading (999 cm) as clear (0)', () => {
    MessageParser.resetThreshold();
    const msg = MessageParser.parse('L=999,R=999');
    expect(msg!.left).toBe(0);
    expect(msg!.right).toBe(0);

    const msgText = MessageParser.parse('Left: 999 cm  Right: 999 cm');
    expect(msgText!.left).toBe(0);
    expect(msgText!.right).toBe(0);
  });

  it('evaluates sub-3cm crosstalk glitches (< 3 cm) as clear (0)', () => {
    MessageParser.resetThreshold();
    const msg = MessageParser.parse('L=1,R=2'); // Raw numbers 1 and 2 in distance context are below 3cm
    // Note: '1' is handled as binary 1 for L, but in verbose text:
    const msgText = MessageParser.parse('Left: 2 cm  Right: 1 cm');
    expect(msgText!.left).toBe(0);
    expect(msgText!.right).toBe(0);
  });

  it('fails safely on invalid/negative readings (returns X instead of false clear)', () => {
    MessageParser.resetThreshold();
    // Negative distance indicates sensor error/timeout -> X
    const msgNeg = MessageParser.parse('L=-1,R=20');
    expect(msgNeg!.left).toBe('X');
    expect(msgNeg!.right).toBe(1);

    const msgNegBoth = MessageParser.parse('L=-5,R=-1');
    expect(msgNegBoth!.left).toBe('X');
    expect(msgNegBoth!.right).toBe('X');

    // Text error tokens
    const msgErr = MessageParser.parse('L=ERR,R=15');
    expect(msgErr!.left).toBe('X');
    expect(msgErr!.right).toBe(1);

    const msgTimeout = MessageParser.parse('Left: TIMEOUT cm  Right: 10 cm');
    expect(msgTimeout!.left).toBe('X');
    expect(msgTimeout!.right).toBe(1);

    const msgJsonFault = MessageParser.parse('{"left": "FAULT", "right": -1}');
    expect(msgJsonFault!.left).toBe('X');
    expect(msgJsonFault!.right).toBe('X');
  });

  it('respects dynamically changed threshold and resetThreshold()', () => {
    MessageParser.setThreshold(30);
    expect(MessageParser.getThreshold()).toBe(30);

    const msg = MessageParser.parse('Left: 25 cm  Right: 35 cm');
    expect(msg!.left).toBe(1);  // 25 <= 30
    expect(msg!.right).toBe(0); // 35 > 30

    // Reset back to standard 20 cm
    MessageParser.resetThreshold();
    expect(MessageParser.getThreshold()).toBe(20);

    const msg2 = MessageParser.parse('Left: 25 cm  Right: 35 cm');
    expect(msg2!.left).toBe(0); // 25 > 20
    expect(msg2!.right).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseLatest
// ---------------------------------------------------------------------------
describe('MessageParser — parseLatest', () => {
  it('returns last valid message from multi-line chunk', () => {
    const chunk = 'L=0,R=0,LC=0\nL=1,R=0,LC=0\nL=1,R=1,LC=1\n';
    const msg = MessageParser.parseLatest(chunk);
    expect(msg!.left).toBe(1);
    expect(msg!.right).toBe(1);
    expect(msg!.laneChange).toBe(1);
  });

  it('ignores invalid lines, returns last valid', () => {
    const chunk = 'READY\nL=0,R=1,LC=0\nBAD_LINE\n';
    const msg = MessageParser.parseLatest(chunk);
    expect(msg!.right).toBe(1);
    expect(msg!.left).toBe(0);
  });
});
