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
  Flame,
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
  Bomb,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { findNearestRailwayStation } from '@/lib/railwayStations';
import { clearDetectionEvents } from '@/lib/logService';

// Synthesize alarm & shutter beep
function playExplosivesShutterSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1040, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.13);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.13);
  } catch {}
}

export default function ExplosivesSensorPage() {
  // Navigation / Filter state
  const [timeRange, setTimeRange] = useState<'5m' | '15m' | '1h' | '24h'>('5m');
  const [threshold, setThreshold] = useState<number>(50.0);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Hardware Connection State
  const [isSerialConnected, setIsSerialConnected] = useState<boolean>(false);
  const [isUsingMockData, setIsUsingMockData] = useState<boolean>(true);
  const [showArduinoModal, setShowArduinoModal] = useState<boolean>(false);
  const [serialError, setSerialError] = useState<string | null>(null);

  // Live Telemetry Streams
  const [readings, setReadings] = useState<any[]>([]);
  const [rdxConcentration, setRdxConcentration] = useState<number>(4.8);
  const [memsFreqShiftHz, setMemsFreqShiftHz] = useState<number>(-12);
  const [dscHeatFlowUw, setDscHeatFlowUw] = useState<number>(1.2);
  const [lastSpikeTime, setLastSpikeTime] = useState<string | null>(null);

  // Auto-Capture State
  const [captures, setCaptures] = useState<any[]>([]);
  const [inspectCapture, setInspectCapture] = useState<any | null>(null);
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);
  const [spikeNotification, setSpikeNotification] = useState<string | null>(null);
  const [isClearingLogs, setIsClearingLogs] = useState<boolean>(false);

  // Geo Location & Station Info
  const [currentCoords, setCurrentCoords] = useState<[number, number]>([22.59548, 88.45420]);
  const [stationName, setStationName] = useState<string>('Bidhan Nagar Road (BNR) • Eastern Railway');

  const serialPortRef = useRef<any>(null);
  const lastAutoCaptureTimeRef = useRef<number>(0);
  const [cameraSource, setCameraSource] = useState<'ip_webcam' | 'device'>('ip_webcam');
  const [ipWebcamUrl, setIpWebcamUrl] = useState<string>('http://10.35.147.105:8080/video');
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

  // Fetch initial auto-captures for explosives from Supabase
  useEffect(() => {
    const fetchCaptures = async () => {
      const { data } = await supabase
        .from('detection_events')
        .select('*')
        .or('substance_category.ilike.%explosives%,substance_name.ilike.%rdx%,substance_name.ilike.%petn%,substance_name.ilike.%mems%')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (data) setCaptures(data);
    };

    fetchCaptures();

    // Listen to local capture events in 0ms
    const handleLocalCapture = (e: any) => {
      const ev = e.detail;
      if (
        ev.substance_category?.includes('Explosives') ||
        ev.substance_name?.includes('RDX') ||
        ev.substance_name?.includes('MEMS')
      ) {
        setCaptures(prev => [ev, ...prev]);
      }
    };

    window.addEventListener('vikrant:new_capture', handleLocalCapture);
    return () => window.removeEventListener('vikrant:new_capture', handleLocalCapture);
  }, []);

  // Clear Explosives Detection Logs from Supabase and local state
  const handleClearLogs = async () => {
    if (!confirm('Clear all explosives spike records from the database? This frees database storage and cannot be undone.')) return;
    setIsClearingLogs(true);
    await clearDetectionEvents({ category: 'explosives' });
    setCaptures([]);
    setIsClearingLogs(false);
  };

  // Listen to cross-page log clearing events
  useEffect(() => {
    const handleLogsCleared = (e: any) => {
      const cat = e.detail?.category;
      if (cat === 'explosives' || cat === 'all') {
        setCaptures([]);
      }
    };
    window.addEventListener('vikrant:logs_cleared', handleLogsCleared);
    return () => window.removeEventListener('vikrant:logs_cleared', handleLogsCleared);
  }, []);

  // Sync camera settings from localStorage and listen to cross-page settings updates
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

  // Auto-fallback watchdog: if cameraSource is ip_webcam and phone stream unreachable after 3.5s, switch to device camera
  useEffect(() => {
    if (cameraSource !== 'ip_webcam') return;
    const timer = setTimeout(() => {
      if (!ipCamConnected) {
        console.warn('[Explosives] IP camera timed out, falling back to laptop camera');
        setCameraSource('device');
      }
    }, 3500);
    return () => clearTimeout(timer);
  }, [cameraSource, ipCamConnected]);

  // Trigger Camera Snapshot on Spike
  const triggerAutoCapture = useCallback(
    async (peakNgl: number, triggerSensor: string) => {
      const now = Date.now();
      // Cooldown of 8s between auto-captures to prevent flood
      if (now - lastAutoCaptureTimeRef.current < 8000) return;
      lastAutoCaptureTimeRef.current = now;

      // Flash & Audio
      setShutterFlash(true);
      playExplosivesShutterSound();
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
          ctx.fillStyle = '#0a0505';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Grid lines
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)';
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

          // Optical Target Crosshairs
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          const cx = canvas.width / 2;
          const cy = canvas.height / 2;
          ctx.strokeRect(cx - 70, cy - 70, 140, 140);
          ctx.beginPath();
          ctx.moveTo(cx - 90, cy);
          ctx.lineTo(cx + 90, cy);
          ctx.moveTo(cx, cy - 90);
          ctx.lineTo(cx, cy + 90);
          ctx.stroke();
        }

        // Stamped Tactical Red Hazard Banner
        ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
        ctx.fillRect(16, 16, canvas.width - 32, 34);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`💥 EXPLOSIVES TRACE SPIKE: ${peakNgl} ng/L [${triggerSensor}]`, 26, 38);

        // Bottom Telemetry Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(16, canvas.height - 48, canvas.width - 32, 36);

        ctx.fillStyle = '#f87171';
        ctx.font = '11px monospace';
        ctx.fillText(`LOC: ${currentCoords[0].toFixed(5)}° N, ${currentCoords[1].toFixed(5)}° E • ${stationName.split('•')[0].trim()}`, 24, canvas.height - 28);
        ctx.fillText(`TIME: ${new Date().toLocaleTimeString()} • SENSOR: RDX MEMS/DSC TRACE`, 24, canvas.height - 14);
      }

      const photoUrl = canvas.toDataURL('image/jpeg', 0.85);
      const timestamp = new Date().toISOString();

      const newEvent = {
        unit_id: 'c7569eb7-87ab-43db-905b-54baf7b106fc',
        substance_category: 'Explosives Trace (RDX)',
        substance_name: `High Explosive Trace Spike: ${peakNgl} ng/L (${triggerSensor})`,
        confidence_tier: 'confirmed',
        confidence_score: 0.98,
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
      setSpikeNotification(`💥 AUTO-CAPTURED: ${peakNgl} ng/L RDX spike at ${stationName.split('•')[0].trim()}!`);
      setTimeout(() => setSpikeNotification(null), 5000);

      window.dispatchEvent(new CustomEvent('vikrant:new_capture', { detail: finalItem }));
    },
    [currentCoords, stationName]
  );

  // Web Serial API: Connect directly to Arduino Uno via USB
  const connectArduinoSerial = async () => {
    try {
      if (!('serial' in navigator)) {
        setSerialError('Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
        return;
      }

      setSerialError(null);
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      serialPortRef.current = port;
      setIsSerialConnected(true);
      setIsUsingMockData(false); // Disable mock data immediately on hardware connection!

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          try {
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              const data = JSON.parse(trimmed);
              const rdxVal = Number(data.rdx || 0);
              const memsVal = Number(data.mems || 0);
              const dscVal = Number(data.dsc || 0);
              handleIncomingSensorData(rdxVal, memsVal, dscVal, 'ARDUINO_UNO');
            } else if (trimmed.includes('RDX:')) {
              const rdxVal = parseFloat(trimmed.replace('RDX:', '').trim());
              const memsVal = Math.round(rdxVal * -3.2);
              const dscVal = Number((rdxVal * 0.12).toFixed(2));
              handleIncomingSensorData(rdxVal, memsVal, dscVal, 'ARDUINO_UNO');
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setSerialError(`Serial Connection Error: ${err.message}`);
      }
    }
  };

  // Process incoming sensor packet (hardware or simulation)
  const handleIncomingSensorData = (rdx: number, mems: number, dsc: number, source: string) => {
    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setRdxConcentration(rdx);
    setMemsFreqShiftHz(mems);
    setDscHeatFlowUw(dsc);

    const newPoint = {
      time: timeLabel,
      rdx,
      mems,
      dsc,
      threshold,
      source,
    };

    setReadings(prev => [...prev.slice(-30), newPoint]);

    // Check spike condition
    if (rdx >= threshold) {
      triggerAutoCapture(rdx, 'RDX / MEMS Microcantilever');
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
      const baseRdx = Number((3 + Math.sin(i * 0.3) * 2 + (Math.random() * 1.5)).toFixed(1));
      const baseMems = Math.round(baseRdx * -2.8);
      const baseDsc = Number((baseRdx * 0.14).toFixed(2));
      initPoints.push({
        time: t,
        rdx: baseRdx,
        mems: baseMems,
        dsc: baseDsc,
        threshold: 50.0,
        source: 'SIMULATOR',
      });
    }
    setReadings(initPoints);

    const interval = setInterval(() => {
      const rand = Math.random();
      const willSpike = rand > 0.88; // 12% chance of natural spike during patrol
      const rdx = willSpike ? Number((62 + Math.random() * 26).toFixed(1)) : Number((4 + Math.sin(Date.now() / 8000) * 2.5 + (Math.random() * 1.5)).toFixed(1));
      const mems = willSpike ? Math.round(-180 - Math.random() * 80) : Math.round(-12 + Math.cos(Date.now() / 7000) * 8);
      const dsc = willSpike ? Number((12.4 + Math.random() * 6).toFixed(2)) : Number((1.2 + Math.sin(Date.now() / 6000) * 0.8).toFixed(2));

      handleIncomingSensorData(rdx, mems, dsc, 'SIMULATOR');
    }, 3500);

    return () => clearInterval(interval);
  }, [isUsingMockData, isSerialConnected, threshold, triggerAutoCapture]);

  // Force Test Spike manually
  const handleForceTestSpike = () => {
    const spikeRdx = Number((78 + Math.random() * 14).toFixed(1));
    const spikeMems = -245;
    const spikeDsc = 16.8;
    handleIncomingSensorData(spikeRdx, spikeMems, spikeDsc, 'FORCED_TEST');
  };

  const isAlarmActive = rdxConcentration >= threshold;

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
            console.warn('[Explosives] IP stream failed, auto-falling back to laptop camera');
            setIpCamConnected(false);
            setCameraSource('device');
          }}
        />
      )}

      {/* Screen Shutter Flash Overlay */}
      {shutterFlash && (
        <div className="fixed inset-0 z-50 bg-red-500/25 pointer-events-none transition-opacity duration-150" />
      )}

      {/* Spike Alert Banner */}
      {spikeNotification && (
        <div className="fixed top-4 right-4 z-50 bg-red-950/90 border border-red-500 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-200">
          <Flame size={18} className="text-red-400 animate-pulse" />
          <span className="font-mono text-xs font-bold">{spikeNotification}</span>
        </div>
      )}

      {/* High-Resolution Capture Inspector Modal */}
      {inspectCapture && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-panel p-5 rounded-2xl border border-red-500 max-w-2xl w-full flex flex-col gap-4 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2">
                <Scan size={18} className="text-red-400" />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  EXPLOSIVES RECON PASSPORT • RDX / MEMS
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
              <img src={inspectCapture.photo_url} alt="Explosives frame" className="w-full h-full object-cover" />
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
                <span className="text-[10px] text-red-400 font-bold">
                  TIER: CONFIRMED EXPLOSIVE TRACE
                </span>
              </div>
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
          <div className="glass-panel p-6 rounded-2xl border border-red-400 max-w-3xl w-full flex flex-col gap-4 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2 text-red-400">
                <Code size={20} />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  ARDUINO UNO C++ SKETCH (EXPLOSIVES TRACE / MEMS SENSOR)
                </h3>
              </div>
              <button
                onClick={() => setShowArduinoModal(false)}
                className="text-foreground/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-sm font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            <p className="text-xs text-foreground/70 font-mono">
              Upload this sketch to your Arduino Uno to stream real sensor packets over USB Serial. Connect sensor analog out to <strong>A2</strong> (differential trace sensor).
            </p>

            <pre className="p-4 rounded-xl bg-black/80 border border-panel-border text-[11px] font-mono text-red-400 overflow-x-auto select-all">
{`// IR VIKRANT - Arduino Uno RDX / MEMS Explosives Telemetry Bridge
const int PIN_TRACE = A2; // MEMS / Differential Sensor Out

void setup() {
  Serial.begin(9600);
  pinMode(PIN_TRACE, INPUT);
  delay(1000); // Sensor stabilization
}

void loop() {
  int raw = analogRead(PIN_TRACE);

  // Convert ADC to ng/L calibration curve
  float rdx_ngl = (raw / 1023.0) * 100.0;
  float mems_shift = rdx_ngl * -3.2; // Frequency shift in Hz
  float dsc_uw = rdx_ngl * 0.18;     // Calorimetry heat flow in uW

  // JSON Serial output
  Serial.print("{\\"rdx\\":");
  Serial.print(rdx_ngl, 1);
  Serial.print(",\\"mems\\":");
  Serial.print(mems_shift, 1);
  Serial.print(",\\"dsc\\":");
  Serial.print(dsc_uw, 2);
  Serial.println("}");

  delay(1000);
}`}
            </pre>

            <div className="flex justify-end gap-3 pt-2 border-t border-panel-border">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`// IR VIKRANT - Arduino Uno RDX Bridge...`);
                  alert('Code copied to clipboard!');
                }}
                className="px-4 py-2 rounded-xl liquid-btn text-xs font-mono font-bold"
              >
                COPY SKETCH
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
      <div className="glass-panel p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shrink-0 border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 shadow-sm">
            <Flame size={26} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-sans text-base font-bold text-slate-900 tracking-tight">
                EXPLOSIVES TRACE & RDX MEMS DETECTION
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase flex items-center gap-1.5 border ${
                  isSerialConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isSerialConnected ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
                {isSerialConnected ? 'ARDUINO UNO LIVE (HARDWARE CONNECTED)' : 'MOCK SIMULATOR STREAM (STANDBY FOR ARDUINO)'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-sans text-slate-600 mt-1 font-medium">
              <MapPin size={13} className="text-rose-600" />
              <span>{stationName}</span>
              <span className="text-slate-300">•</span>
              <span>Microcantilever Resonance (MEMS) + Differential Scanning Calorimetry (DSC)</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Camera Source Indicator */}
          <Link
            href="/dashboard/settings"
            className={`px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-2 transition-all border shadow-xs ${
              cameraSource === 'ip_webcam'
                ? ipCamConnected
                  ? 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                : 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
            }`}
            title="Configured camera for spike auto-capture. Click to change in Settings."
          >
            <Smartphone size={14} className={cameraSource === 'ip_webcam' && ipCamConnected ? 'animate-pulse text-sky-600' : ''} />
            <span>
              {cameraSource === 'ip_webcam'
                ? ipCamConnected
                  ? 'PHONE CAM LIVE'
                  : 'PHONE CAM CONNECTING'
                : 'LAPTOP WEBCAM'}
            </span>
          </Link>

          {/* Connect Arduino Button */}
          <button
            onClick={connectArduinoSerial}
            className={`px-3 py-1.5 rounded-xl font-sans text-xs font-bold flex items-center gap-2 transition-all border shadow-xs ${
              isSerialConnected
                ? 'bg-emerald-600 text-white border-emerald-700'
                : 'bg-slate-900 text-white border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Usb size={14} />
            <span>{isSerialConnected ? 'ARDUINO CONNECTED' : 'CONNECT ARDUINO (USB)'}</span>
          </button>

          {/* Flash Code Modal Button */}
          <button
            onClick={() => setShowArduinoModal(true)}
            className="px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-2 bg-white/80 hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-xs"
          >
            <Code size={14} className="text-slate-600" />
            <span>ARDUINO SKETCH</span>
          </button>

          {/* Force Test Spike Button */}
          <button
            onClick={handleForceTestSpike}
            className="px-3.5 py-1.5 rounded-xl font-sans text-xs font-bold flex items-center gap-2 bg-rose-600 text-white border border-rose-700 hover:bg-rose-700 transition-all shadow-sm active:scale-95"
          >
            <Zap size={14} />
            <span>FORCE RDX SPIKE</span>
          </button>

          {/* Mock Toggle */}
          <button
            onClick={() => setIsUsingMockData(v => !v)}
            disabled={isSerialConnected}
            className={`p-2 rounded-xl border text-xs font-sans transition-all shadow-xs ${
              isUsingMockData
                ? 'bg-white text-slate-800 border-slate-300'
                : 'bg-slate-100 text-slate-400 border-slate-200'
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

      {/* KPI Gauges Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
        {/* RDX Concentration Gauge */}
        <div className={`glass-panel p-4.5 rounded-2xl flex flex-col gap-2 border transition-all shadow-[0_4px_16px_rgba(0,0,0,0.03)] ${
          isAlarmActive ? 'border-rose-400 bg-rose-50/60' : 'border-white/90 hover:border-rose-300'
        }`}>
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span>RDX TRACE LEVEL</span>
            <span className={isAlarmActive ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>
              {isAlarmActive ? 'CRITICAL DETONATION THREAT' : 'CLEAR'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-sans font-bold ${isAlarmActive ? 'text-rose-600' : 'text-slate-950'}`}>
              {rdxConcentration}
            </span>
            <span className="text-xs font-sans text-rose-700 font-semibold">ng/L</span>
          </div>
          <div className="flex justify-between text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80">
            <span>ALARM LIMIT: {threshold.toFixed(0)} ng/L</span>
            <span className="text-rose-700 font-bold">{rdxConcentration >= threshold ? 'SPIKE' : 'SAFE'}</span>
          </div>
        </div>

        {/* MEMS Frequency Shift */}
        <div className="glass-panel p-4.5 rounded-2xl flex flex-col gap-2 border border-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:border-sky-300 transition-all">
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span>MEMS FREQ SHIFT (Δf)</span>
            <span className="text-sky-700 font-bold">MASS LOADING</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-sans font-bold text-slate-950">{memsFreqShiftHz}</span>
            <span className="text-xs font-sans text-sky-700 font-semibold">Hz</span>
          </div>
          <div className="text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80">
            PZT PIEZOELECTRIC ADSORPTION
          </div>
        </div>

        {/* DSC Heat Flow */}
        <div className="glass-panel p-4.5 rounded-2xl flex flex-col gap-2 border border-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:border-amber-300 transition-all">
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span>DSC CALORIMETRY (ΔH)</span>
            <span className="text-amber-700 font-bold">MICRO-HEAT</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-sans font-bold text-slate-950">{dscHeatFlowUw}</span>
            <span className="text-xs font-sans text-amber-700 font-semibold">µW</span>
          </div>
          <div className="text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80">
            EXOTHERMIC DEFLAGRATION SIGNATURE
          </div>
        </div>

        {/* Auto-Captures Counter */}
        <div className="glass-panel p-4.5 rounded-2xl flex flex-col gap-2 border border-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:border-rose-300 transition-all">
          <div className="flex justify-between items-center text-xs font-sans font-bold text-slate-700">
            <span>SPIKE AUTO-CAPTURES</span>
            <Camera size={14} className="text-rose-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-sans font-bold text-slate-950">{captures.length}</span>
            <span className="text-xs font-sans text-slate-500 font-medium">frames</span>
          </div>
          <div className="text-[11px] font-sans text-slate-500 font-medium mt-0.5 pt-1.5 border-t border-slate-200/80 truncate">
            {lastSpikeTime ? `LAST TRIGGER: ${lastSpikeTime}` : 'STANDBY FOR SPIKE'}
          </div>
        </div>
      </div>

      {/* Interactive Main Visualizer & Chart */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-slate-200/90 shadow-sm">
        {/* Chart Header & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="font-sans text-sm font-bold text-slate-900 tracking-tight">
                REAL-TIME RDX TRACE CONCENTRATION & CALORIMETRY HEAT FLOW
              </h2>
              <p className="text-xs font-sans text-slate-600 mt-0.5 font-medium">
                Microcantilever Resonance (MEMS) + Differential Scanning Calorimetry (DSC)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Interactive Threshold Slider */}
            <div className="flex items-center gap-2.5 font-sans text-xs bg-white/90 px-3.5 py-1.5 rounded-xl border border-slate-300 shadow-xs text-slate-800 font-semibold">
              <span className="text-xs text-slate-500 font-medium uppercase">THRESHOLD:</span>
              <input
                type="range"
                min="20"
                max="90"
                step="1"
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="w-28 accent-rose-600 cursor-pointer"
              />
              <span className="text-xs font-bold text-rose-700">{threshold.toFixed(0)} ng/L</span>
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

        {/* High-Fidelity Area Chart */}
        <div className="w-full h-[360px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={readings} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="rdxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e11d48" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#e11d48" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="dscGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11, fill: '#334155', fontFamily: 'sans-serif', fontWeight: 600 }} />
              <YAxis stroke="#64748b" domain={[0, Math.max(50, Math.ceil(threshold * 1.15))]} tick={{ fontSize: 11, fill: '#334155', fontFamily: 'sans-serif', fontWeight: 600 }} unit=" ng" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="glass-panel p-3.5 rounded-xl border border-slate-300/90 text-xs font-sans shadow-xl bg-white/95 text-slate-900">
                        <div className="text-slate-500 mb-1.5 font-bold">{label}</div>
                        <div className="text-rose-700 font-bold">RDX Trace: {payload[0]?.value} ng/L</div>
                        <div className="text-amber-700 font-bold">DSC Heat Flow: {payload[1]?.value} µW</div>
                        <div className="text-sky-700 font-bold">MEMS Shift: {payload[0]?.payload?.mems} Hz</div>
                        <div className="text-[10px] text-slate-500 mt-1">Source: {payload[0]?.payload?.source}</div>
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
                label={{ value: `ALARM THRESHOLD: ${threshold} ng/L`, fill: '#dc2626', fontSize: 11, fontFamily: 'sans-serif', fontWeight: 'bold', position: 'insideTopRight' }}
              />
              <Area type="monotone" dataKey="rdx" stroke="#e11d48" strokeWidth={3} fillOpacity={1} fill="url(#rdxGrad)" name="RDX Trace (ng/L)" />
              <Area type="monotone" dataKey="dsc" stroke="#d97706" strokeWidth={2.5} fillOpacity={1} fill="url(#dscGrad)" name="DSC Heat Flow (µW)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Auto-Captured Recon Gallery (Spike Triggered Snapshots) */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-slate-200/90 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
              <Camera size={20} />
            </div>
            <div>
              <h3 className="font-sans text-sm font-bold text-slate-900 tracking-tight">
                AUTO-CAPTURED EXPLOSIVES RECON GALLERY
              </h3>
              <p className="text-xs font-sans text-slate-600 mt-0.5 font-medium">
                Optical frames captured automatically when chemical gas spikes exceed threshold
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-sans text-slate-500 font-semibold">
              AUTO-FIRES INSTANTLY AT {threshold.toFixed(0)} NG/L
            </span>
            {captures.length > 0 && (
              <button
                onClick={handleClearLogs}
                disabled={isClearingLogs}
                className="px-3 py-1.5 rounded-xl font-sans text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5 transition-all shadow-xs"
                title="Clear all explosives spike records from database"
              >
                <Trash2 size={13} />
                <span>{isClearingLogs ? 'CLEARING...' : 'CLEAR LOGS'}</span>
              </button>
            )}
          </div>
        </div>

        {captures.length === 0 ? (
          <div className="p-10 text-center font-sans text-xs text-slate-500 font-medium flex flex-col items-center justify-center gap-2">
            <Camera size={32} className="opacity-40 text-rose-600" />
            <span>No spike captures recorded yet. Click &quot;FORCE RDX SPIKE&quot; above to test the auto-capture pipeline.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3.5">
            {captures.map((cap, i) => (
              <div
                key={cap.id || i}
                onClick={() => setInspectCapture(cap)}
                className="group relative rounded-xl overflow-hidden glass-panel border border-slate-200 hover:border-rose-400 cursor-pointer transition-all aspect-video shadow-xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cap.photo_url} alt="Explosives frame" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-2 left-2.5 right-2.5 flex justify-between items-center text-[10px] font-sans font-semibold text-white">
                  <span className="truncate max-w-[90px] font-bold text-rose-300">
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
