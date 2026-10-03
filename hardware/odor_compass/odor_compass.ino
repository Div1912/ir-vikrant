#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =====================================================
// IR VIKRANT - COMPLETE OLED + 4 MQ GAS DETECTION
// =====================================================
//
// ARDUINO UNO
//
// CURRENT WIRING FROM YOUR SKETCH:
// MQ3   -> A0 -> FRONT
// MQ2   -> A1 -> RIGHT
// MQ135 -> A2 -> REAR
// MQ5   -> A3 -> LEFT
//
// OLED:
// SDA -> A4
// SCL -> A5
// Address: 0x3C
//
// HC-SR04:
// TRIG -> D6
// ECHO -> D7
//
// Serial: 115200
//
// GAS DETECTION:
// Each sensor is checked independently.
// Threshold = its own baseline + 10%.
//
// NEW BASELINES FROM YOUR RECENT READINGS:
// MQ2   = 40.6  -> threshold 45
// MQ3   = 25.8  -> threshold 29
// MQ5   = 495.6 -> threshold 546
// MQ135 = 48.6  -> threshold 54
//
// IMPORTANT:
// There is NO automatic baseline drift.
// There is NO dependency between sensors.
// ANY ONE sensor reaching its own threshold
// means GAS DETECTED.
//
// =====================================================


// =====================================================
// OLED
// =====================================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  OLED_RESET
);

bool oledReady = false;


// =====================================================
// MQ SENSOR PINS
// =====================================================

#define MQ3_PIN   A0
#define MQ2_PIN   A1
#define MQ135_PIN A2
#define MQ5_PIN   A3


// =====================================================
// SENSOR SIDE LABELS
// CURRENTLY FROM YOUR SKETCH
// =====================================================

const char* MQ2_SIDE   = "RIGHT";
const char* MQ3_SIDE   = "FRONT";
const char* MQ5_SIDE   = "LEFT";
const char* MQ135_SIDE = "REAR";


// =====================================================
// FIXED BASELINES
// =====================================================

const float MQ2_BASELINE   = 40.6;
const float MQ3_BASELINE   = 25.8;
const float MQ5_BASELINE   = 495.6;
const float MQ135_BASELINE = 48.6;


// =====================================================
// 10% DETECTION THRESHOLDS
// =====================================================

const float MQ2_THRESHOLD   = 45.0;
const float MQ3_THRESHOLD   = 29.0;
const float MQ5_THRESHOLD   = 546.0;
const float MQ135_THRESHOLD = 54.0;


// =====================================================
// HC-SR04
// =====================================================

#define TRIG_PIN 6
#define ECHO_PIN 7


// =====================================================
// TIMING
// =====================================================

const unsigned long SENSOR_UPDATE_TIME = 100UL;
const unsigned long OLED_PAGE_TIME = 2500UL;
const unsigned long GAS_ALERT_TIME = 1800UL;

unsigned long lastSensorUpdate = 0;
unsigned long lastPageChange = 0;
unsigned long gasAlertUntil = 0;


// =====================================================
// OLED PAGE
// =====================================================

// 0 = MQ5
// 1 = MQ2
// 2 = MQ3
// 3 = MQ135
// 4 = Ultrasonic

byte currentPage = 0;


// =====================================================
// SENSOR VALUES
// =====================================================

int mq2Value = 0;
int mq3Value = 0;
int mq5Value = 0;
int mq135Value = 0;

float distanceCM = -1.0;


// =====================================================
// PERCENTAGES
// =====================================================

float mq2Percent = 0.0;
float mq3Percent = 0.0;
float mq5Percent = 0.0;
float mq135Percent = 0.0;


// =====================================================
// INDIVIDUAL GAS FLAGS
// =====================================================

bool mq2Detected = false;
bool mq3Detected = false;
bool mq5Detected = false;
bool mq135Detected = false;

bool gasDetected = false;

// Sudden upward spike threshold.
// Example: MQ5 600 -> 1000 = +66.7%, so it is an event.
const float SPIKE_THRESHOLD_PERCENT = 10.0;

bool mq2NewEvent = false;
bool mq3NewEvent = false;
bool mq5NewEvent = false;
bool mq135NewEvent = false;

