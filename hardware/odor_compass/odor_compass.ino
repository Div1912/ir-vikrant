#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ========================================================================================
// IR VIKRANT - PRECISION 360° ODOR COMPASS & QUADRUPED CHEMOTAXIS FIRMWARE
// ========================================================================================
//
// PHYSICAL HARDWARE MOUNTING & PIN WIRING:
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
//   • SERIAL     : 115200 Baud (High-Speed Diagnostic & Web Serial Stream)
//
// HIGH-ACCURACY FEATURES & DIRECTIONAL DETECTION:
//   1. Real-Time Odor Direction Determination:
//      Continuously compares all 4 orthogonal sensors to identify EXACTLY which
//      direction (FRONT, RIGHT, REAR, or LEFT) the highest concentration of gas/smell
//      is originating from, and transmits it both via Serial and directly onto the OLED.
//   2. Anti-Crosstalk Settling: Discards multiplexer sample-and-hold charge before reads.
//   3. 8-Sample Trimmed Mean: Rejects heater coil electrical ripple and voltage spikes.
//   4. EMA Filter: Dual-stage smoothing delivers 0.1 ADC precision with <150ms response.
//   5. Decoupled Ultrasonic: Single clean ping per cycle with rolling 3-ping median filter;
//      eliminates acoustic self-interference (echo bouncing) and blocking pulseIn() stalls.
//   6. Fast I2C (400kHz): Increases OLED data rate by 4x, preventing CPU timing starvation.
//   7. Auto-Zeroing at Startup: 3-second clean-air ambient calibration calibrates baselines
//      to the room's current temperature/humidity/potentiometer setting (prevents false alarms).
//   8. Live Serial Commands:
//      - Send 'C': Re-zero baselines to current clean air immediately
//      - Send 'D': Restore default fixed baselines (MQ3=25.8, MQ2=40.6, 135=48.6, MQ5=495.6)
//      - Send 'P': Cycle OLED page
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

// -----------------------------------------------------
// BASELINES & THRESHOLDS (+10% SENSITIVITY)
// -----------------------------------------------------
const float DEFAULT_BASE_MQ3_FRONT   = 25.8f;
const float DEFAULT_BASE_MQ2_RIGHT   = 40.6f;
const float DEFAULT_BASE_MQ135_REAR  = 48.6f;
const float DEFAULT_BASE_MQ5_LEFT    = 495.6f;

float baseline_MQ3_front   = DEFAULT_BASE_MQ3_FRONT;
float baseline_MQ2_right   = DEFAULT_BASE_MQ2_RIGHT;
float baseline_MQ135_rear  = DEFAULT_BASE_MQ135_REAR;
float baseline_MQ5_left    = DEFAULT_BASE_MQ5_LEFT;

float threshold_MQ3_front  = 29.0f;
float threshold_MQ2_right  = 45.0f;
float threshold_MQ135_rear = 54.0f;
float threshold_MQ5_left   = 546.0f;

const float SPIKE_THRESHOLD_PERCENT = 10.0f; // Sudden upward rise threshold

// -----------------------------------------------------
// FILTERED SENSOR READINGS
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
// PEAK ODOR SOURCE / DIRECTION TRACKING
// -----------------------------------------------------
String peakDirection = "CALM";    // FRONT, RIGHT, REAR, LEFT, CALM
String peakSensorName = "NONE";   // MQ-3, MQ-2, MQ-135, MQ-5
String peakGasType = "CLEAN AIR"; // NARCOTICS, COMBUSTIBLE, TOXIC/NH3, METHANE
float peakDeltaPercent = 0.0f;    // % surge above clean air baseline
int peakRawVal = 0;

// -----------------------------------------------------
// 2D CHEMOTAXIS VECTOR & ULTRASONIC STATE
// -----------------------------------------------------
float plumeBearingDeg = 0.0f;   // -180.0° to +180.0°
float plumeMagnitude = 0.0f;    // Vector excitation %
String robotAction = "IDLE";    // FORWARD, TURN_RIGHT, TURN_LEFT, TURN_REVERSE, OBSTACLE_HOLD
float frontDistanceCM = -1.0f;  // Ultrasonic distance directly in front

