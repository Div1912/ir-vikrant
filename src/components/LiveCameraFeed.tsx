'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  Eye,
  Flame,
  Check,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Scan,
  Sparkles,
  Radio,
  Settings,
  Volume2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { findNearestRailwayStation } from '@/lib/railwayStations';
import { getWatchlist, findBestSuspectMatch } from '@/lib/watchlistService';
import { extractFaceDescriptor } from '@/lib/faceRecognitionEngine';

interface LiveCameraFeedProps {
  unitCode: string;
  unitId?: string;
  location?: string;
  className?: string;
  onEventCreated?: (event: any) => void;
}

// Comprehensive target props dictionary for COCO-SSD
const TARGET_PROPS: Record<string, { label: string; category: string; tier: 'confirmed' | 'presumptive' }> = {
  // Bottles & Vials
  bottle: { label: 'Chemical Precursor Bottle', category: 'Chemical Precursor', tier: 'presumptive' },
  'wine glass': { label: 'Liquid Contraband Vial', category: 'Chemical Precursor', tier: 'presumptive' },
  cup: { label: 'Suspicious Liquid Reagent', category: 'Chemical Precursor', tier: 'presumptive' },
  vase: { label: 'Concealed Liquid Vessel', category: 'Chemical Precursor', tier: 'presumptive' },
  bowl: { label: 'Liquid Preparation Container', category: 'Chemical Precursor', tier: 'presumptive' },

  // Bags, Backpacks & Luggage
  handbag: { label: 'Suspicious Pouch / Small Bag', category: 'Narcotics Concealment', tier: 'confirmed' },
  backpack: { label: 'Unattended Tactical Bag', category: 'Explosives Suspect', tier: 'confirmed' },
  suitcase: { label: 'Contraband Parcel / Luggage', category: 'Narcotics Concealment', tier: 'confirmed' },

  // Electronics & Packets
  'cell phone': { label: 'Electronic Trigger / Detonator', category: 'IED Precursor', tier: 'presumptive' },
  book: { label: 'Concealed Hollowed Packet', category: 'Contraband Packet', tier: 'presumptive' },
  remote: { label: 'Remote Detonator Trigger', category: 'IED Precursor', tier: 'confirmed' },
  laptop: { label: 'Tactical Computing Node', category: 'Cyber Recon', tier: 'presumptive' },
  mouse: { label: 'Electronic Component Prop', category: 'Electronic Precursor', tier: 'presumptive' },
  scissors: { label: 'Sharp Weapon / Cutting Prop', category: 'Restricted Item', tier: 'confirmed' },
  umbrella: { label: 'Concealed Container Shaft', category: 'Restricted Item', tier: 'presumptive' },
};

// Synthesize camera shutter sound via Web Audio API
function playCameraShutterSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(920, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch {}
}

// Synthesize Law Enforcement Interception Alarm chime
function playInterceptionAlertSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174, now + 0.12);
    osc.frequency.setValueAtTime(880, now + 0.24);
    osc.frequency.setValueAtTime(1174, now + 0.36);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  } catch {}
}