int previousMq2Value = 0;
int previousMq3Value = 0;
int previousMq5Value = 0;
int previousMq135Value = 0;

bool previousReadingsReady = false;



// =====================================================
// PREVIOUS DETECTION STATE
// Prevents printing the same threshold event every 100ms.
// =====================================================

bool previousMq2Detected = false;
bool previousMq3Detected = false;
bool previousMq5Detected = false;
bool previousMq135Detected = false;


// =====================================================
// SMOOTH STEP
// =====================================================

float smoothStep(float x) {

  if (x <= 0.0f)
    return 0.0f;

  if (x >= 1.0f)
    return 1.0f;

  return x * x * (3.0f - 2.0f * x);
}


// =====================================================
// CENTER OLED TEXT
// =====================================================

void centerText(
  const char* text,
  byte size,
  int y
) {

  if (!oledReady)
    return;

  int16_t x1;
  int16_t y1;

  uint16_t width;
  uint16_t height;

  display.setTextSize(size);

  display.getTextBounds(
    text,
    0,
    0,
    &x1,
    &y1,
    &width,
    &height
  );

  int x =
    (SCREEN_WIDTH - width) / 2;

  if (x < 0)
    x = 0;

  display.setCursor(x, y);

  display.print(text);
}


// =====================================================
// OLED INITIALIZATION
// =====================================================

void initializeOLED() {

  Serial.println(
    F("Initializing OLED...")
  );

  if (
    display.begin(
      SSD1306_SWITCHCAPVCC,
      OLED_ADDRESS
    )
  ) {

    oledReady = true;

    display.clearDisplay();

    display.setTextColor(WHITE);
    display.setTextWrap(false);

    centerText(
      "IR VIKRANT",
      2,
      8
    );

    centerText(
      "OLED READY",
      1,
      34
    );

    centerText(
      "Starting...",
      1,
      48
    );

    display.display();

    Serial.println(
      F("OLED FOUND at 0x3C")
    );

    delay(800);
  }

  else {

    oledReady = false;

    Serial.println(
      F("OLED NOT FOUND at 0x3C")
    );

    Serial.println(
      F("Check SDA=A4, SCL=A5, VCC, GND")
    );
  }
}


// =====================================================
// I2C SCANNER
// =====================================================

void scanI2C() {

  Serial.println(
    F("I2C scan:")
  );

  for (
    byte address = 1;
    address < 127;
    address++
  ) {

    Wire.beginTransmission(address);

    byte error =
      Wire.endTransmission();

    if (error == 0) {

      Serial.print(
        F("Device: 0x")
      );

      if (address < 16)
        Serial.print('0');

      Serial.println(
        address,
        HEX
      );
    }
  }
}


// =====================================================
// READ SENSOR
//
// SINGLE ADC READ.
// No multi-sample averaging is used for the detection
// decision, so a raised reading is immediately visible.
// =====================================================

int readMQ(byte pin) {

  return analogRead(pin);
}


// =====================================================
// PERCENT ABOVE BASELINE
// =====================================================

float percentAboveBaseline(
  int value,
  float baseline
) {

  return
    ((value - baseline) /
     baseline) * 100.0f;
}


// =====================================================
// PERCENT INCREASE FROM PREVIOUS READING
// =====================================================
float percentIncreaseFromPrevious(
  int currentValue,
  int previousValue
) {
  if (previousValue <= 0) {
    return 0.0f;
  }

  return
    ((currentValue - previousValue) /
     (float)previousValue) * 100.0f;
}


// =====================================================
// GAS DETECTION
//
// Each sensor ONLY uses its own baseline.
// =====================================================