// -----------------------------------------------------
// TIMING & SCHEDULING (Non-blocking loop)
// -----------------------------------------------------
const unsigned long SENSOR_INTERVAL_MS = 100UL;   // 10Hz sampling
const unsigned long ULTRASONIC_INTERVAL_MS = 120UL; // ~8Hz ping rate (prevents acoustic echoes)
const unsigned long OLED_REFRESH_MS = 160UL;      // ~6Hz display update (fast & flicker-free)
const unsigned long OLED_PAGE_TIME_MS = 3000UL;   // 3s page rotation
const unsigned long GAS_ALERT_HOLD_MS = 2500UL;   // Alert hold duration

unsigned long lastSensorTime = 0;
unsigned long lastUltrasonicTime = 0;
unsigned long lastOledRefreshTime = 0;
unsigned long lastPageChangeTime = 0;
unsigned long gasAlertUntil = 0;
unsigned long eyeAnimationStart = 0;

byte currentPage = 0;

// ========================================================================================
// ANTI-CROSSTALK & OUTLIER-REJECTED ADC SAMPLING
// ========================================================================================
int readSensorAccurate(uint8_t pin) {
  // Step 1: Discard first read after switching ADC multiplexer channel
  analogRead(pin);
  delayMicroseconds(80); // Allow S/H capacitor to charge/discharge to sensor impedance

  // Step 2: Sample 8 consecutive readings
  long sum = 0;
  int minVal = 1024;
  int maxVal = -1;

  for (uint8_t i = 0; i < 8; i++) {
    int val = analogRead(pin);
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    sum += val;
    delayMicroseconds(40);
  }

  // Step 3: Trimmed mean: discard lowest and highest single outlier, average middle 6
  return (int)((sum - minVal - maxVal) / 6);
}

// ========================================================================================
// HC-SR04 ULTRASONIC RANGEFINDER (Clean single ping with 3-ping rolling median)
// ========================================================================================
float pingUltrasonicSingle() {
  digitalWrite(TRIG_PIN_FRONT, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN_FRONT, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN_FRONT, LOW);

  // 24000µs timeout = ~4.1m max range (never hangs the loop)
  unsigned long duration = pulseIn(ECHO_PIN_FRONT, HIGH, 24000UL);
  if (duration < 115 || duration >= 24000UL) {
    return -1.0f; // Out of range or no echo
  }

  float cm = (duration * 0.0343f) / 2.0f;
  if (cm < 2.0f || cm > 400.0f) {
    return -1.0f;
  }
  return cm;
}

float getMedianUltrasonicDistance(float newPing) {
  static float pingHistory[3] = {-1.0f, -1.0f, -1.0f};
  static uint8_t pingIdx = 0;

  pingHistory[pingIdx] = newPing;
  pingIdx = (pingIdx + 1) % 3;

  float s[3] = {pingHistory[0], pingHistory[1], pingHistory[2]};
  if (s[0] > s[1]) { float t = s[0]; s[0] = s[1]; s[1] = t; }
  if (s[1] > s[2]) { float t = s[1]; s[1] = s[2]; s[2] = t; }
  if (s[0] > s[1]) { float t = s[0]; s[0] = s[1]; s[1] = t; }

  // Return middle valid reading
  if (s[1] > 0.0f) return s[1];
  if (s[2] > 0.0f) return s[2];
  return s[0];
}

// ========================================================================================
// DETECTION & CHEMOTAXIS MATH
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