export default function LiveCameraFeed({
  unitCode,
  unitId,
  location = 'NDLS Platform 1',
  className = '',
  onEventCreated,
}: LiveCameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ipImgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastAutoTriggerTimeRef = useRef<number>(0);
  const watchlistRef = useRef<any[]>([]);

  useEffect(() => {
    getWatchlist().then(list => {
      watchlistRef.current = list;
    });
  }, []);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mode, setMode] = useState<'optical' | 'thermal'>('optical');
  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // IP Webcam support
  const [feedSource, setFeedSource] = useState<'device' | 'ip_webcam'>('ip_webcam');
  const [ipWebcamUrl, setIpWebcamUrl] = useState<string>('http://10.35.147.216:8080/video');
  const [ipStreamMode, setIpStreamMode] = useState<'direct' | 'proxy'>('direct');
  const [showIpInput, setShowIpInput] = useState<boolean>(false);
  const [showInsecureHelp, setShowInsecureHelp] = useState<boolean>(false);
  const [fellBackToDevice, setFellBackToDevice] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const savedSrc = localStorage.getItem('vikrant_camera_source') as 'device' | 'ip_webcam' | null;
      if (savedSrc) setFeedSource(savedSrc);
      
      let savedUrl = localStorage.getItem('vikrant_ip_webcam_url');
      if (savedUrl) {
        // Auto-upgrade obsolete IPs (.52, .247, or .163) to current active phone IP .216
        if (savedUrl.includes('10.35.147.')) {
          savedUrl = savedUrl.replace(/10\.35\.147\.\d+/, '10.35.147.216');
          localStorage.setItem('vikrant_ip_webcam_url', savedUrl);
        }
        setIpWebcamUrl(savedUrl);
      }

      let savedMode = localStorage.getItem('vikrant_ip_stream_mode') as 'direct' | 'proxy' | null;
      // On cloud deployments (Vercel), local private IPs can NEVER be reached by cloud proxy
      if (isCloud && savedMode === 'proxy') {
        savedMode = 'direct';
        localStorage.setItem('vikrant_ip_stream_mode', 'direct');
      }
      if (savedMode) setIpStreamMode(savedMode);

      const handleSettingsChange = (e: any) => {
        if (e.detail) {
          if (e.detail.source) setFeedSource(e.detail.source);
          if (e.detail.url) setIpWebcamUrl(e.detail.url);
          if (e.detail.mode) setIpStreamMode(e.detail.mode);
        }
      };
      window.addEventListener('vikrant:camera_settings_changed', handleSettingsChange);
      return () => window.removeEventListener('vikrant:camera_settings_changed', handleSettingsChange);
    }
  }, []);

  // Broadcast helper to sync changes across all pages
  const syncCameraSettings = (newSrc: 'device' | 'ip_webcam', newUrl: string, newMode: 'direct' | 'proxy') => {
    if (typeof window !== 'undefined') {
      const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const isLocalIp = newUrl.includes('10.') || newUrl.includes('192.168.') || newUrl.includes('127.0.0.1') || newUrl.includes('localhost');
      const safeMode = isCloud && isLocalIp ? 'direct' : newMode;

      localStorage.setItem('vikrant_camera_source', newSrc);
      localStorage.setItem('vikrant_ip_webcam_url', newUrl);
      localStorage.setItem('vikrant_ip_stream_mode', safeMode);
      window.dispatchEvent(
        new CustomEvent('vikrant:camera_settings_changed', {
          detail: { source: newSrc, url: newUrl, mode: safeMode },
        })
      );
    }
  };

  // AI Detection State
  const [isAiLoading, setIsAiLoading] = useState<boolean>(true);
  const [isAiActive, setIsAiActive] = useState<boolean>(true);
  const [aiModel, setAiModel] = useState<any>(null);
  const [detectedObjects, setDetectedObjects] = useState<any[]>([]);
  const [triggerNotification, setTriggerNotification] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);

  // 1. Initialize Phone / Device Camera (Device Camera ONLY starts if feedSource === 'device')
  const startDeviceCamera = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera API unavailable in this context');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      setHasCamera(true);
      setCameraError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn(`[Camera] Unit ${unitCode} camera access error:`, err.message);
      setHasCamera(false);
      setCameraError(err.message || 'Camera permission denied');
    }
  }, [unitCode]);

  // Automatic Failover: If Phone IP camera is unreachable or blocked, fallback to Laptop Camera!
  const triggerAutoFallbackToDeviceCamera = useCallback((reason: string) => {
    console.warn('[LiveCameraFeed] Phone IP unreachable. Auto-falling back to laptop webcam:', reason);
    setFeedSource('device');
    setFellBackToDevice(true);
    setCameraError(null);
    startDeviceCamera();
  }, [startDeviceCamera]);

  // Watchdog timer: If IP camera feed does not load within 3.5s, auto-switch to laptop camera
  useEffect(() => {
    if (feedSource === 'ip_webcam' && !hasCamera) {
      const timer = setTimeout(() => {
        if (!hasCamera) {
          triggerAutoFallbackToDeviceCamera('Phone camera took too long to respond. Switched to laptop webcam.');
        }
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [feedSource, hasCamera, triggerAutoFallbackToDeviceCamera]);

  useEffect(() => {
    if (feedSource === 'device') {
      startDeviceCamera();
    } else {
      // Immediately stop device webcam tracks if switched away from device
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject = null;
      }
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [feedSource, startDeviceCamera]);

  useEffect(() => {
    if (videoRef.current && stream && feedSource === 'device') {
      videoRef.current.srcObject = stream;
    }
  }, [stream, feedSource]);

  // 2. Load Pretrained Object Detection Model (COCO-SSD / MobileNet)
  useEffect(() => {
    let isCancelled = false;

    const loadModel = async () => {
      try {
        setIsAiLoading(true);
        await import('@tensorflow/tfjs');
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        const model = await cocoSsd.load({ base: 'mobilenet_v2' });

        if (!isCancelled) {
          setAiModel(model);
          setIsAiLoading(false);
          console.log('[AI Vision] Object detection engine armed & scanning');
        }
      } catch (err: any) {
        console.error('[AI Vision] Failed to load model:', err);
        setIsAiLoading(false);
      }
    };

    loadModel();

    return () => {
      isCancelled = true;
    };
  }, []);

  // 3. Instant Frame Capture, Annotation & DB/Storage Logging
  const captureAndLogEvent = useCallback(
    async (detectedItem: {
      class: string;
      score: number;
      label: string;
      category: string;
      tier: 'confirmed' | 'presumptive';
      bbox?: [number, number, number, number];
    }) => {
      setIsCapturing(true);
      if (detectedItem.category === 'Facial Watchlist Intercept') {
        playInterceptionAlertSound();
      } else {
        playCameraShutterSound();
      }
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 200);

      try {
        const video = videoRef.current;
        const ipImg = ipImgRef.current;
        const canvas = canvasRef.current || document.createElement('canvas');

        const sourceEl = feedSource === 'ip_webcam' && ipImg ? ipImg : video;
        if (!sourceEl) return;

        canvas.width = feedSource === 'ip_webcam' && ipImg ? ipImg.naturalWidth || 640 : video?.videoWidth || 640;
        canvas.height = feedSource === 'ip_webcam' && ipImg ? ipImg.naturalHeight || 480 : video?.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw camera frame with thermal filter if enabled
        if (mode === 'thermal') {
          ctx.filter = 'contrast(140%) hue-rotate(180deg) saturate(220%)';
        }
        ctx.drawImage(sourceEl, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';

        // Burn AI Bounding Box directly into the captured image!
        if (detectedItem.bbox) {
          const [bx, by, bw, bh] = detectedItem.bbox;
          const isCulprit = detectedItem.category === 'Facial Watchlist Intercept';
          ctx.strokeStyle = isCulprit ? '#ef4444' : '#38bdf8';
          ctx.lineWidth = 4;
          ctx.strokeRect(bx, by, bw, bh);

          ctx.fillStyle = isCulprit ? 'rgba(220, 38, 38, 0.95)' : 'rgba(2, 132, 199, 0.9)';
          ctx.fillRect(bx, Math.max(0, by - 26), Math.min(canvas.width - bx, 380), 26);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px monospace';
          ctx.fillText(
            isCulprit
              ? `🚨 CULPRIT: ${detectedItem.label.toUpperCase()}`
              : `AI DETECT: ${detectedItem.label.toUpperCase()} (${Math.round(detectedItem.score * 100)}%)`,
            bx + 6,
            Math.max(18, by - 8)
          );
        }

        // Generate base64 Data URL for guaranteed immediate fallback
        const base64Photo = canvas.toDataURL('image/jpeg', 0.82);
        let photoUrl = base64Photo;

        // Also convert to blob and upload to Supabase Storage 'snapshots'
        const fileName = `auto_capture_${detectedItem.class}_${Date.now()}.jpg`;
        const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.85));

        if (blob) {
          const { error: uploadError } = await supabase.storage
            .from('snapshots')
            .upload(fileName, blob, { contentType: 'image/jpeg' });

          if (!uploadError) {
            const { data } = supabase.storage.from('snapshots').getPublicUrl(fileName);
            if (data?.publicUrl) photoUrl = data.publicUrl;
          }
        }

        // Read real-time GPS coordinates and resolve nearest railway station
        let lat = 22.59548;
        let lon = 88.45420;
        let detectedStation = location || 'Bidhan Nagar Road (BNR)';
        if ('geolocation' in navigator) {
          try {
            const pos: any = await new Promise((res, rej) =>
              navigator.geolocation.getCurrentPosition(res, rej, { timeout: 1500, enableHighAccuracy: false })
            );
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            const nearestSt = findNearestRailwayStation(lat, lon);
            detectedStation = `${nearestSt.name} (${nearestSt.code})`;
          } catch {
            const nearestSt = findNearestRailwayStation(lat, lon);
            detectedStation = `${nearestSt.name} (${nearestSt.code})`;
          }
        } else {
          const nearestSt = findNearestRailwayStation(lat, lon);
          detectedStation = `${nearestSt.name} (${nearestSt.code})`;
        }

        // Insert row into Supabase detection_events table
        const targetUnitId = unitId || 'c7569eb7-87ab-43db-905b-54baf7b106fc'; // Q-01 fallback
        const newEvent = {
          unit_id: targetUnitId,
          substance_category: 'AI Visual Trigger (Demo)',
          substance_name: `${detectedItem.label} (${Math.round(detectedItem.score * 100)}% match)`,
          confidence_tier: detectedItem.tier,
          confidence_score: Number(detectedItem.score.toFixed(2)),
          latitude: lat,
          longitude: lon,
          station: detectedStation,
          timestamp: new Date().toISOString(),
          status: 'new',
          photo_url: photoUrl,
        };

        const { data: inserted, error: insertError } = await supabase
          .from('detection_events')
          .insert(newEvent)
          .select()
          .single();

        const createdItem = inserted || { ...newEvent, id: `local-${Date.now()}` };

        // Dispatch local window event so all dashboard panels receive it in 0ms!
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vikrant:new_capture', { detail: createdItem }));
          if (detectedItem.category === 'Facial Watchlist Intercept') {
            window.dispatchEvent(new CustomEvent('vikrant:facial_match', { detail: createdItem }));
          }
        }

        if (onEventCreated) onEventCreated(createdItem);

        setTriggerNotification(`📸 AUTO-CAPTURED: ${detectedItem.label.toUpperCase()} (${Math.round(detectedItem.score * 100)}%)`);
        setTimeout(() => setTriggerNotification(null), 4000);
      } catch (err) {
        console.error('[AI Vision] Auto-capture failed:', err);
      } finally {
        setIsCapturing(false);
      }
    },
    [mode, unitId, location, onEventCreated]
  );

  // 4. High-Speed Frame Sampling Loop (every 350ms with ref cooldown!)
  useEffect(() => {
    if (!aiModel || !isAiActive) return;

    const interval = setInterval(async () => {
      const sourceEl = feedSource === 'ip_webcam' ? ipImgRef.current : videoRef.current;
      if (!sourceEl) return;
      if (feedSource === 'device' && (sourceEl as HTMLVideoElement).readyState < 2) return;
      if (feedSource === 'ip_webcam' && !(sourceEl as HTMLImageElement).complete) return;

      try {
        const predictions = await aiModel.detect(sourceEl);
        setDetectedObjects(predictions);

        // Check if any prediction matches target demo props with score >= 0.32
        for (const pred of predictions) {
          const className = pred.class.toLowerCase();
          const match = TARGET_PROPS[className];

          if (match && pred.score >= 0.32) {
            const now = Date.now();
            // 3.0s cooldown via ref so it doesn't flood, but reacts very fast to props!
            if (now - lastAutoTriggerTimeRef.current > 3000) {
              lastAutoTriggerTimeRef.current = now;
              captureAndLogEvent({
                class: pred.class,
                score: pred.score,
                label: match.label,
                category: match.category,
                tier: match.tier,
                bbox: pred.bbox,
              });
              break;
            }
          }

          // Check for Wanted Suspect Face Match if a person is detected
          if (className === 'person' && watchlistRef.current && watchlistRef.current.length > 0) {
            try {
              const [px, py, pw, ph] = pred.bbox;
              const headCrop = { x: px, y: py, width: pw, height: Math.max(20, ph * 0.45) };
              const faceDescriptor = await extractFaceDescriptor(sourceEl, headCrop);
              const matchResult = findBestSuspectMatch(faceDescriptor, watchlistRef.current, 0.68);

              if (matchResult.isMatch && matchResult.suspect) {
                const now = Date.now();
                if (now - lastAutoTriggerTimeRef.current > 4000) {
                  lastAutoTriggerTimeRef.current = now;
                  captureAndLogEvent({
                    class: 'person',
                    score: matchResult.confidence,
                    label: `WANTED CULPRIT: ${matchResult.suspect.name} (${matchResult.suspect.warrantId})`,
                    category: 'Facial Watchlist Intercept',
                    tier: 'confirmed',
                    bbox: pred.bbox,
                  });
                  break;
                }
              }
            } catch {}
          }
        }
      } catch (err) {
        // Ignored frame drop
      }
    }, 350); // High-speed 350ms loop

    return () => clearInterval(interval);
  }, [aiModel, isAiActive, captureAndLogEvent, feedSource]);

  // 5. Draw Live High-Precision Bounding Box Overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const sourceEl = feedSource === 'ip_webcam' ? ipImgRef.current : videoRef.current;
    if (!canvas || !sourceEl) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const elWidth = (sourceEl as HTMLElement).clientWidth || 400;
    const elHeight = (sourceEl as HTMLElement).clientHeight || 250;
    canvas.width = elWidth;
    canvas.height = elHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isAiActive || detectedObjects.length === 0) return;

    const sourceW = feedSource === 'ip_webcam' ? (sourceEl as HTMLImageElement).naturalWidth || canvas.width : (sourceEl as HTMLVideoElement).videoWidth || canvas.width;
    const sourceH = feedSource === 'ip_webcam' ? (sourceEl as HTMLImageElement).naturalHeight || canvas.height : (sourceEl as HTMLVideoElement).videoHeight || canvas.height;

    const scaleX = canvas.width / (sourceW || canvas.width);
    const scaleY = canvas.height / (sourceH || canvas.height);

    detectedObjects.forEach(obj => {
      const isTarget = TARGET_PROPS[obj.class.toLowerCase()];
      const [x, y, width, height] = obj.bbox;

      const drawX = x * scaleX;
      const drawY = y * scaleY;
      const drawW = width * scaleX;
      const drawH = height * scaleY;

      // Illuminated cyan for target demo props, translucent white for others
      const strokeColor = isTarget ? '#38bdf8' : 'rgba(255,255,255,0.2)';
      const labelText = isTarget
        ? `[TARGET LOCK] ${isTarget.label} (${Math.round(obj.score * 100)}%)`
        : `${obj.class} ${Math.round(obj.score * 100)}%`;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isTarget ? 2.5 : 1;
      ctx.strokeRect(drawX, drawY, drawW, drawH);

      // Corner target brackets
      if (isTarget) {
        const bracketLen = 8;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(drawX, drawY + bracketLen);
        ctx.lineTo(drawX, drawY);
        ctx.lineTo(drawX + bracketLen, drawY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(drawX + drawW - bracketLen, drawY + drawH);
        ctx.lineTo(drawX + drawW, drawY + drawH);
        ctx.lineTo(drawX + drawW, drawY + drawH - bracketLen);
        ctx.stroke();
      }

      // Label tag banner
      ctx.fillStyle = isTarget ? 'rgba(2, 132, 199, 0.92)' : 'rgba(0, 0, 0, 0.65)';
      ctx.font = 'bold 10px monospace';
      const textWidth = ctx.measureText(labelText).width;
      ctx.fillRect(drawX, Math.max(0, drawY - 18), textWidth + 8, 18);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, drawX + 4, Math.max(13, drawY - 5));
    });
  }, [detectedObjects, isAiActive]);

  // Manual demo trigger buttons
  const triggerManualPropDemo = (propKey: 'bottle' | 'handbag' | 'backpack') => {
    const match = TARGET_PROPS[propKey];
    captureAndLogEvent({
      class: propKey,
      score: 0.93,
      label: match.label,
      category: match.category,
      tier: match.tier,
      bbox: [80, 60, 240, 220],
    });
  };

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden border border-panel-border flex items-center justify-center group ${className}`}>
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Shutter Flash Animation Overlay */}
      {shutterFlash && (
        <div className="absolute inset-0 bg-white/90 z-50 pointer-events-none transition-opacity duration-150 animate-out fade-out" />
      )}

      {/* 1. Video Feed (Device Webcam) */}
      {feedSource === 'device' && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover transition-all duration-300 ${
            hasCamera ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
          } ${mode === 'thermal' ? 'filter contrast-150 hue-rotate-180 saturate-200' : 'grayscale-0'}`}
        />
      )}

      {/* 2. IP Webcam Stream */}
      {feedSource === 'ip_webcam' && ipWebcamUrl && !cameraError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ipImgRef}
          key={`${ipWebcamUrl}-${ipStreamMode}`}
          src={ipStreamMode === 'proxy' ? `/api/camera/proxy?url=${encodeURIComponent(ipWebcamUrl)}` : ipWebcamUrl}
          crossOrigin="anonymous"
          alt="IP Webcam Stream"
          className={`w-full h-full object-cover transition-all duration-300 ${
            hasCamera ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
          } ${mode === 'thermal' ? 'filter contrast-150 hue-rotate-180 saturate-200' : 'grayscale-0'}`}
          onLoad={() => {
            setHasCamera(true);
            setCameraError(null);
          }}
          onError={() => {
            setHasCamera(false);
            const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
            const isCloud = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
            const isLocalIp = ipWebcamUrl.includes('10.') || ipWebcamUrl.includes('192.168.') || ipWebcamUrl.includes('127.0.0.1') || ipWebcamUrl.includes('localhost');

            // Automatic failover to Laptop Webcam!
            triggerAutoFallbackToDeviceCamera(
              isCloud && isLocalIp && isHttps
                ? 'Browser blocked local HTTP stream on Vercel. Auto-switched to laptop webcam.'
                : 'Phone camera unreachable. Auto-switched to laptop webcam.'
            );
          }}
        />
      )}

      {/* Active Fallback Notification Banner */}
      {fellBackToDevice && feedSource === 'device' && (
        <div className="absolute top-10 inset-x-2 z-30 flex items-center justify-between bg-black/85 border border-amber-500/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-[9px] font-mono text-amber-200 shadow-xl animate-in slide-in-from-top-1">
          <div className="flex items-center gap-1.5 truncate">
            <Camera size={12} className="text-amber-400 shrink-0 animate-pulse" />
            <span className="truncate"><strong>AUTO-FALLBACK ACTIVE:</strong> Laptop Webcam in use (Phone IP unreachable)</span>
          </div>
          <button
            onClick={() => {
              setFellBackToDevice(false);
              setFeedSource('ip_webcam');
              setHasCamera(false);
            }}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-bold shrink-0 ml-2 border border-amber-500/40"
          >
            RETRY PHONE CAM
          </button>
        </div>
      )}

      {/* 3. Fallback / Diagnostic & One-Click Control Overlay when camera is not streaming */}
      {(!hasCamera || cameraError) && (
        <div className="w-full h-full relative flex flex-col items-center justify-center bg-zinc-950 p-4 text-center z-10 overflow-y-auto">
          <div className="relative z-20 flex flex-col items-center max-w-sm w-full gap-2 text-center">
            <Radio size={24} className="text-cyan-400 animate-pulse" />

            <div className="text-[11px] font-mono font-bold tracking-widest text-white uppercase flex items-center gap-1.5 justify-center">
              <span>{feedSource === 'ip_webcam' ? 'PHONE IP WEBCAM STREAM' : 'LAPTOP / DEVICE WEBCAM'}</span>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                DISCONNECTED
              </span>
            </div>

            {/* Diagnostic Box */}
            <div className="text-[10px] font-mono text-white/80 bg-black/70 border border-white/10 rounded-xl p-2.5 w-full text-left flex flex-col gap-1.5 shadow-xl">
              <div className="flex items-center justify-between text-foreground/50 text-[9px]">
                <span>STREAM TARGET:</span>
                <span className="text-cyan-300 truncate max-w-[170px] font-bold">{ipWebcamUrl}</span>
              </div>

              {cameraError && (
                <div className="text-amber-300 font-bold text-[9px] flex items-start gap-1.5 bg-amber-500/15 p-1.5 rounded-lg border border-amber-500/25">
                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-400" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Vercel HTTPS Notice */}
              {typeof window !== 'undefined' && window.location.protocol === 'https:' && (
                <div className="text-[8.5px] text-cyan-200/90 bg-cyan-950/50 p-1.5 rounded-lg border border-cyan-500/30 flex flex-col gap-0.5">
                  <div className="font-bold text-cyan-300 flex items-center gap-1">
                    <ShieldAlert size={11} />
                    <span>VERCEL (HTTPS) MIXED CONTENT NOTICE</span>
                  </div>
                  <div>Browsers block local HTTP camera streams on secure sites. Choose a quick fix below:</div>
                </div>
              )}
            </div>

            {/* 1-Click Action Buttons */}
            <div className="grid grid-cols-2 gap-1.5 w-full text-[9px] font-mono font-bold">
              <button
                onClick={startDeviceCamera}
                className="px-2.5 py-2 liquid-btn text-cyan-300 rounded-lg hover:bg-cyan-500/20 transition-all flex items-center justify-center gap-1 shadow-lg"
                title="Use laptop / phone built-in webcam directly via WebRTC"
              >
                <Camera size={12} />
                <span>USE WEBCAM</span>
              </button>

              <button
                onClick={() => setShowInsecureHelp(true)}
                className="px-2.5 py-2 liquid-btn-primary text-white rounded-lg transition-all flex items-center justify-center gap-1 shadow-lg"
                title="Allow Insecure Content in Chrome site settings"
              >
                <Settings size={12} />
                <span>CHROME FIX</span>
              </button>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap items-center justify-center gap-1 text-[8px] font-mono text-white/70 w-full pt-1">
              <span className="text-foreground/40 font-bold">PRESETS:</span>
              <button
                onClick={() => {
                  const url = 'http://10.35.147.216:8080/video';
                  setIpWebcamUrl(url);
                  setCameraError(null);
                  setFeedSource('ip_webcam');
                  syncCameraSettings('ip_webcam', url, 'direct');
                }}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-cyan-500/20 hover:text-cyan-300 border border-white/10"
              >
                10.35.147.216 (HTTP)
              </button>
              <button
                onClick={() => {
                  const url = 'https://10.35.147.216:8080/video';
                  setIpWebcamUrl(url);
                  setCameraError(null);
                  setFeedSource('ip_webcam');
                  syncCameraSettings('ip_webcam', url, 'direct');
                  window.open('https://10.35.147.216:8080', '_blank');
                }}
                className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30 flex items-center gap-0.5"
                title="Opens phone HTTPS in new tab to trust SSL certificate"
              >
                <span>10.35.147.216 (HTTPS)</span>
                <ExternalLink size={9} />
              </button>
              <button
                onClick={() => {
                  setCameraError(null);
                  setShowIpInput(true);
                }}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white border border-white/10"
              >
                ENTER IP...
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live AI Bounding Box Overlay Canvas */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Vignette Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/50 pointer-events-none" />

      {/* Top Header Information */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 z-20">
        <span className="text-[10px] font-mono bg-black/80 px-2 py-0.5 rounded-md text-white border border-white/10 font-bold backdrop-blur-md">
          {unitCode}
        </span>
        <span className="text-[9px] font-mono bg-black/60 px-1.5 py-0.5 rounded-md text-white/70 backdrop-blur-md">
          {location}
        </span>
      </div>

      {/* AI Vision Status Pill */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-black/80 border border-cyan-500/30 text-[9px] font-mono backdrop-blur-md">
          <Scan size={11} className={isAiActive ? 'text-cyan-400 animate-spin' : 'text-foreground/40'} />
          <span className={isAiActive ? 'text-cyan-400 font-bold tracking-wider' : 'text-foreground/50'}>
            {isAiLoading ? 'INITIALIZING AI...' : isAiActive ? 'AUTO-DETECTION ARMED' : 'AI STANDBY'}
          </span>
        </div>
      </div>

      {/* Simulated Thermal Overlay Compliance Label */}
      {mode === 'thermal' && (
        <div className="absolute top-8 left-2 z-20">
          <span className="text-[8px] font-mono tracking-widest text-amber-300 bg-black/90 px-2 py-0.5 rounded border border-amber-500/40 uppercase">
            SIMULATED THERMAL OVERLAY (RGB PSEUDO-COLOR)
          </span>
        </div>
      )}

      {/* Instant Notification Toast */}
      {triggerNotification && (
        <div className="absolute top-9 inset-x-2 z-30 flex items-center justify-center pointer-events-none animate-in fade-in slide-in-from-top-2">
          <div className="glass-panel px-3 py-1.5 rounded-lg border border-cyan-400 bg-black/95 text-cyan-300 font-mono text-[10px] flex items-center gap-2 shadow-2xl shadow-cyan-500/30">
            <Sparkles size={13} className="text-cyan-400 animate-bounce" />
            <span className="font-bold">{triggerNotification}</span>
          </div>
        </div>
      )}

      {/* Target Props Bar */}
      <div className="absolute bottom-10 left-2 right-2 flex items-center justify-between z-20 pointer-events-auto">
        <div className="flex items-center gap-1 bg-black/75 backdrop-blur-md p-1 rounded-lg border border-white/10 text-[8px] font-mono">
          <span className="text-foreground/50 px-1 uppercase font-bold">AUTO DETECTS:</span>
          {(['bottle', 'handbag', 'backpack'] as const).map(prop => (
            <button
              key={prop}
              onClick={() => triggerManualPropDemo(prop)}
              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-cyan-500/30 hover:text-cyan-300 text-white/80 transition-colors"
              title={`Simulate immediate ${prop} detection`}
            >
              +{prop}
            </button>
          ))}
        </div>

        {/* IP Webcam button */}
        <button
          onClick={() => setShowIpInput(!showIpInput)}
          className="p-1 rounded-lg bg-black/75 hover:bg-black text-white/70 hover:text-white border border-white/10 text-[9px] font-mono flex items-center gap-1 transition-colors"
          title="Configure IP Webcam URL"
        >
          <Settings size={11} />
          <span>IP CAM</span>
        </button>
      </div>

      {/* IP Webcam Stream Config Dropdown */}
      {showIpInput && (
        <div className="absolute inset-x-2 bottom-12 z-30 glass-panel p-3 rounded-xl border border-panel-border bg-black/95 flex flex-col gap-2 font-mono text-[10px] shadow-2xl">
          <div className="flex justify-between items-center text-foreground/70 uppercase text-[9px] font-bold">
            <span>IP WEBCAM STREAM URL</span>
            <button onClick={() => setShowIpInput(false)} className="text-foreground/40 hover:text-white text-xs">✕</button>
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="e.g. http://10.35.147.216:8080 or 10.35.147.216:8080"
              value={ipWebcamUrl}
              onChange={e => setIpWebcamUrl(e.target.value)}
              className="flex-1 bg-black/70 border border-white/10 rounded-lg px-2 py-1 text-white text-[9px] focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={() => {
                if (ipWebcamUrl) {
                  let clean = ipWebcamUrl.trim();
                  if (!clean.startsWith('http://') && !clean.startsWith('https://')) clean = 'http://' + clean;
                  clean = clean.replace(/\/+$/, '');
                  if (!clean.includes('/video') && !clean.includes('/shot.jpg')) clean += '/video';
                  setIpWebcamUrl(clean);
                  setFeedSource('ip_webcam');
                  syncCameraSettings('ip_webcam', clean, ipStreamMode);
                  setShowIpInput(false);
                }
              }}
              className="px-2.5 py-1 liquid-btn-primary text-white rounded-lg text-[9px] font-bold"
            >
              CONNECT
            </button>
          </div>
          {/* Quick presets */}
          <div className="flex items-center gap-1.5 text-[8px] flex-wrap">
            <span className="text-foreground/50 font-bold">PRESETS:</span>
            <button
              onClick={() => {
                const url = 'http://10.35.147.216:8080/video';
                setIpWebcamUrl(url);
                setFeedSource('ip_webcam');
                syncCameraSettings('ip_webcam', url, ipStreamMode);
              }}
              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-cyan-500/20 text-white/80"
            >
              10.35.147.216 (HTTP)
            </button>
            <button
              onClick={() => {
                const url = 'https://10.35.147.216:8080/video';
                setIpWebcamUrl(url);
                setFeedSource('ip_webcam');
                syncCameraSettings('ip_webcam', url, ipStreamMode);
                window.open('https://10.35.147.216:8080', '_blank');
              }}
              className="px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 flex items-center gap-0.5"
              title="Open phone HTTPS in tab to trust cert"
            >
              <span>10.35.147.216 (HTTPS ↗)</span>
            </button>
            <button
              onClick={() => {
                const url = 'http://10.35.147.52:8080/video';
                setIpWebcamUrl(url);
                setFeedSource('ip_webcam');
                syncCameraSettings('ip_webcam', url, ipStreamMode);
              }}
              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-cyan-500/20 text-white/60"
            >
              10.35.147.52 (Old)
            </button>
          </div>
          <div className="text-[8px] text-foreground/40">
            Open Android <em>IP Webcam</em> app → Tap Start Server → Enter video feed URL.
          </div>
        </div>
      )}

      {/* Bottom Tactical Controls */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-20">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode(m => (m === 'optical' ? 'thermal' : 'optical'))}
            className={`px-2 py-1 rounded-md text-[10px] font-mono flex items-center gap-1 transition-all border ${
              mode === 'thermal'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-black/60 text-white/80 hover:text-white border-white/10'
            }`}
          >
            {mode === 'thermal' ? <Flame size={12} className="text-amber-400" /> : <Eye size={12} />}
            <span>{mode.toUpperCase()}</span>
          </button>

          <button
            onClick={() => setIsAiActive(a => !a)}
            className={`px-2 py-1 rounded-md text-[10px] font-mono flex items-center gap-1 transition-all border ${
              isAiActive
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                : 'bg-black/60 text-white/50 border-white/10'
            }`}
            title="Toggle AI Scanner"
          >
            <Scan size={11} />
            <span>{isAiActive ? 'SCAN: ON' : 'SCAN: OFF'}</span>
          </button>
        </div>

        {/* Manual Snap & Log Button */}
        <button
          onClick={() => triggerManualPropDemo('bottle')}
          disabled={isCapturing}
          className="px-2.5 py-1 liquid-btn-primary text-white rounded-md text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
          title="Manual snapshot & auto-save to database"
        >
          {isCapturing ? <RefreshCw size={11} className="animate-spin" /> : <Camera size={11} />}
          <span>SNAP & LOG</span>
        </button>
      </div>

      {/* Chrome Mixed-Content Insecure Content Step-by-Step Guide Modal */}
      {showInsecureHelp && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md p-4 flex flex-col justify-between font-mono text-[10px] text-white animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <ShieldAlert size={14} />
              <span>ALLOW LOCAL PHONE CAMERA IN CHROME / EDGE</span>
            </div>
            <button onClick={() => setShowInsecureHelp(false)} className="text-white/60 hover:text-white text-xs">✕</button>
          </div>

          <div className="flex flex-col gap-2 my-auto text-left py-2">
            <div className="flex items-start gap-2 bg-white/5 p-2 rounded-lg border border-white/10">
              <span className="font-bold text-cyan-400 text-xs shrink-0">1.</span>
              <span>Look at your browser address bar at the top, and click the <strong>tune / site settings icon (⚙️ or 🔒)</strong> directly to the left of the URL.</span>
            </div>
            <div className="flex items-start gap-2 bg-white/5 p-2 rounded-lg border border-white/10">
              <span className="font-bold text-cyan-400 text-xs shrink-0">2.</span>
              <span>Click <strong>Site settings</strong>.</span>
            </div>
            <div className="flex items-start gap-2 bg-white/5 p-2 rounded-lg border border-white/10">
              <span className="font-bold text-cyan-400 text-xs shrink-0">3.</span>
              <span>Scroll down to <strong>Insecure content</strong> and change from <em>Block (default)</em> to <strong className="text-emerald-400">Allow</strong>.</span>
            </div>
            <div className="flex items-start gap-2 bg-white/5 p-2 rounded-lg border border-white/10">
              <span className="font-bold text-cyan-400 text-xs shrink-0">4.</span>
              <span>Switch back here and <strong>Reload the tab (F5)</strong>. Your phone camera feed will stream immediately!</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <span className="text-[9px] text-foreground/40">Takes only 5 seconds</span>
            <button
              onClick={() => {
                setShowInsecureHelp(false);
                setCameraError(null);
              }}
              className="px-3 py-1 liquid-btn-primary text-white rounded text-[9px] font-bold"
            >
              GOT IT / RETRY
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