void evaluateGasDetection() {

  // ---------------------------------------------------
  // Percentage above each sensor's OWN baseline
  // ---------------------------------------------------

  mq2Percent =
    ((mq2Value - MQ2_BASELINE) /
     MQ2_BASELINE) * 100.0f;

  mq3Percent =
    ((mq3Value - MQ3_BASELINE) /
     MQ3_BASELINE) * 100.0f;

  mq5Percent =
    ((mq5Value - MQ5_BASELINE) /
     MQ5_BASELINE) * 100.0f;

  mq135Percent =
    ((mq135Value - MQ135_BASELINE) /
     MQ135_BASELINE) * 100.0f;


  // ---------------------------------------------------
  // Current individual threshold states
  // ---------------------------------------------------

  mq2Detected =
    (mq2Value >= MQ2_THRESHOLD);

  mq3Detected =
    (mq3Value >= MQ3_THRESHOLD);

  mq5Detected =
    (mq5Value >= MQ5_THRESHOLD);

  mq135Detected =
    (mq135Value >= MQ135_THRESHOLD);


  // ---------------------------------------------------
  // Calculate sudden upward spikes
  // ---------------------------------------------------

  float mq2SpikePercent = 0.0f;
  float mq3SpikePercent = 0.0f;
  float mq5SpikePercent = 0.0f;
  float mq135SpikePercent = 0.0f;

  if (previousReadingsReady) {

    mq2SpikePercent =
      percentIncreaseFromPrevious(
        mq2Value,
        previousMq2Value
      );

    mq3SpikePercent =
      percentIncreaseFromPrevious(
        mq3Value,
        previousMq3Value
      );

    mq5SpikePercent =
      percentIncreaseFromPrevious(
        mq5Value,
        previousMq5Value
      );

    mq135SpikePercent =
      percentIncreaseFromPrevious(
        mq135Value,
        previousMq135Value
      );
  }


  // ---------------------------------------------------
  // Detect newly crossed baseline threshold
  // ---------------------------------------------------

  bool mq2Crossed =
    previousReadingsReady &&
    mq2Detected &&
    !previousMq2Detected;

  bool mq3Crossed =
    previousReadingsReady &&
    mq3Detected &&
    !previousMq3Detected;

  bool mq5Crossed =
    previousReadingsReady &&
    mq5Detected &&
    !previousMq5Detected;

  bool mq135Crossed =
    previousReadingsReady &&
    mq135Detected &&
    !previousMq135Detected;


  // ---------------------------------------------------
  // Detect sudden >=10% rise
  //
  // This catches:
  // MQ5 600 -> 1000
  // (+66.7%)
  // even if MQ5 was already above 546.
  // ---------------------------------------------------

  bool mq2Spike =
    previousReadingsReady &&
    mq2SpikePercent >= SPIKE_THRESHOLD_PERCENT;

  bool mq3Spike =
    previousReadingsReady &&
    mq3SpikePercent >= SPIKE_THRESHOLD_PERCENT;

  bool mq5Spike =
    previousReadingsReady &&
    mq5SpikePercent >= SPIKE_THRESHOLD_PERCENT;

  bool mq135Spike =
    previousReadingsReady &&
    mq135SpikePercent >= SPIKE_THRESHOLD_PERCENT;


  // ---------------------------------------------------
  // NEW EVENT FOR EACH SENSOR
  // ---------------------------------------------------

  mq2NewEvent =
    mq2Crossed ||
    mq2Spike;

  mq3NewEvent =
    mq3Crossed ||
    mq3Spike;

  mq5NewEvent =
    mq5Crossed ||
    mq5Spike;

  mq135NewEvent =
    mq135Crossed ||
    mq135Spike;


  // ---------------------------------------------------
  // ANY ONE SENSOR = GAS DETECTED
  // ---------------------------------------------------

  gasDetected =
    mq2Detected ||
    mq3Detected ||
    mq5Detected ||
    mq135Detected;


  // ---------------------------------------------------
  // Store previous values
  // ---------------------------------------------------

  previousMq2Value =
    mq2Value;

  previousMq3Value =
    mq3Value;

  previousMq5Value =
    mq5Value;

  previousMq135Value =
    mq135Value;

  previousReadingsReady =
    true;
}

// =====================================================
// PRINT GAS EVENT
// =====================================================

