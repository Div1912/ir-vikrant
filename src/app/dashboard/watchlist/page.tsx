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
  const [matchThreshold, setMatchThreshold] = useState<number>(0.68);
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
  const [ipWebcamUrl, setIpWebcamUrl] = useState<string>('http://10.35.147.105:8080/video');
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
          savedIp = savedIp.replace(/10\.35\.147\.\d+/, '10.35.147.105');
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
      if (savedThresh) {
        const val = Number(savedThresh);
        setMatchThreshold(val < 0.60 ? 0.68 : val);
      }

      window.addEventListener('vikrant:camera_settings_changed', handleSettingsChange);
      const handleWatchlistUpdated = (e: any) => { if (e.detail) setWatchlist(e.detail); };
      window.addEventListener('vikrant:watchlist_updated', handleWatchlistUpdated);
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
        suspectId: suspect.id,
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
        const scanRes = await scanFrameForSuspects(scanTarget, watchlist, matchThreshold);
        setLastScanScore(scanRes.confidence);

        if (scanRes.isMatch && scanRes.suspect) {
          const sId = scanRes.suspect.id;
          if (consecutiveMatchesRef.current.suspectId === sId) {
            consecutiveMatchesRef.current.count += 1;
          } else {
            consecutiveMatchesRef.current = { suspectId: sId, count: 1 };
          }

          setActiveMatchTarget({
            suspect: scanRes.suspect,
            confidence: scanRes.confidence,
            bbox: scanRes.bbox,
            targetType: scanRes.targetType,
          });

          // Require at least 2 consecutive positive match frames (or ultra-confident match >= 0.78)
          if (consecutiveMatchesRef.current.count >= 2 || scanRes.confidence >= 0.78) {
            triggerSuspectInterception(scanRes.suspect, scanRes.confidence, scanRes.bbox);
          }
        } else {
          consecutiveMatchesRef.current = { suspectId: '', count: 0 };
          setActiveMatchTarget(null);
          if (!scanRes.detectedFaceCount || scanRes.detectedFaceCount === 0) {
            setLastScanScore(0);
          }
        }
      } catch (err) {
        console.warn('[Face Engine] Frame scan error:', err);
      } finally {
        isScanningBusyRef.current = false;
      }
    }, 120);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isScanning, watchlist, matchThreshold, triggerSuspectInterception, feedSource]);

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

  const getPassportReferencePhoto = (log: any) => {
    // 1. Direct photo URL stored on record
    if (
      log.suspectReferencePhoto &&
      typeof log.suspectReferencePhoto === 'string' &&
      !log.suspectReferencePhoto.endsWith('.svg') &&
      !log.suspectReferencePhoto.includes('undefined')
    ) {
      return log.suspectReferencePhoto;
    }

    // 2. Match by suspectId against current watchlist
    if (log.suspectId) {
      const matchById = watchlist.find(s => s.id === log.suspectId);
      if (matchById?.photoUrl) return matchById.photoUrl;
    }

    // 3. Match by warrantId (RPF-xxxx)
    const warrantMatch = log.warrantId || (log.substance_name && log.substance_name.match(/RPF-[\w-]+/i)?.[0]);
    if (warrantMatch) {
      const matchByWarrant = watchlist.find(s => s.warrantId.toLowerCase() === warrantMatch.toLowerCase());
      if (matchByWarrant?.photoUrl) return matchByWarrant.photoUrl;
    }

    // 4. Suspect name match against current watchlist
    const nameMatch = watchlist.find(s =>
      s.name && log.substance_name && log.substance_name.toLowerCase().includes(s.name.toLowerCase())
    );
    if (nameMatch?.photoUrl) return nameMatch.photoUrl;

    // 5. Semantic keyword matching for enrolled culprits
    const text = ((log.substance_name || '') + ' ' + (log.suspectName || '')).toLowerCase();
    if (text.includes('beta') || text.includes('sunil') || text.includes('8824')) {
      return '/watchlist/suspect_2_face.jpg';
    }
    if (text.includes('alpha') || text.includes('vikram') || text.includes('4091')) {
      return '/watchlist/suspect_1_face.jpg';
    }
    if (text.includes('jiya')) {
      const jiya = watchlist.find(s => s.name.toLowerCase().includes('jiya'));
      if (jiya?.photoUrl) return jiya.photoUrl;
    }

    // 6. Safe default from active watchlist
    return watchlist[0]?.photoUrl || '/watchlist/suspect_2_face.jpg';
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
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white/95 backdrop-blur-xl p-6 rounded-2xl border border-slate-300 max-w-2xl w-full flex flex-col gap-4 shadow-2xl relative text-slate-900">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ScanFace size={20} className="text-red-600" />
                <h3 className="font-sans text-sm font-bold text-slate-900 uppercase tracking-tight">
                  CULPRIT INTERCEPTION DOSSIER
                </h3>
              </div>
              <button
                onClick={() => setInspectMatch(null)}
                className="text-slate-400 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 text-sm font-sans font-bold"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 aspect-[2/1] w-full rounded-xl overflow-hidden">
              <div className="relative bg-slate-950 h-full w-full overflow-hidden border border-slate-300 rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inspectMatch.photo_url} alt="Live Capture" className="w-full h-full object-cover" />
                <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-slate-950/90 text-[10px] font-sans font-bold text-red-300 border border-red-500/40">
                  LIVE INTERCEPT
                </span>
              </div>
              <div className="relative bg-slate-950 h-full w-full overflow-hidden border border-slate-300 rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getPassportReferencePhoto(inspectMatch)} alt="Dossier Reference" className="w-full h-full object-cover" />
                <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-slate-950/90 text-[10px] font-sans font-bold text-sky-300 border border-sky-400/40">
                  DOSSIER MUGSHOT
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 font-sans text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">GPS STAMP</span>
                <span className="text-slate-900 font-bold mt-0.5">
                  {(inspectMatch.latitude || currentCoords[0]).toFixed(6)}° N, {(inspectMatch.longitude || currentCoords[1]).toFixed(6)}° E
                </span>
                <span className="text-[11px] text-slate-600 mt-0.5">{inspectMatch.station || stationName}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">INTERCEPTION TIME</span>
                <span className="text-slate-900 font-bold mt-0.5">
                  {isMounted ? new Date(inspectMatch.timestamp).toLocaleString() : ''}
                </span>
                <span className="text-xs text-red-600 font-bold mt-0.5">
                  MATCH SCORE: {Math.round((inspectMatch.confidence_score || 0.92) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <Link
                href="/dashboard/captures"
                className="text-xs font-sans font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1.5"
              >
                <span>Open in All Captures Log</span>
                <ExternalLink size={13} />
              </Link>

              <button
                onClick={() => setInspectMatch(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-sans font-bold shadow-sm"
              >
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Suspect Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white/95 backdrop-blur-xl p-6 rounded-2xl border border-sky-300 max-w-lg w-full flex flex-col gap-4 shadow-2xl relative text-slate-900">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-sky-700">
                <UserPlus size={20} />
                <h3 className="font-sans text-sm font-bold text-slate-900 uppercase tracking-tight">
                  ENROLL SUSPECT TO WATCHLIST
                </h3>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-slate-400 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 text-sm font-sans font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="flex flex-col gap-3 font-sans text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">SUSPECT FULL NAME *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newSuspectName}
                  onChange={e => setNewSuspectName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:border-sky-500 focus:bg-white outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">WARRANT / CASE ID</label>
                  <input
                    type="text"
                    placeholder="RPF-W-2026-99"
                    value={newSuspectWarrant}
                    onChange={e => setNewSuspectWarrant(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:border-sky-500 focus:bg-white outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">HAZARD LEVEL</label>
                  <select
                    value={newSuspectHazard}
                    onChange={e => setNewSuspectHazard(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:border-sky-500 focus:bg-white outline-none font-semibold"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MODERATE">MODERATE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">CHARGE / OFFENSE</label>
                <input
                  type="text"
                  placeholder="Contraband smuggling / station theft"
                  value={newSuspectOffense}
                  onChange={e => setNewSuspectOffense(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:border-sky-500 focus:bg-white outline-none font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">REFERENCE PHOTO (UPLOAD OR URL) *</label>
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
                    className="flex-1 py-2 rounded-xl border border-dashed border-sky-400 bg-sky-50/50 hover:bg-sky-100/60 text-sky-800 font-bold flex items-center justify-center gap-1.5 transition-colors"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900 focus:border-sky-500 focus:bg-white outline-none text-xs font-medium"
                />
              </div>

              {newSuspectPhotoUrl && (
                <div className="flex items-center gap-3 p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={newSuspectPhotoUrl} alt="Preview" className="w-12 h-12 rounded object-cover border border-emerald-300" />
                  <span className="text-xs font-bold text-emerald-800">Photo Loaded • Ready to Enroll</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 mt-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 font-bold text-white shadow-sm"
                >
                  ENROLL SUSPECT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Header Rail */}
      <div className="glass-liquid-panel p-5 rounded-3xl flex flex-wrap items-center justify-between gap-4 shrink-0 border border-white/80 shadow-md">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-white/60 border border-white/80 text-sky-700 shadow-xs backdrop-blur-md">
            <ScanFace size={26} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-sans text-base font-bold text-slate-950 tracking-tight">
                CULPRIT & WANTED SUSPECT FACIAL INTERCEPTION
              </h1>
              <span className="px-3 py-1 rounded-full bg-white/60 text-emerald-900 border border-white/80 text-[10px] font-sans font-bold flex items-center gap-1.5 shadow-xs backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shadow-[0_0_8px_#059669]" />
                ACTIVE ON-DEVICE AI MATCHER
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-sans text-slate-700 mt-1 font-semibold">
              <MapPin size={13} className="text-sky-600" />
              <span>{stationName}</span>
              <span className="text-slate-400">•</span>
              <span>1024-D Neural ArcFace Biometric Cross-Reference Engine</span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Enroll Current Face from Live Camera */}
          <button
            onClick={handleQuickEnrollCurrentFace}
            className="px-4 py-2 rounded-2xl font-sans text-xs font-bold flex items-center gap-1.5 liquid-btn-primary shadow-md active:scale-95"
            title="Instantly snap the face in front of the camera and enroll into watchlist"
          >
            <Camera size={14} />
            <span>📸 ENROLL CURRENT FACE</span>
          </button>

          {/* Enroll Suspect Button */}
          <button
            onClick={() => setShowEnrollModal(true)}
            className="px-4 py-2 rounded-2xl font-sans text-xs font-semibold flex items-center gap-1.5 liquid-btn border border-white/80 shadow-xs"
          >
            <UserPlus size={14} className="text-slate-700" />
            <span>+ ENROLL SUSPECT</span>
          </button>

          {/* Simulate Interception Button */}
          <button
            onClick={() => handleSimulateMatch()}
            className="px-4 py-2 rounded-2xl font-sans text-xs font-bold flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white border border-rose-500 shadow-md active:scale-95"
          >
            <Sparkles size={14} />
            <span>TEST CULPRIT MATCH</span>
          </button>

          {/* Sensitivity Slider */}
          <div className="flex items-center gap-2.5 bg-white/60 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/80 text-xs font-sans shadow-xs text-slate-900 font-semibold">
            <span className="text-xs text-slate-600 font-bold uppercase">THRESHOLD:</span>
            <input
              type="range"
              min="0.60"
              max="0.85"
              step="0.01"
              value={matchThreshold}
              onChange={e => {
                const val = Number(e.target.value);
                setMatchThreshold(val);
                if (typeof window !== 'undefined') localStorage.setItem('vikrant_face_match_threshold', String(val));
              }}
              className="w-20 accent-sky-600 cursor-pointer"
            />
            <span className="text-xs font-bold text-sky-800">{Math.round(matchThreshold * 100)}%</span>
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
        <div className="lg:col-span-7 glass-liquid-panel rounded-3xl p-4 flex flex-col gap-3 border border-white/80 shadow-md overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-white/60 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Camera size={18} className="text-sky-600" />
              <h2 className="font-sans text-xs font-bold text-slate-950 tracking-tight uppercase">
                RECON FEED • AUTONOMOUS FACIAL MATCHER
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Camera Device Dropdown (Laptop vs Iriun/DroidCam/Phone) */}
              {feedSource === 'device' && videoDevices.length > 0 && (
                <select
                  value={selectedDeviceId}
                  onChange={e => setSelectedDeviceId(e.target.value)}
                  className="bg-white/60 backdrop-blur-md border border-white/80 rounded-xl px-2.5 py-1 text-xs font-sans text-slate-900 font-semibold focus:outline-none focus:border-sky-500 max-w-[150px] truncate shadow-xs"
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
                className={`px-3 py-1 rounded-xl border text-xs font-sans font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                  feedSource === 'ip_webcam'
                    ? 'bg-sky-600 text-white border-sky-500'
                    : 'bg-white/60 text-slate-800 border-white/80 hover:bg-white/80 backdrop-blur-md'
                }`}
                title="Connect to phone IP Webcam stream"
              >
                <span>IP CAM</span>
                {feedSource === 'ip_webcam' && (
                  <span className={`w-2 h-2 rounded-full ${ipCamConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
                )}
              </button>

              <span className={`text-xs font-sans px-3 py-1 rounded-full border backdrop-blur-md font-bold ${
                activeMatchTarget
                  ? 'bg-rose-500/20 text-rose-900 border-rose-400 animate-pulse'
                  : lastScanScore > 0
                  ? 'bg-amber-500/20 text-amber-900 border-amber-400'
                  : 'bg-emerald-500/20 text-emerald-900 border-emerald-400'
              }`}>
                {activeMatchTarget
                  ? `🚨 CULPRIT MATCH: ${activeMatchTarget.suspect.name}`
                  : lastScanScore > 0
                  ? `LIVE FACE SCANNED (${Math.round(lastScanScore * 100)}% - NON-SUSPECT)`
                  : 'BIO-SCANNER READY (NO HUMAN)'}
              </span>
            </div>
          </div>

          {/* IP Webcam Stream Setup Bar */}
          {showIpModal && (
            <div className="p-3.5 rounded-2xl bg-white/60 backdrop-blur-2xl border border-white/80 flex flex-col gap-2.5 font-sans text-xs animate-in fade-in shadow-md">
              <div className="flex justify-between items-center text-sky-950 font-bold">
                <span className="flex items-center gap-1.5">
                  <span>📱 MOBILE IP WEBCAM STREAM SETUP</span>
                  {ipCamConnected && <span className="text-xs text-emerald-700 font-bold">● CONNECTED</span>}
                </span>
                <button onClick={() => setShowIpModal(false)} className="text-slate-500 hover:text-slate-900 font-bold">✕</button>
              </div>

              {/* Input row */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. http://10.35.147.105:8080 or 10.35.147.105:8080"
                  value={ipWebcamUrl}
                  onChange={e => {
                    setIpWebcamUrl(e.target.value);
                    setIpCamError(null);
                  }}
                  className="flex-1 bg-white/70 border border-white/90 rounded-xl px-3 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-sky-500 font-medium shadow-xs"
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
                  className="px-4 py-1.5 liquid-btn-primary font-bold text-white rounded-xl shadow-xs"
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
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    testStatus === 'success'
                      ? 'bg-emerald-500/20 text-emerald-950 border-emerald-400'
                      : testStatus === 'failed'
                      ? 'bg-red-500/20 text-red-950 border-red-400'
                      : 'bg-white/60 border-white/80 text-slate-800 hover:bg-white/80'
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
                    className="px-3 py-1.5 rounded-xl border border-white/80 bg-white/60 text-slate-800 hover:bg-white/80 font-semibold"
                  >
                    RESET
                  </button>
                )}
              </div>

              {/* Presets and Stream Mode */}
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-medium">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-600 font-bold">PRESETS:</span>
                  <button
                    onClick={() => {
                      const url = 'http://10.35.147.105:8080/video';
                      setIpWebcamUrl(url);
                      if (typeof window !== 'undefined') localStorage.setItem('vikrant_ip_webcam_url', url);
                      setFeedSource('ip_webcam');
                      setIpCamError(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/70 hover:bg-white text-slate-800 border border-white/90 font-semibold shadow-xs"
                  >
                    10.35.147.105 (HTTP Phone)
                  </button>
                  <button
                    onClick={() => {
                      const url = 'https://10.35.147.105:8080/video';
                      setIpWebcamUrl(url);
                      if (typeof window !== 'undefined') localStorage.setItem('vikrant_ip_webcam_url', url);
                      setFeedSource('ip_webcam');
                      setIpCamError(null);
                      window.open('https://10.35.147.105:8080', '_blank');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-sky-100/80 hover:bg-sky-200 text-sky-900 border border-sky-300 flex items-center gap-1 font-bold shadow-xs"
                    title="Opens phone HTTPS in new tab to trust SSL certificate"
                  >
                    <span>10.35.147.105 (HTTPS ↗)</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-600 font-bold">ROUTE:</span>
                  <button
                    onClick={() => setIpStreamMode('direct')}
                    className={`px-2.5 py-1 rounded-lg font-bold ${ipStreamMode === 'direct' ? 'bg-sky-600 text-white' : 'bg-white/60 text-slate-700 hover:bg-white'}`}
                  >
                    DIRECT
                  </button>
                  <button
                    onClick={() => setIpStreamMode('proxy')}
                    className={`px-2.5 py-1 rounded-lg font-bold ${ipStreamMode === 'proxy' ? 'bg-sky-600 text-white' : 'bg-white/60 text-slate-700 hover:bg-white'}`}
                  >
                    PROXY
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Camera Surface with Live Targeting HUD */}
          <div className="flex-1 w-full min-h-[300px] bg-slate-950 rounded-2xl overflow-hidden relative border border-white/80 flex items-center justify-center shadow-inner">
            {/* Auto-Fallback Notification Banner */}
            {autoFallbackNotice && (
              <div className="absolute top-2 inset-x-2 z-40 bg-amber-950/90 border border-amber-500/70 text-amber-200 text-xs font-sans px-3 py-1.5 rounded-xl flex items-center justify-between shadow-xl backdrop-blur-md animate-in fade-in">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0 animate-pulse" />
                  <span>{autoFallbackNotice}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setAutoFallbackNotice(null);
                      setFeedSource('ip_webcam');
                      setIpCamConnected(false);
                    }}
                    className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-all"
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
                  setIpCamConnected(false);
                  const isCloud = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
                  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

                  const failMsg = (isCloud && isHttps && ipWebcamUrl.startsWith('http://'))
                    ? 'Browser blocked HTTP stream on Vercel HTTPS. Auto-switched to laptop camera.'
                    : `Phone IP (${ipWebcamUrl.replace(/https?:\/\//, '').split('/')[0]}) unreachable. Auto-switched to laptop camera.`;
                  triggerAutoFallbackToDeviceCamera(failMsg);
                }}
                alt="Mobile IP Webcam Feed"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-4 text-center font-sans text-xs text-slate-400">
                <Camera size={28} className="text-sky-400 animate-pulse" />
                <span>No IP stream configured. Click IP CAM above to connect phone stream.</span>
              </div>
            )}

            {/* Tactical Crosshair / Optical Target Box */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-48 h-48 rounded-2xl border-2 transition-all flex flex-col justify-between p-2 ${
                activeMatchTarget
                  ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)] bg-red-500/10 animate-pulse'
                  : lastScanScore > 0
                  ? 'border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.2)] bg-amber-500/10'
                  : 'border-sky-400/40'
              }`}>
                <div className="flex justify-between text-[9px] font-mono">
                  <span className={activeMatchTarget ? 'text-red-400 font-bold' : lastScanScore > 0 ? 'text-amber-300 font-bold' : 'text-sky-300'}>
                    {activeMatchTarget ? 'LOCK ON TARGET' : lastScanScore > 0 ? 'HUMAN IN FRAME' : 'BIO-SCANNER'}
                  </span>
                  <span className="text-white/60">1024-D NEURAL (FACERES)</span>
                </div>
                <div className="text-center">
                  {activeMatchTarget ? (
                    <div className="px-2 py-0.5 rounded bg-red-950/90 border border-red-500 text-white font-sans text-xs font-bold animate-bounce">
                      MATCH: {Math.round(activeMatchTarget.confidence * 100)}% [{activeMatchTarget.targetType === 'full_photo' ? 'PHOTO' : 'FACE'}]
                    </div>
                  ) : lastScanScore > 0 ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs font-sans text-amber-300 font-bold">
                        LIVE FACE IN FRAME
                      </span>
                      <span className="text-[10px] font-sans text-amber-200 font-semibold">
                        Sim: {Math.round(lastScanScore * 100)}% (Threshold: {Math.round(matchThreshold * 100)}%)
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs font-sans text-emerald-300 font-bold">
                      SECURE • NO HUMAN
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Enrolled Watchlist Roster (5 Cols) */}
        <div className="lg:col-span-5 glass-liquid-panel rounded-3xl p-4 flex flex-col gap-3 border border-white/80 shadow-md overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-white/60">
            <div className="flex items-center gap-2">
              <Radio size={18} className="text-sky-600" />
              <h2 className="font-sans text-xs font-bold text-slate-950 tracking-tight uppercase">
                ACTIVE SUSPECT WATCHLIST ({watchlist.length})
              </h2>
            </div>
            <span className="text-xs font-sans text-slate-600 font-bold">
              /public/watchlist/
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {watchlist.map(suspect => (
              <div
                key={suspect.id}
                className="p-3.5 rounded-2xl glass-liquid border border-white/80 hover:border-sky-300 transition-all flex items-center justify-between gap-3 group shadow-xs"
              >
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={suspect.photoUrl}
                    alt={suspect.name}
                    className="w-12 h-12 rounded-xl object-cover border border-white/80 bg-slate-100 shrink-0 shadow-xs"
                  />
                  <div className="flex flex-col font-sans">
                    <span className="text-xs font-bold text-slate-950 group-hover:text-sky-700 transition-colors">
                      {suspect.name}
                    </span>
                    <span className="text-xs text-slate-700 font-semibold">
                      WARRANT: {suspect.warrantId}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        suspect.hazardLevel === 'CRITICAL'
                          ? 'bg-red-500/20 text-red-950 border border-red-300'
                          : 'bg-amber-500/20 text-amber-950 border border-amber-300'
                      }`}>
                        {suspect.hazardLevel}
                      </span>
                      <span className="text-[10px] text-emerald-900 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-300">{suspect.descriptor && suspect.descriptor.length >= 256 ? '1024-D NEURAL' : '1024-D EMBEDDED'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleSimulateMatch(suspect)}
                    title="Simulate spotting this suspect"
                    className="px-3 py-1 rounded-xl bg-white/70 hover:bg-white text-slate-900 font-sans font-bold transition-all text-xs border border-white/90 shadow-xs"
                  >
                    TEST
                  </button>
                  <button
                    onClick={() => handleRemoveSuspect(suspect.id)}
                    title="Remove from watchlist"
                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-700 transition-colors border border-red-300"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-2xl bg-white/60 backdrop-blur-md border border-white/80 text-xs font-sans text-sky-950 font-bold flex items-center gap-2 shadow-xs">
            <FolderOpen size={16} className="text-sky-600 shrink-0" />
            <span>Drop images into <strong>public/watchlist/</strong> or click <strong>+ ENROLL SUSPECT</strong> to add culprits.</span>
          </div>
        </div>
      </div>

      {/* Bottom Section: Side-by-Side Interception Log (Live Capture vs Watchlist Mugshot) */}
      <div className="glass-liquid-panel rounded-3xl p-5 flex flex-col gap-3 shrink-0 border border-white/80 shadow-md">
        <div className="flex items-center justify-between pb-2 border-b border-white/60">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-rose-600" />
            <h3 className="font-sans text-xs font-bold text-slate-950 tracking-tight uppercase">
              CULPRIT INTERCEPT LOG • SIDE-BY-SIDE VERIFICATION PASSPORT
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-sans text-slate-700 font-semibold">
              AUTO-DISPATCHES RPF EMERGENCY ALERT ON CONFIRMED MATCH
            </span>
            {interceptionLogs.length > 0 && (
              <button
                onClick={handleClearLogs}
                disabled={isClearingLogs}
                className="px-3.5 py-1.5 rounded-xl font-sans text-xs font-bold text-red-700 hover:text-red-800 bg-red-500/10 hover:bg-red-500/20 border border-red-300 flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
                title="Clear all facial interception logs from database"
              >
                <Trash2 size={13} />
                <span>{isClearingLogs ? 'CLEARING...' : 'CLEAR LOGS'}</span>
              </button>
            )}
          </div>
        </div>

        {interceptionLogs.length === 0 ? (
          <div className="p-8 text-center font-sans text-xs text-slate-600 font-semibold flex flex-col items-center justify-center gap-2">
            <ScanFace size={32} className="opacity-40 text-slate-500" />
            <span>No suspect interceptions recorded today. Click &quot;TEST CULPRIT MATCH&quot; above to simulate an encounter.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {interceptionLogs.map((log, i) => (
              <div
                key={`${log.id || 'log'}-${i}`}
                onClick={() => setInspectMatch(log)}
                className="p-3.5 rounded-2xl glass-liquid border border-white/80 hover:border-red-400 shadow-sm transition-all cursor-pointer flex flex-col gap-2.5 group"
              >
                {/* Header Strip */}
                <div className="flex justify-between items-center text-xs font-sans">
                  <span className="text-rose-800 font-bold truncate max-w-[170px]">
                    {log.substance_name?.replace('WANTED CULPRIT:', '') || 'Suspect Encounter'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-950 font-bold border border-red-300 text-[10px]">
                    {Math.round((log.confidence_score || 0.92) * 100)}% MATCH
                  </span>
                </div>

                {/* Side-by-Side Photo Comparison */}
                <div className="grid grid-cols-2 gap-2 aspect-[2/1] w-full rounded-xl overflow-hidden">
                  {/* Live Captured Photo */}
                  <div className="relative bg-slate-950 h-full w-full overflow-hidden border border-white/80 rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={log.photo_url} alt="Live Capture" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 left-1 px-2 py-0.5 rounded-full bg-slate-950/90 text-[9px] font-sans font-bold text-red-300 border border-red-500/40">
                      LIVE CAMERA
                    </span>
                  </div>

                  {/* Watchlist Mugshot Reference */}
                  <div className="relative bg-slate-950 h-full w-full overflow-hidden border border-white/80 rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getPassportReferencePhoto(log)}
                      alt="Watchlist Reference"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 left-1 px-2 py-0.5 rounded-full bg-slate-950/90 text-[9px] font-sans font-bold text-sky-300 border border-sky-400/40">
                      DOSSIER MUGSHOT
                    </span>
                  </div>
                </div>

                {/* Telemetry Footer */}
                <div className="flex justify-between items-center text-xs font-sans text-slate-700 font-semibold pt-1 border-t border-white/60">
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
