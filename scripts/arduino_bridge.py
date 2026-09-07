#!/usr/bin/env python3
"""
IR VIKRANT - Arduino Uno MQ-3 & Ultrasonic Distance USB Serial Bridge
====================================================================
Bridges hardware sensor readings from Arduino Uno:
  1. MQ-3 Narcotics / Volatile Gas Sensor (Pin A0)
  2. HC-SR04 Ultrasonic Distance Sensor (Trig Pin 9, Echo Pin 10)
over USB Serial to the IR VIKRANT web application (Localhost or Vercel Deployment).

Usage:
  # 1. Install prerequisites:
  pip install pyserial requests

  # 2. Run with Localhost:
  python scripts/arduino_bridge.py

  # 3. Run with Vercel Deployment:
  python scripts/arduino_bridge.py --url https://your-project.vercel.app --port COM3
"""

import sys
import time
import argparse
import json
import re

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None

try:
    import requests
except ImportError:
    requests = None


def find_arduino_port():
    """Auto-detect Arduino or CH340 COM port on Windows/Mac/Linux."""
    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        desc = (p.description or '').lower()
        mfg = (p.manufacturer or '').lower()
        if 'arduino' in desc or 'ch340' in desc or 'ftdi' in desc or 'usb-serial' in desc or 'arduino' in mfg:
            return p.device
    if ports:
        return ports[0].device
    return None


