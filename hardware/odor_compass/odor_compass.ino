#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ========================================================================================
// IR VIKRANT - HIGH-ACCURACY 360° ODOR COMPASS & QUADRUPED CHEMOTAXIS FIRMWARE
// ========================================================================================
//
// HARDWARE ORIENTATION & WIRING:
//   • FRONT      : MQ-3   -> Analog A0  (Alcohol / Narcotics / Solvent Vapors)
//   • RIGHT      : MQ-2   -> Analog A1  (Combustible Gas / Smoke / LPG)
//   • REAR       : MQ-135 -> Analog A2  (Air Quality / Hazardous Precursors / NH3)
//   • LEFT       : MQ-5   -> Analog A3  (Natural Gas / Methane / LPG)
//   • FRONT DIST : HC-SR04 Ultrasonic Rangefinder
//                  TRIG   -> Digital 6
//                  ECHO   -> Digital 7
//   • OLED 0.96" : SSD1306 128x64 I2C (Address 0x3C)
//                  SDA    -> Analog A4
//                  SCL    -> Analog A5
//   • SERIAL     : 115200 Baud (High-Speed Real-Time Telemetry to IR Vikrant Dashboard)
//
// ACCURACY & SIGNAL INTEGRITY ENHANCEMENTS:
//   1. Anti-Crosstalk ADC Sampling: Discards multiplexer sample-and-hold charge before reads.
//   2. 16-Sample Trimmed-Mean Filter: Rejects electrical noise and heater coil ripple spikes.
//   3. Exponential Moving Average (EMA): Stable 0.1 ADC precision with <150ms plume response.
//   4. 3-Ping Median Ultrasonic Rangefinder: Rejects acoustic dropouts and stray echo artifacts.
//   5. 2D Vector Plume Decomposition: Real-time bearing angle (-180° to +180°) and magnitude.
//   6. Front Obstacle Avoidance: Emergency stop hold if front distance < 30 cm.
//   7. Multi-Mode OLED HUD: Cute eye animation, 360° Compass Radar Dial, and 4-Direction Grid.
//
// BASELINES & 10% THRESHOLDS:
//   • MQ-3   (FRONT) : Baseline = 25.8  | Threshold = 29.0
//   • MQ-2   (RIGHT) : Baseline = 40.6  | Threshold = 45.0
//   • MQ-135 (REAR)  : Baseline = 48.6  | Threshold = 54.0
//   • MQ-5   (LEFT)  : Baseline = 495.6 | Threshold = 546.0
// ========================================================================================

// -----------------------------------------------------
// OLED DISPLAY SETUP
// -----------------------------------------------------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool oledReady = false;

// -----------------------------------------------------
// PIN DEFINITIONS
// -----------------------------------------------------
#define MQ3_PIN_FRONT    A0  // FRONT
#define MQ2_PIN_RIGHT    A1  // RIGHT
#define MQ135_PIN_REAR   A2  // REAR
#define MQ5_PIN_LEFT     A3  // LEFT

#define TRIG_PIN_FRONT   6   // HC-SR04 TRIG (FRONT)
#define ECHO_PIN_FRONT   7   // HC-SR04 ECHO (FRONT)

// Sensor Side Labels
const char* MQ3_SIDE_NAME   = "FRONT";
const char* MQ2_SIDE_NAME   = "RIGHT";
const char* MQ135_SIDE_NAME = "REAR";
const char* MQ5_SIDE_NAME   = "LEFT";

// -----------------------------------------------------
// CALIBRATED CLEAN-AIR BASELINES & THRESHOLDS (+10%)
// -----------------------------------------------------
float MQ3_BASELINE_FRONT    = 25.8f;
float MQ2_BASELINE_RIGHT    = 40.6f;
float MQ135_BASELINE_REAR   = 48.6f;
float MQ5_BASELINE_LEFT     = 495.6f;

float MQ3_THRESHOLD_FRONT   = 29.0f;
float MQ2_THRESHOLD_RIGHT   = 45.0f;
float MQ135_THRESHOLD_REAR  = 54.0f;
float MQ5_THRESHOLD_LEFT    = 546.0f;

const float SPIKE_THRESHOLD_PERCENT = 10.0f; // Sudden upward rise threshold

// -----------------------------------------------------
// FILTERED SENSOR READINGS & TELEMETRY
// -----------------------------------------------------
int mq3RawFront = 0;
int mq2RawRight = 0;
int mq135RawRear = 0;
int mq5RawLeft = 0;

float mq3FilteredFront = 25.8f;
float mq2FilteredRight = 40.6f;
float mq135FilteredRear = 48.6f;
float mq5FilteredLeft = 495.6f;

float mq3PercentFront = 0.0f;
float mq2PercentRight = 0.0f;
float mq135PercentRear = 0.0f;
float mq5PercentLeft = 0.0f;