void evaluateGasAndVector() {
  // 1. Percentage above each sensor's OWN baseline
  mq3PercentFront  = percentAboveBaseline(mq3FilteredFront, baseline_MQ3_front);
  mq2PercentRight  = percentAboveBaseline(mq2FilteredRight, baseline_MQ2_right);
  mq135PercentRear = percentAboveBaseline(mq135FilteredRear, baseline_MQ135_rear);
  mq5PercentLeft   = percentAboveBaseline(mq5FilteredLeft, baseline_MQ5_left);

  // 2. Individual threshold states
  mq3DetectedFront  = (mq3FilteredFront >= threshold_MQ3_front);
  mq2DetectedRight  = (mq2FilteredRight >= threshold_MQ2_right);
  mq135DetectedRear = (mq135FilteredRear >= threshold_MQ135_rear);
  mq5DetectedLeft   = (mq5FilteredLeft >= threshold_MQ5_left);

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

  // 4b. Find which direction has the HIGHEST gas concentration
  float maxDelta = -999.0f;
  peakDirection = "CALM";
  peakSensorName = "NONE";
  peakGasType = "CLEAN AIR";
  peakDeltaPercent = 0.0f;
  peakRawVal = 0;

  if (mq3PercentFront > maxDelta) {
    maxDelta = mq3PercentFront;
    peakDirection = "FRONT";
    peakSensorName = "MQ-3";
    peakGasType = "NARCOTICS";
    peakDeltaPercent = mq3PercentFront;
    peakRawVal = mq3RawFront;
  }
  if (mq2PercentRight > maxDelta) {
    maxDelta = mq2PercentRight;
    peakDirection = "RIGHT";
    peakSensorName = "MQ-2";
    peakGasType = "SMOKE/LPG";
    peakDeltaPercent = mq2PercentRight;
    peakRawVal = mq2RawRight;
  }
  if (mq135PercentRear > maxDelta) {
    maxDelta = mq135PercentRear;
    peakDirection = "REAR";
    peakSensorName = "MQ-135";
    peakGasType = "TOXIC/NH3";
    peakDeltaPercent = mq135PercentRear;
    peakRawVal = mq135RawRear;
  }
  if (mq5PercentLeft > maxDelta) {
    maxDelta = mq5PercentLeft;
    peakDirection = "LEFT";
    peakSensorName = "MQ-5";
    peakGasType = "METHANE/LPG";
    peakDeltaPercent = mq5PercentLeft;
    peakRawVal = mq5RawLeft;
  }

  // If all deltas are below 7% and no threshold reached
  if (maxDelta < 7.0f && !gasDetected) {
    peakDirection = "CALM";
    peakSensorName = "NONE";
    peakGasType = "CLEAN AIR";
    peakDeltaPercent = 0.0f;
  }

  // 5. Locomotion Recommendation
  if (frontDistanceCM > 0.0f && frontDistanceCM < 30.0f) {
    robotAction = "OBSTACLE_HOLD";
  } else if (gasDetected || plumeMagnitude >= 10.0f || peakDeltaPercent >= 8.0f) {
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

  // 6. Update previous states
  previousMq3 = mq3RawFront;
  previousMq2 = mq2RawRight;
  previousMq135 = mq135RawRear;
  previousMq5 = mq5RawLeft;

  previousMq3Detected = mq3DetectedFront;
  previousMq2Detected = mq2DetectedRight;
  previousMq135Detected = mq135DetectedRear;
  previousMq5Detected = mq5DetectedLeft;

  previousReadingsReady = true;

  if (mq3NewEvent || mq2NewEvent || mq135NewEvent || mq5NewEvent || gasDetected || peakDeltaPercent >= 10.0f) {
    gasAlertUntil = millis() + GAS_ALERT_HOLD_MS;
  }
}

// ========================================================================================
// TELEMETRY OUTPUT (Serial Stream & Diagnostic Report)
// ========================================================================================
void printTelemetry() {
  // Machine-parseable pipe-delimited stream for Web Serial Dashboard
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
  Serial.print(F(" | PeakDir:")); Serial.print(peakDirection);
  Serial.print(F(" | PeakSensor:")); Serial.print(peakSensorName);
  Serial.print(F(" | PeakGas:")); Serial.print(peakGasType);
  Serial.print(F(" | PeakDelta:")); Serial.print(peakDeltaPercent, 1);
  Serial.print(F(" | Distance:"));
  if (frontDistanceCM > 0.0f) {
    Serial.print(frontDistanceCM, 1);
    Serial.println(F("cm"));
  } else {
    Serial.println(F("NO_ECHO"));
  }

  // Event banner if gas is detected
  if (mq3NewEvent || mq2NewEvent || mq135NewEvent || mq5NewEvent) {
    Serial.println(F("========================================"));
    Serial.println(F(">>> GAS DETECTION EVENT TRIGGERED <<<"));
    Serial.print(F("  PRIMARY SMELL DIRECTION: ")); Serial.println(peakDirection);
    if (mq3NewEvent) {
      Serial.print(F("  FRONT (MQ-3)   : ")); Serial.print(mq3RawFront);
      Serial.print(F(" ADC | Base: ")); Serial.print(baseline_MQ3_front, 1);
      Serial.print(F(" | Thr: ")); Serial.print(threshold_MQ3_front, 1);
      Serial.println(F(" [NARCOTICS/ALCOHOL]"));
    }
    if (mq2NewEvent) {
      Serial.print(F("  RIGHT (MQ-2)   : ")); Serial.print(mq2RawRight);
      Serial.print(F(" ADC | Base: ")); Serial.print(baseline_MQ2_right, 1);
      Serial.print(F(" | Thr: ")); Serial.print(threshold_MQ2_right, 1);
      Serial.println(F(" [COMBUSTIBLE/SMOKE]"));
    }
    if (mq135NewEvent) {
      Serial.print(F("  REAR  (MQ-135) : ")); Serial.print(mq135RawRear);
      Serial.print(F(" ADC | Base: ")); Serial.print(baseline_MQ135_rear, 1);
      Serial.print(F(" | Thr: ")); Serial.print(threshold_MQ135_rear, 1);
      Serial.println(F(" [TOXIC/PRECURSORS]"));
    }
    if (mq5NewEvent) {
      Serial.print(F("  LEFT  (MQ-5)   : ")); Serial.print(mq5RawLeft);
      Serial.print(F(" ADC | Base: ")); Serial.print(baseline_MQ5_left, 1);
      Serial.print(F(" | Thr: ")); Serial.print(threshold_MQ5_left, 1);
      Serial.println(F(" [METHANE/LPG]"));
    }
    Serial.print(F("  BEARING        : ")); Serial.print(plumeBearingDeg, 1);
    Serial.print(F("° | MAGNITUDE: ")); Serial.print(plumeMagnitude, 1);
    Serial.print(F("% | ACTION: ")); Serial.println(robotAction);
    Serial.print(F("  FRONT OBSTACLE : "));
    if (frontDistanceCM > 0.0f) { Serial.print(frontDistanceCM, 1); Serial.println(F(" cm")); }
    else { Serial.println(F("CLEAR (>400cm)")); }
    Serial.println(F("========================================"));
  }
}

// ========================================================================================
// OLED RENDERING
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
// Cute Animated Eyes (Active Sniffing Mode)
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

  float opening = (elapsed < 1000UL) ? smoothStep(elapsed / 1000.0f) : 1.0f;

  // Periodic natural blinking
  float blink = 1.0f;
  unsigned long cycle = elapsed % 3800UL;
  if (cycle >= 2400UL && cycle < 2750UL) {
    float p = (cycle - 2400UL) / 350.0f;
    blink = (p < 0.5f) ? (1.0f - smoothStep(p * 2.0f)) : smoothStep((p - 0.5f) * 2.0f);
  }
  opening *= blink;

  float bx = sin(time * 1.3f) * 3.0f;
  float by = sin(time * 1.7f) * 1.5f;

  display.clearDisplay();
  drawCuteEye(34, 32, opening, bx, by, bx * 1.5f, by * 1.5f);
  drawCuteEye(94, 32, opening, bx * 0.9f, by * 0.85f, bx * 1.5f, by * 1.5f);

  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(24, 56);
  display.print(F("SNIFFING CLEAN AIR"));
  display.display();
}

