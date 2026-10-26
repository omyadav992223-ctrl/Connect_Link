// =============================================================================
// BlindSpotPreset.ts — Blind-spot detection circuit for the car safety system.
//
// Inputs (4 total):
//   L  — Left ultrasonic sensor  (Arduino pins 7/6) — hardware-driven
//   R  — Right ultrasonic sensor (Arduino pins 5/4) — hardware-driven
//   IL — Left indicator switch   (manual canvas toggle or hardware button)
//   IR — Right indicator switch  (manual canvas toggle or hardware button)
//
// Required logic equations (per project spec):
//   W_L    = L AND IL        Left warning: obstacle on left AND left indicator ON
//   W_R    = R AND IR        Right warning: obstacle on right AND right indicator ON
//   ALERT  = L OR R          Any obstacle detected on either side
//   SAFE   = NOT(L OR R)     Both sides clear
//   BUZZER = W_L OR W_R      Ring buzzer if either directional warning fires
//
// Truth table (all 16 combinations of L, R, IL, IR):
//   IL IR L R | W_L W_R ALERT SAFE BUZZER
//    0  0  0 0 |  0   0    0    1     0   — clear, not indicating
//    0  0  1 0 |  0   0    1    0     0   — left obstacle but not indicating left
//    0  0  0 1 |  0   0    1    0     0   — right obstacle but not indicating right
//    0  0  1 1 |  0   0    1    0     0   — both obstacles, neither indicator on
//    1  0  0 0 |  0   0    0    1     0   — indicating left, lane clear
//    1  0  1 0 |  1   0    1    0     1   ← DANGER! Left obstacle + left indicator
//    1  0  0 1 |  0   0    1    0     0   — right obstacle, but indicating LEFT
//    1  0  1 1 |  1   0    1    0     1   ← DANGER! Both obstacles, left indicator
//    0  1  0 0 |  0   0    0    1     0   — indicating right, lane clear
//    0  1  1 0 |  0   0    1    0     0   — left obstacle, but indicating RIGHT
//    0  1  0 1 |  0   1    1    0     1   ← DANGER! Right obstacle + right indicator
//    0  1  1 1 |  0   1    1    0     1   ← DANGER! Both obstacles, right indicator
//    1  1  0 0 |  0   0    0    1     0   — both indicators, lane clear
//    1  1  1 0 |  1   0    1    0     1   ← DANGER! Left obstacle, both indicators
//    1  1  0 1 |  0   1    1    0     1   ← DANGER! Right obstacle, both indicators
//    1  1  1 1 |  1   1    1    0     1   ← DANGER! Both obstacles, both indicators
// =============================================================================

import type { CircuitGraph } from '../../engine/CircuitGraph.js';

/** Canvas layout — left-to-right signal flow, vertical spacing generous without overlaps. */
const POS = {
  // ── Inputs (column 1 — x=60) ─────────────────────────────────────────
  inL:   { x: 60,  y: 60  },   // Left sensor (hardware)
  inR:   { x: 60,  y: 180 },   // Right sensor (hardware)
  inIL:  { x: 60,  y: 300 },   // Left indicator (manual)
  inIR:  { x: 60,  y: 420 },   // Right indicator (manual)

  // ── Gate layer 1 (column 2 — x=240) ──────────────────────────────────
  andWL:   { x: 240, y: 80  }, // L AND IL → W_L
  orAlert: { x: 240, y: 200 }, // L OR R → ALERT
  andWR:   { x: 240, y: 340 }, // R AND IR → W_R

  // ── Gate layer 2 (column 3 — x=400) ──────────────────────────────────
  orBuzzer: { x: 400, y: 140 }, // W_L OR W_R → BUZZER
  notSafe:  { x: 400, y: 260 }, // NOT(ALERT) → SAFE

  // ── Outputs (column 4 — x=560) ────────────────────────────────────────
  ledWL:    { x: 560, y: 80  }, // W_L LED
  buzzer:   { x: 560, y: 160 }, // BUZZER
  ledAlert: { x: 560, y: 240 }, // ALERT LED
  ledSafe:  { x: 560, y: 320 }, // SAFE LED
  ledWR:    { x: 560, y: 400 }, // W_R LED
};