// Detection Flags
bool mq3DetectedFront = false;
bool mq2DetectedRight = false;
bool mq135DetectedRear = false;
bool mq5DetectedLeft = false;

bool gasDetected = false;

bool mq3NewEvent = false;
bool mq2NewEvent = false;
bool mq135NewEvent = false;
bool mq5NewEvent = false;

int previousMq3 = 0;
int previousMq2 = 0;
int previousMq135 = 0;
int previousMq5 = 0;
bool previousReadingsReady = false;

bool previousMq3Detected = false;
bool previousMq2Detected = false;
bool previousMq135Detected = false;
bool previousMq5Detected = false;

// -----------------------------------------------------
// 2D CHEMOTAXIS VECTOR & ULTRASONIC STATE
// -----------------------------------------------------
float plumeBearingDeg = 0.0f;   // -180.0° to +180.0°
float plumeMagnitude = 0.0f;    // Vector excitation %
String robotAction = "IDLE";    // FORWARD, TURN_RIGHT, TURN_LEFT, TURN_REVERSE, OBSTACLE_HOLD
float frontDistanceCM = -1.0f;  // Ultrasonic distance directly in front

// -----------------------------------------------------
// LOOP TIMING & OLED ROTATION
// -----------------------------------------------------
const unsigned long SENSOR_UPDATE_TIME = 100UL; // 10Hz sampling
const unsigned long OLED_PAGE_TIME = 2500UL;     // 2.5s page rotation
const unsigned long GAS_ALERT_HOLD_TIME = 2000UL; // Priority screen hold

unsigned long lastSensorUpdate = 0;
unsigned long lastPageChange = 0;
unsigned long gasAlertUntil = 0;
unsigned long eyeAnimationStart = 0;

// Pages:
// 0 = Cute Animated Eyes (Active Sniffing / Calm Air)
// 1 = 360° Odor Compass Radar HUD
// 2 = 4-Direction Grid (All sensors at a glance)
// 3 = Front Pod (MQ-3 Narcotics + Ultrasonic Rangefinder)
byte currentPage = 0;

// ========================================================================================
// HIGH-ACCURACY ADC SAMPLING (Anti-Crosstalk & Outlier Rejection)
// ========================================================================================
int readSensorAccurate(uint8_t pin) {
  // Step 1: Discard first read after switching ADC multiplexer channel
  analogRead(pin);
  delayMicroseconds(60);

  // Step 2: Sample 16 consecutive readings
  const uint8_t TOTAL_SAMPLES = 16;
  int samples[TOTAL_SAMPLES];
  for (uint8_t i = 0; i < TOTAL_SAMPLES; i++) {
    samples[i] = analogRead(pin);
    delayMicroseconds(35);
  }

  // Step 3: Sort samples (Insertion Sort)
  for (uint8_t i = 1; i < TOTAL_SAMPLES; i++) {
    int key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) {
      samples[j + 1] = samples[j];
      j--;
    }
    samples[j + 1] = key;
  }

  // Step 4: Trimmed Mean (discard 4 lowest and 4 highest outliers, average middle 8)
  long sum = 0;
  for (uint8_t i = 4; i < 12; i++) {
    sum += samples[i];
  }
  return (int)(sum / 8);
}

// ========================================================================================
// 3-PING MEDIAN ULTRASONIC RANGEFINDER (HC-SR04 in FRONT)
// ========================================================================================
float readUltrasonicAccurate() {
  float pings[3];
  uint8_t validCount = 0;

  for (uint8_t i = 0; i < 3; i++) {
    digitalWrite(TRIG_PIN_FRONT, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN_FRONT, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN_FRONT, LOW);

    // 25ms timeout corresponds to ~4.3 meters
    unsigned long duration = pulseIn(ECHO_PIN_FRONT, HIGH, 25000UL);
    if (duration > 115 && duration < 24000UL) {
      float cm = (duration * 0.0343f) / 2.0f;
      if (cm >= 2.0f && cm <= 400.0f) {
        pings[validCount++] = cm;
      }
    }
    if (i < 2) delay(8); // Acoustic dissipation delay between pings
  }

  if (validCount == 0) return -1.0f;
  if (validCount == 1) return pings[0];
  if (validCount == 2) return (pings[0] + pings[1]) / 2.0f;

  // Median of 3
  if (pings[0] > pings[1]) { float t = pings[0]; pings[0] = pings[1]; pings[1] = t; }
  if (pings[1] > pings[2]) { float t = pings[1]; pings[1] = pings[2]; pings[2] = t; }
  if (pings[0] > pings[1]) { float t = pings[0]; pings[0] = pings[1]; pings[1] = t; }
  return pings[1];
}

// ========================================================================================
// MATHEMATICAL & DETECTION HELPERS
// ========================================================================================
float percentAboveBaseline(float value, float baseline) {
  if (baseline <= 0.001f) return 0.0f;
  return ((value - baseline) / baseline) * 100.0f;
}