void printGasEvent() {

  // Nothing new happened this cycle.
  if (
    !mq2NewEvent &&
    !mq3NewEvent &&
    !mq5NewEvent &&
    !mq135NewEvent
  ) {
    return;
  }


  Serial.println();
  Serial.println(
    F("========================================")
  );

  Serial.println(
    F(">>> GAS DETECTED <<<")
  );


  if (mq2NewEvent) {

    Serial.print(
      F("SENSOR: MQ2 | SIDE: ")
    );

    Serial.print(
      MQ2_SIDE
    );

    Serial.print(
      F(" | READING: ")
    );

    Serial.print(
      mq2Value
    );

    Serial.print(
      F(" | THRESHOLD: ")
    );

    Serial.println(
      MQ2_THRESHOLD,
      0
    );
  }


  if (mq3NewEvent) {

    Serial.print(
      F("SENSOR: MQ3 | SIDE: ")
    );

    Serial.print(
      MQ3_SIDE
    );

    Serial.print(
      F(" | READING: ")
    );

    Serial.print(
      mq3Value
    );

    Serial.print(
      F(" | THRESHOLD: ")
    );

    Serial.println(
      MQ3_THRESHOLD,
      0
    );
  }


  if (mq5NewEvent) {

    Serial.print(
      F("SENSOR: MQ5 | SIDE: ")
    );

    Serial.print(
      MQ5_SIDE
    );

    Serial.print(
      F(" | READING: ")
    );

    Serial.print(
      mq5Value
    );

    Serial.print(
      F(" | THRESHOLD: ")
    );

    Serial.println(
      MQ5_THRESHOLD,
      0
    );
  }


  if (mq135NewEvent) {

    Serial.print(
      F("SENSOR: MQ135 | SIDE: ")
    );

    Serial.print(
      MQ135_SIDE
    );

    Serial.print(
      F(" | READING: ")
    );

    Serial.print(
      mq135Value
    );

    Serial.print(
      F(" | THRESHOLD: ")
    );

    Serial.println(
      MQ135_THRESHOLD,
      0
    );
  }


  Serial.println(
    F("========================================")
  );

  Serial.println();

  // Keep the gas alert on OLED briefly.
  gasAlertUntil =
    millis() + GAS_ALERT_TIME;
}

// =====================================================
// CUTE EYE
// =====================================================

void drawCuteEye(
  int centerX,
  int centerY,
  float opening,
  float moveX,
  float moveY,
  float pupilX,
  float pupilY
) {

  if (!oledReady)
    return;

  const float FULL_WIDTH = 38.0f;
  const float FULL_HEIGHT = 38.0f;

  float width =
    26.0f +
    (FULL_WIDTH - 26.0f) * opening;

  float height =
    2.0f +
    (FULL_HEIGHT - 2.0f) * opening;

  float blinkSquish =
    0.94f +
    (0.06f * opening);

  width *= blinkSquish;

  int x =
    centerX +
    (int)moveX -
    (int)(width / 2.0f);

  int y =
    centerY +
    (int)moveY -
    (int)(height / 2.0f);

  int w = (int)width;
  int h = (int)height;

  if (w < 4) w = 4;
  if (h < 2) h = 2;

  int radius =
    min(10, h / 2);

  if (h <= 3) {

    display.fillRoundRect(
      x + 2,
      centerY - 1,
      w - 4,
      3,
      1,
      WHITE
    );

    return;
  }

  display.fillRoundRect(
    x,
    y,
    w,
    h,
    radius,
    WHITE
  );

  if (opening > 0.30f) {

    float maxPupilX =
      7.0f * opening;

    float maxPupilY =
      5.0f * opening;

    float safePupilX =
      constrain(
        pupilX,
        -maxPupilX,
        maxPupilX
      );

    float safePupilY =
      constrain(
        pupilY,
        -maxPupilY,
        maxPupilY
      );

    int px =
      centerX +
      (int)moveX +
      (int)safePupilX;

    int py =
      centerY +
      (int)moveY +
      (int)safePupilY;

    int pupilRadius =
      4 +
      (int)(3.0f * opening);

    display.fillCircle(
      px,
      py,
      pupilRadius,
      BLACK
    );

    display.fillCircle(
      px - 2,
      py - 2,
      2,
      WHITE
    );

    display.drawPixel(
      px + 2,
      py + 2,
      WHITE
    );
  }
}