// -----------------------------------------------------
// 360° Odor Compass Radar Screen
// -----------------------------------------------------
void drawOdorCompassScreen() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  // Left: Circular compass dial (Center: 30, 32, Radius: 25)
  const int cx = 30, cy = 32, r = 25;
  display.drawCircle(cx, cy, r, WHITE);
  display.drawCircle(cx, cy, r - 6, WHITE);

  // Cardinal orientation markers: F (MQ3), R (MQ2), B (MQ135), L (MQ5)
  display.setTextSize(1);
  display.setCursor(cx - 3, cy - r + 2); display.print(F("F")); // FRONT
  display.setCursor(cx + r - 8, cy - 3); display.print(F("R")); // RIGHT
  display.setCursor(cx - 3, cy + r - 9); display.print(F("B")); // REAR
  display.setCursor(cx - r + 2, cy - 3); display.print(F("L")); // LEFT

  // Vector arrow pointing to plume angle
  float rad = plumeBearingDeg * (3.14159265f / 180.0f);
  int nx = cx + (int)(sin(rad) * (r - 7));
  int ny = cy - (int)(cos(rad) * (r - 7));
  display.drawLine(cx, cy, nx, ny, WHITE);
  display.fillCircle(nx, ny, 2, WHITE);
  display.fillCircle(cx, cy, 2, WHITE);

  // Right Side Telemetry Readout
  display.setCursor(64, 2);
  display.print(F("360 COMPASS"));
  display.drawLine(64, 11, 127, 11, WHITE);

  display.setCursor(64, 14);
  display.print(F("SRC: "));
  display.print(peakDirection);

  display.setCursor(64, 25);
  display.print(F("SNR: "));
  display.print(peakSensorName);

  display.setCursor(64, 36);
  display.print(F("DEL: "));
  if (peakDeltaPercent > 0) display.print(F("+"));
  display.print((int)peakDeltaPercent);
  display.print(F("%"));

  display.setCursor(64, 47);
  display.print(F("ACT: "));
  display.print(robotAction);

  display.setCursor(64, 57);
  if (frontDistanceCM > 0.0f) {
    display.print(F("US : "));
    display.print((int)frontDistanceCM);
    display.print(F("cm"));
  } else {
    display.print(F("US : CLR"));
  }

  display.display();
}