float percentIncrease(int currentVal, int previousVal) {
  if (previousVal <= 0) return 0.0f;
  return ((currentVal - previousVal) / (float)previousVal) * 100.0f;
}

float smoothStep(float x) {
  if (x <= 0.0f) return 0.0f;
  if (x >= 1.0f) return 1.0f;
  return x * x * (3.0f - 2.0f * x);
}

// ========================================================================================
// SENSOR EVALUATION & 2D VECTOR ODOR COMPASS
// ========================================================================================
void evaluateSensorsAndVector() {
  // 1. Percentage above each sensor's OWN baseline
  mq3PercentFront  = percentAboveBaseline(mq3FilteredFront, MQ3_BASELINE_FRONT);
  mq2PercentRight  = percentAboveBaseline(mq2FilteredRight, MQ2_BASELINE_RIGHT);
  mq135PercentRear = percentAboveBaseline(mq135FilteredRear, MQ135_BASELINE_REAR);
  mq5PercentLeft   = percentAboveBaseline(mq5FilteredLeft, MQ5_BASELINE_LEFT);

  // 2. Individual threshold states
  mq3DetectedFront  = (mq3FilteredFront >= MQ3_THRESHOLD_FRONT);
  mq2DetectedRight  = (mq2FilteredRight >= MQ2_THRESHOLD_RIGHT);
  mq135DetectedRear = (mq135FilteredRear >= MQ135_THRESHOLD_REAR);
  mq5DetectedLeft   = (mq5FilteredLeft >= MQ5_THRESHOLD_LEFT);

  // 3. Sudden upward spike detection (>=10% from previous cycle)
  float s3 = previousReadingsReady ? percentIncrease(mq3RawFront, previousMq3) : 0;
  float s2 = previousReadingsReady ? percentIncrease(mq2RawRight, previousMq2) : 0;
  float s135 = previousReadingsReady ? percentIncrease(mq135RawRear, previousMq135) : 0;
  float s5 = previousReadingsReady ? percentIncrease(mq5RawLeft, previousMq5) : 0;

  bool c3 = previousReadingsReady && mq3DetectedFront && !previousMq3Detected;
  bool c2 = previousReadingsReady && mq2DetectedRight && !previousMq2Detected;
  bool c135 = previousReadingsReady && mq135DetectedRear && !previousMq135Detected;
  bool c5 = previousReadingsReady && mq5DetectedLeft && !previousMq5Detected;

  mq3NewEvent   = c3 || (previousReadingsReady && s3 >= SPIKE_THRESHOLD_PERCENT);
  mq2NewEvent   = c2 || (previousReadingsReady && s2 >= SPIKE_THRESHOLD_PERCENT);
  mq135NewEvent = c135 || (previousReadingsReady && s135 >= SPIKE_THRESHOLD_PERCENT);
  mq5NewEvent   = c5 || (previousReadingsReady && s5 >= SPIKE_THRESHOLD_PERCENT);

  gasDetected = mq3DetectedFront || mq2DetectedRight || mq135DetectedRear || mq5DetectedLeft;

  // 4. 2D Vector Decomposition:
  //    X-axis (Right - Left) = MQ2 - MQ5
  //    Y-axis (Front - Rear) = MQ3 - MQ135
  float df = max(0.0f, mq3PercentFront);
  float dr = max(0.0f, mq2PercentRight);
  float db = max(0.0f, mq135PercentRear);
  float dl = max(0.0f, mq5PercentLeft);

  float vx = dr - dl; // Right vs Left
  float vy = df - db; // Front vs Rear

  plumeMagnitude = sqrt(vx * vx + vy * vy);
  plumeBearingDeg = atan2(vx, vy) * (180.0f / 3.14159265f);

  // 5. Quadruped Gait Locomotion Recommendation
  if (frontDistanceCM > 0.0f && frontDistanceCM < 30.0f) {
    robotAction = "OBSTACLE_HOLD";
  } else if (gasDetected || plumeMagnitude >= 10.0f) {
    if (plumeBearingDeg >= -25.0f && plumeBearingDeg <= 25.0f) {
      robotAction = "FORWARD";
    } else if (plumeBearingDeg > 25.0f && plumeBearingDeg <= 115.0f) {
      robotAction = "TURN_RIGHT";
    } else if (plumeBearingDeg < -25.0f && plumeBearingDeg >= -115.0f) {
      robotAction = "TURN_LEFT";
    } else {
      robotAction = "TURN_REVERSE";
    }
  } else {
    robotAction = "IDLE";
  }

  // 6. Store previous states
  previousMq3 = mq3RawFront;
  previousMq2 = mq2RawRight;
  previousMq135 = mq135RawRear;
  previousMq5 = mq5RawLeft;

  previousMq3Detected = mq3DetectedFront;
  previousMq2Detected = mq2DetectedRight;
  previousMq135Detected = mq135DetectedRear;
  previousMq5Detected = mq5DetectedLeft;

  previousReadingsReady = true;

  if (mq3NewEvent || mq2NewEvent || mq135NewEvent || mq5NewEvent) {
    gasAlertUntil = millis() + GAS_ALERT_HOLD_TIME;
  }
}