// =====================================================
// BOTH EYES
// =====================================================

void drawCuteEyes(
  float opening,
  float leftX,
  float rightX,
  float leftY,
  rightY,
  float pupilX,
  float pupilY
) {

  if (!oledReady)
    return;

  display.clearDisplay();

  display.setTextColor(WHITE);

  drawCuteEye(
    36,
    32,
    opening,
    leftX,
    leftY,
    pupilX,
    pupilY
  );

  drawCuteEye(
    92,
    32,
    opening,
    rightX,
    rightY,
    pupilX,
    pupilY
  );

  display.display();
}


// =====================================================
// EYE ANIMATION
// =====================================================

void updateEyeAnimation(
  unsigned long startTime
) {

  if (!oledReady)
    return;

  unsigned long elapsed =
    millis() - startTime;

  float time =
    elapsed / 1000.0f;


  // Opening

  float opening;

  if (elapsed < 1500UL) {

    float progress =
      elapsed / 1500.0f;

    opening =
      smoothStep(progress);
  }

  else {

    opening = 1.0f;
  }


  // Blink

  float blink = 1.0f;


  if (
    elapsed >= 2500UL &&
    elapsed < 2920UL
  ) {

    float progress =
      (elapsed - 2500UL) / 420.0f;

    if (progress < 0.5f) {

      blink =
        1.0f -
        smoothStep(
          progress * 2.0f
        );
    }

    else {

      blink =
        smoothStep(
          (progress - 0.5f) * 2.0f
        );
    }
  }


  else if (
    elapsed >= 4700UL &&
    elapsed < 5140UL
  ) {

    float progress =
      (elapsed - 4700UL) / 440.0f;

    if (progress < 0.5f) {

      blink =
        1.0f -
        smoothStep(
          progress * 2.0f
        );
    }

    else {

      blink =
        smoothStep(
          (progress - 0.5f) * 2.0f
        );
    }
  }


  opening *= blink;


  // Eye movement

  float baseX =
    sin(time * 1.1f) * 2.5f;

  float baseY =
    sin(time * 1.5f) * 1.2f;


  float leftX = baseX;
  float rightX = baseX * 0.92f;

  float leftY = baseY;
  float rightY = baseY * 0.85f;


  float pupilX =
    sin(time * 1.35f) * 4.5f;

  float pupilY =
    sin(time * 1.8f) * 2.2f;


  // Look left

  if (
    elapsed >= 1600UL &&
    elapsed < 2250UL
  ) {

    float progress =
      (elapsed - 1600UL) / 650.0f;

    float motion;

    if (progress < 0.5f) {

      motion =
        smoothStep(
          progress * 2.0f
        );
    }

    else {

      motion =
        1.0f -
        smoothStep(
          (progress - 0.5f) * 2.0f
        );
    }

    motion *= -4.0f;

    leftX += motion;
    rightX += motion;

    pupilX -= 2.5f;
  }


  // Look right

  if (
    elapsed >= 3400UL &&
    elapsed < 4100UL
  ) {

    float progress =
      (elapsed - 3400UL) / 700.0f;

    float motion;

    if (progress < 0.5f) {

      motion =
        smoothStep(
          progress * 2.0f
        );
    }

    else {

      motion =
        1.0f -
        smoothStep(
          (progress - 0.5f) * 2.0f
        );
    }

    motion *= 4.5f;

    leftX += motion;
    rightX += motion;

    pupilX += 2.8f;
  }


  // Look up

  if (
    elapsed >= 5300UL &&
    elapsed < 5850UL
  ) {

    float progress =
      (elapsed - 5300UL) / 550.0f;

    float motion;

    if (progress < 0.5f) {

      motion =
        smoothStep(
          progress * 2.0f
        );
    }

    else {

      motion =
        1.0f -
        smoothStep(
          (progress - 0.5f) * 2.0f
        );
    }

    motion *= -2.2f;

    leftY += motion;
    rightY += motion;

    pupilY -= 2.0f;
  }


  drawCuteEyes(
    opening,
    leftX,
    rightX,
    leftY,
    rightY,
    pupilX,
    pupilY
  );
}