def parse_arduino_telemetry(raw_line: str):
    """
    Parses any line emitted by Arduino:
      1. JSON: '{"mq3": 45.2, "distance_m": 1.25, "distance_cm": 125}'
      2. Key-value: 'MQ3: 420, Distance: 1.25 m' or 'MQ3: 45.2 | Dist: 125cm'
      3. Comma-separated: '450, 125' (raw ADC, distance in cm)
      4. Raw ADC number: '420'
    Returns: (ppm, raw_adc, dist_m, dist_cm)
    """
    line = raw_line.strip()
    if not line:
        return None, None, None, None

    ppm = None
    raw_adc = None
    dist_m = None
    dist_cm = None

    # Pattern 1: JSON format
    if line.startswith('{') and line.endswith('}'):
        try:
            d = json.loads(line)
            # MQ-3: Check explicit PPM keys first for high precision
            if d.get('ppm') is not None or d.get('mq3_ppm') is not None:
                ppm_raw = float(d.get('ppm') if d.get('ppm') is not None else d.get('mq3_ppm'))
                ppm = round(ppm_raw, 1)
                raw_adc = int(d.get('mq3_raw') if d.get('mq3_raw') is not None else (ppm / 85.0) * 1023)
            else:
                val = (d.get('mq3') if d.get('mq3') is not None
                       else d.get('mq3_raw') if d.get('mq3_raw') is not None
                       else d.get('val') if d.get('val') is not None
                       else d.get('raw') if d.get('raw') is not None
                       else d.get('gas'))
                if val is not None:
                    val = float(val)
                    if val > 85:
                        ppm = round((val / 1023.0) * 85.0, 1)
                        raw_adc = int(val)
                    else:
                        ppm = round(val, 1)
                        raw_adc = int((val / 85.0) * 1023)

            # Distance
            dist_val = (d.get('distance_m') if d.get('distance_m') is not None
                        else d.get('distance') if d.get('distance') is not None
                        else d.get('dist') if d.get('dist') is not None
                        else d.get('distance_cm') if d.get('distance_cm') is not None
                        else d.get('cm') if d.get('cm') is not None
                        else d.get('m') if d.get('m') is not None
                        else d.get('range') if d.get('range') is not None
                        else d.get('d'))

            if dist_val is not None:
                dv = float(dist_val)
                if d.get('distance_cm') is not None or d.get('cm') is not None or dv > 15.0:
                    dist_cm = round(dv)
                    dist_m = round(dv / 100.0, 2)
                else:
                    dist_m = round(dv, 2)
                    dist_cm = round(dv * 100.0)

            return ppm, raw_adc, dist_m, dist_cm
        except Exception:
            pass

    # Pattern 2: Key-value / text regex
    dist_match = (re.search(r'(?:dist(?:ance)?|range|d)[\s:=]+([0-9.]+)\s*(cm|m(?:eter)?s?)?', line, re.IGNORECASE) or
                  re.search(r'([0-9.]+)\s*(cm|m(?:eter)?s?)\b', line, re.IGNORECASE))
    if dist_match:
        try:
            num = float(dist_match.group(1))
            unit = (dist_match.group(2) or '').lower()
            if unit.startswith('m') and not unit.startswith('cm'):
                dist_m = round(num, 2)
                dist_cm = round(num * 100.0)
            elif unit.startswith('cm') or num > 15.0:
                dist_cm = round(num)
                dist_m = round(num / 100.0, 2)
            else:
                dist_m = round(num, 2)
                dist_cm = round(num * 100.0)
        except Exception:
            pass

    mq3_match = re.search(r'(?:mq-?3|a0|gas|ppm)[\s:=]+([0-9.]+)', line, re.IGNORECASE)
    if mq3_match:
        try:
            val = float(mq3_match.group(1))
            if val > 100:
                ppm = round((val / 1023.0) * 85.0, 1)
                raw_adc = int(val)
            else:
                ppm = round(val, 1)
                raw_adc = int((val / 85.0) * 1023)
        except Exception:
            pass

    # Pattern 3: Comma separated '450, 125'
    if ppm is None and ',' in line:
        parts = re.findall(r'[-+]?\d*\.\d+|\d+', line)
        if len(parts) >= 2:
            try:
                v1 = float(parts[0])
                v2 = float(parts[1])
                if v1 > 100:
                    ppm = round((v1 / 1023.0) * 85.0, 1)
                    raw_adc = int(v1)
                else:
                    ppm = round(v1, 1)
                    raw_adc = int((v1 / 85.0) * 1023)

                if v2 > 15.0:
                    dist_cm = round(v2)
                    dist_m = round(v2 / 100.0, 2)
                else:
                    dist_m = round(v2, 2)
                    dist_cm = round(v2 * 100.0)
            except Exception:
                pass

    # Pattern 4: Bare single number
    if ppm is None and dist_m is None:
        try:
            val = float(line)
            if val > 100:
                ppm = round((val / 1023.0) * 85.0, 1)
                raw_adc = int(val)
            else:
                ppm = round(val, 1)
                raw_adc = int((val / 85.0) * 1023)
        except ValueError:
            pass

    return ppm, raw_adc, dist_m, dist_cm