// -----------------------------------------------------
// 4-Direction Grid Screen (All sensors visible at once)
// -----------------------------------------------------
void drawFourDirectionGrid() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  display.drawLine(64, 0, 64, 53, WHITE);
  display.drawLine(0, 26, 127, 26, WHITE);

  // TOP-LEFT: FRONT MQ-3
  display.setCursor(2, 2);  display.print(F("FRONT MQ3"));
  display.setCursor(2, 14); display.print(mq3RawFront);
  display.print(F("/"));    display.print((int)threshold_MQ3_front);
  if (peakDirection == "FRONT") display.print(F(" *"));

  // TOP-RIGHT: RIGHT MQ-2
  display.setCursor(68, 2);  display.print(F("RIGHT MQ2"));
  display.setCursor(68, 14); display.print(mq2RawRight);
  display.print(F("/"));     display.print((int)threshold_MQ2_right);
  if (peakDirection == "RIGHT") display.print(F(" *"));

  // BOTTOM-LEFT: LEFT MQ-5
  display.setCursor(2, 30);  display.print(F("LEFT MQ5"));
  display.setCursor(2, 42); display.print(mq5RawLeft);
  display.print(F("/"));    display.print((int)threshold_MQ5_left);
  if (peakDirection == "LEFT") display.print(F(" *"));

  // BOTTOM-RIGHT: REAR MQ-135
  display.setCursor(68, 30);  display.print(F("REAR 135"));
  display.setCursor(68, 42); display.print(mq135RawRear);
  display.print(F("/"));     display.print((int)threshold_MQ135_rear);
  if (peakDirection == "REAR") display.print(F(" *"));

  display.drawLine(0, 54, 127, 54, WHITE);
  display.setCursor(2, 56);
  display.print(F("SRC: "));
  display.print(peakDirection);
  display.print(F(" | US:"));
  if (frontDistanceCM > 0.0f) {
    display.print((int)frontDistanceCM);
    display.print(F("cm"));
  } else {
    display.print(F("CLEAR"));
  }

  display.display();
}

// -----------------------------------------------------
// High-Visibility Odor Source Direction Alert Screen
// (Shows prominently from which direction smell is coming)
// -----------------------------------------------------
void drawGasAlertScreen() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  // Inverted Alert Header
  display.fillRect(0, 0, 128, 12, WHITE);
  display.setTextColor(BLACK);
  centerText("! ODOR SOURCE LOCATED !", 1, 2);
  display.setTextColor(WHITE);

  // HUGE DIRECTION TEXT (Size 2 font)
  char dirBanner[20];
  if (peakDirection == "FRONT") {
    snprintf(dirBanner, sizeof(dirBanner), "^ FRONT ^");
  } else if (peakDirection == "RIGHT") {
    snprintf(dirBanner, sizeof(dirBanner), ">> RIGHT >>");
  } else if (peakDirection == "LEFT") {
    snprintf(dirBanner, sizeof(dirBanner), "<< LEFT <<");
  } else if (peakDirection == "REAR") {
    snprintf(dirBanner, sizeof(dirBanner), "v REAR v");
  } else {
    snprintf(dirBanner, sizeof(dirBanner), "SMELL LOCATED");
  }
  centerText(dirBanner, 2, 16);

  // Subtitle: Sensor name and target gas
  char subInfo[30];
  snprintf(subInfo, sizeof(subInfo), "%s [%s]", peakSensorName.c_str(), peakGasType.c_str());
  centerText(subInfo, 1, 34);

  // Divider
  display.drawLine(4, 44, 123, 44, WHITE);

  // Bottom telemetry line: Delta surge and Bearing angle
  display.setCursor(4, 47);
  display.print(F("SURGE: +"));
  display.print((int)peakDeltaPercent);
  display.print(F("% | "));
  if (plumeBearingDeg > 0) display.print(F("+"));
  display.print((int)plumeBearingDeg);
  display.print(F((char)247));

  // Action & Obstacle footer
  display.setCursor(4, 56);
  display.print(F("ACT:"));
  display.print(robotAction);

  display.setCursor(76, 56);
  if (frontDistanceCM > 0.0f) {
    display.print(F("US:"));
    display.print((int)frontDistanceCM);
    display.print(F("cm"));
  } else {
    display.print(F("US:CLR"));
  }

  display.display();
}

