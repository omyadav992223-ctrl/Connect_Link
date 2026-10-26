// =============================================================================
// Smart Blind-Spot Warning System — Arduino Sketch
// =============================================================================
//
// Hardware connections:
//   Pin 2 — Left IR sensor digital output  (HIGH = detected)
//   Pin 3 — Right IR sensor digital output (HIGH = detected)
//   Pin 4 — Lane change switch/button      (HIGH = lane change active)
//   Pin 13 — Built-in LED (blinks when critical warning active)
//
// NOTE: Most IR obstacle sensors are ACTIVE-LOW (output LOW when object
// detected). If your sensor is active-low, set SENSOR_ACTIVE_LOW = true.
//
// Serial output format (9600 baud, sent every 100ms):
//   L=1,R=0,LC=1
//
// =============================================================================

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const int LEFT_SENSOR_PIN   = 2;
const int RIGHT_SENSOR_PIN  = 3;
const int LANE_CHANGE_PIN   = 4;
const int STATUS_LED_PIN    = 13;

// Set to true if your IR sensors output LOW when detecting an object.
// Most common IR obstacle modules (FC-51, HW-201) are active-low.
const bool SENSOR_ACTIVE_LOW = true;

// Transmission interval in milliseconds
const int SEND_INTERVAL_MS = 100;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

unsigned long lastSendTime = 0;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

void setup() {
  Serial.begin(9600);
  while (!Serial) { ; }  // Wait for serial port to connect (Leonardo/Micro)

  pinMode(LEFT_SENSOR_PIN,  INPUT);
  pinMode(RIGHT_SENSOR_PIN, INPUT);
  pinMode(LANE_CHANGE_PIN,  INPUT_PULLUP); // Use internal pull-up for button
  pinMode(STATUS_LED_PIN,   OUTPUT);

  Serial.println("READY");
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

void loop() {
  // Handle incoming commands from the web app
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "PING") {
      Serial.println("PONG");
    }
  }

  // Send sensor data at regular interval
  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;

    // Read raw sensor values
    int rawLeft  = digitalRead(LEFT_SENSOR_PIN);
    int rawRight = digitalRead(RIGHT_SENSOR_PIN);
    int rawLC    = digitalRead(LANE_CHANGE_PIN);

    // Convert to logic HIGH = detected
    int L  = SENSOR_ACTIVE_LOW ? (rawLeft  == LOW ? 1 : 0) : rawLeft;
    int R  = SENSOR_ACTIVE_LOW ? (rawRight == LOW ? 1 : 0) : rawRight;
    // Lane change button: INPUT_PULLUP means LOW when pressed
    int LC = (rawLC == LOW) ? 1 : 0;

    // Send CSV line
    Serial.print("L=");  Serial.print(L);
    Serial.print(",R="); Serial.print(R);
    Serial.print(",LC="); Serial.println(LC);

    // Blink status LED if critical warning (L=1, R=1, LC=1)
    if (L == 1 && R == 1 && LC == 1) {
      digitalWrite(STATUS_LED_PIN, (now / 200) % 2 == 0 ? HIGH : LOW);
    } else {
      digitalWrite(STATUS_LED_PIN, LOW);
    }
  }
}