// ========================================================================================
// SERIAL TELEMETRY (Machine-Readable Pipe & JSON for Web Serial Dashboard)
// ========================================================================================
void printTelemetry() {
  // High-precision pipe-delimited stream
  Serial.print(F("MQ2:")); Serial.print(mq2RawRight);
  Serial.print(F(" | MQ3:")); Serial.print(mq3RawFront);
  Serial.print(F(" | MQ5:")); Serial.print(mq5RawLeft);
  Serial.print(F(" | MQ135:")); Serial.print(mq135RawRear);
  Serial.print(F(" | MQ2%:")); Serial.print(mq2PercentRight, 1);
  Serial.print(F(" | MQ3%:")); Serial.print(mq3PercentFront, 1);
  Serial.print(F(" | MQ5%:")); Serial.print(mq5PercentLeft, 1);
  Serial.print(F(" | MQ135%:")); Serial.print(mq135PercentRear, 1);
  Serial.print(F(" | GAS:")); Serial.print(gasDetected ? "YES" : "NO");
  Serial.print(F(" | Bearing:")); Serial.print(plumeBearingDeg, 1);
  Serial.print(F(" | Mag:")); Serial.print(plumeMagnitude, 1);
  Serial.print(F(" | Action:")); Serial.print(robotAction);
  Serial.print(F(" | Distance:"));
  if (frontDistanceCM > 0.0f) {
    Serial.print(frontDistanceCM, 1);
    Serial.println(F("cm"));
  } else {
    Serial.println(F("NO_ECHO"));
  }

  // Event banner if new gas spike triggered
  if (mq3NewEvent || mq2NewEvent || mq135NewEvent || mq5NewEvent) {
    Serial.println(F("========================================"));
    Serial.println(F(">>> GAS DETECTED <<<"));
    if (mq3NewEvent) {
      Serial.print(F("DIRECTION: FRONT (MQ-3) | READING: ")); Serial.print(mq3RawFront);
      Serial.print(F(" | BASE: ")); Serial.print(MQ3_BASELINE_FRONT, 1);
      Serial.print(F(" | THR: ")); Serial.println(MQ3_THRESHOLD_FRONT, 1);
    }
    if (mq2NewEvent) {
      Serial.print(F("DIRECTION: RIGHT (MQ-2) | READING: ")); Serial.print(mq2RawRight);
      Serial.print(F(" | BASE: ")); Serial.print(MQ2_BASELINE_RIGHT, 1);
      Serial.print(F(" | THR: ")); Serial.println(MQ2_THRESHOLD_RIGHT, 1);
    }
    if (mq135NewEvent) {
      Serial.print(F("DIRECTION: REAR (MQ-135) | READING: ")); Serial.print(mq135RawRear);
      Serial.print(F(" | BASE: ")); Serial.print(MQ135_BASELINE_REAR, 1);
      Serial.print(F(" | THR: ")); Serial.println(MQ135_THRESHOLD_REAR, 1);
    }
    if (mq5NewEvent) {
      Serial.print(F("DIRECTION: LEFT (MQ-5) | READING: ")); Serial.print(mq5RawLeft);
      Serial.print(F(" | BASE: ")); Serial.print(MQ5_BASELINE_LEFT, 1);
      Serial.print(F(" | THR: ")); Serial.println(MQ5_THRESHOLD_LEFT, 1);
    }
    Serial.print(F("BEARING: ")); Serial.print(plumeBearingDeg, 1);
    Serial.print(F("° [")); Serial.print(robotAction);
    Serial.print(F("] | FRONT DISTANCE: "));
    if (frontDistanceCM > 0.0f) { Serial.print(frontDistanceCM, 1); Serial.println(F("cm")); }
    else { Serial.println(F("CLEAR")); }
    Serial.println(F("========================================"));
  }
}

// ========================================================================================
// OLED RENDERING UTILITIES
// ========================================================================================
void centerText(const char* text, byte size, int y) {
  if (!oledReady) return;
  int16_t x1, y1; uint16_t width, height;
  display.setTextSize(size);
  display.getTextBounds(text, 0, 0, &x1, &y1, &width, &height);
  int x = (SCREEN_WIDTH - width) / 2;
  if (x < 0) x = 0;
  display.setCursor(x, y);
  display.print(text);
}