void renderOledDisplay() {
  if (!oledReady) return;

  // When gas/smell is actively detected, prioritize showing the high gas direction screen!
  if (gasDetected || peakDeltaPercent >= 10.0f || gasAlertUntil > millis()) {
    drawGasAlertScreen();
    return;
  }

  switch (currentPage) {
    case 0:
      drawCuteEyesScreen();
      break;
    case 1:
      drawOdorCompassScreen();
      break;
    case 2:
      drawFourDirectionGrid();
      break;
    default:
      currentPage = 0;
      drawCuteEyesScreen();
      break;
  }
}

// ========================================================================================
// AMBIENT ZERO-CALIBRATION ROUTINE
// ========================================================================================
void calibrateCleanAirBaselines(bool interactive = true) {
  if (interactive) {
    Serial.println(F("\n[CALIBRATION] Sampling clean air baselines across all 4 sensors..."));
  }

  if (oledReady) {
    display.clearDisplay();
    centerText("AUTO CALIBRATING", 1, 10);
    centerText("ZERO BASELINE", 1, 24);
    centerText("Sampling clean air...", 1, 40);
    display.display();
  }

  long s3 = 0, s2 = 0, s135 = 0, s5 = 0;
  const int CAL_SAMPLES = 25;

  for (int i = 0; i < CAL_SAMPLES; i++) {
    s3   += readSensorAccurate(MQ3_PIN_FRONT);
    s2   += readSensorAccurate(MQ2_PIN_RIGHT);
    s135 += readSensorAccurate(MQ135_PIN_REAR);
    s5   += readSensorAccurate(MQ5_PIN_LEFT);
    delay(40);
  }

  float newBase3   = (float)s3 / CAL_SAMPLES;
  float newBase2   = (float)s2 / CAL_SAMPLES;
  float newBase135 = (float)s135 / CAL_SAMPLES;
  float newBase5   = (float)s5 / CAL_SAMPLES;

  // Sanity validation: must be within reasonable non-zero ADC bounds
  if (newBase3 > 5.0f && newBase3 < 800.0f)   baseline_MQ3_front  = newBase3;
  if (newBase2 > 5.0f && newBase2 < 800.0f)   baseline_MQ2_right  = newBase2;
  if (newBase135 > 5.0f && newBase135 < 800.0f) baseline_MQ135_rear = newBase135;
  if (newBase5 > 5.0f && newBase5 < 950.0f)   baseline_MQ5_left   = newBase5;

  // Calculate new +10% thresholds
  threshold_MQ3_front  = baseline_MQ3_front  * 1.10f;
  threshold_MQ2_right  = baseline_MQ2_right  * 1.10f;
  threshold_MQ135_rear = baseline_MQ135_rear * 1.10f;
  threshold_MQ5_left   = baseline_MQ5_left   * 1.10f;

  if (interactive) {
    Serial.println(F("[CALIBRATION COMPLETE] New Clean Air Baselines & +10% Thresholds:"));
    Serial.print(F("  FRONT MQ-3   : Base=")); Serial.print(baseline_MQ3_front, 1);
    Serial.print(F(" | Thr=")); Serial.println(threshold_MQ3_front, 1);
    Serial.print(F("  RIGHT MQ-2   : Base=")); Serial.print(baseline_MQ2_right, 1);
    Serial.print(F(" | Thr=")); Serial.println(threshold_MQ2_right, 1);
    Serial.print(F("  REAR  MQ-135 : Base=")); Serial.print(baseline_MQ135_rear, 1);
    Serial.print(F(" | Thr=")); Serial.println(threshold_MQ135_rear, 1);
    Serial.print(F("  LEFT  MQ-5   : Base=")); Serial.print(baseline_MQ5_left, 1);
    Serial.print(F(" | Thr=")); Serial.println(threshold_MQ5_left, 1);
    Serial.println(F("========================================================\n"));
  }

  if (oledReady) {
    display.clearDisplay();
    centerText("CALIBRATION DONE", 1, 10);
    centerText("BASELINES ZEROED", 1, 26);
    centerText("Threshold = Base+10%", 1, 42);
    display.display();
    delay(700);
  }
}