export function loadBlindSpotPreset(graph: CircuitGraph): void {
  graph.clear();

  // ------------------------------------------------------------------
  // Source inputs
  // ------------------------------------------------------------------
  const inL  = graph.addComponent('INPUT', POS.inL,  'L');    // Left sensor (hardware)
  const inR  = graph.addComponent('INPUT', POS.inR,  'R');    // Right sensor (hardware)
  const inIL = graph.addComponent('INPUT', POS.inIL, 'IL');   // Left indicator (manual)
  const inIR = graph.addComponent('INPUT', POS.inIR, 'IR');   // Right indicator (manual)

  // ------------------------------------------------------------------
  // Gate layer 1 — directional warnings and alert
  //   W_L    = L AND IL
  //   W_R    = R AND IR
  //   ALERT  = L OR R
  // ------------------------------------------------------------------
  const andWL   = graph.addComponent('AND', POS.andWL,   'AND_WL');    // W_L gate
  const andWR   = graph.addComponent('AND', POS.andWR,   'AND_WR');    // W_R gate
  const orAlert = graph.addComponent('OR',  POS.orAlert, 'OR_ALERT'); // ALERT gate

  // ------------------------------------------------------------------
  // Gate layer 2 — safe signal and buzzer
  //   SAFE   = NOT(L OR R)
  //   BUZZER = W_L OR W_R
  // ------------------------------------------------------------------
  const notSafe  = graph.addComponent('NOT', POS.notSafe,  'NOT_SAFE');  // SAFE inverter
  const orBuzzer = graph.addComponent('OR',  POS.orBuzzer, 'OR_BUZZ');   // BUZZER gate

  // ------------------------------------------------------------------
  // Output indicators
  // ------------------------------------------------------------------
  const ledWL    = graph.addComponent('LED',    POS.ledWL,    'W_L');    // Left warning
  const ledWR    = graph.addComponent('LED',    POS.ledWR,    'W_R');    // Right warning
  const ledAlert = graph.addComponent('LED',    POS.ledAlert, 'ALERT');  // Any obstacle
  const ledSafe  = graph.addComponent('LED',    POS.ledSafe,  'SAFE');   // Both sides clear
  const buzzer   = graph.addComponent('BUZZER', POS.buzzer,   'BUZZER'); // Physical buzzer

  // ------------------------------------------------------------------
  // Wires — W_L = L AND IL
  // ------------------------------------------------------------------
  graph.addWire(inL.id,  'out', andWL.id, 'in_A');
  graph.addWire(inIL.id, 'out', andWL.id, 'in_B');

  // W_R = R AND IR
  graph.addWire(inR.id,  'out', andWR.id, 'in_A');
  graph.addWire(inIR.id, 'out', andWR.id, 'in_B');

  // ALERT = L OR R
  graph.addWire(inL.id, 'out', orAlert.id, 'in_A');
  graph.addWire(inR.id, 'out', orAlert.id, 'in_B');

  // SAFE = NOT(ALERT)
  graph.addWire(orAlert.id, 'out_Y', notSafe.id, 'in_A');

  // BUZZER = W_L OR W_R
  graph.addWire(andWL.id, 'out_Y', orBuzzer.id, 'in_A');
  graph.addWire(andWR.id, 'out_Y', orBuzzer.id, 'in_B');

  // ------------------------------------------------------------------
  // Output wiring
  // ------------------------------------------------------------------
  graph.addWire(andWL.id,   'out_Y', ledWL.id,    'in');  // W_L → W_L LED
  graph.addWire(andWR.id,   'out_Y', ledWR.id,    'in');  // W_R → W_R LED
  graph.addWire(orAlert.id, 'out_Y', ledAlert.id, 'in');  // ALERT → ALERT LED
  graph.addWire(notSafe.id, 'out_Y', ledSafe.id,  'in');  // SAFE → SAFE LED  (note: SAFE=1 when NOT_ALERT=1)
  graph.addWire(orBuzzer.id,'out_Y', buzzer.id,   'in');  // BUZZER gate → physical buzzer
}