// -----------------------------------------------------
// CUTE ROBOT EYES (Organic Blinking & Sniffing Motion)
// -----------------------------------------------------
void drawCuteEye(int cx, int cy, float opening, float mx, float my, float px, float py) {
  const float FULL_W = 36.0f, FULL_H = 34.0f;
  float w = 24.0f + (FULL_W - 24.0f) * opening;
  float h = 2.0f + (FULL_H - 2.0f) * opening;
  w *= (0.94f + 0.06f * opening);

  int x = cx + (int)mx - (int)(w / 2.0f);
  int y = cy + (int)my - (int)(h / 2.0f);
  int iw = max(4, (int)w), ih = max(2, (int)h);

  if (ih <= 3) {
    display.fillRoundRect(x + 2, cy - 1, iw - 4, 3, 1, WHITE);
    return;
  }

  display.fillRoundRect(x, y, iw, ih, min(8, ih / 2), WHITE);

  if (opening > 0.35f) {
    float maxPupilX = 6.0f * opening, maxPupilY = 4.5f * opening;
    int pupilX = cx + (int)mx + (int)constrain(px, -maxPupilX, maxPupilX);
    int pupilY = cy + (int)my + (int)constrain(py, -maxPupilY, maxPupilY);
    int pRad = 3 + (int)(3.0f * opening);

    display.fillCircle(pupilX, pupilY, pRad, BLACK);
    display.fillCircle(pupilX - 2, pupilY - 2, 2, WHITE);
    display.drawPixel(pupilX + 2, pupilY + 2, WHITE);
  }
}

void drawCuteEyesScreen() {
  unsigned long elapsed = millis() - eyeAnimationStart;
  float time = elapsed / 1000.0f;

  float opening = (elapsed < 1200UL) ? smoothStep(elapsed / 1200.0f) : 1.0f;

  // Periodic blinking cycles
  float blink = 1.0f;
  unsigned long cycle = elapsed % 4000UL;
  if (cycle >= 2500UL && cycle < 2850UL) {
    float p = (cycle - 2500UL) / 350.0f;
    blink = (p < 0.5f) ? (1.0f - smoothStep(p * 2.0f)) : smoothStep((p - 0.5f) * 2.0f);
  }
  opening *= blink;

  float bx = sin(time * 1.3f) * 3.0f;
  float by = sin(time * 1.7f) * 1.5f;

  display.clearDisplay();
  drawCuteEye(34, 32, opening, bx, by, bx * 1.5f, by * 1.5f);
  drawCuteEye(94, 32, opening, bx * 0.9f, by * 0.85f, bx * 1.5f, by * 1.5f);

  // Subtle clean status text at bottom
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(30, 56);
  display.print(F("SNIFFING CLEAN"));
  display.display();
}

// -----------------------------------------------------
// 360° ODOR COMPASS & VECTOR RADAR HUD
// -----------------------------------------------------
void drawOdorCompassScreen() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  // Left side: Circular compass dial (Center: 32, 32, Radius: 25)
  const int cx = 32, cy = 32, r = 24;
  display.drawCircle(cx, cy, r, WHITE);
  display.drawCircle(cx, cy, r - 6, WHITE);

  // Directional cardinal indicators
  display.setTextSize(1);
  display.setCursor(cx - 3, cy - r + 2); display.print(F("F")); // FRONT (MQ-3)
  display.setCursor(cx + r - 8, cy - 3); display.print(F("R")); // RIGHT (MQ-2)
  display.setCursor(cx - 3, cy + r - 9); display.print(F("B")); // REAR  (MQ-135)
  display.setCursor(cx - r + 2, cy - 3); display.print(F("L")); // LEFT  (MQ-5)

  // Compass vector arrow pointing towards plume angle
  float rad = plumeBearingDeg * (3.14159265f / 180.0f);
  int nx = cx + (int)(sin(rad) * (r - 7));
  int ny = cy - (int)(cos(rad) * (r - 7));
  display.drawLine(cx, cy, nx, ny, WHITE);
  display.fillCircle(nx, ny, 2, WHITE);
  display.fillCircle(cx, cy, 2, WHITE);

  // Right side: Telemetry & Navigation Command (x=66 to 127)
  display.setCursor(68, 2);
  display.print(F("360 ODOR"));

  display.drawLine(68, 12, 127, 12, WHITE);

  display.setCursor(68, 16);
  display.print(F("DIR:"));
  if (plumeMagnitude >= 10.0f) {
    if (abs(plumeBearingDeg) <= 25.0f) display.print(F("FRONT"));
    else if (plumeBearingDeg > 25.0f && plumeBearingDeg <= 115.0f) display.print(F("RIGHT"));
    else if (plumeBearingDeg < -25.0f && plumeBearingDeg >= -115.0f) display.print(F("LEFT"));
    else display.print(F("REAR"));
  } else {
    display.print(F("CALM"));
  }

  display.setCursor(68, 27);
  display.print(F("ANG:"));
  if (plumeBearingDeg > 0) display.print(F("+"));
  display.print((int)plumeBearingDeg);
  display.print(F((char)247)); // degree symbol

  display.setCursor(68, 38);
  display.print(F("MAG:"));
  display.print((int)plumeMagnitude);
  display.print(F("%"));

  // Front Ultrasonic Distance or Obstacle Warning
  display.setCursor(68, 49);
  if (frontDistanceCM > 0.0f && frontDistanceCM < 30.0f) {
    display.print(F("!STOP:"));
    display.print((int)frontDistanceCM);
    display.print(F("c"));
  } else if (frontDistanceCM > 0.0f) {
    display.print(F("US:"));
    display.print((int)frontDistanceCM);
    display.print(F("cm"));
  } else {
    display.print(F("US:CLEAR"));
  }

  // Locomotion recommendation banner at bottom
  if (gasDetected || plumeMagnitude >= 10.0f || (frontDistanceCM > 0.0f && frontDistanceCM < 30.0f)) {
    display.fillRect(0, 56, 128, 8, WHITE);
    display.setTextColor(BLACK);
    display.setCursor(8, 56);
    display.print(F("ACT: "));
    display.print(robotAction);
    display.setTextColor(WHITE);
  }

  display.display();
}