def main():
    if serial is None or requests is None:
        print("[ERROR] Required packages missing. Please install them with:")
        print("        pip install pyserial requests")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="IR VIKRANT - Arduino Uno MQ-3 & Ultrasonic Serial Bridge")
    parser.add_argument("--port", type=str, default=None, help="COM port (e.g. COM3, COM4). Auto-detected if omitted.")
    parser.add_argument("--baud", type=int, default=9600, help="Serial baud rate (default: 9600)")
    parser.add_argument("--url", type=str, default="http://localhost:3000", help="Base URL of IR VIKRANT (localhost or Vercel URL)")
    parser.add_argument("--unit-id", type=str, default="c7569eb7-87ab-43db-905b-54baf7b106fc", help="Unit ID GUID")
    parser.add_argument("--lat", type=float, default=22.59548, help="Station Latitude")
    parser.add_argument("--lng", type=float, default=88.45420, help="Station Longitude")
    args = parser.parse_args()

    port = args.port or find_arduino_port()
    if not port:
        print("[!] No USB COM port found! Make sure Arduino Uno is plugged in via USB cable.")
        print("[!] Available ports: ", [p.device for p in serial.tools.list_ports.comports()])
        sys.exit(1)

    endpoint = args.url.rstrip('/') + '/api/sensors/ingest'
    print("=" * 68)
    print("  🛡️  IR VIKRANT - ARDUINO UNO MQ-3 & ULTRASONIC SERIAL BRIDGE")
    print("=" * 68)
    print(f" [*] Target USB Port : {port} @ {args.baud} baud")
    print(f" [*] Ingestion URL   : {endpoint}")
    print(f" [*] Unit ID         : {args.unit_id}")
    print(" [*] Supported       : MQ-3 (Pin A0) & Ultrasonic (Trig 9, Echo 10)")
    print(" [*] Tip: Close Arduino IDE's 'Serial Monitor' so COM port is free.")
    print("=" * 68)

    try:
        ser = serial.Serial(port, args.baud, timeout=2)
        time.sleep(1.5)  # Allow Arduino reset on DTR
        print(f"[✓] Connected to {port} successfully! Listening for telemetry...\n")
    except serial.SerialException as e:
        print(f"\n[ERROR] Could not open {port}: {e}")
        print("[!] Is Arduino IDE's Serial Monitor window open? Close it and retry.")
        sys.exit(1)

    last_post_time = 0
    post_interval = 2.0  # Ingest at most once every 2 seconds unless spike detected
    cached_dist_m = None
    cached_dist_cm = None

    try:
        while True:
            if ser.in_waiting > 0:
                raw_line = ser.readline().decode('utf-8', errors='replace').strip()
                if not raw_line:
                    continue

                ppm, raw_adc, dist_m, dist_cm = parse_arduino_telemetry(raw_line)

                if dist_m is not None:
                    cached_dist_m = dist_m
                    cached_dist_cm = dist_cm

                if ppm is None and dist_m is None:
                    continue

                now = time.time()
                is_spike = (ppm is not None and ppm >= 40.0)

                # Format terminal display
                status_icon = "🚨 [SPIKE]" if is_spike else "🟢 [NORMAL]"
                mq_str = f"MQ-3: {ppm:5.1f} PPM (ADC: {raw_adc:4d})" if ppm is not None else "MQ-3: standby"
                curr_dist_m = dist_m or cached_dist_m
                curr_dist_cm = dist_cm or cached_dist_cm
                dist_str = f" | Range: {curr_dist_m:.2f}m ({curr_dist_cm}cm) away" if curr_dist_m is not None else ""

                print(f"{status_icon} {mq_str}{dist_str} | Time: {time.strftime('%H:%M:%S')}")

                # Send to API (throttle to once every 2s, or immediately on spike)
                if (ppm is not None) and (is_spike or (now - last_post_time >= post_interval)):
                    payload = {
                        "unit_id": args.unit_id,
                        "sensor_type": "narcotics_mq3",
                        "value": ppm,
                        "unit_of_measure": "ppm",
                        "latitude": args.lat,
                        "longitude": args.lng,
                    }
                    if curr_dist_m is not None:
                        payload["distance_m"] = curr_dist_m
                        payload["distance_cm"] = curr_dist_cm

                    try:
                        resp = requests.post(endpoint, json=payload, timeout=3)
                        if resp.status_code == 200:
                            data = resp.json()
                            if data.get('thresholdExceeded'):
                                dist_tag = f" at {curr_dist_m:.2f}m distance" if curr_dist_m is not None else ""
                                print(f"    ↳ 📸 AUTO-CAPTURE TRIGGERED & LOGGED TO DATABASE{dist_tag}!")
                        else:
                            print(f"    ↳ [WARN] API returned HTTP {resp.status_code}: {resp.text[:80]}")
                    except Exception as req_err:
                        print(f"    ↳ [WARN] Could not post to API: {req_err}")

                    last_post_time = now

            time.sleep(0.04)

    except KeyboardInterrupt:
        print("\n[*] Stopping Arduino Bridge. Goodbye!")
    finally:
        ser.close()


if __name__ == '__main__':
    main()
