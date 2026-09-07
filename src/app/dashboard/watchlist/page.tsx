'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ScanFace,
  Camera,
  ShieldAlert,
  AlertTriangle,
  UserPlus,
  Trash2,
  Check,
  X,
  Sparkles,
  ExternalLink,
  MapPin,
  Clock,
  Radio,
  Eye,
  Sliders,
  Upload,
  CheckCircle2,
  FolderOpen,
  Volume2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { findNearestRailwayStation } from '@/lib/railwayStations';
import {
  getWatchlist,
  enrollSuspect,
  removeSuspect,
  findBestSuspectMatch,
  SuspectProfile,
} from '@/lib/watchlistService';
import { extractFaceDescriptor, scanFrameForSuspects, computeFaceSimilarity } from '@/lib/faceRecognitionEngine';
import { clearDetectionEvents, clearFacialMatchEvents } from '@/lib/logService';

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

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<SuspectProfile[]>([]);
  const [matchThreshold, setMatchThreshold] = useState<number>(0.48);
  const [enrollToast, setEnrollToast] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [aiModel, setAiModel] = useState<any>(null);
  const [blazeModel, setBlazeModel] = useState<any>(null);

  // Concurrency & Inference Acceleration Refs
  const inferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isScanningBusyRef = useRef<boolean>(false);
  const consecutiveMatchesRef = useRef<{ suspectId: string; count: number }>({ suspectId: '', count: 0 });
  const lastCocoScanRef = useRef<number>(0);

  // Camera & Detection States
  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [feedSource, setFeedSource] = useState<'device' | 'ip_webcam'>('ip_webcam');
  const [ipWebcamUrl, setIpWebcamUrl] = useState<string>('http://10.35.147.216:8080/video');
  const [ipStreamMode, setIpStreamMode] = useState<'direct' | 'proxy'>('direct');
  const [ipCamConnected, setIpCamConnected] = useState<boolean>(false);
  const [ipCamError, setIpCamError] = useState<string | null>(null);
  const [autoFallbackNotice, setAutoFallbackNotice] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [lastScanScore, setLastScanScore] = useState<number>(0);
  const [showIpModal, setShowIpModal] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [activeMatchTarget, setActiveMatchTarget] = useState<any | null>(null);
  const [alarmActive, setAlarmActive] = useState<boolean>(false);
  const [screenFlash, setScreenFlash] = useState<boolean>(false);

  // Interception Events Log
  const [interceptionLogs, setInterceptionLogs] = useState<any[]>([]);
  const [inspectMatch, setInspectMatch] = useState<any | null>(null);
  const [isClearingLogs, setIsClearingLogs] = useState<boolean>(false);

  // Modal State
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false);
  const [newSuspectName, setNewSuspectName] = useState<string>('');
  const [newSuspectWarrant, setNewSuspectWarrant] = useState<string>('');
  const [newSuspectOffense, setNewSuspectOffense] = useState<string>('');
  const [newSuspectHazard, setNewSuspectHazard] = useState<'CRITICAL' | 'HIGH' | 'MODERATE'>('HIGH');
  const [newSuspectPhotoUrl, setNewSuspectPhotoUrl] = useState<string>('');

  // Location Telemetry
  const [currentCoords, setCurrentCoords] = useState<[number, number]>([22.59548, 88.45420]);
  const [stationName, setStationName] = useState<string>('Bidhan Nagar Road (BNR) • Eastern Railway');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ipImageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Initial Load & Geolocation & Saved Settings
  useEffect(() => {
    setIsMounted(true);
    getWatchlist().then(setWatchlist);

    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        if (e.detail.source) setFeedSource(e.detail.source);
        if (e.detail.url) setIpWebcamUrl(e.detail.url);
        if (e.detail.mode) setIpStreamMode(e.detail.mode);
      }
    };

    if (typeof window !== 'undefined') {
      const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const savedSrc = localStorage.getItem('vikrant_camera_source') as 'device' | 'ip_webcam' | null;
      if (savedSrc) setFeedSource(savedSrc);
      
      let savedIp = localStorage.getItem('vikrant_ip_webcam_url');
      if (savedIp) {
        if (savedIp.includes('10.35.147.')) {
          savedIp = savedIp.replace(/10\.35\.147\.\d+/, '10.35.147.216');
          localStorage.setItem('vikrant_ip_webcam_url', savedIp);
        }
        setIpWebcamUrl(savedIp);
      }

      let savedMode = localStorage.getItem('vikrant_ip_stream_mode') as 'direct' | 'proxy' | null;
      if (isCloud && savedMode === 'proxy') {
        savedMode = 'direct';
        localStorage.setItem('vikrant_ip_stream_mode', 'direct');
      }
      if (savedMode) setIpStreamMode(savedMode);

      const savedThresh = localStorage.getItem('vikrant_face_match_threshold');
      if (savedThresh) setMatchThreshold(Number(savedThresh));

      window.addEventListener('vikrant:camera_settings_changed', handleSettingsChange);
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
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

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('vikrant:camera_settings_changed', handleSettingsChange);
      }
    };
  }, []);

  // Load BlazeFace for sub-10ms precision facial landmark localization
  useEffect(() => {
    let isCancelled = false;
    const loadBlaze = async () => {
      try {
        await import('@tensorflow/tfjs');
        const blazeface = await import('@tensorflow-models/blazeface');
        const model = await blazeface.load();
        if (!isCancelled) {
          setBlazeModel(model);
          console.log('[Watchlist AI] BlazeFace face locator armed');
        }
      } catch (e) {
        console.warn('[Watchlist AI] BlazeFace load error:', e);
      }
    };
    loadBlaze();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Load COCO-SSD for intelligent person & phone bounding
  useEffect(() => {
    let isCancelled = false;
    const loadAi = async () => {
      try {
        await import('@tensorflow/tfjs');
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        const model = await cocoSsd.load({ base: 'mobilenet_v2' });
        if (!isCancelled) {
          setAiModel(model);
          console.log('[Watchlist AI] COCO-SSD model armed');
        }
      } catch (e) {
        console.warn('[Watchlist AI] COCO-SSD fallback to multi-scale scanner:', e);
      }
    };
    loadAi();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Enumerate camera devices (detects Phone/Iriun/DroidCam virtual webcams)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const inputs = devices.filter(d => d.kind === 'videoinput');
        setVideoDevices(inputs);
        if (inputs.length > 0 && !selectedDeviceId) {
          const phoneCam = inputs.find(d => /iriun|droidcam|phone|wireless|camo/i.test(d.label));
          setSelectedDeviceId(phoneCam ? phoneCam.deviceId : inputs[0].deviceId);
        }
      });
    }
  }, [selectedDeviceId]);

  // 2. Fetch past facial match events from Supabase
  useEffect(() => {
    const fetchMatches = async () => {
      const { data } = await supabase
        .from('detection_events')
        .select('*')
        .or('substance_category.ilike.%facial%,substance_name.ilike.%suspect%,substance_name.ilike.%culprit%')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (data) setInterceptionLogs(data);
    };

    fetchMatches();

    const handleLocalMatch = (e: any) => {
      const item = e.detail;
      setInterceptionLogs(prev => [item, ...prev]);
    };

    window.addEventListener('vikrant:facial_match', handleLocalMatch);
    return () => window.removeEventListener('vikrant:facial_match', handleLocalMatch);
  }, []);

  // Clear Facial Match Interception Logs from Supabase and local state
  const handleClearLogs = async () => {
    if (!confirm('Clear all facial interception records from the database? This frees database storage and cannot be undone.')) return;
    setIsClearingLogs(true);
    await clearDetectionEvents({ category: 'facial' });
    await clearFacialMatchEvents();
    setInterceptionLogs([]);
    setIsClearingLogs(false);
  };

  // Listen to cross-page log clearing events
  useEffect(() => {
    const handleLogsCleared = (e: any) => {
      const cat = e.detail?.category;
      if (cat === 'facial' || cat === 'all') {
        setInterceptionLogs([]);
      }
    };
    window.addEventListener('vikrant:logs_cleared', handleLogsCleared);
    return () => window.removeEventListener('vikrant:logs_cleared', handleLogsCleared);
  }, []);

  // 3. Start Camera Video Feed
  useEffect(() => {
    if (feedSource !== 'device' || !navigator?.mediaDevices?.getUserMedia) return;

    let activeStream: MediaStream | null = null;
    const constraints: MediaStreamConstraints = {
      video: selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(stream => {
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          setHasCamera(true);
        }
      })
      .catch(err => {
        console.warn('[Watchlist Camera] Error:', err.message);
        setHasCamera(false);
      });

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [feedSource, selectedDeviceId]);

  // Auto-Fallback from unreachable phone IP camera to laptop/device camera
  const triggerAutoFallbackToDeviceCamera = useCallback((reason: string) => {
    console.warn('[Watchlist] Auto-falling back to laptop camera:', reason);
    setFeedSource('device');
    setHasCamera(true);
    setAutoFallbackNotice(reason);
    setIpCamConnected(false);
  }, []);

  // Watchdog: If phone stream does not connect within 3.5s, automatically fall back to laptop camera
  useEffect(() => {
    if (feedSource !== 'ip_webcam') return;
    const timer = setTimeout(() => {
      if (!ipCamConnected) {
        triggerAutoFallbackToDeviceCamera(
          `Phone stream unreachable (${ipWebcamUrl.replace(/https?:\/\//, '').split('/')[0]}). Auto-switched to laptop camera.`
        );
      }
    }, 3500);
    return () => clearTimeout(timer);
  }, [feedSource, ipCamConnected, ipWebcamUrl, triggerAutoFallbackToDeviceCamera]);

  // 4. Auto-Capture & Alert Generation when Suspect is Spotted
  const triggerSuspectInterception = useCallback(
    async (
      suspect: SuspectProfile,
      confidence: number,
      targetBbox?: { x: number; y: number; width: number; height: number }
    ) => {
      const now = Date.now();
      // 5s cooldown per interception event to avoid flooding
      if (now - lastCaptureTimeRef.current < 5000) return;
      lastCaptureTimeRef.current = now;

      // Audio alarm siren & Visual red strobe flash
      playInterceptionAlertSound();
      setScreenFlash(true);
      setAlarmActive(true);
      setTimeout(() => setScreenFlash(false), 400);
      setTimeout(() => setAlarmActive(false), 8000);      // Grab camera snapshot
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      const ipImg = ipImageRef.current;
      const snapSource = feedSource === 'ip_webcam' ? ipImageRef.current : video;

      canvas.width = feedSource === 'ip_webcam' && snapSource ? (snapSource as any).naturalWidth || 640 : video?.videoWidth || 640;
      canvas.height = feedSource === 'ip_webcam' && snapSource ? (snapSource as any).naturalHeight || 480 : video?.videoHeight || 420;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        if (feedSource === 'ip_webcam' && snapSource && (snapSource as any).naturalWidth > 0) {
          try {
            ctx.drawImage(snapSource, 0, 0, canvas.width, canvas.height);
          } catch (e) {
            console.warn('[Interception Canvas] IP image draw failed:', e);
          }
        } else if (video && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } else {
          // Synthetic tactical recon background
          ctx.fillStyle = '#090d16';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#334155';
          for (let x = 0; x < canvas.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
        }

        // Draw Optical Red Reticle around culprit face
        const vW = feedSource === 'ip_webcam' && snapSource ? (snapSource as any).naturalWidth || canvas.width : video?.videoWidth || canvas.width;
        const vH = feedSource === 'ip_webcam' && snapSource ? (snapSource as any).naturalHeight || canvas.height : video?.videoHeight || canvas.height;
        const scaleX = canvas.width / vW;
        const scaleY = canvas.height / vH;

        let bx = targetBbox ? targetBbox.x * scaleX : canvas.width / 2 - 80;
        let by = targetBbox ? targetBbox.y * scaleY : canvas.height / 2 - 100;
        let bw = targetBbox ? targetBbox.width * scaleX : 160;
        let bh = targetBbox ? targetBbox.height * scaleY : 180;

        // Keep inside bounds
        bx = Math.max(10, Math.min(canvas.width - bw - 10, bx));
        by = Math.max(50, Math.min(canvas.height - bh - 60, by));

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.strokeRect(bx, by, bw, bh);

        // Corner brackets
        const bLen = Math.min(24, bw * 0.22);
        ctx.lineWidth = 6;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(bx - 4, by + bLen);
        ctx.lineTo(bx - 4, by - 4);
        ctx.lineTo(bx + bLen, by - 4);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(bx + bw + 4, by + bLen);
        ctx.lineTo(bx + bw + 4, by - 4);
        ctx.lineTo(bx + bw - bLen, by - 4);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(bx - 4, by + bh - bLen);
        ctx.lineTo(bx - 4, by + bh - 4);
        ctx.lineTo(bx + bLen, by + bh - 4);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(bx + bw + 4, by + bh - bLen);
        ctx.lineTo(bx + bw + 4, by + bh - 4);
        ctx.lineTo(bx + bw - bLen, by + bh - 4);
        ctx.stroke();

        // Stamped Red Threat Banner at Top
        ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
        ctx.fillRect(16, 16, canvas.width - 32, 42);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(
          `🚨 CULPRIT INTERCEPT: ${suspect.name.toUpperCase()} • ${Math.round(confidence * 100)}% MATCH`,
          26,
          42
        );

        // Bottom Telemetry
        ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
        ctx.fillRect(16, canvas.height - 56, canvas.width - 32, 44);

        ctx.fillStyle = '#fca5a5';
        ctx.font = '11px monospace';
        ctx.fillText(
          `WARRANT: ${suspect.warrantId} • HAZARD: ${suspect.hazardLevel} • OFFENSE: ${suspect.offense}`,
          24,
          canvas.height - 36
        );
        ctx.fillText(
          `LOC: ${currentCoords[0].toFixed(5)}° N, ${currentCoords[1].toFixed(5)}° E • ${stationName.split('•')[0].trim()} • ${new Date().toLocaleTimeString()}`,
          24,
          canvas.height - 18
        );
      }

      const livePhotoUrl = canvas.toDataURL('image/jpeg', 0.85);
      const timestamp = new Date().toISOString();

      const newEvent = {
        unit_id: 'c7569eb7-87ab-43db-905b-54baf7b106fc',
        substance_category: 'Facial Watchlist Intercept',
        substance_name: `WANTED CULPRIT: ${suspect.name} (${suspect.warrantId})`,
        confidence_tier: 'confirmed',
        confidence_score: Number(confidence.toFixed(2)),
        latitude: currentCoords[0],
        longitude: currentCoords[1],
        station: stationName,
        status: 'new',
        timestamp,
        photo_url: livePhotoUrl,
      };

      // Save to Supabase detection_events and facial_match_events
      const { data: inserted } = await supabase.from('detection_events').insert(newEvent).select().single();
      await supabase.from('facial_match_events').insert({
        unit_id: 'c7569eb7-87ab-43db-905b-54baf7b106fc',
        confidence: Number(confidence.toFixed(2)),
        station: stationName,
        status: 'new',
        timestamp,
      });

      const finalRecord = {
        ...(inserted || newEvent),
        suspectReferencePhoto: suspect.photoUrl,
        suspectName: suspect.name,
        warrantId: suspect.warrantId,
      };

      setInterceptionLogs(prev => [finalRecord, ...prev]);
      setActiveMatchTarget({ suspect, confidence });

      window.dispatchEvent(new CustomEvent('vikrant:facial_match', { detail: finalRecord }));
      window.dispatchEvent(new CustomEvent('vikrant:new_capture', { detail: finalRecord }));
    },
    [currentCoords, stationName, feedSource]
  );

  // 5. Continuous Real-Time Autonomous Facial Scanning Loop
  useEffect(() => {
    if (!isScanning || watchlist.length === 0) return;

    let isMounted = true;

    const interval = setInterval(async () => {
      if (!isMounted) return;

      let scanTarget: HTMLVideoElement | HTMLImageElement | null = null;
      if (feedSource === 'device' && videoRef.current && videoRef.current.readyState >= 2) {
        scanTarget = videoRef.current;
      } else if (feedSource === 'ip_webcam') {
        if (ipImageRef.current && ipImageRef.current.naturalWidth > 0) {
          scanTarget = ipImageRef.current;
        }
      }

      if (!scanTarget) return;
      if (isScanningBusyRef.current) return;
      isScanningBusyRef.current = true;

      try {
        const fullW = (scanTarget as any).naturalWidth || (scanTarget as any).videoWidth || 640;
        const fullH = (scanTarget as any).naturalHeight || (scanTarget as any).videoHeight || 480;

        let inferCanvas = inferCanvasRef.current;
        if (!inferCanvas) {
          inferCanvas = document.createElement('canvas');
          inferCanvasRef.current = inferCanvas;
        }
        inferCanvas.width = 320;
        inferCanvas.height = 240;
        const inferCtx = inferCanvas.getContext('2d', { willReadFrequently: true });
        if (!inferCtx) return;
        inferCtx.drawImage(scanTarget, 0, 0, 320, 240);

        let detectedFaces: Array<{ x: number; y: number; width: number; height: number; type: 'face' | 'full_photo' }> = [];

        // 1. BlazeFace Landmark Face Detection (sub-10ms precision)
        if (blazeModel) {
          try {
            const blazePreds = await blazeModel.estimateFaces(inferCanvas, false);
            for (const p of blazePreds) {
              const x1 = Array.isArray(p.topLeft) ? p.topLeft[0] : (p.topLeft as any)[0];
              const y1 = Array.isArray(p.topLeft) ? p.topLeft[1] : (p.topLeft as any)[1];
              const x2 = Array.isArray(p.bottomRight) ? p.bottomRight[0] : (p.bottomRight as any)[0];
              const y2 = Array.isArray(p.bottomRight) ? p.bottomRight[1] : (p.bottomRight as any)[1];
              const fw = x2 - x1;
              const fh = y2 - y1;
              detectedFaces.push({
                x: Math.max(0, x1 - fw * 0.05),
                y: Math.max(0, y1 - fh * 0.05),
                width: Math.min(320 - x1, fw * 1.10),
                height: Math.min(240 - y1, fh * 1.10),
                type: 'face',
              });
            }
          } catch {}
        }

        // 2. COCO-SSD ONLY if no face was detected by BlazeFace (throttled to 700ms)
        if (detectedFaces.length === 0 && aiModel && (Date.now() - lastCocoScanRef.current > 700)) {
          lastCocoScanRef.current = Date.now();
          try {
            const rawPreds = await aiModel.detect(inferCanvas);
            for (const obj of rawPreds) {
              if (obj.class === 'cell phone' && obj.score >= 0.28) {
                const [px, py, pw, ph] = obj.bbox;
                detectedFaces.push({ x: px, y: py, width: pw, height: ph, type: 'full_photo' });
              } else if (detectedFaces.length === 0 && obj.class === 'person' && obj.score >= 0.35) {
                const [px, py, pw, ph] = obj.bbox;
                detectedFaces.push({
                  x: Math.max(0, px + pw * 0.15),
                  y: Math.max(0, py),
                  width: Math.min(320 - px, pw * 0.70),
                  height: Math.min(240 - py, Math.max(25, ph * 0.30)),
                  type: 'face',
                });
              }
            }
          } catch {}
        }

        // STRICT HUMAN GATE: If no face or phone is detected, immediately return
        if (detectedFaces.length === 0) {
          setLastScanScore(0);
          setActiveMatchTarget(null);
          consecutiveMatchesRef.current = { suspectId: '', count: 0 };
          return;
        }

        // Scan candidate regions against watchlist directly from inferCanvas!
        let bestSim = 0;
        let bestSuspect: SuspectProfile | null = null;
        let bestBbox = detectedFaces[0];
        let bestTargetType: 'face' | 'full_photo' = 'face';

        for (const region of detectedFaces) {
          if (region.width < 15 || region.height < 15) continue;
          const liveDescriptor = await extractFaceDescriptor(inferCanvas, region);
          for (const suspect of watchlist) {
            let sim = 0;
            let matchedType: 'face' | 'full_photo' = 'face';

            if (suspect.descriptor && suspect.descriptor.length === 128) {
              const faceSim = computeFaceSimilarity(liveDescriptor, suspect.descriptor);
              if (faceSim > sim) {
                sim = faceSim;
                matchedType = 'face';
              }
            }

            if (suspect.fullDescriptor && suspect.fullDescriptor.length === 128) {
              const fullSim = computeFaceSimilarity(liveDescriptor, suspect.fullDescriptor);
              if (fullSim > sim) {
                sim = fullSim;
                matchedType = 'full_photo';
              }
            }

            if (sim > bestSim) {
              bestSim = sim;
              bestSuspect = suspect;
              bestBbox = region;
              bestTargetType = matchedType;
            }
          }
        }

        setLastScanScore(Number(bestSim.toFixed(3)));

        // Scale bounding box back up to full video dimensions for visual reticle
        const scaleX = fullW / 320;
        const scaleY = fullH / 240;
        const scaledBbox = {
          x: bestBbox.x * scaleX,
          y: bestBbox.y * scaleY,
          width: bestBbox.width * scaleX,
          height: bestBbox.height * scaleY,
        };

        if (bestSim >= matchThreshold && bestSuspect) {
          const sId = bestSuspect.id;
          if (consecutiveMatchesRef.current.suspectId === sId) {
            consecutiveMatchesRef.current.count += 1;
          } else {
            consecutiveMatchesRef.current = { suspectId: sId, count: 1 };
          }

          setActiveMatchTarget({
            suspect: bestSuspect,
            confidence: bestSim,
            bbox: scaledBbox,
            targetType: bestTargetType,
          });

          // INSTANT INTERCEPTION: Fire alert immediately upon verified biometric match!
          triggerSuspectInterception(bestSuspect, bestSim, scaledBbox);
        } else {
          consecutiveMatchesRef.current = { suspectId: '', count: 0 };
          setActiveMatchTarget(null);
        }
      } catch (err) {
        console.warn('[Face Engine] Frame scan error:', err);
      } finally {
        isScanningBusyRef.current = false;
      }
    }, 90); // Real-time 90ms (~11 FPS) instantaneous face scan loop

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isScanning, watchlist, matchThreshold, triggerSuspectInterception, feedSource, aiModel, blazeModel]);

  // Quick Snap Current Face and Enroll into Watchlist
  const handleQuickEnrollCurrentFace = async () => {
    let scanTarget: HTMLVideoElement | HTMLImageElement | null = null;
    if (feedSource === 'device' && videoRef.current && videoRef.current.readyState >= 2) {
      scanTarget = videoRef.current;
    } else if (feedSource === 'ip_webcam' && ipImageRef.current && ipImageRef.current.naturalWidth > 0) {
      scanTarget = ipImageRef.current;
    }

    if (!scanTarget) {
      alert('Camera feed not ready. Please make sure camera is connected.');
      return;
    }

    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = 320;
      snapCanvas.height = 240;
      const snapCtx = snapCanvas.getContext('2d', { willReadFrequently: true });
      if (!snapCtx) return;
      snapCtx.drawImage(scanTarget, 0, 0, 320, 240);

      let cropArea = { x: 70, y: 30, width: 180, height: 180 };
      if (blazeModel) {
        try {
          const preds = await blazeModel.estimateFaces(snapCanvas, false);
          if (preds.length > 0) {
            const x1 = Array.isArray(preds[0].topLeft) ? preds[0].topLeft[0] : (preds[0].topLeft as any)[0];
            const y1 = Array.isArray(preds[0].topLeft) ? preds[0].topLeft[1] : (preds[0].topLeft as any)[1];
            const x2 = Array.isArray(preds[0].bottomRight) ? preds[0].bottomRight[0] : (preds[0].bottomRight as any)[0];
            const y2 = Array.isArray(preds[0].bottomRight) ? preds[0].bottomRight[1] : (preds[0].bottomRight as any)[1];
            const fw = Math.max(30, x2 - x1);
            const fh = Math.max(30, y2 - y1);
            const cx = Math.max(0, x1 - fw * 0.05);
            const cy = Math.max(0, y1 - fh * 0.05);
            cropArea = {
              x: cx,
              y: cy,
              width: Math.max(20, Math.min(320 - cx, fw * 1.10)),
              height: Math.max(20, Math.min(240 - cy, fh * 1.10)),
            };
          }
        } catch {}
      }

      // Crop face for the mugshot card preview
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = 200;
      faceCanvas.height = 200;
      const faceCtx = faceCanvas.getContext('2d');
      if (faceCtx) {
        faceCtx.drawImage(
          snapCanvas,
          cropArea.x,
          cropArea.y,
          cropArea.width,
          cropArea.height,
          0,
          0,
          200,
          200
        );
      }

      const facePhotoUrl = faceCanvas.toDataURL('image/jpeg', 0.90);
      const faceDescriptor = await extractFaceDescriptor(snapCanvas, cropArea);
      const fullDescriptor = await extractFaceDescriptor(snapCanvas);

      const targetNum = watchlist.length + 1;
      const enrolled = await enrollSuspect({
        name: `Target Suspect #${targetNum} (Live Enrolled Face)`,
        warrantId: `RPF-LIVE-${Math.floor(1000 + Math.random() * 9000)}`,
        offense: 'Active Surveillance Subject (Live Face Profile)',
        hazardLevel: 'CRITICAL',
        photoUrl: facePhotoUrl,
        descriptor: faceDescriptor,
        fullDescriptor: fullDescriptor,
      });

      setWatchlist(prev => [enrolled, ...prev]);
      setMatchThreshold(prev => Math.min(prev, 0.48));
      setEnrollToast(`✅ FACE ENROLLED: "${enrolled.name}" added to Watchlist! Monitoring camera for instant match...`);
      setTimeout(() => setEnrollToast(null), 5000);
    } catch (e: any) {
      alert(`Enrollment failed: ${e.message}`);
    }
  };

  // Handle Manual Enrollment of New Suspect
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSuspectName || !newSuspectPhotoUrl) {
      alert('Please provide suspect name and photo.');
      return;
    }

    // Try detecting face in the uploaded image using blazeModel for optimal cropping
    let customFaceCrop: { x: number; y: number; width: number; height: number } | undefined = undefined;
    try {
      const tempImg = new Image();
      tempImg.src = newSuspectPhotoUrl;
      await new Promise(r => {
        if (tempImg.complete && tempImg.naturalWidth > 0) return r(null);
        tempImg.onload = () => r(null);
        setTimeout(r, 600);
      });
      if (tempImg.naturalWidth > 0 && blazeModel) {
        const preds = await blazeModel.estimateFaces(tempImg, false);
        if (preds.length > 0) {
          const x1 = Array.isArray(preds[0].topLeft) ? preds[0].topLeft[0] : (preds[0].topLeft as any)[0];
          const y1 = Array.isArray(preds[0].topLeft) ? preds[0].topLeft[1] : (preds[0].topLeft as any)[1];
          const x2 = Array.isArray(preds[0].bottomRight) ? preds[0].bottomRight[0] : (preds[0].bottomRight as any)[0];
          const y2 = Array.isArray(preds[0].bottomRight) ? preds[0].bottomRight[1] : (preds[0].bottomRight as any)[1];
          const fw = Math.max(30, x2 - x1);
          const fh = Math.max(30, y2 - y1);
          const cx = Math.max(0, x1 - fw * 0.05);
          const cy = Math.max(0, y1 - fh * 0.05);
          customFaceCrop = {
            x: cx,
            y: cy,
            width: Math.max(20, Math.min(tempImg.naturalWidth - cx, fw * 1.10)),
            height: Math.max(20, Math.min(tempImg.naturalHeight - cy, fh * 1.10)),
          };
        }
      }
    } catch {}

    const enrolled = await enrollSuspect(
      {
        name: newSuspectName,
        warrantId: newSuspectWarrant || `RPF-${Math.floor(1000 + Math.random() * 9000)}`,
        offense: newSuspectOffense || 'Unspecified Railway Offense',
        hazardLevel: newSuspectHazard,
        photoUrl: newSuspectPhotoUrl,
      },
      customFaceCrop
    );

    setWatchlist(prev => [enrolled, ...prev]);
    setShowEnrollModal(false);
    setNewSuspectName('');
    setNewSuspectWarrant('');
    setNewSuspectOffense('');
    setNewSuspectPhotoUrl('');
    setEnrollToast(`✅ CULPRIT ENROLLED: "${enrolled.name}" added to Watchlist! Monitoring camera...`);
    setTimeout(() => setEnrollToast(null), 5000);
  };

  // Image Upload File Handler with Automatic Fast Downscaling
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const img = new Image();
        img.onload = () => {
          const maxDim = 480;
          let w = img.naturalWidth || 480;
          let h = img.naturalHeight || 480;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            setNewSuspectPhotoUrl(c.toDataURL('image/jpeg', 0.88));
          } else {
            setNewSuspectPhotoUrl(reader.result as string);
          }
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  // Force Simulate Match for testing
  const handleSimulateMatch = (suspect?: SuspectProfile) => {
    const target = suspect || watchlist[0];
    if (target) {
      const simulatedConfidence = Number((0.88 + Math.random() * 0.08).toFixed(2));
      triggerSuspectInterception(target, simulatedConfidence);
    }
  };

  // Remove suspect
  const handleRemoveSuspect = async (id: string) => {
    const updated = await removeSuspect(id);
    setWatchlist(updated);
  };

  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 overflow-y-auto bg-transparent">
      {/* Screen Red Flash on Culprit Alert */}
      {screenFlash && (
        <div className="fixed inset-0 z-50 bg-red-600/35 pointer-events-none transition-opacity duration-200" />
      )}

      {/* Urgent Floating Interception Alert Bar */}
      {alarmActive && activeMatchTarget && (
        <div className="fixed top-4 right-4 z-50 bg-red-950/95 border-2 border-red-500 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300 max-w-lg">
          <div className="p-2 rounded-xl bg-red-500/20 text-red-400 animate-pulse shrink-0">
            <ShieldAlert size={26} />
          </div>
          <div className="flex flex-col flex-1">
            <span className="text-[10px] font-mono tracking-widest text-red-400 font-bold uppercase">
              🚨 WANTED CULPRIT INTERCEPT CONFIRMED
            </span>
            <span className="font-mono text-sm font-bold text-white">
              {activeMatchTarget.suspect.name} (Warrant #{activeMatchTarget.suspect.warrantId})
            </span>
            <span className="text-xs font-mono text-red-200/80">
              Confidence: {Math.round(activeMatchTarget.confidence * 100)}% • Station: {stationName.split('•')[0].trim()}
            </span>
          </div>
          <button
            onClick={() => setAlarmActive(false)}
            className="text-foreground/50 hover:text-white px-2 py-1 text-sm font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {/* High-Resolution Capture Inspector Modal */}
      {inspectMatch && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-panel p-5 rounded-2xl border border-red-500 max-w-2xl w-full flex flex-col gap-4 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2">
                <ScanFace size={18} className="text-red-400" />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  CULPRIT INTERCEPTION DOSSIER
                </h3>
              </div>
              <button
                onClick={() => setInspectMatch(null)}
                className="text-foreground/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-sm font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="w-full aspect-video rounded-xl bg-black overflow-hidden relative border border-panel-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inspectMatch.photo_url} alt="Culprit snapshot" className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 px-2 py-1 rounded bg-red-950/90 font-mono text-xs text-red-300 border border-red-500/50">
                {inspectMatch.substance_name}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-2.5 rounded-xl bg-black/50 border border-panel-border flex flex-col">
                <span className="text-[10px] text-foreground/40 uppercase">GPS STAMP</span>
                <span className="text-foreground/90 font-bold">
                  {(inspectMatch.latitude || currentCoords[0]).toFixed(6)}° N, {(inspectMatch.longitude || currentCoords[1]).toFixed(6)}° E
                </span>
                <span className="text-[10px] text-foreground/60">{inspectMatch.station || stationName}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-black/50 border border-panel-border flex flex-col">
                <span className="text-[10px] text-foreground/40 uppercase">INTERCEPTION TIME</span>
                <span className="text-foreground/90 font-bold">
                  {isMounted ? new Date(inspectMatch.timestamp).toLocaleString() : ''}
                </span>
                <span className="text-[10px] text-red-400 font-bold">
                  MATCH SCORE: {Math.round((inspectMatch.confidence_score || 0.92) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-panel-border">
              <Link
                href="/dashboard/captures"
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
              >
                <span>Open in All Captures Log</span>
                <ExternalLink size={12} />
              </Link>

              <button
                onClick={() => setInspectMatch(null)}
                className="px-4 py-2 rounded-xl liquid-btn-primary text-xs font-mono font-bold"
              >
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Suspect Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-panel p-6 rounded-2xl border border-cyan-400 max-w-lg w-full flex flex-col gap-4 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2 text-cyan-400">
                <UserPlus size={18} />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  ENROLL SUSPECT TO WATCHLIST
                </h3>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-foreground/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="flex flex-col gap-3 font-mono text-xs">
              <div>
                <label className="text-[10px] text-foreground/60 block mb-1">SUSPECT FULL NAME *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newSuspectName}
                  onChange={e => setNewSuspectName(e.target.value)}
                  className="w-full bg-black/50 border border-panel-border rounded-xl p-2.5 text-white focus:border-cyan-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-foreground/60 block mb-1">WARRANT / CASE ID</label>
                  <input
                    type="text"
                    placeholder="RPF-W-2026-99"
                    value={newSuspectWarrant}
                    onChange={e => setNewSuspectWarrant(e.target.value)}
                    className="w-full bg-black/50 border border-panel-border rounded-xl p-2.5 text-white focus:border-cyan-400 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-foreground/60 block mb-1">HAZARD LEVEL</label>
                  <select
                    value={newSuspectHazard}
                    onChange={e => setNewSuspectHazard(e.target.value as any)}
                    className="w-full bg-black/50 border border-panel-border rounded-xl p-2.5 text-white focus:border-cyan-400 outline-none"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MODERATE">MODERATE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-foreground/60 block mb-1">CHARGE / OFFENSE</label>
                <input
                  type="text"
                  placeholder="Contraband smuggling / station theft"
                  value={newSuspectOffense}
                  onChange={e => setNewSuspectOffense(e.target.value)}
                  className="w-full bg-black/50 border border-panel-border rounded-xl p-2.5 text-white focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-foreground/60 block mb-1">REFERENCE PHOTO (UPLOAD OR URL) *</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2 rounded-xl border border-dashed border-cyan-400/60 hover:bg-cyan-500/10 text-cyan-300 flex items-center justify-center gap-1.5"
                  >
                    <Upload size={14} />
                    <span>Upload from Device</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Or paste image URL (e.g. /watchlist/suspect_1.svg)"
                  value={newSuspectPhotoUrl}
                  onChange={e => setNewSuspectPhotoUrl(e.target.value)}
                  className="w-full bg-black/50 border border-panel-border rounded-xl p-2 text-foreground/80 focus:border-cyan-400 outline-none text-[11px]"
                />
              </div>

              {newSuspectPhotoUrl && (
                <div className="flex items-center gap-3 p-2 bg-black/40 rounded-xl border border-panel-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={newSuspectPhotoUrl} alt="Preview" className="w-12 h-12 rounded object-cover border" />
                  <span className="text-[10px] text-emerald-400">Photo Loaded • Ready to Enroll</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-panel-border mt-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 rounded-xl glass-panel text-foreground/60 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl liquid-btn-primary font-bold text-black"
                >
                  ENROLL SUSPECT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Header Rail */}
      <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shrink-0 border border-red-500/20">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
            <ScanFace size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-mono text-base font-bold text-white tracking-wider uppercase">
                CULPRIT & WANTED SUSPECT FACIAL INTERCEPTION
              </h1>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-mono font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ACTIVE ON-DEVICE AI MATCHER
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-mono text-foreground/60 mt-0.5">
              <MapPin size={12} className="text-red-400" />
              <span>{stationName}</span>
              <span className="text-foreground/30">•</span>
              <span>128-D Spatial HOG & Euclidean Biometric Embedding Cross-Reference</span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Enroll Current Face from Live Camera */}
          <button
            onClick={handleQuickEnrollCurrentFace}
            className="px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all shadow-md active:scale-95"
            title="Instantly snap the face in front of the camera and enroll into watchlist"
          >
            <Camera size={14} />
            <span>📸 ENROLL CURRENT FACE</span>
          </button>

          {/* Enroll Suspect Button */}
          <button
            onClick={() => setShowEnrollModal(true)}
            className="px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all"
          >
            <UserPlus size={14} />
            <span>+ ENROLL SUSPECT</span>
          </button>

          {/* Simulate Interception Button */}
          <button
            onClick={() => handleSimulateMatch()}
            className="px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-all"
          >
            <Sparkles size={14} />
            <span>TEST CULPRIT MATCH</span>
          </button>

          {/* Sensitivity Slider */}
          <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-xl border border-panel-border text-xs font-mono">
            <span className="text-[10px] text-foreground/50">THRESHOLD:</span>
            <input
              type="range"
              min="0.30"
              max="0.80"
              step="0.02"
              value={matchThreshold}
              onChange={e => {
                const val = Number(e.target.value);
                setMatchThreshold(val);
                if (typeof window !== 'undefined') localStorage.setItem('vikrant_face_match_threshold', String(val));
              }}
              className="w-20 accent-red-500 cursor-pointer"
            />
            <span className="text-xs font-bold text-red-400">{Math.round(matchThreshold * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Floating Non-Blocking Enrollment Toast */}
      {enrollToast && (
        <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 font-mono text-xs flex items-center justify-between shadow-xl animate-in slide-in-from-top duration-200 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{enrollToast}</span>
          </div>
          <button onClick={() => setEnrollToast(null)} className="text-emerald-400 hover:text-white ml-3 font-bold">✕</button>
        </div>
      )}

      {/* Prominent High-Priority Threat Alert Banner */}
      {alarmActive && activeMatchTarget && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/95 via-red-900/95 to-red-950/95 border-2 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)] flex items-center justify-between gap-4 animate-pulse shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-red-600 text-white animate-bounce shrink-0 shadow-lg shadow-red-600/50">
              <ShieldAlert size={28} />
            </div>
            <div>
              <div className="font-mono text-sm font-black text-white tracking-wider flex items-center gap-2">
                <span>🚨 CULPRIT DETECTED: {activeMatchTarget.suspect.name.toUpperCase()}</span>
                <span className="px-2 py-0.5 rounded bg-red-800 text-red-100 text-[10px] border border-red-400 font-bold">
                  {Math.round(activeMatchTarget.confidence * 100)}% MATCH
                </span>
              </div>
              <div className="font-mono text-xs text-red-200/90 mt-0.5">
                Warrant: <strong className="text-white">{activeMatchTarget.suspect.warrantId}</strong> • Hazard: <strong className="text-amber-300">{activeMatchTarget.suspect.hazardLevel}</strong> • Offense: <span>{activeMatchTarget.suspect.offense}</span> • Station: <strong className="text-white">{stationName}</strong>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAlarmActive(false)}
              className="px-4 py-2 rounded-xl bg-black/60 border border-red-500/50 text-xs font-mono text-white hover:bg-black/90 font-bold transition-all shadow-md"
            >
              MUTE ALARM
            </button>
          </div>
        </div>
      )}

      {/* Main Split Interface: Left Camera / Right Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[440px]">
        {/* Left Column: Live Recon Camera with Optical Target Overlay (7 Cols) */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-4 flex flex-col gap-3 border border-panel-border overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-panel-border flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-red-400" />
              <h2 className="font-mono text-xs font-bold text-white tracking-widest uppercase">
                RECON FEED • AUTONOMOUS FACIAL MATCHER
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Camera Device Dropdown (Laptop vs Iriun/DroidCam/Phone) */}
              {feedSource === 'device' && videoDevices.length > 0 && (
                <select
                  value={selectedDeviceId}
                  onChange={e => setSelectedDeviceId(e.target.value)}
                  className="bg-black/80 border border-white/15 rounded-lg px-2 py-0.5 text-[10px] font-mono text-cyan-300 focus:outline-none focus:border-cyan-400 max-w-[140px] truncate"
                  title="Select video source (e.g. Laptop Cam, Iriun Webcam, DroidCam)"
                >
                  {videoDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}

              {/* IP Cam Toggle */}
              <button
                onClick={() => setShowIpModal(!showIpModal)}
                className={`px-2 py-0.5 rounded-lg border text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                  feedSource === 'ip_webcam'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                    : 'bg-black/60 text-foreground/60 border-white/10 hover:text-white'
                }`}
                title="Connect to phone IP Webcam stream"
              >
                <span>IP CAM</span>
                {feedSource === 'ip_webcam' && (
                  <span className={`w-1.5 h-1.5 rounded-full ${ipCamConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
                )}
              </button>

              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                activeMatchTarget
                  ? 'bg-red-500/20 text-red-400 border-red-500/40 font-bold animate-pulse'
                  : lastScanScore > 0
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 font-bold'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {activeMatchTarget
                  ? `🚨 CULPRIT MATCH: ${activeMatchTarget.suspect.name}`
                  : lastScanScore > 0
                  ? `LIVE FACE DETECTED (${Math.round(lastScanScore * 100)}% match)`
                  : 'BIO-SCANNER READY (NO HUMAN)'}
              </span>
            </div>
          </div>

          {/* IP Webcam Stream Setup Bar */}
          {showIpModal && (
            <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex flex-col gap-2.5 font-mono text-[10px] animate-in fade-in">
              <div className="flex justify-between items-center text-cyan-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <span>📱 MOBILE IP WEBCAM STREAM SETUP</span>
                  {ipCamConnected && <span className="text-[9px] text-emerald-400 font-bold">● CONNECTED</span>}
                </span>
                <button onClick={() => setShowIpModal(false)} className="text-foreground/40 hover:text-white">✕</button>
              </div>

              {/* Input row */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. http://10.35.147.216:8080 or 10.35.147.216:8080"
                  value={ipWebcamUrl}
                  onChange={e => {
                    setIpWebcamUrl(e.target.value);
                    setIpCamError(null);
                  }}
                  className="flex-1 bg-black/80 border border-white/15 rounded-lg px-2.5 py-1.5 text-white text-[10px] focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={() => {
                    let clean = ipWebcamUrl.trim();
                    if (!clean.startsWith('http://') && !clean.startsWith('https://')) clean = 'http://' + clean;
                    clean = clean.replace(/\/+$/, '');
                    if (!clean.includes('/video') && !clean.includes('/shot.jpg')) clean += '/video';
                    setIpWebcamUrl(clean);
                    if (typeof window !== 'undefined') localStorage.setItem('vikrant_ip_webcam_url', clean);
                    setFeedSource('ip_webcam');
                    setShowIpModal(false);
                    setIpCamError(null);
                  }}
                  className="px-3 py-1.5 liquid-btn-primary font-bold text-black rounded-lg"
                >
                  CONNECT
                </button>
                <button
                  onClick={async () => {
                    setTestStatus('testing');
                    try {
                      let clean = ipWebcamUrl.trim();
                      if (!clean.startsWith('http://') && !clean.startsWith('https://')) clean = 'http://' + clean;
                      clean = clean.replace(/\/+$/, '');
                      const testUrl = clean.endsWith('/shot.jpg') ? clean : `${clean.replace(/\/video$/, '')}/shot.jpg`;
                      const res = await fetch(`/api/camera/proxy?url=${encodeURIComponent(testUrl)}`, { cache: 'no-store' });
                      if (res.ok) {
                        setTestStatus('success');
                        setIpCamConnected(true);
                        setIpCamError(null);
                      } else {
                        setTestStatus('failed');
                      }
                    } catch {
                      setTestStatus('failed');
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-[9px] font-bold transition-all ${
                    testStatus === 'success'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                      : testStatus === 'failed'
                      ? 'bg-red-500/20 text-red-300 border-red-500'
                      : 'border-white/20 text-white/80 hover:bg-white/10'
                  }`}
                >
                  {testStatus === 'testing' ? 'TESTING...' : testStatus === 'success' ? '✅ 200 OK' : testStatus === 'failed' ? '❌ FAILED' : 'TEST PING'}
                </button>
                {feedSource === 'ip_webcam' && (
                  <button
                    onClick={() => {
                      setFeedSource('device');
                      setShowIpModal(false);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-white/20 text-white/80 hover:bg-white/10"
                  >
                    RESET
                  </button>
                )}
              </div>

              {/* Presets and Stream Mode */}
              <div className="flex items-center justify-between flex-wrap gap-2 text-[9px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-foreground/50 font-bold">PRESETS:</span>
                  <button
                    onClick={() => {
                      const url = 'http://10.35.147.216:8080/video';
                      setIpWebcamUrl(url);
                      if (typeof window !== 'undefined') localStorage.setItem('vikrant_ip_webcam_url', url);
                      setFeedSource('ip_webcam');
                      setIpCamError(null);
                    }}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-cyan-500/20 hover:text-cyan-300 text-white/80 border border-white/10"
                  >
                    10.35.147.216 (HTTP Phone)
                  </button>
                  <button
                    onClick={() => {
                      const url = 'https://10.35.147.216:8080/video';
                      setIpWebcamUrl(url);
                      if (typeof window !== 'undefined') localStorage.setItem('vikrant_ip_webcam_url', url);
                      setFeedSource('ip_webcam');
                      setIpCamError(null);
                      window.open('https://10.35.147.216:8080', '_blank');
                    }}
                    className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
                    title="Opens phone HTTPS in new tab to trust SSL certificate"
                  >
                    <span>10.35.147.216 (HTTPS ↗)</span>
                  </button>
                  <button
                    onClick={() => {
                      const url = 'http://10.35.147.52:8080/video';
                      setIpWebcamUrl(url);
                      if (typeof window !== 'undefined') localStorage.setItem('vikrant_ip_webcam_url', url);
                      setFeedSource('ip_webcam');
                      setIpCamError(null);
                    }}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-cyan-500/20 text-white/60 border border-white/10"
                  >
                    10.35.147.52 (Old)
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-foreground/50">ROUTE:</span>
                  <button
                    onClick={() => setIpStreamMode('direct')}
                    className={`px-1.5 py-0.5 rounded ${ipStreamMode === 'direct' ? 'bg-cyan-500/30 text-cyan-300 font-bold' : 'text-foreground/50'}`}
                  >
                    DIRECT
                  </button>
                  <button
                    onClick={() => setIpStreamMode('proxy')}
                    className={`px-1.5 py-0.5 rounded ${ipStreamMode === 'proxy' ? 'bg-cyan-500/30 text-cyan-300 font-bold' : 'text-foreground/50'}`}
                  >
                    PROXY
                  </button>
                </div>
              </div>

              <span className="text-[9px] text-foreground/50">
                1. Open <strong>IP Webcam</strong> on phone → 2. Scroll down & tap <strong>Start server</strong> → 3. Ensure both laptop and phone are on the same Wi-Fi.
              </span>
            </div>
          )}

          {/* Camera Surface with Live Targeting HUD */}
          <div className="flex-1 w-full min-h-[300px] bg-black rounded-xl overflow-hidden relative border border-panel-border flex items-center justify-center">
            {/* Auto-Fallback Notification Banner */}
            {autoFallbackNotice && (
              <div className="absolute top-2 inset-x-2 z-40 bg-amber-950/90 border border-amber-500/70 text-amber-200 text-[10px] font-mono px-3 py-1.5 rounded-lg flex items-center justify-between shadow-xl backdrop-blur-md animate-in fade-in">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-400 shrink-0 animate-pulse" />
                  <span>{autoFallbackNotice}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setAutoFallbackNotice(null);
                      setFeedSource('ip_webcam');
                      setIpCamConnected(false);
                    }}
                    className="px-2 py-0.5 rounded bg-amber-500/25 hover:bg-amber-500/40 text-amber-100 font-bold border border-amber-500/40 text-[9px] transition-all"
                  >
                    RETRY PHONE CAM
                  </button>
                  <button
                    onClick={() => setAutoFallbackNotice(null)}
                    className="text-amber-400/60 hover:text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {feedSource === 'device' ? (
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
            ) : ipWebcamUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={ipImageRef}
                key={`${ipWebcamUrl}-${ipStreamMode}`}
                src={
                  ipStreamMode === 'proxy'
                    ? `/api/camera/proxy?url=${encodeURIComponent(ipWebcamUrl.includes('/video') ? ipWebcamUrl : `${ipWebcamUrl.replace(/\/+$/, '')}/video`)}`
                    : ipWebcamUrl.includes('/video')
                    ? ipWebcamUrl
                    : `${ipWebcamUrl.replace(/\/+$/, '')}/video`
                }
                crossOrigin="anonymous"
                onLoad={() => {
                  setHasCamera(true);
                  setIpCamConnected(true);
                  setIpCamError(null);
                  setAutoFallbackNotice(null);
                }}
                onError={() => {
                  console.warn('[Watchlist IP Cam] Failed to load stream with mode:', ipStreamMode);
                  const isCloud = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
                  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

                  setIpCamConnected(false);
                  const failMsg = (isCloud && isHttps && ipWebcamUrl.startsWith('http://'))
                    ? 'Browser blocked HTTP stream on Vercel HTTPS. Auto-switched to laptop camera.'
                    : `Phone IP (${ipWebcamUrl.replace(/https?:\/\//, '').split('/')[0]}) unreachable. Auto-switched to laptop camera.`;
                  triggerAutoFallbackToDeviceCamera(failMsg);
                }}
                alt="Mobile IP Webcam Feed"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-4 text-center font-mono text-xs text-foreground/50">
                <Camera size={28} className="text-cyan-400 animate-pulse" />
                <span>No IP stream configured. Click IP CAM above to connect phone stream.</span>
              </div>
            )}

            {/* Live Camera Connection Status Pill */}
            {feedSource === 'ip_webcam' && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 z-20 pointer-events-none">
                <div className={`px-2.5 py-1 rounded-lg text-[9px] font-mono flex items-center gap-1.5 border backdrop-blur-md font-bold shadow-lg ${
                  ipCamConnected
                    ? 'bg-emerald-950/85 border-emerald-500/50 text-emerald-300'
                    : 'bg-amber-950/85 border-amber-500/50 text-amber-300 animate-pulse'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${ipCamConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span>
                    {ipCamConnected
                      ? `PHONE CAM LIVE • ${ipWebcamUrl.replace(/https?:\/\//, '').split('/')[0]} (${ipStreamMode.toUpperCase()})`
                      : 'CONNECTING TO PHONE CAM...'}
                  </span>
                </div>
              </div>
            )}

            {/* Error Overlay if disconnected */}
            {feedSource === 'ip_webcam' && ipCamError && !ipCamConnected && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center z-20 font-mono">
                <AlertTriangle size={30} className="text-amber-400 mb-2 animate-bounce" />
                <span className="text-xs text-white font-bold mb-1">PHONE CAMERA NOT REACHABLE</span>
                <span className="text-[10px] text-foreground/70 max-w-sm mb-3">
                  {ipCamError}
                </span>
                <div className="flex flex-wrap gap-2 justify-center pointer-events-auto">
                  <button
                    onClick={() => {
                      setFeedSource('device');
                      setIpCamError(null);
                    }}
                    className="px-3 py-1.5 liquid-btn text-cyan-300 rounded-lg text-[10px] font-bold flex items-center gap-1"
                  >
                    <Camera size={12} />
                    <span>USE LAPTOP WEBCAM</span>
                  </button>
                  <button
                    onClick={() => {
                      const httpsUrl = ipWebcamUrl.replace(/^http:/, 'https:');
                      setIpWebcamUrl(httpsUrl);
                      if (typeof window !== 'undefined') localStorage.setItem('vikrant_ip_webcam_url', httpsUrl);
                      setIpCamError(null);
                      window.open(httpsUrl.replace(/\/video$/, ''), '_blank');
                    }}
                    className="px-3 py-1.5 liquid-btn-primary text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                  >
                    <span>OPEN HTTPS & TRUST CERT</span>
                    <ExternalLink size={10} />
                  </button>
                  <button
                    onClick={() => setShowIpModal(true)}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px]"
                  >
                    CHANGE IP
                  </button>
                </div>
              </div>
            )}

            {/* Tactical Crosshair / Optical Target Box */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-48 h-48 rounded-2xl border-2 transition-all flex flex-col justify-between p-2 ${
                activeMatchTarget
                  ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)] bg-red-500/10 animate-pulse'
                  : lastScanScore > 0
                  ? 'border-amber-400/60 shadow-[0_0_15px_rgba(245,158,11,0.2)] bg-amber-500/5'
                  : 'border-cyan-400/30'
              }`}>
                <div className="flex justify-between text-[8px] font-mono">
                  <span className={activeMatchTarget ? 'text-red-400 font-bold' : lastScanScore > 0 ? 'text-amber-400 font-bold' : 'text-cyan-400'}>
                    {activeMatchTarget ? 'LOCK ON TARGET' : lastScanScore > 0 ? 'HUMAN IN FRAME' : 'BIO-SCANNER'}
                  </span>
                  <span className="text-white/60">64x64 HOG</span>
                </div>
                <div className="text-center">
                  {activeMatchTarget ? (
                    <div className="px-2 py-0.5 rounded bg-red-950/90 border border-red-500 text-white font-mono text-[9px] font-bold animate-bounce">
                      MATCH: {Math.round(activeMatchTarget.confidence * 100)}% [{activeMatchTarget.targetType === 'full_photo' ? 'PHOTO' : 'FACE'}]
                    </div>
                  ) : lastScanScore > 0 ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] font-mono text-amber-300 font-bold">
                        LIVE FACE IN FRAME
                      </span>
                      <span className="text-[8px] font-mono text-amber-400/90 font-semibold">
                        Sim: {Math.round(lastScanScore * 100)}% (Threshold: {Math.round(matchThreshold * 100)}%)
                      </span>
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono text-emerald-400/80 font-bold">
                      SECURE • NO HUMAN
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom HUD Telemetry Strip */}
            <div className="absolute bottom-2 left-2 right-2 p-2 rounded-lg bg-black/80 backdrop-blur-sm border border-white/10 flex justify-between items-center text-[10px] font-mono">
              <span className="text-foreground/70 flex items-center gap-1">
                <MapPin size={11} className="text-red-400" />
                {stationName.split('•')[0].trim()}
              </span>
              <span className="text-cyan-400">
                WATCHLIST POOL: {watchlist.length} SUSPECTS
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Enrolled Watchlist Roster (5 Cols) */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-4 flex flex-col gap-3 border border-panel-border overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-panel-border">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-cyan-400" />
              <h2 className="font-mono text-xs font-bold text-white tracking-widest uppercase">
                ACTIVE SUSPECT WATCHLIST ({watchlist.length})
              </h2>
            </div>
            <span className="text-[10px] font-mono text-foreground/40">
              FOLDER: /public/watchlist/
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {watchlist.map(suspect => (
              <div
                key={suspect.id}
                className="p-3 rounded-xl bg-black/40 border border-panel-border hover:border-white/20 transition-all flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={suspect.photoUrl}
                    alt={suspect.name}
                    className="w-12 h-12 rounded-lg object-cover border border-panel-border bg-slate-900"
                  />
                  <div className="flex flex-col font-mono">
                    <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                      {suspect.name}
                    </span>
                    <span className="text-[10px] text-foreground/60">
                      WARRANT: {suspect.warrantId}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded ${
                        suspect.hazardLevel === 'CRITICAL'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {suspect.hazardLevel}
                      </span>
                      <span className="text-[8px] text-emerald-400">128-D EMBEDDED</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleSimulateMatch(suspect)}
                    title="Simulate spotting this suspect"
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-foreground/70 hover:text-white transition-colors text-[10px] font-mono"
                  >
                    TEST
                  </button>
                  <button
                    onClick={() => handleRemoveSuspect(suspect.id)}
                    title="Remove from watchlist"
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-[10px] font-mono text-cyan-200/80 flex items-center gap-2">
            <FolderOpen size={14} className="text-cyan-400 shrink-0" />
            <span>Drop images into <strong>public/watchlist/</strong> or click <strong>+ ENROLL SUSPECT</strong> to add culprits.</span>
          </div>
        </div>
      </div>

      {/* Bottom Section: Side-by-Side Interception Log (Live Capture vs Watchlist Mugshot) */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3 shrink-0 border border-red-500/20">
        <div className="flex items-center justify-between pb-2 border-b border-panel-border">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-400" />
            <h3 className="font-mono text-xs font-bold text-white tracking-widest uppercase">
              CULPRIT INTERCEPT LOG • SIDE-BY-SIDE VERIFICATION PASSPORT
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-foreground/50">
              AUTO-DISPATCHES RPF EMERGENCY ALERT ON CONFIRMED MATCH
            </span>
            {interceptionLogs.length > 0 && (
              <button
                onClick={handleClearLogs}
                disabled={isClearingLogs}
                className="px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 flex items-center gap-1.5 transition-all active:scale-95"
                title="Clear all facial interception logs from database"
              >
                <Trash2 size={12} />
                <span>{isClearingLogs ? 'CLEARING...' : 'CLEAR LOGS'}</span>
              </button>
            )}
          </div>
        </div>

        {interceptionLogs.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-foreground/40 flex flex-col items-center justify-center gap-2">
            <ScanFace size={28} className="opacity-30" />
            <span>No suspect interceptions recorded today. Click &quot;TEST CULPRIT MATCH&quot; above to simulate an encounter.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {interceptionLogs.map((log, i) => (
              <div
                key={`${log.id || 'log'}-${i}`}
                onClick={() => setInspectMatch(log)}
                className="p-3 rounded-xl glass-panel border border-panel-border hover:border-red-400 transition-all cursor-pointer flex flex-col gap-2.5 group"
              >
                {/* Header Strip */}
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-red-400 font-bold truncate max-w-[170px]">
                    {log.substance_name?.replace('WANTED CULPRIT:', '') || 'Suspect Encounter'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold border border-red-500/30">
                    {Math.round((log.confidence_score || 0.92) * 100)}% MATCH
                  </span>
                </div>

                {/* Side-by-Side Photo Comparison */}
                <div className="grid grid-cols-2 gap-2 aspect-[2/1] w-full rounded-lg overflow-hidden">
                  {/* Live Captured Photo */}
                  <div className="relative bg-black h-full w-full overflow-hidden border border-white/10 rounded">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={log.photo_url} alt="Live Capture" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-red-400 border border-red-500/40">
                      LIVE CAMERA
                    </span>
                  </div>

                  {/* Watchlist Mugshot Reference */}
                  <div className="relative bg-black h-full w-full overflow-hidden border border-white/10 rounded">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={log.suspectReferencePhoto || '/watchlist/suspect_1.svg'}
                      alt="Watchlist Reference"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-cyan-300 border border-cyan-400/40">
                      DOSSIER MUGSHOT
                    </span>
                  </div>
                </div>

                {/* Telemetry Footer */}
                <div className="flex justify-between items-center text-[9px] font-mono text-foreground/60 pt-1 border-t border-white/5">
                  <span className="truncate max-w-[140px]">{log.station || stationName.split('•')[0].trim()}</span>
                  <span>{isMounted ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