// =====================================================
// GAS ALERT OLED SCREEN
// =====================================================

void drawGasAlert(
  const char* sensorName,
  const char* side,
  int value,
  float threshold,
  float percent
) {

  if (!oledReady)
    return;

  display.clearDisplay();

  display.setTextColor(WHITE);
  display.setTextWrap(false);


  centerText(
    "GAS DETECTED",
    2,
    0
  );


  display.drawLine(
    0,
    18,
    127,
    18,
    WHITE
  );


  centerText(
    sensorName,
    2,
    21
  );


  centerText(
    side,
    1,
    42
  );


  char info[25];

  snprintf(
    info,
    sizeof(info),
    "VAL:%d THR:%d",
    value,
    (int)threshold
  );

  centerText(
    info,
    1,
    52
  );


  display.display();
}


// =====================================================
// SHOW GAS ALERT
// =====================================================

void showGasAlert() {

  if (!oledReady)
    return;


  if (mq5NewEvent) {

    drawGasAlert(
      "MQ-5",
      MQ5_SIDE,
      mq5Value,
      MQ5_THRESHOLD,
      mq5Percent
    );

    return;
  }


  if (mq2NewEvent) {

    drawGasAlert(
      "MQ-2",
      MQ2_SIDE,
      mq2Value,
      MQ2_THRESHOLD,
      mq2Percent
    );

    return;
  }


  if (mq3NewEvent) {

    drawGasAlert(
      "MQ-3",
      MQ3_SIDE,
      mq3Value,
      MQ3_THRESHOLD,
      mq3Percent
    );

    return;
  }


  if (mq135NewEvent) {

    drawGasAlert(
      "MQ-135",
      MQ135_SIDE,
      mq135Value,
      MQ135_THRESHOLD,
      mq135Percent
    );

    return;
  }
}


// =====================================================
// MQ OLED PAGE
// =====================================================
// =====================================================
// MQ OLED PAGE
// =====================================================

void drawMQScreen(
  const char* sensorName,
  const char* side,
  int value,
  float threshold,
  float percent,
  bool detected
) {

  if (!oledReady)
    return;

  display.clearDisplay();

  display.setTextColor(WHITE);
  display.setTextWrap(false);


  char header[20];

  snprintf(
    header,
    sizeof(header),
    "%s %s",
    sensorName,
    side
  );

  centerText(
    header,
    2,
    0
  );


  display.drawLine(
    0,
    18,
    127,
    18,
    WHITE
  );


  char valueText[10];

  itoa(
    value,
    valueText,
    10
  );

  centerText(
    valueText,
    3,
    20
  );


  char percentText[25];

  snprintf(
    percentText,
    sizeof(percentText),
    "THR:%d %+.1f%%",
    (int)threshold,
    percent
  );

  centerText(
    percentText,
    1,
    46
  );


  if (detected) {

    display.fillRect(
      0,
      55,
      128,
      9,
      WHITE
    );

    display.setTextColor(BLACK);

    centerText(
      "GAS DETECTED",
      1,
      56
    );

    display.setTextColor(WHITE);
  }

  else {

    centerText(
      "CLEAR",
      1,
      56
    );
  }


  display.display();
}


// =====================================================
// ULTRASONIC READING
// =====================================================

float readUltrasonic() {

  digitalWrite(
    TRIG_PIN,
    LOW
  );

  delayMicroseconds(2);

  digitalWrite(
    TRIG_PIN,
    HIGH
  );

  delayMicroseconds(10);

  digitalWrite(
    TRIG_PIN,
    LOW
  );


  unsigned long duration =
    pulseIn(
      ECHO_PIN,
      HIGH,
      30000UL
    );


  if (duration == 0)
    return -1.0f;


  float cm =
    duration / 58.0f;


  if (
    cm < 2.0f ||
    cm > 400.0f
  ) {

    return -1.0f;
  }


  return cm;
}


// =====================================================
// ULTRASONIC OLED PAGE
// =====================================================

