# 📂 circuits/ — Exported Logic Circuit Files

This folder contains the digital logic circuit files for the **Blind-Spot Detection System** project.
These files can be imported directly into the website at `http://localhost:3000`.

---

## Files

| File | Description |
|---|---|
| `blind_spot_detection.json` | Full logical circuit for the blind-spot detection system |

---

## How to Import

1. Open `http://localhost:3000` in **Chrome or Edge**
2. Click the **Import / Load** button in the toolbar (or use the File menu)
3. Select `blind_spot_detection.json` from this folder
4. The circuit loads instantly on the canvas — ready to simulate or connect to Arduino

---

## Circuit Logic Explained

### Inputs
| Label | Represents | Source |
|---|---|---|
| **L** | Left ultrasonic sensor — `1` if distance $\le 20\text{ cm}$, else `0` | Arduino Pins 7 (TRIG) / 6 (ECHO) |
| **R** | Right ultrasonic sensor — `1` if distance $\le 20\text{ cm}$, else `0` | Arduino Pins 5 (TRIG) / 4 (ECHO) |
| **IL** | Left vehicle turn indicator switch — `1` when active | Interactive Web Canvas Toggle |
| **IR** | Right vehicle turn indicator switch — `1` when active | Interactive Web Canvas Toggle |

### Gates
| Gate | Function | Description |
|---|---|---|
| **AND_WL** | `L AND IL` | Left critical warning: obstacle on left AND left indicator active |
| **AND_WR** | `R AND IR` | Right critical warning: obstacle on right AND right indicator active |
| **OR_ALERT** | `L OR R` | General alert: obstacle detected on either side |
| **NOT_SAFE** | `NOT(L OR R)` | Safe state: both blind spots completely clear |
| **OR_BUZZ** | `W_L OR W_R` | Buzzer trigger: rings when an obstacle is present on the turn-indicated side |

### Outputs
| Label | Trigger Condition | Function |
|---|---|---|
| **W_L** | $L \land IL = 1$ | Left hazard LED indicator |
| **W_R** | $R \land IR = 1$ | Right hazard LED indicator |
| **ALERT** | $L \lor R = 1$ | General blind-spot obstacle alert LED |
| **SAFE** | $\neg(L \lor R) = 1$ | Clear lane safety LED |
| **BUZZER** | $W_L \lor W_R = 1$ | Sends `BUZZ=1` command to physical buzzer on Arduino Pin 11 |

### Boolean Expressions
```
W_L    = L · IL
W_R    = R · IR
ALERT  = L + R
SAFE   = (L + R)'
BUZZER = W_L + W_R = (L · IL) + (R · IR)
```

### Truth Table (All 16 Combinations)
| IL | IR | L | R | W_L | W_R | ALERT | SAFE | BUZZER | Description |
|:--:|:--:|:-:|:-:|:---:|:---:|:-----:|:----:|:------:|:---|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | All clear, no indicators |
| 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | Right obstacle, not turning right |
| 0 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | Left obstacle, not turning left |
| 0 | 0 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | Both obstacles, no turn indicated |
| 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | Indicating right, lane clear |
| 0 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | **DANGER**: Right obstacle + right indicator |
| 0 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | Left obstacle, indicating right |
| 0 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 1 | **DANGER**: Both obstacles, indicating right |
| 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | Indicating left, lane clear |
| 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | Right obstacle, indicating left |
| 1 | 0 | 1 | 0 | 1 | 0 | 1 | 0 | 1 | **DANGER**: Left obstacle + left indicator |
| 1 | 0 | 1 | 1 | 1 | 0 | 1 | 0 | 1 | **DANGER**: Both obstacles, indicating left |
| 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | Hazard lights on, lane clear |
| 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | **DANGER**: Right obstacle + hazard/indicators |
| 1 | 1 | 1 | 0 | 1 | 0 | 1 | 0 | 1 | **DANGER**: Left obstacle + hazard/indicators |
| 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | **DANGER**: Both obstacles + hazard/indicators |

---

## Hardware Connection

When the Arduino is connected (Hardware Mode):
- **L** input is driven by the **Left HC-SR04** sensor (TRIG: Pin 7, ECHO: Pin 6)
- **R** input is driven by the **Right HC-SR04** sensor (TRIG: Pin 5, ECHO: Pin 4)
- **IL** and **IR** are toggled manually on the web canvas UI
- **BUZZER** is controlled by the circuit: when $W_L \lor W_R = 1$, the website transmits `BUZZ=1\n` to drive the buzzer on **Pin 11**

Flash `BlindSpotDetector.ino` to the Arduino, then connect via the Hardware tab on the website.
