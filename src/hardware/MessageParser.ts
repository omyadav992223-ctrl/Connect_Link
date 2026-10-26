// =============================================================================
// MessageParser.ts — Ultra-robust parser for Arduino serial messages.
// Handles any key order, binary or distance in cm, L/R or F/S aliases.
// Preserves manual website switches by emitting 'X' when indicator keys are absent.
// Standardized threshold: 20 cm default, configurable between 3 cm and 100 cm.
// =============================================================================

import type { HardwareMessage, LogicValue } from '../engine/types.js';

export const DEFAULT_THRESHOLD_CM = 20;
export const MIN_VALID_DISTANCE_CM = 3;
export const MAX_VALID_DISTANCE_CM = 400;
export const NO_ECHO_DISTANCE_CM = 999;

let currentThresholdCm = DEFAULT_THRESHOLD_CM;

export function getThreshold(): number {
  return currentThresholdCm;
}

export function setThreshold(cm: number): void {
  currentThresholdCm = Math.max(MIN_VALID_DISTANCE_CM, Math.min(100, Math.round(cm)));
}

export function resetThreshold(): void {
  currentThresholdCm = DEFAULT_THRESHOLD_CM;
}

export function toBitOrDist(v: unknown, threshold = currentThresholdCm): LogicValue {
  if (v === undefined || v === null || v === '' || v === 'X') return 'X';
  const s = String(v).trim().toUpperCase();
  if (s === '1' || s === 'HIGH' || s === 'ON') return 1;
  if (s === '0' || s === 'LOW'  || s === 'OFF') return 0;
  if (['ERR', 'ERROR', 'TIMEOUT', 'INVALID', 'FAIL', 'FAULT', 'NAN'].includes(s)) return 'X';

  const num = parseFloat(s);
  if (!isNaN(num)) {
    // Negative distances are sensor fault/error codes -> fail-safe 'X' (not false clear)
    if (num < 0) return 'X';
    // 999 or greater is standard ultrasonic no-echo / open road sentinel -> clear (0)
    if (num >= NO_ECHO_DISTANCE_CM) return 0;
    // Physical distance below 3cm is sensor crosstalk / electrical glitch -> clear (0)
    if (num < MIN_VALID_DISTANCE_CM) return 0;
    // Distance <= threshold: obstacle detected in blind spot (1), otherwise clear (0)
    return num <= threshold ? 1 : 0;
  }
  return 'X';
}

export function distToBit(cm: number, threshold = currentThresholdCm): LogicValue {
  if (!isFinite(cm) || isNaN(cm) || cm < 0) return 'X';
  if (cm >= NO_ECHO_DISTANCE_CM) return 0;
  if (cm < MIN_VALID_DISTANCE_CM) return 0;
  return cm <= threshold ? 1 : 0;
}

function extractDistance(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const num = parseFloat(String(v));
  if (isFinite(num) && num >= MIN_VALID_DISTANCE_CM && num < NO_ECHO_DISTANCE_CM) {
    return Math.round(num);
  }
  return undefined;
}

export class MessageParser {
  static readonly DEFAULT_THRESHOLD_CM = DEFAULT_THRESHOLD_CM;
  static readonly MIN_VALID_DISTANCE_CM = MIN_VALID_DISTANCE_CM;
  static readonly MAX_VALID_DISTANCE_CM = MAX_VALID_DISTANCE_CM;
  static readonly NO_ECHO_DISTANCE_CM = NO_ECHO_DISTANCE_CM;

  static getThreshold(): number {
    return getThreshold();
  }

  static setThreshold(cm: number): void {
    setThreshold(cm);
  }

  static resetThreshold(): void {
    resetThreshold();
  }

