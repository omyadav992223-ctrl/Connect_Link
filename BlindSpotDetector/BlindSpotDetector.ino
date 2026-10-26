// =============================================================================
// BlindSpotDetector.ino — Live Arduino Code for Project Presentation
//
// Hardware Wiring:
//   Left  Sensor: TRIG -> Pin 7 | ECHO -> Pin 6
//   Right Sensor: TRIG -> Pin 5 | ECHO -> Pin 4
//   Buzzer:       (+)  -> Pin 11 | (-)  -> GND
//   All VCC -> 5V, All GND -> GND
//
// Protocol (9600 baud):
//   Telemetry Out: "L=<0|1>,R=<0|1>,DIST_L=<cm>,DIST_R=<cm>\n"
//   Command In:    "BUZZ=1\n"    -> ring buzzer (with 600ms watchdog)
//                  "BUZZ=0\n"    -> silence buzzer
//                  "THRESH=<cm>\n"-> dynamically update obstacle distance
//                  "PING\n"      -> returns "PONG\n"
// =============================================================================

const int LEFT_TRIG  = 7;
const int LEFT_ECHO  = 6;
const int RIGHT_TRIG = 5;
const int RIGHT_ECHO = 4;
const int BUZZER_PIN = 11;

// Obstacle threshold in centimeters (tabletop prototype range: 3cm to 20cm default)
const int MIN_DIST_CM = 3;
int MAX_DIST_CM = 20;

int webBuzz = 0;
unsigned long lastSerialCmdTime = 0;
const unsigned long SERIAL_TIMEOUT_MS = 600; // fail-safe auto silence

String serialInput = "";

long measureDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 25000); // 25ms timeout (~425cm max)

  // 0 means no echo (infinite open space) -> clear
  if (duration <= 0) return 999;

  long cm = duration * 0.0343 / 2;

  // Anything under 3cm is sensor crosstalk / electrical glitch -> clear
  if (cm < 3 || cm > 400) return 999;

  return cm;
}

void setup() {
  pinMode(LEFT_TRIG,  OUTPUT);
  pinMode(LEFT_ECHO,  INPUT);
  pinMode(RIGHT_TRIG, OUTPUT);
  pinMode(RIGHT_ECHO, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.begin(9600); // Matches website baud rate
}

void loop() {
  // 1. Measure both sensors
  long leftDist  = measureDistance(LEFT_TRIG,  LEFT_ECHO);
  delay(30); // Prevent ultrasonic interference between sensors
  long rightDist = measureDistance(RIGHT_TRIG, RIGHT_ECHO);

  // 2. Logic: 1 if obstacle between MIN_DIST_CM and MAX_DIST_CM, 0 otherwise
  int L = (leftDist  >= MIN_DIST_CM && leftDist  <= MAX_DIST_CM) ? 1 : 0;
  int R = (rightDist >= MIN_DIST_CM && rightDist <= MAX_DIST_CM) ? 1 : 0;

  // 3. Read any feedback command from website
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      serialInput.trim();
      if (serialInput == "BUZZ=1") {
        webBuzz = 1;
        lastSerialCmdTime = millis();
      } else if (serialInput == "BUZZ=0") {
        webBuzz = 0;
      } else if (serialInput.startsWith("THRESH=")) {
        int t = serialInput.substring(7).toInt();
        if (t >= 5 && t <= 100) {
          MAX_DIST_CM = t;
        }
      } else if (serialInput == "PING") {
        Serial.println("PONG");
      }
      serialInput = "";
    } else {
      serialInput += c;
    }
  }

  // 4. Fail-safe watchdog: auto-silence buzzer if connection is lost
  if (webBuzz == 1 && (millis() - lastSerialCmdTime > SERIAL_TIMEOUT_MS)) {
    webBuzz = 0;
  }

  // 5. Buzzer controlled ONLY by the website logic circuit output.
  if (webBuzz == 1) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }

  // 6. Send sensor signals and live measured distance to website circuit
  Serial.print("L=");
  Serial.print(L);
  Serial.print(",R=");
  Serial.print(R);
  Serial.print(",DIST_L=");
  Serial.print(leftDist);
  Serial.print(",DIST_R=");
  Serial.println(rightDist);

  delay(70); // ~10 updates per second
}