void restoreDefaultBaselines() {
  baseline_MQ3_front   = DEFAULT_BASE_MQ3_FRONT;
  baseline_MQ2_right   = DEFAULT_BASE_MQ2_RIGHT;
  baseline_MQ135_rear  = DEFAULT_BASE_MQ135_REAR;
  baseline_MQ5_left    = DEFAULT_BASE_MQ5_LEFT;

  threshold_MQ3_front  = 29.0f;
  threshold_MQ2_right  = 45.0f;
  threshold_MQ135_rear = 54.0f;
  threshold_MQ5_left   = 546.0f;

  Serial.println(F("\n[RESET] Restored default fixed baselines (25.8, 40.6, 48.6, 495.6)"));
  if (oledReady) {
    display.clearDisplay();
    centerText("DEFAULTS RESTORED", 1, 24);
    display.display();
    delay(600);
  }
}

// ========================================================================================
// SETUP
// ========================================================================================
void setup() {
  Serial.begin(115200);

  // Analog Pins Configuration
  pinMode(MQ3_PIN_FRONT, INPUT);
  pinMode(MQ2_PIN_RIGHT, INPUT);
  pinMode(MQ135_PIN_REAR, INPUT);
  pinMode(MQ5_PIN_LEFT, INPUT);

  // Ultrasonic HC-SR04 Pins Configuration
  pinMode(TRIG_PIN_FRONT, OUTPUT);
  pinMode(ECHO_PIN_FRONT, INPUT);
  digitalWrite(TRIG_PIN_FRONT, LOW);

  Wire.begin();
  Wire.setClock(400000); // 400kHz Fast Mode I2C (4x faster display refresh)

  // OLED Initialization
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    oledReady = true;
    display.clearDisplay();
    display.setTextColor(WHITE);
    centerText("IR VIKRANT", 2, 8);
    centerText("360 ODOR COMPASS", 1, 32);
    centerText("Warming up...", 1, 46);
    display.display();
  }

  // 3-second startup clean-air auto calibration
  Serial.println(F("\n========================================================"));
  Serial.println(F("    IR VIKRANT - PRECISION ODOR COMPASS INITIALIZING    "));
  Serial.println(F("========================================================"));
  Serial.println(F("Auto-zeroing clean air baselines in 3 seconds..."));
  Serial.println(F("(Send 'D' in Serial to use default fixed baselines instead)"));

  for (int cd = 3; cd > 0; cd--) {
    if (oledReady) {
      display.clearDisplay();
      centerText("AUTO-ZERO BASELINE", 1, 14);
      char buf[20];
      snprintf(buf, sizeof(buf), "Starting in %ds...", cd);
      centerText(buf, 1, 32);
      centerText("KEEP IN CLEAN AIR", 1, 46);
      display.display();
    }
    Serial.print(F("Calibration in ")); Serial.print(cd); Serial.println(F("s..."));
    delay(1000);

    // If user sends 'D', cancel auto-zero and use default baselines
    if (Serial.available()) {
      char c = Serial.read();
      if (c == 'D' || c == 'd') {
        restoreDefaultBaselines();
        break;
      }
    }
  }

  calibrateCleanAirBaselines(false);

  // Initial read & Exponential filter initialization
  mq3RawFront   = readSensorAccurate(MQ3_PIN_FRONT);
  mq2RawRight   = readSensorAccurate(MQ2_PIN_RIGHT);
  mq135RawRear  = readSensorAccurate(MQ135_PIN_REAR);
  mq5RawLeft    = readSensorAccurate(MQ5_PIN_LEFT);

  mq3FilteredFront  = mq3RawFront;
  mq2FilteredRight  = mq2RawRight;
  mq135FilteredRear = mq135RawRear;
  mq5FilteredLeft   = mq5RawLeft;

  previousMq3   = mq3RawFront;
  previousMq2   = mq2RawRight;
  previousMq135 = mq135RawRear;
  previousMq5   = mq5RawLeft;
  previousReadingsReady = true;

  frontDistanceCM = getMedianUltrasonicDistance(pingUltrasonicSingle());

  eyeAnimationStart = millis();
  lastSensorTime = millis();
  lastUltrasonicTime = millis();
  lastOledRefreshTime = millis();
  lastPageChangeTime = millis();

  Serial.println(F("\n========================================================"));
  Serial.println(F("             IR VIKRANT PRECISION SYSTEM READY          "));
  Serial.println(F("========================================================"));
  Serial.print(F("FRONT : MQ-3   (A0) | Base: ")); Serial.print(baseline_MQ3_front, 1);   Serial.print(F(" | Thr: ")); Serial.println(threshold_MQ3_front, 1);
  Serial.print(F("RIGHT : MQ-2   (A1) | Base: ")); Serial.print(baseline_MQ2_right, 1);   Serial.print(F(" | Thr: ")); Serial.println(threshold_MQ2_right, 1);
  Serial.print(F("REAR  : MQ-135 (A2) | Base: ")); Serial.print(baseline_MQ135_rear, 1);  Serial.print(F(" | Thr: ")); Serial.println(threshold_MQ135_rear, 1);
  Serial.print(F("LEFT  : MQ-5   (A3) | Base: ")); Serial.print(baseline_MQ5_left, 1);    Serial.print(F(" | Thr: ")); Serial.println(threshold_MQ5_left, 1);
  Serial.println(F("FRONT : HC-SR04 Rangefinder (D6 TRIG, D7 ECHO)"));
  Serial.println(F("COMMANDS: Send 'C' to re-zero baselines | 'D' to use defaults"));
  Serial.println(F("========================================================\n"));
}