// -----------------------------------------------------
// 4-DIRECTION SENSOR GRID (All 4 Orthogonal Sensors At Once)
// -----------------------------------------------------
void drawFourDirectionGrid() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  // Crosshair dividers
  display.drawLine(64, 0, 64, 53, WHITE);
  display.drawLine(0, 26, 127, 26, WHITE);

  // TOP-LEFT: FRONT MQ-3
  display.setCursor(2, 2);
  display.print(F("FRONT MQ3"));
  display.setCursor(2, 14);
  display.print(mq3RawFront);
  display.print(F("/")); display.print((int)MQ3_THRESHOLD_FRONT);
  if (mq3DetectedFront) display.print(F(" *"));

  // TOP-RIGHT: RIGHT MQ-2
  display.setCursor(68, 2);
  display.print(F("RIGHT MQ2"));
  display.setCursor(68, 14);
  display.print(mq2RawRight);
  display.print(F("/")); display.print((int)MQ2_THRESHOLD_RIGHT);
  if (mq2DetectedRight) display.print(F(" *"));

  // BOTTOM-LEFT: LEFT MQ-5
  display.setCursor(2, 30);
  display.print(F("LEFT MQ5"));
  display.setCursor(2, 42);
  display.print(mq5RawLeft);
  display.print(F("/")); display.print((int)MQ5_THRESHOLD_LEFT);
  if (mq5DetectedLeft) display.print(F(" *"));

  // BOTTOM-RIGHT: REAR MQ-135
  display.setCursor(68, 30);
  display.print(F("REAR MQ135"));
  display.setCursor(68, 42);
  display.print(mq135RawRear);
  display.print(F("/")); display.print((int)MQ135_THRESHOLD_REAR);
  if (mq135DetectedRear) display.print(F(" *"));

  // Bottom Footer: Ultrasonic Range
  display.drawLine(0, 54, 127, 54, WHITE);
  display.setCursor(2, 56);
  display.print(F("FRONT US: "));
  if (frontDistanceCM > 0.0f) {
    display.print(frontDistanceCM, 1);
    display.print(F(" cm"));
  } else {
    display.print(F("NO ECHO / CLEAR"));
  }

  display.display();
}

// -----------------------------------------------------
// FRONT POD SCREEN (MQ-3 Narcotics + Ultrasonic)
// -----------------------------------------------------
void drawFrontPodScreen() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  centerText("FRONT POD SENSORS", 1, 0);
  display.drawLine(0, 10, 127, 10, WHITE);

  // MQ-3 Section
  display.setCursor(4, 14);
  display.print(F("MQ-3 (ALCOHOL/NARCOTICS):"));
  display.setTextSize(2);
  display.setCursor(8, 25);
  display.print(mq3RawFront);
  display.setTextSize(1);
  display.print(F(" ADC (THR:"));
  display.print((int)MQ3_THRESHOLD_FRONT);
  display.print(F(")"));

  // Ultrasonic Section
  display.setCursor(4, 43);
  display.print(F("FRONT ULTRASONIC RANGE:"));
  display.setCursor(8, 54);
  display.setTextSize(1);
  if (frontDistanceCM > 0.0f) {
    display.setTextSize(1);
    display.print(F("DIST: "));
    display.print(frontDistanceCM, 1);
    display.print(F(" cm"));
    if (frontDistanceCM < 30.0f) display.print(F(" [OBSTACLE!]"));
  } else {
    display.print(F("DIST: CLEAR (>400cm)"));
  }

  display.display();
}

