/*
  ========================================================================================
  IR VIKRANT - Autonomous Quadruped Directional Chemical Plume Tracking (Chemotaxis Engine)
  ========================================================================================
  Hardware Configuration:
    - 4 MQ Gas Sensors facing 4 orthogonal directions:
        • Front (0° Heading)   : MQ-2   (Analog A0)
        • Right (+90° Heading) : MQ-3   (Analog A1) - Narcotics & Solvent Vapor Specialist
        • Rear  (180° Heading) : MQ-5   (Analog A2)
        • Left  (-90° Heading) : MQ-135 (Analog A3) - Chemical Precursors & Air Quality
    - Front Ultrasonic Obstacle Avoidance:
        • HC-SR04 TRIG: Pin 9
        • HC-SR04 ECHO: Pin 10
    - Quadruped Motor / Servo Driver Control:
        • Left Drive PWM  : Pin 5 (or PCA9685 I2C)
        • Right Drive PWM : Pin 6 (or PCA9685 I2C)
        • Dir A / Dir B   : Pins 7, 8
    - Telemetry Output:
        • USB Serial @ 9600 Baud (Standard JSON for IR Vikrant Web Serial Dashboard)
  ========================================================================================
*/

#define PIN_MQ2_FRONT   A0
#define PIN_MQ3_RIGHT   A1
#define PIN_MQ5_REAR    A2
#define PIN_MQ135_LEFT  A3

#define PIN_TRIG        9
#define PIN_ECHO        10

// Motor / Actuator Pin Definitions (L298N / Quadruped Gait Controller)
#define PIN_MOTOR_LEFT_PWM   5
#define PIN_MOTOR_RIGHT_PWM  6
#define PIN_MOTOR_DIR_L      7
#define PIN_MOTOR_DIR_R      8

// Algorithm Tuning Parameters
const float PLUME_TRIGGER_THRESHOLD = 25.0; // Min relative % excitation required to engage
const float OBSTACLE_STOP_CM        = 30.0; // Emergency halt if obstacle closer than 30cm
const int   WARMUP_SAMPLES          = 50;   // 50 samples for clean-air ambient baseline calibration

// Running Ambient Clean-Air Baselines
float baseline_front = 300.0;
float baseline_right = 160.0;
float baseline_rear  = 220.0;
float baseline_left  = 280.0;

// Filtered ADC Values (Exponential Moving Average)
float filtered_front = 300.0;
float filtered_right = 160.0;
float filtered_rear  = 220.0;
float filtered_left  = 280.0;

// Ultrasonic Distance
float current_distance_cm = 120.0;

// Current Motion Command
String current_action = "IDLE";
float target_bearing_deg = 0.0;
float plume_magnitude = 0.0;

// Timing
unsigned long last_sample_time = 0;
const unsigned long SAMPLE_INTERVAL_MS = 250; // 4Hz sample & gait decision loop

void setup() {
  Serial.begin(9600);

  pinMode(PIN_MQ2_FRONT, INPUT);
  pinMode(PIN_MQ3_RIGHT, INPUT);
  pinMode(PIN_MQ5_REAR, INPUT);
  pinMode(PIN_MQ135_LEFT, INPUT);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  pinMode(PIN_MOTOR_LEFT_PWM, OUTPUT);
  pinMode(PIN_MOTOR_RIGHT_PWM, OUTPUT);
  pinMode(PIN_MOTOR_DIR_L, OUTPUT);
  pinMode(PIN_MOTOR_DIR_R, OUTPUT);

  stopRobot();

  // Print startup banner
  Serial.println(F("{\"system\":\"IR_VIKRANT_CHEMOTAXIS_INITIALIZING\",\"status\":\"CALIBRATING_BASELINES\"}"));

  // Initial Baseline Auto-Calibration Loop (Clean Air Reference)
  float sum_f = 0, sum_r = 0, sum_b = 0, sum_l = 0;
  for (int i = 0; i < WARMUP_SAMPLES; i++) {
    sum_f += analogRead(PIN_MQ2_FRONT);
    sum_r += analogRead(PIN_MQ3_RIGHT);
    sum_b += analogRead(PIN_MQ5_REAR);
    sum_l += analogRead(PIN_MQ135_LEFT);
    delay(40);
  }

  baseline_front = sum_f / WARMUP_SAMPLES;
  baseline_right = sum_r / WARMUP_SAMPLES;
  baseline_rear  = sum_b / WARMUP_SAMPLES;
  baseline_left  = sum_l / WARMUP_SAMPLES;

  filtered_front = baseline_front;
  filtered_right = baseline_right;
  filtered_rear  = baseline_rear;
  filtered_left  = baseline_left;

  Serial.println(F("{\"system\":\"IR_VIKRANT_CHEMOTAXIS_ARMED\",\"status\":\"READY\"}"));
}