void drawUltrasonicScreen() {

  if (!oledReady)
    return;

  display.clearDisplay();

  display.setTextColor(WHITE);
  display.setTextWrap(false);


  centerText(
    "ULTRASONIC",
    2,
    0
  );


  display.drawLine(
    0,
    18,
    127,
    18,
    WHITE
  );


  if (distanceCM > 0.0f) {

    char text[12];

    dtostrf(
      distanceCM,
      5,
      1,
      text
    );


    display.setTextSize(3);

    display.setCursor(
      5,
      27
    );

    display.print(text);


    display.setTextSize(2);

    display.setCursor(
      92,
      33
    );

    display.print("cm");
  }

  else {

    centerText(
      "NO ECHO",
      2,
      31
    );
  }


  display.display();
}


// =====================================================
// DRAW CURRENT PAGE
// =====================================================

void drawCurrentPage() {

  if (!oledReady)
    return;


  switch (currentPage) {

    case 0:

      drawMQScreen(
        "MQ-5",
        MQ5_SIDE,
        mq5Value,
        MQ5_THRESHOLD,
        mq5Percent,
        mq5Detected
      );

      break;


    case 1:

      drawMQScreen(
        "MQ-2",
        MQ2_SIDE,
        mq2Value,
        MQ2_THRESHOLD,
        mq2Percent,
        mq2Detected
      );

      break;


    case 2:

      drawMQScreen(
        "MQ-3",
        MQ3_SIDE,
        mq3Value,
        MQ3_THRESHOLD,
        mq3Percent,
        mq3Detected
      );

      break;


    case 3:

      drawMQScreen(
        "MQ-135",
        MQ135_SIDE,
        mq135Value,
        MQ135_THRESHOLD,
        mq135Percent,
        mq135Detected
      );

      break;


    case 4:

      drawUltrasonicScreen();

      break;
  }
}


// =====================================================
// SERIAL READINGS
//
// NORMAL = exactly one line with all values.
// GAS = reading line + separate GAS DETECTED block.
// No NO GAS spam.
// =====================================================

void printTelemetry() {

  Serial.print(
    F("MQ2:")
  );

  Serial.print(
    mq2Value
  );


  Serial.print(
    F(" | MQ3:")
  );

  Serial.print(
    mq3Value
  );


  Serial.print(
    F(" | MQ5:")
  );

  Serial.print(
    mq5Value
  );


  Serial.print(
    F(" | MQ135:")
  );

  Serial.print(
    mq135Value
  );


  Serial.print(
    F(" | MQ2%:")
  );

  Serial.print(
    mq2Percent,
    1
  );


  Serial.print(
    F(" | MQ3%:")
  );

  Serial.print(
    mq3Percent,
    1
  );


  Serial.print(
    F(" | MQ5%:")
  );

  Serial.print(
    mq5Percent,
    1
  );


  Serial.print(
    F(" | MQ135%:")
  );

  Serial.print(
    mq135Percent,
    1
  );


  Serial.print(
    F(" | GAS:")
  );

  Serial.print(
    gasDetected ? "YES" : "NO"
  );


  Serial.print(
    F(" | Distance:")
  );


  if (distanceCM > 0.0f) {

    Serial.print(
      distanceCM,
      1
    );

    Serial.println(
      F("cm")
    );
  }

  else {

    Serial.println(
      F("NO_ECHO")
    );
  }
}


// =====================================================
// UPDATE ALL SENSORS
// =====================================================

void updateSensors() {

  // ---------------------------------------------------
  // IMPORTANT:
  // Read each sensor independently.
  // ---------------------------------------------------

  mq2Value =
    readMQ(MQ2_PIN);

  mq3Value =
    readMQ(MQ3_PIN);

  mq5Value =
    readMQ(MQ5_PIN);

  mq135Value =
    readMQ(MQ135_PIN);


  // Detection

  evaluateGasDetection();


  // Print event ONLY when a sensor first crosses
  // its own 10% threshold.

  printGasEvent();
}


// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(
    115200
  );


  // MQ inputs

  pinMode(
    MQ2_PIN,
    INPUT
  );

  pinMode(
    MQ3_PIN,
    INPUT
  );

  pinMode(
    MQ5_PIN,
    INPUT
  );

  pinMode(
    MQ135_PIN,
    INPUT
  );


  // Ultrasonic

  pinMode(
    TRIG_PIN,
    OUTPUT
  );

  pinMode(
    ECHO_PIN,
    INPUT
  );

  digitalWrite(
    TRIG_PIN,
    LOW
  );


  // I2C

  Wire.begin();


  // OLED

  initializeOLED();


  // Initial sensor readings

  mq2Value =
    readMQ(MQ2_PIN);

  mq3Value =
    readMQ(MQ3_PIN);

  mq5Value =
    readMQ(MQ5_PIN);

  mq135Value =
    readMQ(MQ135_PIN);


  // Establish the startup readings as the previous readings.
  // This prevents a false spike immediately after boot.

  previousMq2Value = mq2Value;
  previousMq3Value = mq3Value;
  previousMq5Value = mq5Value;
  previousMq135Value = mq135Value;

  previousReadingsReady = true;


  // Establish current threshold state.
  // If a sensor starts above the threshold, it is considered
  // currently detected, but it does NOT generate a new event.

  mq2Detected = (mq2Value >= MQ2_THRESHOLD);
  mq3Detected = (mq3Value >= MQ3_THRESHOLD);
  mq5Detected = (mq5Value >= MQ5_THRESHOLD);
  mq135Detected = (mq135Value >= MQ135_THRESHOLD);

  previousMq2Detected = mq2Detected;
  previousMq3Detected = mq3Detected;
  previousMq5Detected = mq5Detected;
  previousMq135Detected = mq135Detected;

  mq2NewEvent = false;
  mq3NewEvent = false;
  mq5NewEvent = false;
  mq135NewEvent = false;


  mq2Percent =
    percentAboveBaseline(
      mq2Value,
      MQ2_BASELINE
    );

  mq3Percent =
    percentAboveBaseline(
      mq3Value,
      MQ3_BASELINE
    );

  mq5Percent =
    percentAboveBaseline(
      mq5Value,
      MQ5_BASELINE
    );

  mq135Percent =
    percentAboveBaseline(
      mq135Value,
      MQ135_BASELINE
    );


  gasDetected =
    mq2Detected ||
    mq3Detected ||
    mq5Detected ||
    mq135Detected;


  distanceCM =
    readUltrasonic();


  // Print startup information

  Serial.println();

  Serial.println(
    F("==========================================")
  );

  Serial.println(
    F("          IR VIKRANT READY")
  );

  Serial.println(
    F("==========================================")
  );

  Serial.println(
    F("MQ2   Base: 40.6  Threshold: 45")
  );

  Serial.println(
    F("MQ3   Base: 25.8  Threshold: 29")
  );

  Serial.println(
    F("MQ5   Base: 495.6 Threshold: 546")
  );

  Serial.println(
    F("MQ135 Base: 48.6  Threshold: 54")
  );

  Serial.println(
    F("Detection = ANY ONE SENSOR")
  );

  Serial.println(
    F("==========================================")
  );

  Serial.println();


  lastSensorUpdate =
    millis();

  lastPageChange =
    millis();
}


// =====================================================
// LOOP
// =====================================================

void loop() {

  unsigned long now =
    millis();


  // ===================================================
  // CONTINUOUS SENSOR READING
  // ===================================================

  if (
    now - lastSensorUpdate >=
    SENSOR_UPDATE_TIME
  ) {

    lastSensorUpdate =
      now;


    // Read sensors

    updateSensors();


    // Ultrasonic

    distanceCM =
      readUltrasonic();


    // Terminal line

    printTelemetry();


    // -------------------------------------------------
    // OLED
    //
    // New gas event gets priority.
    // -------------------------------------------------

    if (
      gasAlertUntil > now
    ) {

      showGasAlert();
    }

    else {

      drawCurrentPage();
    }
  }


  // ===================================================
  // CHANGE OLED SENSOR PAGE
  // ===================================================

  if (
    now - lastPageChange >=
    OLED_PAGE_TIME
  ) {

    lastPageChange =
      now;


    currentPage++;


    if (currentPage > 4)
      currentPage = 0;


    if (
      gasAlertUntil <= now
    ) {

      drawCurrentPage();
    }
  }
}
