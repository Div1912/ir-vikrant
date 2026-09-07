'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Pill,
  Activity,
  AlertTriangle,
  Camera,
  Cpu,
  Zap,
  RotateCcw,
  Sliders,
  Sparkles,
  ExternalLink,
  MapPin,
  Clock,
  CheckCircle2,
  Usb,
  Code,
  Scan,
  ShieldAlert,
  Radio,
  Play,
  Pause,
  Smartphone,
  Trash2,
  Radar,
  Target,
  Crosshair,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { findNearestRailwayStation } from '@/lib/railwayStations';
import { clearDetectionEvents } from '@/lib/logService';

// Synthesize camera shutter beep
function playShutterSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(280, audioCtx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch {}
}

export default function NarcoticsSensorPage() {
  // Navigation / Filter state
  const [timeRange, setTimeRange] = useState<'5m' | '15m' | '1h' | '24h'>('5m');
  const [threshold, setThreshold] = useState<number>(40.0);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Hardware Connection State
  const [isSerialConnected, setIsSerialConnected] = useState<boolean>(false);
  const [isUsingMockData, setIsUsingMockData] = useState<boolean>(true);
  const [showArduinoModal, setShowArduinoModal] = useState<boolean>(false);
  const [serialError, setSerialError] = useState<string | null>(null);

  // Live Telemetry Streams
  const [readings, setReadings] = useState<any[]>([]);
  const [mq3Raw, setMq3Raw] = useState<number>(245);
  const [mq135Raw, setMq135Raw] = useState<number>(180);
  const [mq3Ppm, setMq3Ppm] = useState<number>(19.4);
  const [mq135Ppm, setMq135Ppm] = useState<number>(14.2);
  const [compositeIndex, setCompositeIndex] = useState<number>(17.3);
  const [lastSpikeTime, setLastSpikeTime] = useState<string | null>(null);
  const [lastRawSerialLine, setLastRawSerialLine] = useState<string | null>(null);
  const [rawSerialPacketsCount, setRawSerialPacketsCount] = useState<number>(0);

  // Ultrasonic Distance Telemetry State (HC-SR04)
  const [distanceM, setDistanceM] = useState<number>(1.25);
  const [distanceCm, setDistanceCm] = useState<number>(125);
  const [distanceStatus, setDistanceStatus] = useState<'contact' | 'proximity' | 'clear'>('proximity');
  const [isUltrasonicActive, setIsUltrasonicActive] = useState<boolean>(false);
  const distanceMRef = useRef<number>(1.25);
  const distanceCmRef = useRef<number>(125);

  // Precision Calibration Baseline Offset (Ambient Clean Air Trim)
  const [baselineOffset, setBaselineOffset] = useState<number>(0);

  // Load saved baseline offset from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vikrant_mq3_baseline_offset');
      if (saved) setBaselineOffset(Number(saved) || 0);
    }
  }, []);

  const handleCalibrateBaseline = () => {
    // Current ambient air target is 15.0 PPM
    const currentUncal = mq3Ppm + baselineOffset;
    const newOffset = Math.max(0, Number((currentUncal - 15.0).toFixed(1)));
    setBaselineOffset(newOffset);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vikrant_mq3_baseline_offset', String(newOffset));
    }
    setSpikeNotification(`✓ Calibrated to Clean Air baseline (15.0 PPM target). Zero trim: -${newOffset} PPM`);
    setTimeout(() => setSpikeNotification(null), 4000);
  };

  const handleResetBaseline = () => {
    setBaselineOffset(0);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vikrant_mq3_baseline_offset');
    }
    setSpikeNotification('✓ Baseline calibration reset to factory raw curve.');
    setTimeout(() => setSpikeNotification(null), 3000);
  };

  const updateDistance = (meters: number, cm?: number) => {
    // Ignore physical anomalies or timeout glitches (< 2cm or > 4.5m)
    if (meters < 0.02 || meters > 4.5) return;

    const prevM = distanceMRef.current;
    let m = meters;
    // Anti-jitter low-pass smoothing when stationary or moving smoothly
    if (prevM > 0.05 && Math.abs(meters - prevM) < 0.35) {
      m = Number((0.75 * meters + 0.25 * prevM).toFixed(2));
    } else {
      m = Number(meters.toFixed(2));
    }

    const c = cm !== undefined ? Math.round(cm) : Math.round(m * 100);
    setDistanceM(m);
    setDistanceCm(c);
    distanceMRef.current = m;
    distanceCmRef.current = c;
    setIsUltrasonicActive(true);

    if (m < 0.5) setDistanceStatus('contact');
    else if (m < 1.5) setDistanceStatus('proximity');
    else setDistanceStatus('clear');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vikrant:distance_update', {
          detail: { distance_m: m, distance_cm: c },
        })
      );
    }
  };

  // Auto-Capture State
  const [captures, setCaptures] = useState<any[]>([]);
  const [inspectCapture, setInspectCapture] = useState<any | null>(null);
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);
  const [spikeNotification, setSpikeNotification] = useState<string | null>(null);
  const [isClearingLogs, setIsClearingLogs] = useState<boolean>(false);
  const [sketchTab, setSketchTab] = useState<'single_mq3' | 'raw_analog' | 'dual' | 'python_bridge'>('single_mq3');

  // Geo Location & Station Info
  const [currentCoords, setCurrentCoords] = useState<[number, number]>([22.59548, 88.45420]);
  const [stationName, setStationName] = useState<string>('Bidhan Nagar Road (BNR) • Eastern Railway');

  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const lastAutoCaptureTimeRef = useRef<number>(0);
  const [cameraSource, setCameraSource] = useState<'ip_webcam' | 'device'>('ip_webcam');
  const [ipWebcamUrl, setIpWebcamUrl] = useState<string>('http://10.35.147.52:8080/video');
  const [ipStreamMode, setIpStreamMode] = useState<'direct' | 'proxy'>('direct');
  const [ipCamConnected, setIpCamConnected] = useState<boolean>(false);
  const ipImgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Detect GPS Location on mount
  useEffect(() => {
    setIsMounted(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          setCurrentCoords([latitude, longitude]);
          const nearest = findNearestRailwayStation(latitude, longitude);
          setStationName(nearest.fullLabel);
        },
        () => {},
        { timeout: 5000 }
      );
    }
  }, []);

  // Fetch initial auto-captures for narcotics from Supabase
  useEffect(() => {
    const fetchCaptures = async () => {
      const { data } = await supabase
        .from('detection_events')
        .select('*')
        .or('substance_category.ilike.%narcotics%,substance_name.ilike.%mq-3%,substance_name.ilike.%mq-135%')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (data) setCaptures(data);
    };

    fetchCaptures();

    // Listen to local capture events in 0ms
    const handleLocalCapture = (e: any) => {
      const ev = e.detail;
      if (ev.substance_category?.includes('Narcotics') || ev.substance_name?.includes('MQ-3') || ev.substance_name?.includes('MQ-135')) {
        setCaptures(prev => [ev, ...prev]);
      }
    };

    window.addEventListener('vikrant:new_capture', handleLocalCapture);
    return () => window.removeEventListener('vikrant:new_capture', handleLocalCapture);
  }, []);

  // Sync camera settings from localStorage and listen to cross-page settings updates
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSrc = localStorage.getItem('vikrant_camera_source') as 'ip_webcam' | 'device' | null;
      if (savedSrc) setCameraSource(savedSrc);
      const savedUrl = localStorage.getItem('vikrant_ip_webcam_url');
      if (savedUrl) setIpWebcamUrl(savedUrl);
      const savedMode = localStorage.getItem('vikrant_ip_stream_mode') as 'direct' | 'proxy' | null;
      if (savedMode) setIpStreamMode(savedMode);

      const handleSettingsChange = (e: any) => {
        if (e.detail) {
          if (e.detail.source) setCameraSource(e.detail.source);
          if (e.detail.url) setIpWebcamUrl(e.detail.url);
          if (e.detail.mode) setIpStreamMode(e.detail.mode);
        }
      };
      window.addEventListener('vikrant:camera_settings_changed', handleSettingsChange);
      return () => window.removeEventListener('vikrant:camera_settings_changed', handleSettingsChange);
    }
  }, []);

  // Connect to device webcam ONLY if cameraSource === 'device', stopping all tracks when switched off
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    if (cameraSource === 'device') {
      if (navigator?.mediaDevices?.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
          .then(stream => {
            activeStream = stream;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play().catch(() => {});
            }
          })
          .catch(() => {});
      }
    } else {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [cameraSource]);

  // Trigger Camera Snapshot on Spike
  const triggerAutoCapture = useCallback(
    async (peakPpm: number, triggerSensor: string) => {
      const now = Date.now();
      // Cooldown of 8s between auto-captures to prevent flood
      if (now - lastAutoCaptureTimeRef.current < 8000) return;
      lastAutoCaptureTimeRef.current = now;

      // Flash & Audio
      setShutterFlash(true);
      playShutterSound();
      setTimeout(() => setShutterFlash(false), 250);

      // Create snapshot image on canvas
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        let drewRealFrame = false;
        // Priority 1: Mobile Phone IP Webcam stream
        if (
          cameraSource === 'ip_webcam' &&
          ipImgRef.current &&
          (ipImgRef.current.naturalWidth > 0 || ipImgRef.current.complete)
        ) {
          try {
            ctx.drawImage(ipImgRef.current, 0, 0, canvas.width, canvas.height);
            drewRealFrame = true;
          } catch {
            drewRealFrame = false;
          }
        }
        // Priority 2: Laptop / USB Webcam
        else if (cameraSource === 'device' && videoRef.current && videoRef.current.readyState >= 2) {
          try {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            drewRealFrame = true;
          } catch {
            drewRealFrame = false;
          }
        }

        if (!drewRealFrame) {
          // Synthetic high-res tactical recon frame
          ctx.fillStyle = '#090b10';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Grid lines
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
          ctx.lineWidth = 1;
          for (let x = 0; x < canvas.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
          for (let y = 0; y < canvas.height; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
        }

        const currDistM = distanceMRef.current;
        const currDistCm = distanceCmRef.current;

        // Optical Target Crosshairs & Rangefinder Overlay
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const bSize = 20;
        const bW = 130;
        const bH = 90;

        ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
        ctx.lineWidth = 2;
        // Corner brackets
        ctx.beginPath(); ctx.moveTo(cx - bW/2, cy - bH/2 + bSize); ctx.lineTo(cx - bW/2, cy - bH/2); ctx.lineTo(cx - bW/2 + bSize, cy - bH/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + bW/2 - bSize, cy - bH/2); ctx.lineTo(cx + bW/2, cy - bH/2); ctx.lineTo(cx + bW/2, cy - bH/2 + bSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - bW/2, cy + bH/2 - bSize); ctx.lineTo(cx - bW/2, cy + bH/2); ctx.lineTo(cx - bW/2 + bSize, cy + bH/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + bW/2 - bSize, cy + bH/2); ctx.lineTo(cx + bW/2, cy + bH/2); ctx.lineTo(cx + bW/2, cy + bH/2 - bSize); ctx.stroke();

        // Target Center Reticle Dot
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 2 * Math.PI); ctx.fill();

        // Range Tag Badge on Reticle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(cx - 75, cy + bH/2 + 6, 150, 22);
        ctx.strokeStyle = '#06b6d4';
        ctx.strokeRect(cx - 75, cy + bH/2 + 6, 150, 22);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`⛶ TARGET: ${currDistM.toFixed(2)}m (${currDistCm}cm)`, cx, cy + bH/2 + 21);
        ctx.textAlign = 'left';

        // Stamped Tactical HUD Banner
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.fillRect(16, 16, canvas.width - 32, 34);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`🚨 NARCOTICS SPIKE: ${peakPpm} PPM [${triggerSensor}] • ${currDistM.toFixed(2)}m FROM ROBOT`, 24, 38);

        // Bottom Telemetry Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(16, canvas.height - 48, canvas.width - 32, 36);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '10px monospace';
        ctx.fillText(`LOC: ${currentCoords[0].toFixed(5)}° N, ${currentCoords[1].toFixed(5)}° E • ${stationName.split('•')[0].trim()}`, 24, canvas.height - 28);
        ctx.fillText(`TIME: ${new Date().toLocaleTimeString()} • ULTRASONIC RANGE: ${currDistM.toFixed(2)}m (${currDistCm}cm) • SENSOR: MQ-3`, 24, canvas.height - 14);
      }

      const currDistM = distanceMRef.current;
      const photoUrl = canvas.toDataURL('image/jpeg', 0.85);
      const timestamp = new Date().toISOString();

      const newEvent = {
        unit_id: 'c7569eb7-87ab-43db-905b-54baf7b106fc',
        substance_category: 'Narcotics MOS (MQ-3/MQ-135)',
        substance_name: `Narcotics Vapor Spike: ${peakPpm} ppm (${triggerSensor}) • Target at ${currDistM.toFixed(2)}m from robot`,
        confidence_tier: 'confirmed',
        confidence_score: 0.96,
        latitude: currentCoords[0],
        longitude: currentCoords[1],
        station: stationName,
        status: 'new',
        timestamp,
        photo_url: photoUrl,
      };

      // Save to Supabase
      const { data: inserted } = await supabase.from('detection_events').insert(newEvent).select().single();
      const finalItem = inserted || { ...newEvent, id: `local-${now}` };

      setCaptures(prev => [finalItem, ...prev]);
      setLastSpikeTime(new Date().toLocaleTimeString());
      setSpikeNotification(`📸 AUTO-CAPTURED: ${peakPpm} PPM at ${currDistM.toFixed(2)}m distance from robot!`);
      setTimeout(() => setSpikeNotification(null), 5000);

      window.dispatchEvent(new CustomEvent('vikrant:new_capture', { detail: finalItem }));
    },
    [currentCoords, stationName]
  );

  // Disconnect cleanly from Arduino Uno to release USB COM port
  const disconnectArduinoSerial = async () => {
    try {
      if (serialReaderRef.current) {
        try {
          await serialReaderRef.current.cancel();
        } catch {}
        try {
          serialReaderRef.current.releaseLock();
        } catch {}
        serialReaderRef.current = null;
      }
      if (serialPortRef.current) {
        try {
          await serialPortRef.current.close();
        } catch {}
        serialPortRef.current = null;
      }
    } catch {}
    setIsSerialConnected(false);
    setLastRawSerialLine(null);
    setRawSerialPacketsCount(0);
  };

  // Web Serial API: Connect directly to Arduino Uno via USB (Works on Localhost & Vercel HTTPS)
  const connectArduinoSerial = async (targetPort?: any) => {
    // Avoid double connect if already actively streaming
    if (serialPortRef.current && serialReaderRef.current) {
      console.log('[IR VIKRANT] Serial already active.');
      return;
    }

    try {
      if (!('serial' in navigator)) {
        setSerialError('Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Brave on desktop.');
        return;
      }

      setSerialError(null);

      // Verify that targetPort is an actual SerialPort instance with open() method (not a React click event!)
      let port: any = null;
      if (targetPort && typeof targetPort.open === 'function') {
        port = targetPort;
      } else {
        // Request user to pick the Arduino port from browser dialog
        port = await (navigator as any).serial.requestPort();
      }

      if (!port || typeof port.open !== 'function') {
        throw new Error('Valid serial port was not found or selected.');
      }

      // Check if port is already open
      if (!port.readable) {
        await port.open({ baudRate: 9600 });
      }

      serialPortRef.current = port;
      setIsSerialConnected(true);
      setIsUsingMockData(false); // Disable mock data immediately on hardware connection!

      // If readable stream is currently locked, wait or release
      if (port.readable.locked) {
        console.warn('[IR VIKRANT] Port readable is already locked.');
        return;
      }

      const reader = port.readable.getReader();
      serialReaderRef.current = reader;
      const textDecoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            buffer += textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          setLastRawSerialLine(trimmed);
          setRawSerialPacketsCount(c => c + 1);

          try {
            let parsedMq3: number | null = null;
            let parsedMq135: number | null = null;
            let parsedDistM: number | null = null;
            let parsedDistCm: number | null = null;
            let raw3: number | undefined = undefined;
            let raw135: number | undefined = undefined;

            // Pattern 1: JSON format (e.g. {"mq3": 45.2, "distance_m": 1.25, "distance_cm": 125})
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              const data = JSON.parse(trimmed);
              // Gas / MQ-3: Check explicit PPM keys first for high precision
              if (data.ppm !== undefined || data.mq3_ppm !== undefined) {
                const p = Number(data.ppm ?? data.mq3_ppm);
                if (!isNaN(p)) {
                  parsedMq3 = Number(p.toFixed(1));
                  raw3 = data.mq3_raw !== undefined ? Number(data.mq3_raw) : Math.round((parsedMq3 / 85) * 1023);
                }
              } else {
                const rawVal = data.mq3 ?? data.mq3_raw ?? data.val ?? data.raw ?? data.gas;
                if (rawVal !== undefined && rawVal !== null) {
                  const val = Number(rawVal);
                  if (val > 85) {
                    raw3 = Math.round(val);
                    parsedMq3 = Number(((val / 1023) * 85).toFixed(1));
                  } else {
                    parsedMq3 = Number(val.toFixed(1));
                    raw3 = Math.round((val / 85) * 1023);
                  }
                }
              }

              // MQ-135
              if (data.mq135_ppm !== undefined) {
                const p135 = Number(data.mq135_ppm);
                if (!isNaN(p135)) {
                  parsedMq135 = Number(p135.toFixed(1));
                  raw135 = data.mq135_raw !== undefined ? Number(data.mq135_raw) : Math.round((parsedMq135 / 65) * 1023);
                }
              } else if (data.mq135 !== undefined) {
                const val135 = Number(data.mq135);
                if (val135 > 65) {
                  raw135 = Math.round(val135);
                  parsedMq135 = Number(((val135 / 1023) * 65).toFixed(1));
                } else {
                  parsedMq135 = Number(val135.toFixed(1));
                  raw135 = Math.round((val135 / 65) * 1023);
                }
              }
              // Ultrasonic Distance
              const rawDist = data.distance_m ?? data.dist_m ?? data.distance ?? data.dist ?? data.distance_cm ?? data.dist_cm ?? data.cm ?? data.m ?? data.range ?? data.d;
              if (rawDist !== undefined && rawDist !== null) {
                const dNum = Number(rawDist);
                if (!isNaN(dNum)) {
                  if (data.distance_cm !== undefined || data.dist_cm !== undefined || data.cm !== undefined || dNum > 15) {
                    parsedDistCm = Math.round(dNum);
                    parsedDistM = Number((dNum / 100).toFixed(2));
                  } else {
                    parsedDistM = Number(dNum.toFixed(2));
                    parsedDistCm = Math.round(dNum * 100);
                  }
                }
              }
            }
            // Pattern 2: Key-value / text regex
            else {
              // Check distance keywords: Distance: 1.25m or Dist: 125cm or Range: 1.3
              const distMatch = trimmed.match(/(?:dist(?:ance)?|range|d)[\s:=]+([0-9.]+)\s*(cm|m(?:eter)?s?)?/i) ||
                                trimmed.match(/([0-9.]+)\s*(cm|m(?:eter)?s?)\b/i);
              if (distMatch) {
                const num = parseFloat(distMatch[1]);
                const unit = (distMatch[2] || '').toLowerCase();
                if (!isNaN(num)) {
                  if (unit.startsWith('m') && !unit.startsWith('cm')) {
                    parsedDistM = Number(num.toFixed(2));
                    parsedDistCm = Math.round(num * 100);
                  } else if (unit.startsWith('cm') || num > 15) {
                    parsedDistCm = Math.round(num);
                    parsedDistM = Number((num / 100).toFixed(2));
                  } else {
                    parsedDistM = Number(num.toFixed(2));
                    parsedDistCm = Math.round(num * 100);
                  }
                }
              }

              // Check MQ-3 keywords: PPM: 45.2 vs MQ3: 450 / A0: 420
              const ppmMatch = trimmed.match(/(?:ppm)[\s:=]+([0-9.]+)/i);
              const mq3Match = trimmed.match(/(?:mq-?3|a0|gas)[\s:=]+([0-9.]+)/i);

              if (ppmMatch) {
                const val = parseFloat(ppmMatch[1]);
                if (!isNaN(val)) {
                  parsedMq3 = Number(val.toFixed(1));
                  raw3 = Math.round((val / 85) * 1023);
                }
              } else if (mq3Match) {
                const val = parseFloat(mq3Match[1]);
                if (!isNaN(val)) {
                  if (val > 85) {
                    raw3 = Math.round(val);
                    parsedMq3 = Number(((val / 1023) * 85).toFixed(1));
                  } else {
                    parsedMq3 = Number(val.toFixed(1));
                    raw3 = Math.round((val / 85) * 1023);
                  }
                }
              } else if (trimmed.includes(',')) {
                // Comma-separated: "450, 125" (MQ3 raw ADC, distance cm)
                const parts = trimmed.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                if (parts.length >= 2) {
                  const v1 = parts[0];
                  const v2 = parts[1];
                  if (v1 > 85) {
                    raw3 = Math.round(v1);
                    parsedMq3 = Number(((v1 / 1023) * 85).toFixed(1));
                  } else {
                    parsedMq3 = Number(v1.toFixed(1));
                    raw3 = Math.round((v1 / 85) * 1023);
                  }
                  if (v2 > 15) {
                    parsedDistCm = Math.round(v2);
                    parsedDistM = Number((v2 / 100).toFixed(2));
                  } else {
                    parsedDistM = Number(v2.toFixed(2));
                    parsedDistCm = Math.round(v2 * 100);
                  }
                }
              } else if (!isNaN(Number(trimmed))) {
                // Single bare number
                const val = Number(trimmed);
                if (val > 100) {
                  raw3 = val;
                  parsedMq3 = Number(((val / 1023) * 85).toFixed(1));
                } else {
                  parsedMq3 = val;
                  raw3 = Math.round((val / 85) * 1023);
                }
              }
            }

            // If distance was found, update rangefinder immediately
            if (parsedDistM !== null) {
              updateDistance(parsedDistM, parsedDistCm ?? undefined);
            }

            // If MQ-3 was found, process narcotics packet
            if (parsedMq3 !== null) {
              const finalMq3 = Math.max(0, Math.min(100, parsedMq3));
              const finalMq135 = parsedMq135 !== null ? Math.max(0, Math.min(100, parsedMq135)) : Number((finalMq3 * 0.7).toFixed(1));
              handleIncomingSensorData(finalMq3, finalMq135, 'ARDUINO_UNO', raw3, raw135, parsedDistM, parsedDistCm);
            }
          } catch {}
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
    serialReaderRef.current = null;
  }
} catch (err: any) {
      if (err.name === 'NotFoundError') {
        // User closed the port picker without selecting
      } else if (err.name === 'NetworkError' || err.message?.includes('Failed to open') || err.message?.includes('access')) {
        setSerialError('COM Port is BUSY or LOCKED! Please close the Arduino IDE "Serial Monitor" window, then click Connect.');
      } else {
        setSerialError(`Serial Connection Error: ${err.message}`);
      }
      setIsSerialConnected(false);
    }
  };

  // Auto-connect to previously authorized Arduino Uno port on mount or when USB is plugged in
  useEffect(() => {
    if (typeof window === 'undefined' || !('serial' in navigator)) return;
    let isCancelled = false;

    // Check for previously paired Arduino port
    (navigator as any).serial
      .getPorts()
      .then((ports: any[]) => {
        if (!isCancelled && ports && ports.length > 0 && !serialPortRef.current) {
          console.log('[IR VIKRANT] Auto-connecting to authorized Arduino Uno USB port...');
          connectArduinoSerial(ports[0]);
        }
      })
      .catch(() => {});

    // Listen for USB connection events
    const handleConnect = (e: any) => {
      console.log('[IR VIKRANT] USB device plugged in:', e);
      const port = e?.port || (e?.target && typeof e.target.open === 'function' ? e.target : null);
      if (port && typeof port.open === 'function' && !serialPortRef.current) {
        connectArduinoSerial(port);
      }
    };

    const handleDisconnect = () => {
      console.log('[IR VIKRANT] USB device disconnected');
      disconnectArduinoSerial();
    };

    (navigator as any).serial.addEventListener('connect', handleConnect);
    (navigator as any).serial.addEventListener('disconnect', handleDisconnect);

    return () => {
      isCancelled = true;
      if ('serial' in navigator) {
        (navigator as any).serial.removeEventListener('connect', handleConnect);
        (navigator as any).serial.removeEventListener('disconnect', handleDisconnect);
      }
    };
  }, []);

  // Clear Narcotics Detection Logs from Supabase and local state
  const handleClearLogs = async () => {
    if (!confirm('Clear all narcotics spike records from the database? This frees database storage and cannot be undone.')) return;
    setIsClearingLogs(true);
    await clearDetectionEvents({ category: 'narcotics' });
    setCaptures([]);
    setIsClearingLogs(false);
  };

  // Listen to cross-page log clearing events
  useEffect(() => {
    const handleLogsCleared = (e: any) => {
      const cat = e.detail?.category;
      if (cat === 'narcotics' || cat === 'all') {
        setCaptures([]);
      }
    };
    window.addEventListener('vikrant:logs_cleared', handleLogsCleared);
    return () => window.removeEventListener('vikrant:logs_cleared', handleLogsCleared);
  }, []);

  // Process incoming sensor packet (hardware or simulation)
  const handleIncomingSensorData = (
    mq3: number,
    mq135: number,
    source: string,
    raw3?: number,
    raw135?: number,
    distM?: number | null,
    distCm?: number | null
  ) => {
    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // Apply user clean air baseline calibration trim
    const netMq3 = Math.max(0, Number((mq3 - baselineOffset).toFixed(1)));
    const composite = Number((0.6 * netMq3 + 0.4 * mq135).toFixed(1));

    setMq3Ppm(netMq3);
    setMq135Ppm(mq135);
    setCompositeIndex(composite);
    if (raw3) setMq3Raw(raw3);
    if (raw135) setMq135Raw(raw135);

    if (distM !== undefined && distM !== null) {
      updateDistance(distM, distCm ?? undefined);
    }

    const currentDist = distM !== undefined && distM !== null ? distM : distanceMRef.current;

    const newPoint = {
      time: timeLabel,
      mq3: netMq3,
      mq135,
      composite,
      distance: currentDist,
      threshold,
      source,
    };

    setReadings(prev => [...prev.slice(-30), newPoint]);

    // Check spike condition
    if (composite >= threshold || netMq3 >= threshold || mq135 >= threshold) {
      const trigger = netMq3 >= threshold ? 'MQ-3 Alcohol/Vapor' : mq135 >= threshold ? 'MQ-135 Precursors' : 'Composite e-Nose';
      triggerAutoCapture(Math.max(netMq3, mq135, composite), trigger);
    }
  };

  // Mock Data Generator: Runs only when isUsingMockData is true
  useEffect(() => {
    if (!isUsingMockData || isSerialConnected) return;

    // Seed initial 15 points
    const now = Date.now();
    const initPoints = [];
    for (let i = 14; i >= 0; i--) {
      const t = new Date(now - i * 4000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const base3 = Number((18 + Math.sin(i * 0.4) * 4 + (Math.random() * 2)).toFixed(1));
      const base135 = Number((14 + Math.cos(i * 0.3) * 3 + (Math.random() * 1.5)).toFixed(1));
      initPoints.push({
        time: t,
        mq3: base3,
        mq135: base135,
        composite: Number((0.6 * base3 + 0.4 * base135).toFixed(1)),
        distance: 1.25,
        threshold: 40.0,
        source: 'SIMULATOR',
      });
    }
    setReadings(initPoints);

    const interval = setInterval(() => {
      const rand = Math.random();
      const willSpike = rand > 0.88; // 12% chance of natural spike during patrol
      const mq3 = willSpike ? Number((48 + Math.random() * 28).toFixed(1)) : Number((19 + Math.sin(Date.now() / 6000) * 5 + (Math.random() * 3)).toFixed(1));
      const mq135 = willSpike ? Number((42 + Math.random() * 22).toFixed(1)) : Number((15 + Math.cos(Date.now() / 7000) * 4 + (Math.random() * 2)).toFixed(1));

      const raw3 = Math.round((mq3 / 80) * 1023);
      const raw135 = Math.round((mq135 / 60) * 1023);

      const mockDist = Number((1.25 + Math.sin(Date.now() / 8000) * 0.6 + (Math.random() * 0.15)).toFixed(2));
      updateDistance(mockDist);

      handleIncomingSensorData(mq3, mq135, 'SIMULATOR', raw3, raw135, mockDist);
    }, 3500);

    return () => clearInterval(interval);
  }, [isUsingMockData, isSerialConnected, threshold, triggerAutoCapture]);

  // Force Test Spike manually
  const handleForceTestSpike = () => {
    const spikeMq3 = Number((68 + Math.random() * 15).toFixed(1));
    const spikeMq135 = Number((54 + Math.random() * 12).toFixed(1));
    handleIncomingSensorData(spikeMq3, spikeMq135, 'FORCED_TEST', 880, 760);
  };

  const isAlarmActive = compositeIndex >= threshold || mq3Ppm >= threshold;

  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 overflow-y-auto bg-transparent">
      {/* Hidden video / IP webcam stream for genuine snapshot capture */}
      <video ref={videoRef} className="hidden" playsInline muted />
      {cameraSource === 'ip_webcam' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ipImgRef}
          src={ipStreamMode === 'proxy' ? `/api/camera/proxy?url=${encodeURIComponent(ipWebcamUrl)}` : ipWebcamUrl}
          crossOrigin="anonymous"
          alt="IP Webcam Feed Source"
          className="hidden"
          onLoad={() => setIpCamConnected(true)}
          onError={() => {
            if (ipStreamMode === 'direct') {
              console.warn('[Narcotics] Direct IP stream failed, falling back to proxy');
              setIpStreamMode('proxy');
            } else {
              setIpCamConnected(false);
            }
          }}
        />
      )}

      {/* Screen Shutter Flash Overlay */}
      {shutterFlash && (
        <div className="fixed inset-0 z-50 bg-white/35 pointer-events-none transition-opacity duration-150" />
      )}

      {/* Spike Alert Banner */}
      {spikeNotification && (
        <div className="fixed top-4 right-4 z-50 bg-red-950/90 border border-red-500 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-200">
          <Camera size={18} className="text-red-400 animate-pulse" />
          <span className="font-mono text-xs font-bold">{spikeNotification}</span>
        </div>
      )}

      {/* High-Resolution Capture Inspector Modal */}
      {inspectCapture && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-panel p-5 rounded-2xl border border-cyan-400 max-w-2xl w-full flex flex-col gap-4 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2">
                <Scan size={18} className="text-cyan-400" />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  SPIKE RECON PASSPORT • NARCOTICS MOS
                </h3>
              </div>
              <button
                onClick={() => setInspectCapture(null)}
                className="text-foreground/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-sm font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="w-full aspect-video rounded-xl bg-black overflow-hidden relative border border-panel-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inspectCapture.photo_url} alt="Spike frame" className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 px-2 py-1 rounded bg-red-950/80 font-mono text-xs text-red-300 border border-red-500/50">
                {inspectCapture.substance_name}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-2.5 rounded-xl bg-black/50 border border-panel-border flex flex-col">
                <span className="text-[10px] text-foreground/40 uppercase">GPS STAMP</span>
                <span className="text-foreground/90 font-bold">
                  {(inspectCapture.latitude || currentCoords[0]).toFixed(6)}° N, {(inspectCapture.longitude || currentCoords[1]).toFixed(6)}° E
                </span>
                <span className="text-[10px] text-foreground/60">{inspectCapture.station || stationName}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-black/50 border border-panel-border flex flex-col">
                <span className="text-[10px] text-foreground/40 uppercase">RECORDED TIMESTAMP</span>
                <span className="text-foreground/90 font-bold">
                  {isMounted ? new Date(inspectCapture.timestamp).toLocaleString() : ''}
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">
                  STATUS: CONFIRMED SPIKE LOGGED
                </span>
              </div>

              {inspectCapture.substance_name?.includes('Target at') && (
                <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-between col-span-2">
                  <div className="flex items-center gap-2 text-cyan-300">
                    <Radar size={16} />
                    <span className="font-bold">ULTRASONIC RANGEFINDER TELEMETRY:</span>
                  </div>
                  <span className="text-sm font-bold text-white bg-black/60 px-2.5 py-0.5 rounded border border-cyan-500/30">
                    {inspectCapture.substance_name.split('Target at')[1]?.trim() || 'Detected Range'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-panel-border">
              <Link
                href="/dashboard/captures"
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
              >
                <span>View in All Captures Log</span>
                <ExternalLink size={12} />
              </Link>

              <button
                onClick={() => setInspectCapture(null)}
                className="px-4 py-2 rounded-xl liquid-btn-primary text-xs font-mono font-bold"
              >
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arduino C++ Sketch Modal */}
      {showArduinoModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-panel p-6 rounded-2xl border border-cyan-400 max-w-3xl w-full flex flex-col gap-4 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2 text-cyan-400">
                <Code size={20} />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  ARDUINO UNO C++ SKETCH (MQ-3 + ULTRASONIC RANGEFINDER)
                </h3>
              </div>
              <button
                onClick={() => setShowArduinoModal(false)}
                className="text-foreground/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-sm font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            {/* Vercel Deployment & Browser Serial Note */}
            <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs font-mono text-cyan-300">
              💡 <strong>Works on Vercel & Localhost:</strong> When deployed on Vercel (HTTPS), Web Serial connects directly to the USB cable on your PC. Remember to <strong>close the Arduino IDE Serial Monitor</strong> before connecting in the browser.
            </div>

            {/* Sketch Setup Selector Tabs */}
            <div className="flex items-center gap-2 border-b border-panel-border pb-2 text-xs font-mono flex-wrap">
              <button
                onClick={() => setSketchTab('single_mq3')}
                className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                  sketchTab === 'single_mq3'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-foreground/50 hover:text-white'
                }`}
              >
                1. MQ-3 + Ultrasonic HC-SR04 (Your Setup)
              </button>
              <button
                onClick={() => setSketchTab('raw_analog')}
                className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                  sketchTab === 'raw_analog'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-foreground/50 hover:text-white'
                }`}
              >
                2. Minimal Raw Analog (4 Lines)
              </button>
              <button
                onClick={() => setSketchTab('dual')}
                className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                  sketchTab === 'dual'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-foreground/50 hover:text-white'
                }`}
              >
                3. Dual MQ-3 + MQ-135 Array
              </button>
              <button
                onClick={() => setSketchTab('python_bridge')}
                className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                  sketchTab === 'python_bridge'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-foreground/50 hover:text-white'
                }`}
              >
                4. Python Bridge (Vercel Background)
              </button>
            </div>

            {sketchTab === 'single_mq3' && (
              <>
                <p className="text-xs text-foreground/70 font-mono">
                  Hardware Wiring: MQ-3: <strong>VCC → 5V</strong>, <strong>GND → GND</strong>, <strong>AOUT → A0</strong> | Ultrasonic HC-SR04: <strong>VCC → 5V</strong>, <strong>GND → GND</strong>, <strong>TRIG → Pin 9</strong>, <strong>ECHO → Pin 10</strong>.
                </p>
                <pre className="p-4 rounded-xl bg-black/80 border border-panel-border text-[11px] font-mono text-emerald-400 overflow-x-auto select-all">
{`// ==============================================================
// IR VIKRANT - Arduino Uno MQ-3 & Ultrasonic (HC-SR04) Telemetry
// ==============================================================
// Hardware Wiring:
//   MQ-3 Sensor:
//     VCC  -> Arduino 5V
//     GND  -> Arduino GND
//     AOUT -> Arduino Analog Pin A0
//
//   Ultrasonic Sensor (HC-SR04):
//     VCC  -> Arduino 5V
//     GND  -> Arduino GND
//     TRIG -> Arduino Digital Pin 9
//     ECHO -> Arduino Digital Pin 10
// ==============================================================

const int PIN_MQ3 = A0;
const int PIN_TRIG = 9;
const int PIN_ECHO = 10;

void setup() {
  Serial.begin(9600);
  pinMode(PIN_MQ3, INPUT);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  delay(1000); // Sensor power-on settle
}

// 3-sample median filter eliminates ultrasonic reflection glitches & jitter
float readUltrasonicCm() {
  float samples[3];
  int count = 0;
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);

    long duration = pulseIn(PIN_ECHO, HIGH, 25000); // 25ms timeout (~4m)
    if (duration > 115 && duration < 23320) { // Valid 2cm - 400cm range
      samples[count++] = (duration * 0.0343) / 2.0;
    }
    delay(4);
  }
  if (count == 0) return -1.0;
  // Sort samples to find median
  for (int i = 0; i < count - 1; i++) {
    for (int j = i + 1; j < count; j++) {
      if (samples[i] > samples[j]) {
        float t = samples[i]; samples[i] = samples[j]; samples[j] = t;
      }
    }
  }
  return samples[count / 2];
}

void loop() {
  // 1. Read MQ-3 Gas Sensor (4-sample oversampling cancels 5V ADC ripple)
  int raw_sum = 0;
  for (int i = 0; i < 4; i++) {
    raw_sum += analogRead(PIN_MQ3);
    delay(2);
  }
  int raw_mq3 = raw_sum / 4;
  float ppm = (raw_mq3 / 1023.0) * 85.0; // Calibrated 0-85 PPM

  // 2. Read Ultrasonic Distance with Anti-Jitter Median Filtering
  float dist_cm = readUltrasonicCm();
  float dist_m = (dist_cm > 0) ? (dist_cm / 100.0) : -1.0;

  // 3. Emit clean JSON telemetry over USB Serial
  Serial.print("{\\"ppm\\":");
  Serial.print(ppm, 1);
  Serial.print(",\\"mq3_raw\\":");
  Serial.print(raw_mq3);
  if (dist_cm > 0) {
    Serial.print(",\\"distance_m\\":");
    Serial.print(dist_m, 2);
    Serial.print(",\\"distance_cm\\":");
    Serial.print(dist_cm, 1);
  }
  Serial.println("}");

  delay(250); // 4 Hz update rate
}`}
                </pre>
              </>
            )}

            {sketchTab === 'raw_analog' && (
              <>
                <p className="text-xs text-foreground/70 font-mono">
                  Ultra-simple 4-line sketch. Connect MQ-3 analog pin to <strong>A0</strong>.
                </p>
                <pre className="p-4 rounded-xl bg-black/80 border border-panel-border text-[11px] font-mono text-emerald-400 overflow-x-auto select-all">
{`// IR VIKRANT - Bare Minimum MQ-3 Analog Sketch
// Works with zero libraries! Connect MQ-3 AOUT to A0

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(analogRead(A0));
  delay(500);
}`}
                </pre>
              </>
            )}

            {sketchTab === 'dual' && (
              <>
                <p className="text-xs text-foreground/70 font-mono">
                  Dual Array: Connect MQ-3 to <strong>A0</strong> and MQ-135 to <strong>A1</strong>.
                </p>
                <pre className="p-4 rounded-xl bg-black/80 border border-panel-border text-[11px] font-mono text-emerald-400 overflow-x-auto select-all">
{`// IR VIKRANT - Dual MQ-3 + MQ-135 Telemetry Array
const int PIN_MQ3 = A0;
const int PIN_MQ135 = A1;

void setup() {
  Serial.begin(9600);
  pinMode(PIN_MQ3, INPUT);
  pinMode(PIN_MQ135, INPUT);
  delay(1000);
}

void loop() {
  int raw3 = analogRead(PIN_MQ3);
  int raw135 = analogRead(PIN_MQ135);

  float ppm3 = (raw3 / 1023.0) * 85.0;
  float ppm135 = (raw135 / 1023.0) * 65.0;

  Serial.print("{\\"mq3\\":");
  Serial.print(ppm3, 1);
  Serial.print(",\\"mq135\\":");
  Serial.print(ppm135, 1);
  Serial.println("}");

  delay(500);
}`}
                </pre>
              </>
            )}

            {sketchTab === 'python_bridge' && (
              <>
                <p className="text-xs text-foreground/70 font-mono">
                  Prefer running a background daemon or using Firefox/Safari? Run our pre-built Python bridge script to forward Arduino COM port telemetry straight to your Vercel deployment:
                </p>
                <div className="p-4 rounded-xl bg-black/80 border border-panel-border space-y-3 text-xs font-mono">
                  <div className="text-foreground/60 text-[11px]">Step 1: Install Python prerequisites</div>
                  <pre className="text-emerald-400 select-all bg-black/60 p-2.5 rounded border border-white/5">pip install pyserial requests</pre>
                  <div className="text-foreground/60 text-[11px]">Step 2: Run bridge with your Vercel URL (auto-detects Arduino COM port)</div>
                  <pre className="text-cyan-300 select-all bg-black/60 p-2.5 rounded border border-white/5">python scripts/arduino_bridge.py --url https://your-project.vercel.app</pre>
                  <div className="text-[10px] text-foreground/40">
                    💡 The bridge auto-detects COM3/COM4, parses MQ-3 ADC readings, and calls <code className="text-white">/api/sensors/ingest</code> on Vercel.
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-panel-border">
              <button
                onClick={() => {
                  const code = sketchTab === 'single_mq3'
                    ? `// IR VIKRANT - High-Accuracy MQ-3 & Ultrasonic Rangefinder\nconst int PIN_MQ3 = A0;\nconst int PIN_TRIG = 9;\nconst int PIN_ECHO = 10;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(PIN_MQ3, INPUT);\n  pinMode(PIN_TRIG, OUTPUT);\n  pinMode(PIN_ECHO, INPUT);\n  delay(1000);\n}\n\nfloat readUltrasonicCm() {\n  float samples[3]; int count = 0;\n  for (int i = 0; i < 3; i++) {\n    digitalWrite(PIN_TRIG, LOW); delayMicroseconds(2);\n    digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);\n    digitalWrite(PIN_TRIG, LOW);\n    long d = pulseIn(PIN_ECHO, HIGH, 25000);\n    if (d > 115 && d < 23320) samples[count++] = (d * 0.0343) / 2.0;\n    delay(4);\n  }\n  if (count == 0) return -1.0;\n  for (int i = 0; i < count - 1; i++)\n    for (int j = i + 1; j < count; j++)\n      if (samples[i] > samples[j]) { float t = samples[i]; samples[i] = samples[j]; samples[j] = t; }\n  return samples[count / 2];\n}\n\nvoid loop() {\n  int raw_sum = 0;\n  for (int i = 0; i < 4; i++) { raw_sum += analogRead(PIN_MQ3); delay(2); }\n  int raw_mq3 = raw_sum / 4;\n  float ppm = (raw_mq3 / 1023.0) * 85.0;\n  float dist_cm = readUltrasonicCm();\n  float dist_m = (dist_cm > 0) ? (dist_cm / 100.0) : -1.0;\n  Serial.print("{\\"ppm\\":"); Serial.print(ppm, 1);\n  Serial.print(",\\"mq3_raw\\":"); Serial.print(raw_mq3);\n  if (dist_cm > 0) { Serial.print(",\\"distance_m\\":"); Serial.print(dist_m, 2); Serial.print(",\\"distance_cm\\":"); Serial.print(dist_cm, 1); }\n  Serial.println("}");\n  delay(250);\n}`
                    : sketchTab === 'raw_analog'
                    ? `void setup() { Serial.begin(9600); }\nvoid loop() { Serial.println(analogRead(A0)); delay(500); }`
                    : sketchTab === 'dual'
                    ? `const int PIN_MQ3 = A0; const int PIN_MQ135 = A1;\nvoid setup() { Serial.begin(9600); }\nvoid loop() { float ppm3 = (analogRead(PIN_MQ3) / 1023.0) * 85.0; float ppm135 = (analogRead(PIN_MQ135) / 1023.0) * 65.0; Serial.print("{\\"mq3\\":"); Serial.print(ppm3, 1); Serial.print(",\\"mq135\\":"); Serial.print(ppm135, 1); Serial.println("}"); delay(500); }`
                    : `python scripts/arduino_bridge.py --url https://your-project.vercel.app`;
                  navigator.clipboard.writeText(code);
                  alert('Copied to clipboard!');
                }}
                className="px-4 py-2 rounded-xl liquid-btn text-xs font-mono font-bold"
              >
                {sketchTab === 'python_bridge' ? 'COPY COMMAND' : 'COPY ACTIVE SKETCH'}
              </button>
              <button
                onClick={() => setShowArduinoModal(false)}
                className="px-4 py-2 rounded-xl liquid-btn-primary text-xs font-mono font-bold"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header & Hardware Connectivity Rail */}
      <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shrink-0 border border-cyan-500/20">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Pill size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-mono text-base font-bold text-white tracking-wider uppercase">
                NARCOTICS & CHEMICAL MOS SENSOR ARRAY
              </h1>
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase flex items-center gap-1.5 border ${
                  isSerialConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isSerialConnected ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
                {isSerialConnected ? 'ARDUINO UNO LIVE (HARDWARE CONNECTED)' : 'MOCK SIMULATOR STREAM (STANDBY FOR ARDUINO)'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-mono text-foreground/60 mt-0.5">
              <MapPin size={12} className="text-cyan-400" />
              <span>{stationName}</span>
              <span className="text-foreground/30">•</span>
              <span>e-Nose Multi-Gas MOS Array (MQ-3 / MQ-135)</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Camera Source Indicator */}
          <Link
            href="/dashboard/settings"
            className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all border ${
              cameraSource === 'ip_webcam'
                ? ipCamConnected
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/30'
            }`}
            title="Configured camera for spike auto-capture. Click to change in Settings."
          >
            <Smartphone size={14} className={cameraSource === 'ip_webcam' && ipCamConnected ? 'animate-pulse text-cyan-400' : ''} />
            <span>
              {cameraSource === 'ip_webcam'
                ? ipCamConnected
                  ? 'PHONE CAM (LIVE)'
                  : 'PHONE CAM (CONNECTING)'
                : 'LAPTOP WEBCAM'}
            </span>
          </Link>

          {/* Connect / Disconnect Arduino Button */}
          <button
            onClick={() => (isSerialConnected ? disconnectArduinoSerial() : connectArduinoSerial())}
            className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all liquid-btn ${
              isSerialConnected
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40'
                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
            }`}
          >
            <Usb size={14} />
            <span>{isSerialConnected ? 'DISCONNECT ARDUINO' : 'CONNECT ARDUINO (USB)'}</span>
          </button>

          {/* Flash Code Modal Button */}
          <button
            onClick={() => setShowArduinoModal(true)}
            className="px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 glass-panel text-foreground/70 hover:text-white border border-panel-border"
          >
            <Code size={14} />
            <span>ARDUINO SKETCH</span>
          </button>

          {/* Calibrate Clean Air Baseline */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleCalibrateBaseline}
              title={baselineOffset > 0 ? `Clean Air Offset: -${baselineOffset} PPM. Click while in fresh air to recalibrate.` : 'Click while sensor is in normal clean air to zero-calibrate baseline at 15.0 PPM.'}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all border ${
                baselineOffset > 0
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                  : 'glass-panel text-foreground/70 hover:text-white border-panel-border'
              }`}
            >
              <Sliders size={14} className={baselineOffset > 0 ? 'text-cyan-400' : ''} />
              <span>{baselineOffset > 0 ? `TRIM: -${baselineOffset} PPM` : 'CALIBRATE ZERO'}</span>
            </button>
            {baselineOffset > 0 && (
              <button
                onClick={handleResetBaseline}
                title="Reset zero calibration back to raw factory curve"
                className="p-1.5 rounded-xl glass-panel text-foreground/50 hover:text-white border border-panel-border"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>

          {/* Force Test Spike Button */}
          <button
            onClick={handleForceTestSpike}
            className="px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-all"
          >
            <Zap size={14} />
            <span>FORCE TEST SPIKE</span>
          </button>

          {/* Mock Toggle */}
          <button
            onClick={() => setIsUsingMockData(v => !v)}
            disabled={isSerialConnected}
            className={`p-1.5 rounded-xl border text-xs font-mono ${
              isUsingMockData
                ? 'bg-white/10 text-white border-white/20'
                : 'bg-black/40 text-foreground/40 border-panel-border'
            }`}
            title="Toggle Synthetic Mock Stream"
          >
            {isUsingMockData ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>
      </div>

      {serialError && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive font-mono text-xs flex items-center gap-2">
          <AlertTriangle size={15} />
          <span>{serialError}</span>
        </div>
      )}

      {/* Live Hardware Serial Telemetry Stream Pill */}
      {isSerialConnected && (
        <div className="glass-panel px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-950/20 flex flex-wrap items-center justify-between gap-2 font-mono text-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold">USB SERIAL TELEMETRY RX (ARDUINO UNO):</span>
            <span className="text-white bg-black/60 px-2 py-0.5 rounded border border-white/10 font-bold text-[10px]">
              {rawSerialPacketsCount} PACKETS RECVD
            </span>
          </div>
          <div className="flex items-center gap-2 text-emerald-300 text-[11px] truncate max-w-lg">
            <span className="text-foreground/50">RAW PACKET:</span>
            <code className="bg-black/80 px-2.5 py-0.5 rounded border border-emerald-500/30 text-emerald-300 font-bold">
              {lastRawSerialLine || 'Listening on COM port...'}
            </code>
          </div>
        </div>
      )}

      {/* KPI Gauges Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        {/* 1. MQ-3 Gauge */}
        <div className="glass-panel p-4 rounded-xl flex flex-col gap-1.5 border border-panel-border">
          <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-foreground/50 uppercase">
            <span>MQ-3 NARCOTICS VAPOR</span>
            <span className="text-cyan-400">PIN A0</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-white">{mq3Ppm}</span>
            <span className="text-xs font-mono text-cyan-300">ppm</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono text-foreground/40 mt-1 border-t border-white/5 pt-1.5">
            <span>ADC: {mq3Raw} ({((mq3Raw / 1023) * 5.0).toFixed(2)}V)</span>
            <span className={isSerialConnected ? 'text-emerald-400 font-bold' : 'text-foreground/30'}>
              {isSerialConnected ? 'MQ-3 LIVE' : 'SIMULATED'}
              {baselineOffset > 0 ? ` (-${baselineOffset} TRIM)` : ''}
            </span>
          </div>
        </div>

        {/* 2. Target Distance from Robot (Ultrasonic HC-SR04) */}
        <div
          className={`glass-panel p-4 rounded-xl flex flex-col gap-1.5 border transition-all ${
            distanceStatus === 'contact'
              ? 'border-red-500 bg-red-950/25 shadow-lg shadow-red-500/10'
              : distanceStatus === 'proximity'
              ? 'border-amber-500/40 bg-amber-500/10'
              : 'border-cyan-500/30 bg-cyan-950/10'
          }`}
        >
          <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-foreground/50 uppercase">
            <span className="flex items-center gap-1.5">
              <Radar size={13} className={isUltrasonicActive ? 'text-cyan-400 animate-spin' : 'text-foreground/40'} />
              <span>TARGET DISTANCE</span>
            </span>
            <span
              className={`font-bold text-[9px] px-1.5 py-0.5 rounded border ${
                distanceStatus === 'contact'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                  : distanceStatus === 'proximity'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {distanceStatus === 'contact'
                ? 'CRITICAL (<0.5m)'
                : distanceStatus === 'proximity'
                ? 'PROXIMITY (<1.5m)'
                : 'CLEAR RANGE'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-mono font-bold ${
                distanceStatus === 'contact'
                  ? 'text-red-400'
                  : distanceStatus === 'proximity'
                  ? 'text-amber-300'
                  : 'text-cyan-300'
              }`}
            >
              {distanceM.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-foreground/50">meters away</span>
          </div>
          {/* Dynamic Rangefinder Bar */}
          <div className="w-full bg-black/50 rounded-full h-1.5 overflow-hidden mt-1 border border-white/5">
            <div
              className={`h-full transition-all duration-200 ${
                distanceStatus === 'contact'
                  ? 'bg-red-500'
                  : distanceStatus === 'proximity'
                  ? 'bg-amber-400'
                  : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.max(5, Math.min(100, (distanceM / 4.0) * 100))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-foreground/40 mt-1 border-t border-white/5 pt-1.5">
            <span>{distanceCm} cm FROM ROBOT</span>
            <span className={isUltrasonicActive ? 'text-cyan-400 font-bold' : 'text-foreground/30'}>
              {isUltrasonicActive ? 'HC-SR04 LIVE' : 'SIMULATED'}
            </span>
          </div>
        </div>

        {/* MQ-135 Gauge */}
        <div className="glass-panel p-4 rounded-xl flex flex-col gap-1.5 border border-panel-border">
          <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-foreground/50 uppercase">
            <span>MQ-135 PRECURSORS / AIR</span>
            <span className="text-purple-400">PIN A1</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-white">{mq135Ppm}</span>
            <span className="text-xs font-mono text-purple-300">ppm</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono text-foreground/40 mt-1 border-t border-white/5 pt-1.5">
            <span>RAW ADC: {mq135Raw}</span>
            <span>VOLTS: {((mq135Raw / 1023) * 5.0).toFixed(2)}V</span>
          </div>
        </div>

        {/* Composite e-Nose Status */}
        <div className={`glass-panel p-4 rounded-xl flex flex-col gap-1.5 border ${
          isAlarmActive ? 'border-red-500 bg-red-950/20' : 'border-panel-border'
        }`}>
          <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-foreground/50 uppercase">
            <span>COMPOSITE e-NOSE INDEX</span>
            <span className={isAlarmActive ? 'text-red-400 font-bold' : 'text-emerald-400'}>
              {isAlarmActive ? 'SPIKE DETECTED' : 'NORMAL'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-mono font-bold ${isAlarmActive ? 'text-red-400' : 'text-white'}`}>
              {compositeIndex}
            </span>
            <span className="text-xs font-mono text-foreground/50">ppm eq</span>
          </div>
          <div className="text-[10px] font-mono text-foreground/40 mt-1 border-t border-white/5 pt-1.5">
            ALARM THRESHOLD: {threshold.toFixed(1)} ppm
          </div>
        </div>

        {/* Auto-Captures Counter */}
        <div className="glass-panel p-4 rounded-xl flex flex-col gap-1.5 border border-panel-border">
          <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-foreground/50 uppercase">
            <span>SPIKE AUTO-CAPTURES</span>
            <Camera size={13} className="text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-white">{captures.length}</span>
            <span className="text-xs font-mono text-foreground/50">frames</span>
          </div>
          <div className="text-[10px] font-mono text-foreground/40 mt-1 border-t border-white/5 pt-1.5 truncate">
            {lastSpikeTime ? `LAST TRIGGER: ${lastSpikeTime}` : 'STANDBY FOR SPIKE'}
          </div>
        </div>
      </div>

      {/* Interactive Main Visualizer & Chart */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3 min-h-[380px] border border-cyan-500/20">
        {/* Chart Header & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-panel-border">
          <div className="flex items-center gap-3">
            <Activity size={16} className="text-cyan-400" />
            <h2 className="font-mono text-xs font-bold text-white tracking-widest uppercase">
              REAL-TIME MOS SENSOR STREAM & VOLATILE CURVE
            </h2>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Interactive Threshold Slider */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-[10px] text-foreground/50 uppercase">THRESHOLD:</span>
              <input
                type="range"
                min="20"
                max="80"
                step="1"
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="w-24 accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-bold text-cyan-400">{threshold.toFixed(0)} ppm</span>
            </div>

            {/* Time Filter Buttons */}
            <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/10 text-[10px] font-mono">
              {(['5m', '15m', '1h', '24h'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTimeRange(t)}
                  className={`px-2.5 py-1 rounded-md transition-all uppercase ${
                    timeRange === t ? 'bg-white/15 text-white font-bold' : 'text-foreground/50 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* High-Fidelity Area Chart */}
        <div className="flex-1 w-full min-h-[290px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={readings} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="narcoticsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="precursorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#22272e" />
              <XAxis dataKey="time" stroke="#52525b" tick={{ fontSize: 10, fill: '#71717a' }} />
              <YAxis stroke="#52525b" domain={[0, 90]} tick={{ fontSize: 10, fill: '#71717a' }} unit="ppm" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="glass-panel p-3 rounded-xl border border-cyan-500/40 text-xs font-mono shadow-2xl bg-black/90">
                        <div className="text-foreground/50 mb-1 font-bold">{label}</div>
                        <div className="text-cyan-400">MQ-3 Alcohol/Narcotics: {payload[0]?.value} ppm</div>
                        <div className="text-purple-400">MQ-135 Air/Precursor: {payload[1]?.value} ppm</div>
                        <div className="text-emerald-400">e-Nose Composite: {payload[2]?.value} ppm</div>
                        <div className="text-[10px] text-foreground/40 mt-1">Source: {payload[0]?.payload?.source}</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={threshold}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{ value: `ALARM THRESHOLD: ${threshold} ppm`, fill: '#f43f5e', fontSize: 10, position: 'insideTopRight' }}
              />
              <Area type="monotone" dataKey="mq3" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#narcoticsGrad)" name="MQ-3 Narcotics" />
              <Area type="monotone" dataKey="mq135" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#precursorGrad)" name="MQ-135 Precursors" />
              <Line type="monotone" dataKey="composite" stroke="#10b981" strokeWidth={2} dot={false} name="Composite Index" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Auto-Captured Recon Gallery (Spike Triggered Snapshots) */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3 shrink-0 border border-cyan-500/20">
        <div className="flex items-center justify-between pb-2 border-b border-panel-border">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-cyan-400" />
            <h3 className="font-mono text-xs font-bold text-white tracking-widest uppercase">
              AUTO-CAPTURED SPIKE RECON GALLERY (CAMERA & HUD PASSPORT)
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-foreground/50">
              AUTO-FIRES THE INSTANT SPIKE EXCEEDS {threshold.toFixed(0)} PPM
            </span>
            {captures.length > 0 && (
              <button
                onClick={handleClearLogs}
                disabled={isClearingLogs}
                className="px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 flex items-center gap-1.5 transition-all active:scale-95"
                title="Clear all narcotics spike records from database"
              >
                <Trash2 size={12} />
                <span>{isClearingLogs ? 'CLEARING...' : 'CLEAR LOGS'}</span>
              </button>
            )}
          </div>
        </div>

        {captures.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-foreground/40 flex flex-col items-center justify-center gap-2">
            <Camera size={28} className="opacity-30" />
            <span>No spike captures recorded yet. Click &quot;FORCE TEST SPIKE&quot; above to test the auto-capture pipeline.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {captures.map((cap, i) => (
              <div
                key={cap.id || i}
                onClick={() => setInspectCapture(cap)}
                className="group relative rounded-xl overflow-hidden glass-panel border border-panel-border hover:border-cyan-400 cursor-pointer transition-all aspect-video"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cap.photo_url} alt="Spike frame" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-1.5 left-2 right-2 flex justify-between items-center text-[9px] font-mono text-white">
                  <span className="truncate max-w-[90px] font-bold text-cyan-300">
                    {cap.substance_name?.split(':')[1]?.split('(')[0]?.trim() || 'Spike'}
                  </span>
                  <span className="text-white/60">
                    {isMounted ? new Date(cap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