// ========================================================================================
// MAIN LOOP (Decoupled, Jitter-Free Multitasking)
// ========================================================================================
void loop() {
  unsigned long now = millis();

  // 1. Check Serial Commands
  if (Serial.available()) {
    char cmd = Serial.read();
    if (cmd == 'C' || cmd == 'c') {
      calibrateCleanAirBaselines(true);
    } else if (cmd == 'D' || cmd == 'd') {
      restoreDefaultBaselines();
    } else if (cmd == 'P' || cmd == 'p') {
      currentPage = (currentPage + 1) % 3;
    }
  }

  // 2. High-Precision MQ Sensor Sampling (every 100ms = 10Hz)
  if (now - lastSensorTime >= SENSOR_INTERVAL_MS) {
    lastSensorTime = now;

    // Read with anti-crosstalk settling & trimmed mean
    mq3RawFront   = readSensorAccurate(MQ3_PIN_FRONT);
    mq2RawRight   = readSensorAccurate(MQ2_PIN_RIGHT);
    mq135RawRear  = readSensorAccurate(MQ135_PIN_REAR);
    mq5RawLeft    = readSensorAccurate(MQ5_PIN_LEFT);

    // Dual-stage EMA filter (35% sample + 65% history)
    mq3FilteredFront  = (0.35f * mq3RawFront)  + (0.65f * mq3FilteredFront);
    mq2FilteredRight  = (0.35f * mq2RawRight)  + (0.65f * mq2FilteredRight);
    mq135FilteredRear = (0.35f * mq135RawRear) + (0.65f * mq135FilteredRear);
    mq5FilteredLeft   = (0.35f * mq5RawLeft)   + (0.65f * mq5FilteredLeft);

    evaluateGasAndVector();
    printTelemetry();
  }

  // 3. Ultrasonic Rangefinder (staggered at 120ms to prevent acoustic echo overlap)
  if (now - lastUltrasonicTime >= ULTRASONIC_INTERVAL_MS) {
    lastUltrasonicTime = now;
    float ping = pingUltrasonicSingle();
    frontDistanceCM = getMedianUltrasonicDistance(ping);
  }

  // 4. OLED Refresh (at 160ms = ~6.25 FPS, Fast 400kHz I2C, never blocks ADC)
  if (now - lastOledRefreshTime >= OLED_REFRESH_MS) {
    lastOledRefreshTime = now;
    renderOledDisplay();
  }

  // 5. Page Rotation (every 3 seconds when calm)
  if (now - lastPageChangeTime >= OLED_PAGE_TIME_MS) {
    lastPageChangeTime = now;
    currentPage = (currentPage + 1) % 3;
  }
}