// Read ultrasonic sensor in centimeters
float readUltrasonic() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long duration = pulseIn(PIN_ECHO, HIGH, 25000); // 25ms timeout
  if (duration > 115 && duration < 23320) {
    return (duration * 0.0343) / 2.0;
  }
  return 150.0; // Default clear range if out of bounds
}

// -------------------------------------------------------------
// Quadruped Motion Control Functions
// -------------------------------------------------------------
void walkForward() {
  digitalWrite(PIN_MOTOR_DIR_L, HIGH);
  digitalWrite(PIN_MOTOR_DIR_R, HIGH);
  analogWrite(PIN_MOTOR_LEFT_PWM, 200);
  analogWrite(PIN_MOTOR_RIGHT_PWM, 200);
  current_action = "FORWARD";
}

void pivotRight() {
  digitalWrite(PIN_MOTOR_DIR_L, HIGH);
  digitalWrite(PIN_MOTOR_DIR_R, LOW);
  analogWrite(PIN_MOTOR_LEFT_PWM, 180);
  analogWrite(PIN_MOTOR_RIGHT_PWM, 180);
  current_action = "TURN_RIGHT";
}

void pivotLeft() {
  digitalWrite(PIN_MOTOR_DIR_L, LOW);
  digitalWrite(PIN_MOTOR_DIR_R, HIGH);
  analogWrite(PIN_MOTOR_LEFT_PWM, 180);
  analogWrite(PIN_MOTOR_RIGHT_PWM, 180);
  current_action = "TURN_LEFT";
}

void reverseTurn() {
  digitalWrite(PIN_MOTOR_DIR_L, LOW);
  digitalWrite(PIN_MOTOR_DIR_R, HIGH);
  analogWrite(PIN_MOTOR_LEFT_PWM, 220);
  analogWrite(PIN_MOTOR_RIGHT_PWM, 220);
  current_action = "TURN_REVERSE";
}

void stopRobot() {
  analogWrite(PIN_MOTOR_LEFT_PWM, 0);
  analogWrite(PIN_MOTOR_RIGHT_PWM, 0);
  digitalWrite(PIN_MOTOR_DIR_L, LOW);
  digitalWrite(PIN_MOTOR_DIR_R, LOW);
  current_action = "IDLE";
}