  static parse(raw: string): HardwareMessage | null {
    const trimmed = raw.replace(/\r/g, '').trim();
    if (!trimmed) return null;

    // ── JSON ──────────────────────────────────────────────────────────────
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        const l  = obj['left']       ?? obj['L']  ?? obj['l'] ?? obj['front'] ?? obj['F'];
        const r  = obj['right']      ?? obj['R']  ?? obj['r'] ?? obj['side']  ?? obj['S'];
        const il = obj['leftIndicator']  ?? obj['IL'] ?? obj['il'];
        const ir = obj['rightIndicator'] ?? obj['IR'] ?? obj['ir'];
        const lc = obj['laneChange'] ?? obj['LC'] ?? obj['lc'];
        const dl = obj['leftDist']   ?? obj['distL'] ?? obj['dist_l'];
        const dr = obj['rightDist']  ?? obj['distR'] ?? obj['dist_r'];

        if (l === undefined && r === undefined) return null;
        return {
          left:           toBitOrDist(l),
          right:          toBitOrDist(r),
          leftDist:       extractDistance(dl) ?? extractDistance(l),
          rightDist:      extractDistance(dr) ?? extractDistance(r),
          leftIndicator:  il !== undefined ? toBitOrDist(il) : 'X',
          rightIndicator: ir !== undefined ? toBitOrDist(ir) : 'X',
          laneChange:     lc !== undefined ? toBitOrDist(lc) : 0,
          rawText:        trimmed,
        };
      } catch { return null; }
    }

    // ── Verbose distance text ─────────────────────────────────────────────
    const leftM  = /(?:left|front)\s*:\s*(-?\d+|ERR|ERROR|TIMEOUT|INVALID|FAULT|NAN)\s*cm/i.exec(trimmed);
    const rightM = /(?:right|side)\s*:\s*(-?\d+|ERR|ERROR|TIMEOUT|INVALID|FAULT|NAN)\s*cm/i.exec(trimmed);
    const ilM    = /IL\s*=\s*([01])/i.exec(trimmed);
    const irM    = /IR\s*=\s*([01])/i.exec(trimmed);
    const lcM    = /LC\s*=\s*([01])/i.exec(trimmed);
    if (leftM || rightM) {
      const lToken = leftM ? leftM[1] : undefined;
      const rToken = rightM ? rightM[1] : undefined;
      const parseDistToken = (tok: string | undefined): LogicValue => {
        if (tok === undefined) return 0;
        const upper = tok.trim().toUpperCase();
        if (['ERR', 'ERROR', 'TIMEOUT', 'INVALID', 'FAIL', 'FAULT', 'NAN'].includes(upper)) return 'X';
        const num = parseFloat(upper);
        if (isNaN(num) || num < 0) return 'X';
        return distToBit(num);
      };
      return {
        left:           parseDistToken(lToken),
        right:          parseDistToken(rToken),
        leftDist:       extractDistance(lToken),
        rightDist:      extractDistance(rToken),
        leftIndicator:  ilM ? toBitOrDist(ilM[1]) : 'X',
        rightIndicator: irM ? toBitOrDist(irM[1]) : 'X',
        laneChange:     lcM ? toBitOrDist(lcM[1]) : 0,
        rawText:        trimmed,
      };
    }

    // ── Key=Value CSV (handles L=1,R=0 or F=1,S=0 or L=15,R=80,DIST_L=15) ─
    if (trimmed.includes('=')) {
      const map: Record<string, string> = {};
      let leadingBareValue: string | null = null;

      const parts = trimmed.split(',');
      for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq < 0) {
          const bare = part.trim();
          if (/^\d+$/.test(bare) && leadingBareValue === null) {
            leadingBareValue = bare;
          }
          continue;
        }
        const k = part.slice(0, eq).trim().toUpperCase();
        const v = part.slice(eq + 1).trim();
        if (k) map[k] = v;
      }

      // Check for Left / Front key (or bare leading digit)
      const lVal  = map['L'] ?? map['F'] ?? map['LEFT'] ?? map['FRONT'] ?? (leadingBareValue !== null ? leadingBareValue : undefined);
      // Check for Right / Side key
      const rVal  = map['R'] ?? map['S'] ?? map['RIGHT'] ?? map['SIDE'];
      const ilVal = map['IL'] ?? map['LEFT_IND'] ?? map['LIND'];
      const irVal = map['IR'] ?? map['RIGHT_IND'] ?? map['RIND'];
      const lcVal = map['LC'] ?? map['LANE'];
      const dlVal = map['DIST_L'] ?? map['DL'] ?? map['DISTL'];
      const drVal = map['DIST_R'] ?? map['DR'] ?? map['DISTR'];

      if (lVal !== undefined || rVal !== undefined) {
        return {
          left:           toBitOrDist(lVal ?? 0),
          right:          toBitOrDist(rVal ?? 0),
          leftDist:       extractDistance(dlVal) ?? extractDistance(lVal),
          rightDist:      extractDistance(drVal) ?? extractDistance(rVal),
          leftIndicator:  ilVal !== undefined ? toBitOrDist(ilVal) : 'X',
          rightIndicator: irVal !== undefined ? toBitOrDist(irVal) : 'X',
          laneChange:     lcVal !== undefined ? toBitOrDist(lcVal) : 0,
          rawText:        trimmed,
        };
      }
    }

    return null;
  }

  static parseLatest(chunk: string): HardwareMessage | null {
    const lines = chunk.split('\n');
    let last: HardwareMessage | null = null;
    for (const line of lines) {
      const msg = MessageParser.parse(line);
      if (msg) last = msg;
    }
    return last;
  }
}
