'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  Line,
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
  ExternalLink,
  MapPin,
  Clock,
  CheckCircle2,
  Usb,
  Code,
  ShieldAlert,
  Radio,
  Play,
  Pause,
  Smartphone,
  Trash2,
  Radar,
  Target,
  FlaskConical,
  Gauge,
  Layers,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { findNearestRailwayStation } from '@/lib/railwayStations';
import { clearDetectionEvents } from '@/lib/logService';
import DirectionalOdorRadar, { DirectionalPlumeTelemetry } from '@/components/DirectionalOdorRadar';

// Camera Shutter Audio Feedback
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
  const [sketchTab, setSketchTab] = useState<'chemotaxis_4direction' | 'single_mq3' | 'dual'>('chemotaxis_4direction');
  const [directionalPlume, setDirectionalPlume] = useState<DirectionalPlumeTelemetry | null>(null);
  const [baudRate, setBaudRate] = useState<number>(115200);

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

  // Baseline Calibration Offset (Ambient Clean Air Trim)
  const [baselineOffset, setBaselineOffset] = useState<number>(0);

  // Captures & Modal State
  const [captures, setCaptures] = useState<any[]>([]);
  const [inspectCapture, setInspectCapture] = useState<any | null>(null);
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);
  const [spikeNotification, setSpikeNotification] = useState<string | null>(null);
  const [isClearingLogs, setIsClearingLogs] = useState<boolean>(false);

  // Geo Location & Station Info
  const [currentCoords, setCurrentCoords] = useState<[number, number]>([22.59548, 88.45420]);
  const [stationName, setStationName] = useState<string>('Bidhan Nagar Road (BNR) • Eastern Railway');

  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const lastAutoCaptureTimeRef = useRef<number>(0);
  const [cameraSource, setCameraSource] = useState<'ip_webcam' | 'device'>('ip_webcam');
  const [ipWebcamUrl, setIpWebcamUrl] = useState<string>('http://10.35.147.105:8080/video');
  const [ipStreamMode, setIpStreamMode] = useState<'direct' | 'proxy'>('direct');
  const [ipCamConnected, setIpCamConnected] = useState<boolean>(false);
  const ipImgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Load saved baseline offset
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vikrant_mq3_baseline_offset');
      if (saved) setBaselineOffset(Number(saved) || 0);
    }
  }, []);

  const handleCalibrateBaseline = () => {
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
    if (meters < 0.02 || meters > 4.5) return;

    const prevM = distanceMRef.current;
    let m = meters;
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
  };

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

    const handleLocalCapture = (e: any) => {
      const ev = e.detail;
      if (ev.substance_category?.includes('Narcotics') || ev.substance_name?.includes('MQ-3') || ev.substance_name?.includes('MQ-135')) {
        setCaptures(prev => [ev, ...prev]);
      }
    };

    window.addEventListener('vikrant:new_capture', handleLocalCapture);
    return () => window.removeEventListener('vikrant:new_capture', handleLocalCapture);
  }, []);

  // Clear Narcotics Logs from Supabase and local state
  const handleClearLogs = async () => {
    if (!confirm('Clear all chemical sensor spike records from the database?')) return;
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

  // Sync camera settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const savedSrc = localStorage.getItem('vikrant_camera_source') as 'ip_webcam' | 'device' | null;
      if (savedSrc) setCameraSource(savedSrc);

      let savedUrl = localStorage.getItem('vikrant_ip_webcam_url');
      if (savedUrl) {
        if (savedUrl.includes('10.35.147.')) {
          savedUrl = savedUrl.replace(/10\.35\.147\.\d+/, '10.35.147.105');
          localStorage.setItem('vikrant_ip_webcam_url', savedUrl);
        }
        setIpWebcamUrl(savedUrl);
      }

      let savedMode = localStorage.getItem('vikrant_ip_stream_mode') as 'direct' | 'proxy' | null;
      if (isCloud && savedMode === 'proxy') {
        savedMode = 'direct';
        localStorage.setItem('vikrant_ip_stream_mode', 'direct');
      }
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

  // Connect to device webcam if cameraSource === 'device'
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

  // Auto-fallback watchdog if phone stream unreachable
  useEffect(() => {
    if (cameraSource !== 'ip_webcam') return;
    const timer = setTimeout(() => {
      if (!ipCamConnected) {
        setCameraSource('device');
      }
    }, 3500);
    return () => clearTimeout(timer);
  }, [cameraSource, ipCamConnected]);

  // Trigger Camera Snapshot on Spike
  const triggerAutoCapture = useCallback(
    async (peakPpm: number, triggerSensor: string) => {
      const now = Date.now();
      if (now - lastAutoCaptureTimeRef.current < 8000) return;
      lastAutoCaptureTimeRef.current = now;

      setShutterFlash(true);
      playShutterSound();
      setTimeout(() => setShutterFlash(false), 250);

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        let drewRealFrame = false;
        if (cameraSource === 'ip_webcam' && ipImgRef.current && ipImgRef.current.naturalWidth > 0) {
          try {
            ctx.drawImage(ipImgRef.current, 0, 0, 640, 400);
            drewRealFrame = true;
          } catch {}
        } else if (cameraSource === 'device' && videoRef.current && videoRef.current.readyState >= 2) {
          try {
            ctx.drawImage(videoRef.current, 0, 0, 640, 400);
            drewRealFrame = true;
          } catch {}
        }

        if (!drewRealFrame) {
          ctx.fillStyle = '#080a12';
          ctx.fillRect(0, 0, 640, 400);
          ctx.strokeStyle = 'rgba(184, 212, 240, 0.2)';
          ctx.lineWidth = 1;
          for (let x = 0; x < 640; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 400);
            ctx.stroke();
          }
          for (let y = 0; y < 400; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(640, y);
            ctx.stroke();
          }
        }

        // Overlay HUD
        ctx.fillStyle = 'rgba(3, 4, 10, 0.85)';
        ctx.fillRect(10, 10, 340, 60);
        ctx.strokeStyle = '#b8d4f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, 340, 60);

        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`🚨 CHEMICAL SPIKE: ${triggerSensor}`, 20, 30);

        ctx.fillStyle = '#ffffff';
        ctx.font = '11px monospace';
        ctx.fillText(`PEAK CONCENTRATION: ${peakPpm.toFixed(1)} PPM`, 20, 48);

        ctx.fillStyle = 'rgba(3, 4, 10, 0.85)';
        ctx.fillRect(10, 335, 620, 55);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.strokeRect(10, 335, 620, 55);

        ctx.fillStyle = '#b8d4f0';
        ctx.font = '10px monospace';
        ctx.fillText(`LOCATION: ${stationName}`, 20, 355);
        ctx.fillText(`GPS: ${currentCoords[0].toFixed(5)}° N, ${currentCoords[1].toFixed(5)}° E`, 20, 375);
        ctx.fillText(`TIME: ${new Date().toLocaleTimeString()}`, 400, 375);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

        const newRecord = {
          unit_id: 'Q-01',
          substance_category: `Narcotics (${triggerSensor})`,
          substance_name: `${triggerSensor} Spike (${peakPpm.toFixed(1)} PPM)`,
          confidence_tier: 'confirmed',
          confidence_score: Number((Math.min(0.99, peakPpm / 80.0)).toFixed(2)),
          latitude: currentCoords[0],
          longitude: currentCoords[1],
          station: stationName,
          timestamp: new Date().toISOString(),
          photo_url: dataUrl,
          status: 'new',
        };

        setCaptures(prev => [newRecord, ...prev]);

        window.dispatchEvent(
          new CustomEvent('vikrant:new_capture', { detail: newRecord })
        );

        supabase.from('detection_events').insert([newRecord]).then();
      }
    },
    [cameraSource, currentCoords, stationName]
  );

  // Parse Serial JSON & Update State
  const handleIncomingSensorData = useCallback(
    (mq3PpmVal: number, mq135PpmVal: number, rawLine?: string, rawMq3Adc?: number, rawMq135Adc?: number, ultrasonicDistM?: number, ultrasonicDistCm?: number) => {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const finalMq3Ppm = Math.max(0, Number((mq3PpmVal - baselineOffset).toFixed(1)));
      const finalMq135Ppm = Number(mq135PpmVal.toFixed(1));
      const comp = Number(((finalMq3Ppm * 0.65) + (finalMq135Ppm * 0.35)).toFixed(1));

      setMq3Ppm(finalMq3Ppm);
      setMq135Ppm(finalMq135Ppm);
      setCompositeIndex(comp);

      if (rawMq3Adc !== undefined) setMq3Raw(rawMq3Adc);
      if (rawMq135Adc !== undefined) setMq135Raw(rawMq135Adc);
      if (rawLine) {
        setLastRawSerialLine(rawLine);
        setRawSerialPacketsCount(c => c + 1);
      }

      if (ultrasonicDistM !== undefined && ultrasonicDistM > 0) {
        updateDistance(ultrasonicDistM, ultrasonicDistCm);
      }

      setReadings(prev => {
        const next = [...prev, { time: nowStr, mq3: finalMq3Ppm, mq135: finalMq135Ppm, composite: comp }];
        return next.slice(-40);
      });

      if (finalMq3Ppm >= threshold || finalMq135Ppm >= threshold || comp >= threshold) {
        setLastSpikeTime(nowStr);
        const sensorLabel = finalMq3Ppm >= threshold ? 'MQ-3 Alcohol/Vapor' : 'MQ-135 Gas Precursor';
        setSpikeNotification(`⚠ High Gas Concentration Detected! ${sensorLabel}: ${Math.max(finalMq3Ppm, finalMq135Ppm)} PPM`);
        triggerAutoCapture(Math.max(finalMq3Ppm, finalMq135Ppm), sensorLabel);
      } else {
        setSpikeNotification(null);
      }
    },
    [baselineOffset, threshold, triggerAutoCapture]
  );

  // Web Serial API (Arduino USB Serial Connection)
  const connectArduinoSerial = async () => {
    setSerialError(null);
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      setSerialError('Web Serial API is not supported by your browser. Please use Google Chrome or Edge.');
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });
      serialPortRef.current = port;
      setIsSerialConnected(true);
      setIsUsingMockData(false);

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      serialReaderRef.current = reader;

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                const parsed = JSON.parse(trimmed);

                // Handle 4-Directional Chemotaxis Plume Telemetry
                if (parsed.bearing_deg !== undefined || parsed.front_mq2 !== undefined || parsed.delta_right !== undefined) {
                  const pData: DirectionalPlumeTelemetry = {
                    front_mq2: Number(parsed.front_mq2 ?? 300),
                    right_mq3: Number(parsed.right_mq3 ?? 160),
                    rear_mq5: Number(parsed.rear_mq5 ?? 220),
                    left_mq135: Number(parsed.left_mq135 ?? 280),
                    delta_front: Number(parsed.delta_front ?? 0),
                    delta_right: Number(parsed.delta_right ?? 0),
                    delta_rear: Number(parsed.delta_rear ?? 0),
                    delta_left: Number(parsed.delta_left ?? 0),
                    bearing_deg: Number(parsed.bearing_deg ?? 0),
                    magnitude: Number(parsed.magnitude ?? 0),
                    action: parsed.action || 'IDLE',
                    distance_cm: parsed.distance_cm !== undefined ? Number(parsed.distance_cm) : undefined,
                  };
                  setDirectionalPlume(pData);
                  window.dispatchEvent(new CustomEvent('vikrant:directional_plume', { detail: pData }));
                }

                const ppm3 = parsed.ppm !== undefined ? Number(parsed.ppm) : parsed.mq3 !== undefined ? Number(parsed.mq3) : parsed.right_mq3 !== undefined ? Number(((parsed.right_mq3 / 1023.0) * 85.0).toFixed(1)) : 20.0;
                const ppm135 = parsed.mq135 !== undefined ? Number(parsed.mq135) : parsed.left_mq135 !== undefined ? Number(((parsed.left_mq135 / 1023.0) * 65.0).toFixed(1)) : 15.0;
                const raw3 = parsed.mq3_raw !== undefined ? Number(parsed.mq3_raw) : parsed.right_mq3 !== undefined ? Number(parsed.right_mq3) : Math.round((ppm3 / 85.0) * 1023);
                const raw135 = parsed.mq135_raw !== undefined ? Number(parsed.mq135_raw) : parsed.left_mq135 !== undefined ? Number(parsed.left_mq135) : Math.round((ppm135 / 65.0) * 1023);
                const distM = parsed.distance_m !== undefined ? Number(parsed.distance_m) : parsed.distance_cm !== undefined ? Number(parsed.distance_cm) / 100 : undefined;
                const distCm = parsed.distance_cm !== undefined ? Number(parsed.distance_cm) : undefined;

                handleIncomingSensorData(ppm3, ppm135, trimmed, raw3, raw135, distM, distCm);
              } else if (trimmed.includes('MQ2:') && trimmed.includes('MQ3:')) {
                // Parse pipe-delimited 4-MQ format from odor_compass.ino
                // Format: MQ2:40 | MQ3:25 | MQ5:495 | MQ135:48 | MQ2%:0.0 | MQ3%:0.0 | MQ5%:0.0 | MQ135%:0.0 | GAS:NO | Distance:12.4cm
                const mq2Match = trimmed.match(/MQ2:\s*([+-]?\d+(?:\.\d+)?)/);
                const mq3Match = trimmed.match(/MQ3:\s*([+-]?\d+(?:\.\d+)?)/);
                const mq5Match = trimmed.match(/MQ5:\s*([+-]?\d+(?:\.\d+)?)/);
                const mq135Match = trimmed.match(/MQ135:\s*([+-]?\d+(?:\.\d+)?)/);
                const mq2PctMatch = trimmed.match(/MQ2%:\s*([+-]?\d+(?:\.\d+)?)/);
                const mq3PctMatch = trimmed.match(/MQ3%:\s*([+-]?\d+(?:\.\d+)?)/);
                const mq5PctMatch = trimmed.match(/MQ5%:\s*([+-]?\d+(?:\.\d+)?)/);
                const mq135PctMatch = trimmed.match(/MQ135%:\s*([+-]?\d+(?:\.\d+)?)/);
                const distMatch = trimmed.match(/Distance:\s*([+-]?\d+(?:\.\d+)?)cm/);

                const vMq2 = mq2Match ? Number(mq2Match[1]) : 40;
                const vMq3 = mq3Match ? Number(mq3Match[1]) : 25;
                const vMq5 = mq5Match ? Number(mq5Match[1]) : 495;
                const vMq135 = mq135Match ? Number(mq135Match[1]) : 48;

                const pMq2 = mq2PctMatch ? Number(mq2PctMatch[1]) : 0;
                const pMq3 = mq3PctMatch ? Number(mq3PctMatch[1]) : 0;
                const pMq5 = mq5PctMatch ? Number(mq5PctMatch[1]) : 0;
                const pMq135 = mq135PctMatch ? Number(mq135PctMatch[1]) : 0;

                const distCm = distMatch ? Number(distMatch[1]) : undefined;
                const distM = distCm !== undefined ? distCm / 100 : undefined;

                // Sketch pin layout: MQ3 = FRONT, MQ2 = RIGHT, MQ135 = REAR, MQ5 = LEFT
                const vx = pMq2 - pMq5;
                const vy = pMq3 - pMq135;
                const mag = Number(Math.sqrt(vx * vx + vy * vy).toFixed(1));
                const bearing = Number((Math.atan2(vx, vy) * (180.0 / Math.PI)).toFixed(1));

                let action: DirectionalPlumeTelemetry['action'] = 'IDLE';
                if (distCm !== undefined && distCm > 0 && distCm < 30.0) {
                  action = 'OBSTACLE_HOLD';
                } else if (mag >= 8.0) {
                  if (bearing >= -25.0 && bearing <= 25.0) action = 'FORWARD';
                  else if (bearing > 25.0 && bearing <= 115.0) action = 'TURN_RIGHT';
                  else if (bearing < -25.0 && bearing >= -115.0) action = 'TURN_LEFT';
                  else action = 'TURN_REVERSE';
                }

                const pData: DirectionalPlumeTelemetry = {
                  front_mq2: vMq3, // front sensor is MQ3
                  right_mq3: vMq2, // right sensor is MQ2
                  rear_mq5: vMq135, // rear sensor is MQ135
                  left_mq135: vMq5, // left sensor is MQ5
                  delta_front: pMq3,
                  delta_right: pMq2,
                  delta_rear: pMq135,
                  delta_left: pMq5,
                  bearing_deg: bearing,
                  magnitude: mag,
                  action,
                  distance_cm: distCm,
                };
                setDirectionalPlume(pData);
                window.dispatchEvent(new CustomEvent('vikrant:directional_plume', { detail: pData }));

                const ppm3 = Number(((vMq3 / 1023.0) * 85.0).toFixed(1));
                const ppm135 = Number(((vMq135 / 1023.0) * 65.0).toFixed(1));
                handleIncomingSensorData(ppm3, ppm135, trimmed, vMq3, vMq135, distM, distCm);
              } else if (!isNaN(Number(trimmed))) {
                const raw = Number(trimmed);
                const ppm = (raw / 1023.0) * 85.0;
                handleIncomingSensorData(ppm, 14.0, `RAW ANALOG: ${raw}`, raw, 180);
              }
            } catch {
              console.warn('[Arduino Serial] Frame parse skipped:', trimmed);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[Arduino Serial] Connection cancelled or error:', err.message);
      setSerialError(`Serial Connection Error: ${err.message || 'Cancelled'}`);
      setIsSerialConnected(false);
    }
  };

  const disconnectArduinoSerial = async () => {
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel();
        serialReaderRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
    } catch {}
    setIsSerialConnected(false);
  };

  // Synthetic Mock Telemetry Loop
  useEffect(() => {
    if (!isUsingMockData || isSerialConnected) return;

    const interval = setInterval(() => {
      const base3 = 18.0 + Math.sin(Date.now() / 2500) * 4.5;
      const noise3 = (Math.random() - 0.5) * 2.0;
      const val3 = Number((base3 + noise3).toFixed(1));

      const base135 = 14.0 + Math.cos(Date.now() / 3200) * 3.0;
      const val135 = Number((base135 + (Math.random() - 0.5) * 1.5).toFixed(1));

      const mockAdc3 = Math.round((val3 / 85.0) * 1023);
      const mockAdc135 = Math.round((val135 / 65.0) * 1023);

      const mockDistM = Number((1.25 + Math.sin(Date.now() / 4000) * 0.45).toFixed(2));
      const mockDistCm = Math.round(mockDistM * 100);

      handleIncomingSensorData(val3, val135, `{"ppm":${val3},"mq3_raw":${mockAdc3},"distance_m":${mockDistM},"distance_cm":${mockDistCm}}`, mockAdc3, mockAdc135, mockDistM, mockDistCm);
    }, 1000);

    return () => clearInterval(interval);
  }, [isUsingMockData, isSerialConnected, handleIncomingSensorData]);

  const handleForceTestSpike = () => {
    const spikeMq3 = 68.5;
    const spikeMq135 = 45.2;
    handleIncomingSensorData(spikeMq3, spikeMq135, '{"FORCED_SPIKE_TEST": true}', 820, 680);
  };

  const isAlarmActive = compositeIndex >= threshold || mq3Ppm >= threshold;

  return (
    <div className="flex flex-col h-full w-full p-5 gap-5 overflow-y-auto bg-transparent font-sans">
      {/* Hidden camera stream for auto-capture */}
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
            setIpCamConnected(false);
            setCameraSource('device');
          }}
        />
      )}

      {/* Screen Shutter Flash Overlay */}
      {shutterFlash && (
        <div className="fixed inset-0 z-50 bg-white/30 pointer-events-none transition-opacity duration-150" />
      )}

      {/* Spike Alert Notification */}
      {spikeNotification && (
        <div className="fixed top-5 right-5 z-50 bg-red-950/90 border border-red-500 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-200 backdrop-blur-md">
          <AlertTriangle size={18} className="text-red-400 animate-bounce" />
          <span className="font-mono text-xs font-bold">{spikeNotification}</span>
        </div>
      )}

      {/* Frame Inspector Modal */}
      {inspectCapture && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-liquid-panel p-6 max-w-2xl w-full flex flex-col gap-4 shadow-2xl relative border border-[#b8d4f0]/30">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#b8d4f0]">
                <FlaskConical size={18} />
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                  CHEMICAL DETECTION RECON FRAME
                </h3>
              </div>
              <button
                onClick={() => setInspectCapture(null)}
                className="text-zinc-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-xs font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="w-full aspect-video rounded-xl bg-black overflow-hidden relative border border-white/15">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inspectCapture.photo_url} alt="Captured frame" className="w-full h-full object-cover" />
              <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-black/80 font-mono text-xs text-[#b8d4f0] border border-[#b8d4f0]/30 font-bold">
                {inspectCapture.substance_name || 'Chemical Spike Trigger'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col">
                <span className="text-[10px] text-zinc-400 uppercase">GPS Location</span>
                <span className="text-white font-bold">
                  {(inspectCapture.latitude || 22.59548).toFixed(5)}° N, {(inspectCapture.longitude || 88.45420).toFixed(5)}° E
                </span>
                <span className="text-[10px] text-zinc-400">{inspectCapture.station || stationName}</span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col">
                <span className="text-[10px] text-zinc-400 uppercase">Timestamp</span>
                <span className="text-white font-bold">
                  {isMounted ? new Date(inspectCapture.timestamp).toLocaleString() : ''}
                </span>
                <span className="text-[10px] text-[#b8d4f0] font-bold">
                  CONFIDENCE: {Math.round((inspectCapture.confidence_score || 0.88) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                onClick={() => setInspectCapture(null)}
                className="px-5 py-2 rounded-xl liquid-btn-primary text-xs font-mono font-bold"
              >
                CLOSE INSPECTOR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arduino Sketch Code Modal */}
      {showArduinoModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-liquid-panel p-6 max-w-3xl w-full flex flex-col gap-4 shadow-2xl relative border border-[#b8d4f0]/30 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#b8d4f0]">
                <Code size={18} />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  ARDUINO HARDWARE SKETCH & SERIAL GUIDE
                </h3>
              </div>
              <button onClick={() => setShowArduinoModal(false)} className="text-zinc-400 hover:text-white text-sm font-mono">✕</button>
            </div>

            <div className="flex gap-2 font-mono text-xs border-b border-white/10 pb-2 flex-wrap">
              <button
                onClick={() => setSketchTab('chemotaxis_4direction')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  sketchTab === 'chemotaxis_4direction' ? 'bg-[#b8d4f0]/20 text-[#b8d4f0] font-bold border border-[#b8d4f0]/30' : 'text-zinc-400 hover:text-white'
                }`}
              >
                🧭 4-DIRECTION CHEMOTAXIS (MQ2/3/5/135)
              </button>
              <button
                onClick={() => setSketchTab('single_mq3')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  sketchTab === 'single_mq3' ? 'bg-[#b8d4f0]/20 text-[#b8d4f0] font-bold border border-[#b8d4f0]/30' : 'text-zinc-400 hover:text-white'
                }`}
              >
                MQ-3 + ULTRASONIC
              </button>
              <button
                onClick={() => setSketchTab('dual')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  sketchTab === 'dual' ? 'bg-[#b8d4f0]/20 text-[#b8d4f0] font-bold border border-[#b8d4f0]/30' : 'text-zinc-400 hover:text-white'
                }`}
              >
                DUAL MQ-3 & MQ-135
              </button>
            </div>

            <div className="p-4 rounded-xl bg-black/80 border border-white/10 font-mono text-xs text-zinc-300">
              <pre className="overflow-x-auto text-[11px] text-[#b8d4f0] leading-relaxed select-all">
                {sketchTab === 'chemotaxis_4direction'
                  ? `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =====================================================
// IR VIKRANT - COMPLETE OLED + 4 MQ GAS DETECTION
// =====================================================
// ARDUINO UNO
// MQ3   -> A0 -> FRONT
// MQ2   -> A1 -> RIGHT
// MQ135 -> A2 -> REAR
// MQ5   -> A3 -> LEFT
// OLED: SDA -> A4, SCL -> A5 (0x3C)
// HC-SR04: TRIG -> D6, ECHO -> D7
// Serial: 115200 Baud
// =====================================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool oledReady = false;

#define MQ3_PIN   A0
#define MQ2_PIN   A1
#define MQ135_PIN A2
#define MQ5_PIN   A3

const char* MQ2_SIDE   = "RIGHT";
const char* MQ3_SIDE   = "FRONT";
const char* MQ5_SIDE   = "LEFT";
const char* MQ135_SIDE = "REAR";

const float MQ2_BASELINE   = 40.6;
const float MQ3_BASELINE   = 25.8;
const float MQ5_BASELINE   = 495.6;
const float MQ135_BASELINE = 48.6;

const float MQ2_THRESHOLD   = 45.0;
const float MQ3_THRESHOLD   = 29.0;
const float MQ5_THRESHOLD   = 546.0;
const float MQ135_THRESHOLD = 54.0;

#define TRIG_PIN 6
#define ECHO_PIN 7

const unsigned long SENSOR_UPDATE_TIME = 100UL;
const unsigned long OLED_PAGE_TIME = 2500UL;
const unsigned long GAS_ALERT_TIME = 1800UL;

unsigned long lastSensorUpdate = 0;
unsigned long lastPageChange = 0;
unsigned long gasAlertUntil = 0;

byte currentPage = 0;
int mq2Value = 0, mq3Value = 0, mq5Value = 0, mq135Value = 0;
float distanceCM = -1.0;
float mq2Percent = 0.0, mq3Percent = 0.0, mq5Percent = 0.0, mq135Percent = 0.0;

bool mq2Detected = false, mq3Detected = false, mq5Detected = false, mq135Detected = false;
bool gasDetected = false;
const float SPIKE_THRESHOLD_PERCENT = 10.0;
bool mq2NewEvent = false, mq3NewEvent = false, mq5NewEvent = false, mq135NewEvent = false;
int previousMq2Value = 0, previousMq3Value = 0, previousMq5Value = 0, previousMq135Value = 0;
bool previousReadingsReady = false;
bool previousMq2Detected = false, previousMq3Detected = false, previousMq5Detected = false, previousMq135Detected = false;

float smoothStep(float x) {
  if (x <= 0.0f) return 0.0f;
  if (x >= 1.0f) return 1.0f;
  return x * x * (3.0f - 2.0f * x);
}

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

void initializeOLED() {
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    oledReady = true;
    display.clearDisplay();
    display.setTextColor(WHITE);
    centerText("IR VIKRANT", 2, 8);
    centerText("OLED READY", 1, 34);
    centerText("Starting...", 1, 48);
    display.display();
    delay(800);
  }
}

int readMQ(byte pin) { return analogRead(pin); }
float percentAboveBaseline(int value, float baseline) { return ((value - baseline) / baseline) * 100.0f; }
float percentIncreaseFromPrevious(int cur, int prev) {
  if (prev <= 0) return 0.0f;
  return ((cur - prev) / (float)prev) * 100.0f;
}

void evaluateGasDetection() {
  mq2Percent = percentAboveBaseline(mq2Value, MQ2_BASELINE);
  mq3Percent = percentAboveBaseline(mq3Value, MQ3_BASELINE);
  mq5Percent = percentAboveBaseline(mq5Value, MQ5_BASELINE);
  mq135Percent = percentAboveBaseline(mq135Value, MQ135_BASELINE);

  mq2Detected = (mq2Value >= MQ2_THRESHOLD);
  mq3Detected = (mq3Value >= MQ3_THRESHOLD);
  mq5Detected = (mq5Value >= MQ5_THRESHOLD);
  mq135Detected = (mq135Value >= MQ135_THRESHOLD);

  float s2 = previousReadingsReady ? percentIncreaseFromPrevious(mq2Value, previousMq2Value) : 0;
  float s3 = previousReadingsReady ? percentIncreaseFromPrevious(mq3Value, previousMq3Value) : 0;
  float s5 = previousReadingsReady ? percentIncreaseFromPrevious(mq5Value, previousMq5Value) : 0;
  float s135 = previousReadingsReady ? percentIncreaseFromPrevious(mq135Value, previousMq135Value) : 0;

  bool c2 = previousReadingsReady && mq2Detected && !previousMq2Detected;
  bool c3 = previousReadingsReady && mq3Detected && !previousMq3Detected;
  bool c5 = previousReadingsReady && mq5Detected && !previousMq5Detected;
  bool c135 = previousReadingsReady && mq135Detected && !previousMq135Detected;

  mq2NewEvent = c2 || (previousReadingsReady && s2 >= SPIKE_THRESHOLD_PERCENT);
  mq3NewEvent = c3 || (previousReadingsReady && s3 >= SPIKE_THRESHOLD_PERCENT);
  mq5NewEvent = c5 || (previousReadingsReady && s5 >= SPIKE_THRESHOLD_PERCENT);
  mq135NewEvent = c135 || (previousReadingsReady && s135 >= SPIKE_THRESHOLD_PERCENT);

  gasDetected = mq2Detected || mq3Detected || mq5Detected || mq135Detected;

  previousMq2Value = mq2Value; previousMq3Value = mq3Value;
  previousMq5Value = mq5Value; previousMq135Value = mq135Value;
  previousReadingsReady = true;
}

void printGasEvent() {
  if (!mq2NewEvent && !mq3NewEvent && !mq5NewEvent && !mq135NewEvent) return;
  Serial.println(F("\\n========================================\\n>>> GAS DETECTED <<<"));
  if (mq2NewEvent)   Serial.println(F("SENSOR: MQ2 | SIDE: RIGHT"));
  if (mq3NewEvent)   Serial.println(F("SENSOR: MQ3 | SIDE: FRONT"));
  if (mq5NewEvent)   Serial.println(F("SENSOR: MQ5 | SIDE: LEFT"));
  if (mq135NewEvent) Serial.println(F("SENSOR: MQ135 | SIDE: REAR"));
  Serial.println(F("========================================\\n"));
  gasAlertUntil = millis() + GAS_ALERT_TIME;
}

void printTelemetry() {
  Serial.print(F("MQ2:")); Serial.print(mq2Value);
  Serial.print(F(" | MQ3:")); Serial.print(mq3Value);
  Serial.print(F(" | MQ5:")); Serial.print(mq5Value);
  Serial.print(F(" | MQ135:")); Serial.print(mq135Value);
  Serial.print(F(" | MQ2%:")); Serial.print(mq2Percent, 1);
  Serial.print(F(" | MQ3%:")); Serial.print(mq3Percent, 1);
  Serial.print(F(" | MQ5%:")); Serial.print(mq5Percent, 1);
  Serial.print(F(" | MQ135%:")); Serial.print(mq135Percent, 1);
  Serial.print(F(" | GAS:")); Serial.print(gasDetected ? "YES" : "NO");
  Serial.print(F(" | Distance:"));
  if (distanceCM > 0.0f) { Serial.print(distanceCM, 1); Serial.println(F("cm")); }
  else { Serial.println(F("NO_ECHO")); }
}

float readUltrasonic() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long d = pulseIn(ECHO_PIN, HIGH, 30000UL);
  if (d == 0) return -1.0f;
  float cm = d / 58.0f;
  return (cm < 2.0f || cm > 400.0f) ? -1.0f : cm;
}

void setup() {
  Serial.begin(115200);
  pinMode(MQ2_PIN, INPUT); pinMode(MQ3_PIN, INPUT);
  pinMode(MQ5_PIN, INPUT); pinMode(MQ135_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  Wire.begin();
  initializeOLED();
  mq2Value = readMQ(MQ2_PIN); mq3Value = readMQ(MQ3_PIN);
  mq5Value = readMQ(MQ5_PIN); mq135Value = readMQ(MQ135_PIN);
  previousMq2Value = mq2Value; previousMq3Value = mq3Value;
  previousMq5Value = mq5Value; previousMq135Value = mq135Value;
  previousReadingsReady = true;
  lastSensorUpdate = millis(); lastPageChange = millis();
}

void loop() {
  unsigned long now = millis();
  if (now - lastSensorUpdate >= SENSOR_UPDATE_TIME) {
    lastSensorUpdate = now;
    mq2Value = readMQ(MQ2_PIN); mq3Value = readMQ(MQ3_PIN);
    mq5Value = readMQ(MQ5_PIN); mq135Value = readMQ(MQ135_PIN);
    evaluateGasDetection();
    printGasEvent();
    distanceCM = readUltrasonic();
    printTelemetry();
  }
}`
                  : sketchTab === 'single_mq3'
                  ? `// IR VIKRANT - High-Accuracy MQ-3 & Ultrasonic Rangefinder
const int PIN_MQ3 = A0;
const int PIN_TRIG = 9;
const int PIN_ECHO = 10;

void setup() {
  Serial.begin(9600);
  pinMode(PIN_MQ3, INPUT);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  delay(1000);
}

float readUltrasonicCm() {
  digitalWrite(PIN_TRIG, LOW); delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long d = pulseIn(PIN_ECHO, HIGH, 25000);
  if (d > 115 && d < 23320) return (d * 0.0343) / 2.0;
  return -1.0;
}

void loop() {
  int raw_mq3 = analogRead(PIN_MQ3);
  float ppm = (raw_mq3 / 1023.0) * 85.0;
  float dist_cm = readUltrasonicCm();
  float dist_m = (dist_cm > 0) ? (dist_cm / 100.0) : -1.0;

  Serial.print("{\\"ppm\\":"); Serial.print(ppm, 1);
  Serial.print(",\\"mq3_raw\\":"); Serial.print(raw_mq3);
  if (dist_cm > 0) {
    Serial.print(",\\"distance_m\\":"); Serial.print(dist_m, 2);
    Serial.print(",\\"distance_cm\\":"); Serial.print(dist_cm, 1);
  }
  Serial.println("}");
  delay(300);
}`
                  : `const int PIN_MQ3 = A0; const int PIN_MQ135 = A1;
void setup() { Serial.begin(9600); }
void loop() {
  float ppm3 = (analogRead(PIN_MQ3) / 1023.0) * 85.0;
  float ppm135 = (analogRead(PIN_MQ135) / 1023.0) * 65.0;
  Serial.print("{\\"mq3\\":"); Serial.print(ppm3, 1);
  Serial.print(",\\"mq135\\":"); Serial.print(ppm135, 1);
  Serial.println("}");
  delay(400);
}`}
              </pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button onClick={() => setShowArduinoModal(false)} className="px-5 py-2 rounded-xl liquid-btn-primary text-xs font-mono font-bold">
                DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Rail */}
      <div className="glass-panel p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shrink-0 border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 shadow-sm">
            <FlaskConical size={26} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-sans text-base font-bold text-slate-900 tracking-tight">
                NARCOTICS MONITORING & CHEMICAL SENSOR TELEMETRY
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase flex items-center gap-1.5 border ${
                  isSerialConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-sky-50 text-sky-800 border-sky-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isSerialConnected ? 'bg-emerald-600 animate-pulse' : 'bg-sky-600'}`} />
                {isSerialConnected ? 'ARDUINO USB CONNECTED' : 'SYNTHETIC TELEMETRY STREAM'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-sans text-slate-600 mt-1 font-medium">
              <MapPin size={13} className="text-sky-600" />
              <span>{stationName}</span>
              <span className="text-slate-300">•</span>
              <span>e-Nose Multi-Gas Array (MQ-3 Alcohol / MQ-135 Precursors)</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Camera Source Badge */}
          <Link
            href="/dashboard/settings"
            className={`px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-2 transition-all border shadow-xs ${
              cameraSource === 'ip_webcam'
                ? ipCamConnected
                  ? 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                : 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
            }`}
          >
            <Smartphone size={14} className={cameraSource === 'ip_webcam' && ipCamConnected ? 'animate-pulse text-sky-600' : ''} />
            <span>
              {cameraSource === 'ip_webcam'
                ? ipCamConnected ? 'PHONE CAM LIVE' : 'PHONE CAM CONNECTING'
                : 'LAPTOP WEBCAM'}
            </span>
          </Link>

          {/* Connect USB Serial & Baud Rate */}
          <div className="flex items-center gap-1.5">
            <select
              value={baudRate}
              onChange={e => setBaudRate(Number(e.target.value))}
              disabled={isSerialConnected}
              className="px-2 py-1.5 rounded-xl font-mono text-xs bg-white/90 border border-slate-300 text-slate-800 shadow-xs cursor-pointer disabled:opacity-60"
              title="Serial Baud Rate (Odor Compass sketch uses 115200)"
            >
              <option value={115200}>115200 BAUD</option>
              <option value={9600}>9600 BAUD</option>
            </select>
            <button
              onClick={() => (isSerialConnected ? disconnectArduinoSerial() : connectArduinoSerial())}
              className={`px-3 py-1.5 rounded-xl font-sans text-xs font-bold flex items-center gap-2 transition-all border shadow-xs ${
                isSerialConnected
                  ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-red-600'
                  : 'bg-slate-900 text-white border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Usb size={14} />
              <span>{isSerialConnected ? 'DISCONNECT USB' : 'CONNECT HARDWARE (USB)'}</span>
            </button>
          </div>

          {/* Arduino Code */}
          <button
            onClick={() => setShowArduinoModal(true)}
            className="px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-2 bg-white/80 hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-xs"
          >
            <Code size={14} className="text-slate-600" />
            <span>SKETCH CODE</span>
          </button>

          {/* Calibrate Baseline */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleCalibrateBaseline}
              className={`px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-2 transition-all border shadow-xs ${
                baselineOffset > 0
                  ? 'bg-sky-100 text-sky-900 border-sky-300'
                  : 'bg-white/80 hover:bg-slate-100 text-slate-800 border border-slate-300'
              }`}
            >
              <Sliders size={14} className={baselineOffset > 0 ? 'text-sky-700' : 'text-slate-600'} />
              <span>{baselineOffset > 0 ? `TRIM: -${baselineOffset} PPM` : 'CALIBRATE ZERO'}</span>
            </button>
            {baselineOffset > 0 && (
              <button
                onClick={handleResetBaseline}
                className="p-1.5 rounded-xl bg-white/80 hover:bg-slate-100 text-slate-600 border border-slate-300 shadow-xs"
                title="Reset zero trim calibration"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>

          {/* Test Spike Trigger */}
          <button
            onClick={handleForceTestSpike}
            className="px-3.5 py-1.5 rounded-xl font-sans text-xs font-bold flex items-center gap-2 bg-rose-600 text-white border border-rose-700 hover:bg-rose-700 transition-all shadow-sm active:scale-95"
          >
            <Zap size={14} />
            <span>TEST SPIKE TRIGGER</span>
          </button>

          {/* Stream Play/Pause */}
          <button
            onClick={() => setIsUsingMockData(v => !v)}
            disabled={isSerialConnected}
            className={`p-2 rounded-xl border text-xs font-sans transition-all shadow-xs ${
              isUsingMockData ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
            title="Toggle simulation stream"
          >
            {isUsingMockData ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>
      </div>

      {serialError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 font-mono text-xs flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{serialError}</span>
        </div>
      )}

      {/* Hardware Telemetry Stream Pill */}
      {isSerialConnected && (
        <div className="glass-liquid px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center gap-2 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold">USB SERIAL STREAM ACTIVE (ARDUINO UNO):</span>
            <span className="text-white bg-black/60 px-2.5 py-0.5 rounded border border-white/10 font-bold text-[10px]">
              {rawSerialPacketsCount} PACKETS RECVD
            </span>
          </div>
          <div className="flex items-center gap-2 text-emerald-300 text-[11px] truncate max-w-lg">
            <span className="text-zinc-400">RAW SERIAL:</span>
            <code className="bg-black/80 px-2.5 py-0.5 rounded border border-emerald-500/30 text-emerald-300 font-bold">
              {lastRawSerialLine || 'Listening...'}
            </code>
          </div>
        </div>
      )}

      {/* 360° Directional Chemical Odor Radar & Quadruped Chemotaxis Compass */}
      <DirectionalOdorRadar telemetry={directionalPlume} />

      {/* Telemetry Dials Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 shrink-0">
        {/* 1. MQ-3 Alcohol & Vapor Sensor */}
        <div className="glass-liquid p-4.5 rounded-2xl flex flex-col gap-2 border border-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:border-sky-300 transition-all">
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span>MQ-3 ALCOHOL / VAPOR</span>
            <span className="text-sky-700 font-bold">PIN A0</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-sans font-bold text-slate-950">{mq3Ppm}</span>
            <span className="text-xs font-sans font-semibold text-sky-700">PPM</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden border border-slate-300/60">
            <div
              className="h-full bg-sky-600 transition-all duration-300"
              style={{ width: `${Math.min(100, (mq3Ppm / 80) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80">
            <span>C₂H₅OH • RAW: {mq3Raw}</span>
            <span className={isSerialConnected ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
              {isSerialConnected ? 'HARDWARE' : 'SIMULATED'}
            </span>
          </div>
        </div>

        {/* 2. Target Proximity Distance */}
        <div
          className={`glass-liquid p-4.5 rounded-2xl flex flex-col gap-2 border transition-all shadow-[0_4px_16px_rgba(0,0,0,0.03)] ${
            distanceStatus === 'contact'
              ? 'border-red-400 bg-red-50/60'
              : distanceStatus === 'proximity'
              ? 'border-amber-400 bg-amber-50/60'
              : 'border-white/90 hover:border-sky-300'
          }`}
        >
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Radar size={14} className={isUltrasonicActive ? 'text-sky-600 animate-spin' : 'text-slate-500'} />
              <span>PROXIMITY (HC-SR04)</span>
            </span>
            <span
              className={`font-bold text-[10px] px-2 py-0.5 rounded-full border ${
                distanceStatus === 'contact'
                  ? 'bg-red-100 text-red-800 border-red-300 animate-pulse'
                  : distanceStatus === 'proximity'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
            >
              {distanceStatus === 'contact' ? 'CRITICAL' : distanceStatus === 'proximity' ? 'PROXIMITY' : 'CLEAR'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-sans font-bold ${
                distanceStatus === 'contact' ? 'text-red-600' : distanceStatus === 'proximity' ? 'text-amber-700' : 'text-slate-950'
              }`}
            >
              {distanceM.toFixed(2)}
            </span>
            <span className="text-xs font-sans text-slate-500 font-medium">meters</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden border border-slate-300/60">
            <div
              className={`h-full transition-all duration-300 ${
                distanceStatus === 'contact' ? 'bg-red-600' : distanceStatus === 'proximity' ? 'bg-amber-500' : 'bg-sky-600'
              }`}
              style={{ width: `${Math.max(5, Math.min(100, (distanceM / 4.0) * 100))}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80">
            <span>{distanceCm} cm RANGE</span>
            <span className={isUltrasonicActive ? 'text-sky-700 font-bold' : 'text-slate-500'}>
              {isUltrasonicActive ? 'ACTIVE' : 'STANDBY'}
            </span>
          </div>
        </div>

        {/* 3. MQ-135 Air Quality Sensor */}
        <div className="glass-liquid p-4.5 rounded-2xl flex flex-col gap-2 border border-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:border-sky-300 transition-all">
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span>MQ-135 AIR QUALITY</span>
            <span className="text-teal-700 font-bold">PIN A1</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-sans font-bold text-slate-950">{mq135Ppm}</span>
            <span className="text-xs font-sans font-semibold text-teal-700">PPM</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden border border-slate-300/60">
            <div
              className="h-full bg-teal-600 transition-all duration-300"
              style={{ width: `${Math.min(100, (mq135Ppm / 65) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80">
            <span>NH₃ / CO₂ • RAW: {mq135Raw}</span>
            <span className="font-semibold text-slate-700">{((mq135Raw / 1023) * 5.0).toFixed(2)}V</span>
          </div>
        </div>

        {/* 4. Composite Risk Index */}
        <div
          className={`glass-liquid p-4.5 rounded-2xl flex flex-col gap-2 border transition-all shadow-[0_4px_16px_rgba(0,0,0,0.03)] ${
            isAlarmActive ? 'border-red-400 bg-red-50/60' : 'border-white/90 hover:border-sky-300'
          }`}
        >
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span>COMPOSITE VAPOR RISK</span>
            <span className={isAlarmActive ? 'text-red-700 font-bold' : 'text-emerald-700 font-bold'}>
              {isAlarmActive ? 'SPIKE EXCEEDED' : 'NORMAL'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-sans font-bold ${isAlarmActive ? 'text-red-600' : 'text-slate-950'}`}>
              {compositeIndex}
            </span>
            <span className="text-xs font-sans text-slate-500 font-medium">PPM eq</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden border border-slate-300/60">
            <div
              className={`h-full transition-all duration-300 ${isAlarmActive ? 'bg-red-600' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, (compositeIndex / threshold) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80">
            <span>ALARM LEVEL</span>
            <span className="text-slate-950 font-bold">{threshold.toFixed(0)} PPM</span>
          </div>
        </div>

        {/* 5. Auto-Captures Counter */}
        <div className="glass-liquid p-4.5 rounded-2xl flex flex-col gap-2 border border-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:border-sky-300 transition-all">
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span>INCIDENT CAPTURES</span>
            <Camera size={14} className="text-sky-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-sans font-bold text-slate-950">{captures.length}</span>
            <span className="text-xs font-sans text-slate-500 font-medium">frames</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden border border-slate-300/60">
            <div className="h-full bg-sky-600" style={{ width: `${Math.min(100, (captures.length / 10) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80 truncate">
            <span>{lastSpikeTime ? `LAST: ${lastSpikeTime}` : 'MONITORING ACTIVE'}</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Telemetry Graph */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-slate-200/90 shadow-sm">
        {/* Chart Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-700">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="font-sans text-sm font-bold text-slate-900 tracking-tight">
                REAL-TIME GAS CONCENTRATION WAVEFORM (PPM)
              </h2>
              <p className="text-xs font-sans text-slate-600 mt-0.5 font-medium">
                Multi-channel e-Nose telemetry stream & threshold alert monitoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Threshold Slider */}
            <div className="flex items-center gap-2.5 font-sans text-xs bg-white/90 px-3.5 py-1.5 rounded-xl border border-slate-300 shadow-xs text-slate-800 font-semibold">
              <span className="text-xs text-slate-500 font-medium uppercase">ALARM THRESHOLD:</span>
              <input
                type="range"
                min="20"
                max="80"
                step="1"
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="w-28 accent-sky-600 cursor-pointer"
              />
              <span className="text-xs font-bold text-sky-700">{threshold.toFixed(0)} PPM</span>
            </div>

            {/* Time Filter Buttons */}
            <div className="flex items-center bg-slate-200/70 rounded-xl p-0.5 border border-slate-300/80 text-xs font-sans">
              {(['5m', '15m', '1h', '24h'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTimeRange(t)}
                  className={`px-3 py-1 rounded-lg transition-all uppercase font-semibold ${
                    timeRange === t ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recharts Interactive Area Chart */}
        <div className="w-full h-[360px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={readings} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="mq3Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="mq135Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11, fill: '#334155', fontFamily: 'sans-serif', fontWeight: 600 }} />
              <YAxis stroke="#64748b" domain={[0, Math.max(45, Math.ceil(threshold * 1.15))]} tick={{ fontSize: 11, fill: '#334155', fontFamily: 'sans-serif', fontWeight: 600 }} unit=" PPM" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="glass-panel p-3.5 rounded-xl border border-slate-300/90 text-xs font-sans shadow-xl bg-white/95 text-slate-900">
                        <div className="text-slate-500 mb-1.5 font-bold">{label}</div>
                        <div className="text-sky-700 font-bold">MQ-3 Alcohol Vapor: {payload[0]?.value} PPM</div>
                        <div className="text-teal-700 font-bold">MQ-135 Precursors: {payload[1]?.value} PPM</div>
                        <div className="text-rose-600 font-bold">Composite Index: {payload[2]?.value} PPM</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={threshold}
                stroke="#dc2626"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{ value: `ALARM THRESHOLD: ${threshold} PPM`, fill: '#dc2626', fontSize: 11, fontFamily: 'sans-serif', fontWeight: 'bold', position: 'insideTopRight' }}
              />
              <Area type="monotone" dataKey="mq3" stroke="#0284c7" strokeWidth={3} fillOpacity={1} fill="url(#mq3Grad)" name="MQ-3 Vapor" />
              <Area type="monotone" dataKey="mq135" stroke="#0d9488" strokeWidth={2.5} fillOpacity={1} fill="url(#mq135Grad)" name="MQ-135 Precursors" />
              <Line type="monotone" dataKey="composite" stroke="#e11d48" strokeWidth={2.5} dot={false} name="Composite Index" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Auto-Captured Incident Gallery */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-slate-200/90 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-700">
              <Camera size={20} />
            </div>
            <div>
              <h3 className="font-sans text-sm font-bold text-slate-900 tracking-tight">
                AUTO-CAPTURED INCIDENT RECORDS
              </h3>
              <p className="text-xs font-sans text-slate-600 mt-0.5 font-medium">
                Optical frames captured automatically when chemical gas spikes exceed threshold
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {captures.length > 0 && (
              <button
                onClick={handleClearLogs}
                disabled={isClearingLogs}
                className="px-3 py-1.5 rounded-xl font-sans text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Trash2 size={13} />
                <span>{isClearingLogs ? 'CLEARING...' : 'CLEAR RECORDS'}</span>
              </button>
            )}
          </div>
        </div>

        {captures.length === 0 ? (
          <div className="p-10 text-center font-sans text-xs text-slate-500 font-medium flex flex-col items-center justify-center gap-2">
            <Camera size={32} className="opacity-40 text-sky-600" />
            <span>No chemical spike records logged. Click &quot;TEST SPIKE TRIGGER&quot; above to simulate an incident capture.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3.5">
            {captures.map((cap, i) => (
              <div
                key={cap.id || i}
                onClick={() => setInspectCapture(cap)}
                className="group relative rounded-xl overflow-hidden glass-panel border border-slate-200 hover:border-sky-400 cursor-pointer transition-all aspect-video shadow-xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cap.photo_url} alt="Spike frame" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-2 left-2.5 right-2.5 flex justify-between items-center text-[10px] font-sans font-semibold text-white">
                  <span className="truncate max-w-[90px] font-bold text-sky-300">
                    {cap.substance_name?.split(':')[1]?.split('(')[0]?.trim() || 'Spike'}
                  </span>
                  <span className="text-slate-300 font-mono text-[9px]">
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