// -----------------------------------------------------
// PRIORITY GAS ALERT SCREEN
// -----------------------------------------------------
void drawGasAlertScreen() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  // Inverted header banner
  display.fillRect(0, 0, 128, 14, WHITE);
  display.setTextColor(BLACK);
  centerText("GAS DETECTED", 1, 3);
  display.setTextColor(WHITE);

  // Determine primary triggering sensor
  const char* sensorName = "MQ-3";
  const char* side = MQ3_SIDE_NAME;
  int val = mq3RawFront;
  float thr = MQ3_THRESHOLD_FRONT;

  if (mq3DetectedFront) {
    sensorName = "MQ-3"; side = MQ3_SIDE_NAME; val = mq3RawFront; thr = MQ3_THRESHOLD_FRONT;
  } else if (mq2DetectedRight) {
    sensorName = "MQ-2"; side = MQ2_SIDE_NAME; val = mq2RawRight; thr = MQ2_THRESHOLD_RIGHT;
  } else if (mq135DetectedRear) {
    sensorName = "MQ-135"; side = MQ135_SIDE_NAME; val = mq135RawRear; thr = MQ135_THRESHOLD_REAR;
  } else if (mq5DetectedLeft) {
    sensorName = "MQ-5"; side = MQ5_SIDE_NAME; val = mq5RawLeft; thr = MQ5_THRESHOLD_LEFT;
  }

  char title[25];
  snprintf(title, sizeof(title), "%s (%s)", sensorName, side);
  centerText(title, 2, 18);

  char info[30];
  snprintf(info, sizeof(info), "VAL: %d  THR: %d", val, (int)thr);
  centerText(info, 1, 38);

  char nav[30];
  snprintf(nav, sizeof(nav), "VEC: %d%c [%s]", (int)plumeBearingDeg, (char)247, robotAction.c_str());
  centerText(nav, 1, 52);

  display.display();
}

// -----------------------------------------------------
// OLED SCREEN CONTROLLER
// -----------------------------------------------------
void renderOledDisplay() {
  if (!oledReady) return;

  // Gas Alert gets absolute priority
  if (gasAlertUntil > millis()) {
    drawGasAlertScreen();
    return;
  }

  switch (currentPage) {
    case 0:
      if (!gasDetected) drawCuteEyesScreen();
      else drawOdorCompassScreen();
      break;
    case 1:
      drawOdorCompassScreen();
      break;
    case 2:
      drawFourDirectionGrid();
      break;
    case 3:
      drawFrontPodScreen();
      break;
    default:
      currentPage = 0;
      drawOdorCompassScreen();
      break;
  }
}

// ========================================================================================
// ON-DEMAND CLEAN AIR CALIBRATION
// ========================================================================================
void calibrateCleanAirBaselines() {
  Serial.println(F("\n>>> INITIATING CLEAN AIR ZERO CALIBRATION (50 Samples) <<<"));
  if (oledReady) {
    display.clearDisplay();
    centerText("CALIBRATING...", 1, 20);
    centerText("KEEP IN CLEAN AIR", 1, 36);
    display.display();
  }

  long s3 = 0, s2 = 0, s135 = 0, s5 = 0;
  const int SAMPLES = 50;
  for (int i = 0; i < SAMPLES; i++) {
    s3 += readSensorAccurate(MQ3_PIN_FRONT);
    s2 += readSensorAccurate(MQ2_PIN_RIGHT);
    s135 += readSensorAccurate(MQ135_PIN_REAR);
    s5 += readSensorAccurate(MQ5_PIN_LEFT);
    delay(30);
  }

  MQ3_BASELINE_FRONT   = s3 / (float)SAMPLES;
  MQ2_BASELINE_RIGHT   = s2 / (float)SAMPLES;
  MQ135_BASELINE_REAR  = s135 / (float)SAMPLES;
  MQ5_BASELINE_LEFT    = s5 / (float)SAMPLES;

  // Set +10% detection thresholds
  MQ3_THRESHOLD_FRONT  = MQ3_BASELINE_FRONT * 1.10f;
  MQ2_THRESHOLD_RIGHT  = MQ2_BASELINE_RIGHT * 1.10f;
  MQ135_THRESHOLD_REAR = MQ135_BASELINE_REAR * 1.10f;
  MQ5_THRESHOLD_LEFT   = MQ5_BASELINE_LEFT * 1.10f;

  Serial.println(F("CALIBRATION COMPLETE:"));
  Serial.print(F("  FRONT MQ3   Base: ")); Serial.print(MQ3_BASELINE_FRONT, 1); Serial.print(F(" | Thr: ")); Serial.println(MQ3_THRESHOLD_FRONT, 1);
  Serial.print(F("  RIGHT MQ2   Base: ")); Serial.print(MQ2_BASELINE_RIGHT, 1); Serial.print(F(" | Thr: ")); Serial.println(MQ2_THRESHOLD_RIGHT, 1);
  Serial.print(F("  REAR  MQ135 Base: ")); Serial.print(MQ135_BASELINE_REAR, 1); Serial.print(F(" | Thr: ")); Serial.println(MQ135_THRESHOLD_REAR, 1);
  Serial.print(F("  LEFT  MQ5   Base: ")); Serial.print(MQ5_BASELINE_LEFT, 1); Serial.print(F(" | Thr: ")); Serial.println(MQ5_THRESHOLD_LEFT, 1);
}