// -------------------------------------------------------------
// Main Autonomous Loop
// -------------------------------------------------------------
void loop() {
  unsigned long now = millis();
  if (now - last_sample_time < SAMPLE_INTERVAL_MS) return;
  last_sample_time = now;

  // 1. Read Raw ADC from all 4 directional MQ sensors
  int raw_f = analogRead(PIN_MQ2_FRONT);
  int raw_r = analogRead(PIN_MQ3_RIGHT);
  int raw_b = analogRead(PIN_MQ5_REAR);
  int raw_l = analogRead(PIN_MQ135_LEFT);

  // 2. Exponential Moving Average Low-Pass Filter (removes electrical spikes & jitter)
  const float alpha = 0.25;
  filtered_front = (alpha * raw_f) + ((1.0 - alpha) * filtered_front);
  filtered_right = (alpha * raw_r) + ((1.0 - alpha) * filtered_right);
  filtered_rear  = (alpha * raw_b) + ((1.0 - alpha) * filtered_rear);
  filtered_left  = (alpha * raw_l) + ((1.0 - alpha) * filtered_left);

  // 3. Slow ambient baseline drift tracking (only update when air is calm)
  const float drift_alpha = 0.002;
  if (raw_f < baseline_front * 1.15) baseline_front = (drift_alpha * raw_f) + ((1.0 - drift_alpha) * baseline_front);
  if (raw_r < baseline_right * 1.15) baseline_right = (drift_alpha * raw_r) + ((1.0 - drift_alpha) * baseline_right);
  if (raw_b < baseline_rear  * 1.15) baseline_rear  = (drift_alpha * raw_b) + ((1.0 - drift_alpha) * baseline_rear);
  if (raw_l < baseline_left  * 1.15) baseline_left  = (drift_alpha * raw_l) + ((1.0 - drift_alpha) * baseline_left);

  // 4. Calculate Normalized Delta Excitation (ΔS) in Percentage above clean air
  float delta_f = max(0.0, ((filtered_front - baseline_front) / baseline_front) * 100.0);
  float delta_r = max(0.0, ((filtered_right - baseline_right) / baseline_right) * 100.0);
  float delta_b = max(0.0, ((filtered_rear  - baseline_rear)  / baseline_rear)  * 100.0);
  float delta_l = max(0.0, ((filtered_left  - baseline_left)  / baseline_left)  * 100.0);

  // 5. 2D Vector Decomposition & Directional Plume Solver
  // X axis: Right (+1) vs Left (-1)
  // Y axis: Front (+1) vs Rear (-1)
  float vx = delta_r - delta_l;
  float vy = delta_f - delta_b;

  plume_magnitude = sqrt((vx * vx) + (vy * vy));
  target_bearing_deg = atan2(vx, vy) * (180.0 / 3.14159265); // -180° to +180°

  // 6. Check Front Ultrasonic Distance
  current_distance_cm = readUltrasonic();

  // 7. Quadruped Chemotaxis Decision Logic
  if (current_distance_cm < OBSTACLE_STOP_CM) {
    // Safety Halt: Obstacle right in front of the robot
    stopRobot();
    current_action = "OBSTACLE_HOLD";
  } else if (plume_magnitude < PLUME_TRIGGER_THRESHOLD) {
    // Normal Ambient Air: No active smell gradient
    stopRobot();
    current_action = "IDLE";
  } else {
    // Active Plume Detected! Steer toward the highest gradient
    if (target_bearing_deg >= -25.0 && target_bearing_deg <= 25.0) {
      walkForward();
    } else if (target_bearing_deg > 25.0 && target_bearing_deg <= 115.0) {
      pivotRight();
    } else if (target_bearing_deg < -25.0 && target_bearing_deg >= -115.0) {
      pivotLeft();
    } else {
      reverseTurn();
    }
  }

  // 8. Stream Structured JSON Telemetry over Serial
  Serial.print(F("{\"front_mq2\":")); Serial.print(raw_f);
  Serial.print(F(",\"right_mq3\":")); Serial.print(raw_r);
  Serial.print(F(",\"rear_mq5\":")); Serial.print(raw_b);
  Serial.print(F(",\"left_mq135\":")); Serial.print(raw_l);
  Serial.print(F(",\"delta_front\":")); Serial.print(delta_f, 1);
  Serial.print(F(",\"delta_right\":")); Serial.print(delta_r, 1);
  Serial.print(F(",\"delta_rear\":")); Serial.print(delta_b, 1);
  Serial.print(F(",\"delta_left\":")); Serial.print(delta_l, 1);
  Serial.print(F(",\"bearing_deg\":")); Serial.print(target_bearing_deg, 1);
  Serial.print(F(",\"magnitude\":")); Serial.print(plume_magnitude, 1);
  Serial.print(F(",\"action\":\"")); Serial.print(current_action);
  Serial.print(F("\",\"distance_cm\":")); Serial.print(current_distance_cm, 1);
  Serial.println(F("}"));
}