// ========================================================================================
// INITIAL SETUP
// ========================================================================================
void setup() {
  Serial.begin(115200);

  pinMode(MQ3_PIN_FRONT, INPUT);
  pinMode(MQ2_PIN_RIGHT, INPUT);
  pinMode(MQ135_PIN_REAR, INPUT);
  pinMode(MQ5_PIN_LEFT, INPUT);

  pinMode(TRIG_PIN_FRONT, OUTPUT);
  pinMode(ECHO_PIN_FRONT, INPUT);
  digitalWrite(TRIG_PIN_FRONT, LOW);

  Wire.begin();

  // OLED Initialization
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    oledReady = true;
    display.clearDisplay();
    display.setTextColor(WHITE);
    centerText("IR VIKRANT", 2, 8);
    centerText("ODOR COMPASS", 1, 32);
    centerText("High-Accuracy 4-MQ", 1, 46);
    display.display();
    delay(1000);
  }

  // Initial read & Exponential filter initialization
  mq3RawFront = readSensorAccurate(MQ3_PIN_FRONT);
  mq2RawRight = readSensorAccurate(MQ2_PIN_RIGHT);
  mq135RawRear = readSensorAccurate(MQ135_PIN_REAR);
  mq5RawLeft = readSensorAccurate(MQ5_PIN_LEFT);

  mq3FilteredFront = mq3RawFront;
  mq2FilteredRight = mq2RawRight;
  mq135FilteredRear = mq135RawRear;
  mq5FilteredLeft = mq5RawLeft;

  previousMq3 = mq3RawFront;
  previousMq2 = mq2RawRight;
  previousMq135 = mq135RawRear;
  previousMq5 = mq5RawLeft;
  previousReadingsReady = true;

  frontDistanceCM = readUltrasonicAccurate();

  eyeAnimationStart = millis();
  lastSensorUpdate = millis();
  lastPageChange = millis();

  Serial.println(F("\n========================================================"));
  Serial.println(F("    IR VIKRANT - 360° HIGH-ACCURACY ODOR COMPASS READY  "));
  Serial.println(F("========================================================"));
  Serial.println(F("FRONT : MQ-3   (A0) | Base: 25.8  | Threshold: 29.0"));
  Serial.println(F("RIGHT : MQ-2   (A1) | Base: 40.6  | Threshold: 45.0"));
  Serial.println(F("REAR  : MQ-135 (A2) | Base: 48.6  | Threshold: 54.0"));
  Serial.println(F("LEFT  : MQ-5   (A3) | Base: 495.6 | Threshold: 546.0"));
  Serial.println(F("FRONT : HC-SR04 Ultrasonic Rangefinder (D6 TRIG, D7 ECHO)"));
  Serial.println(F("Commands: Send 'C' in Serial to zero baselines in clean air"));
  Serial.println(F("========================================================\n"));
}

// ========================================================================================
// MAIN LOOP
// ========================================================================================
void loop() {
  unsigned long now = millis();

  // Check for Serial Zero Calibration command ('C' or 'c')
  if (Serial.available()) {
    char cmd = Serial.read();
    if (cmd == 'C' || cmd == 'c') {
      calibrateCleanAirBaselines();
    }
  }

  // 1. High-Precision Sensor Update Loop (every 100ms)
  if (now - lastSensorUpdate >= SENSOR_UPDATE_TIME) {
    lastSensorUpdate = now;

    // Read 4 MQ sensors with anti-crosstalk & 16-sample trimmed mean
    mq3RawFront   = readSensorAccurate(MQ3_PIN_FRONT);
    mq2RawRight   = readSensorAccurate(MQ2_PIN_RIGHT);
    mq135RawRear  = readSensorAccurate(MQ135_PIN_REAR);
    mq5RawLeft    = readSensorAccurate(MQ5_PIN_LEFT);

    // Exponential Moving Average filter (35% new sample + 65% previous)
    mq3FilteredFront  = (0.35f * mq3RawFront)  + (0.65f * mq3FilteredFront);
    mq2FilteredRight  = (0.35f * mq2RawRight)  + (0.65f * mq2FilteredRight);
    mq135FilteredRear = (0.35f * mq135RawRear) + (0.65f * mq135FilteredRear);
    mq5FilteredLeft   = (0.35f * mq5RawLeft)   + (0.65f * mq5FilteredLeft);

    // Read 3-ping median front ultrasonic distance
    frontDistanceCM = readUltrasonicAccurate();

    // Evaluate detection, sudden spikes, and 2D vector bearing/magnitude
    evaluateSensorsAndVector();

    // Transmit telemetry to IR Vikrant Dashboard
    printTelemetry();

    // Render OLED
    renderOledDisplay();
  }

  // 2. Page Rotation (every 2.5s when no gas alert is active)
  if (now - lastPageChange >= OLED_PAGE_TIME) {
    lastPageChange = now;
    currentPage++;
    if (currentPage > 3) currentPage = 0;
  }
}
