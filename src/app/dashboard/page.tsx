'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle,
  Crosshair,
  Wifi,
  Camera,
  ScanFace,
  Check,
  X,
  ShieldAlert,
  Activity,
  Scan,
  Sparkles,
  MapPin,
  Clock,
  ExternalLink,
  ChevronRight,
  Eye,
  Trash2,
} from 'lucide-react';
import LiveCameraFeed from '@/components/LiveCameraFeed';
import LiveSensorPanel from '@/components/LiveSensorPanel';
import { clearDetectionEvents } from '@/lib/logService';

const MainMap = dynamic(() => import('@/components/MainMap'), { ssr: false });

type AlertEvent = {
  id: string;
  unit_id: string;
  unit_code?: string;
  substance_category: string;
  substance_name?: string;
  confidence_tier: 'screen' | 'presumptive' | 'confirmed';
  confidence_score?: number;
  latitude?: number;
  longitude?: number;
  station?: string;
  timestamp: string;
  photo_url?: string;
};

type FaceMatchEvent = {
  id: string;
  unit_id: string;
  confidence: number;
  timestamp: string;
  station: string;
  status: 'new' | 'reviewed' | 'dismissed';
};

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [recentCaptures, setRecentCaptures] = useState<any[]>([]);
  const [inspectCapture, setInspectCapture] = useState<any | null>(null);
  const [faceMatches, setFaceMatches] = useState<FaceMatchEvent[]>([]);
  const [expandedFaceMatch, setExpandedFaceMatch] = useState<string | null>(null);
  const [bottomView, setBottomView] = useState<'split' | 'captures' | 'sensors'>('split');

  const [stats, setStats] = useState({ activeUnits: 12, detectionsToday: 4, pendingAlerts: 2, avgResponseTime: '2.4m' });
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    // Initial fetch for alerts and captures
    const fetchAlerts = async () => {
      const { data } = await supabase
        .from('detection_events')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(30);

      if (data && data.length > 0) {
        setAlerts(data);
        const capturesWithPhotos = data.filter(d => d.photo_url);
        setRecentCaptures(capturesWithPhotos);
        setStats(s => ({
          ...s,
          detectionsToday: data.length,
          pendingAlerts: data.filter(d => d.status === 'new').length,
        }));
      }
    };
    fetchAlerts();

    // Initial fetch for face matches
    const fetchMatches = async () => {
      const { data } = await supabase
        .from('facial_match_events')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);
      if (data) setFaceMatches(data);
    };
    fetchMatches();

    // Listen to local auto-capture events for 0ms instant UI update!
    const handleLocalCapture = (e: any) => {
      const newEvent = e.detail;
      setAlerts(prev => [newEvent, ...prev]);
      if (newEvent.photo_url) {
        setRecentCaptures(prev => [newEvent, ...prev]);
      }
      setStats(s => ({ ...s, pendingAlerts: s.pendingAlerts + 1, detectionsToday: s.detectionsToday + 1 }));
    };

    const handleLogsCleared = (e: any) => {
      const cat = e.detail?.category;
      if (cat === 'all' || !cat) {
        setAlerts([]);
        setRecentCaptures([]);
        setStats(s => ({ ...s, pendingAlerts: 0, detectionsToday: 0 }));
      } else if (cat === 'ai_visual') {
        setAlerts(prev => prev.filter(a => a.substance_category !== 'AI Visual Trigger (Demo)'));
        setRecentCaptures(prev => prev.filter(a => a.substance_category !== 'AI Visual Trigger (Demo)'));
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('vikrant:new_capture', handleLocalCapture);
      window.addEventListener('vikrant:logs_cleared', handleLogsCleared);
    }

    // Realtime subscriptions
    const alertsChannelId = `dash_alerts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channelAlerts = supabase
      .channel(alertsChannelId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'detection_events' }, payload => {
        const item = payload.new as any;
        setAlerts(prev => [item, ...prev].slice(0, 50));
        if (item.photo_url) {
          setRecentCaptures(prev => [item, ...prev].slice(0, 30));
        }
        setStats(s => ({ ...s, pendingAlerts: s.pendingAlerts + 1, detectionsToday: s.detectionsToday + 1 }));
      })
      .subscribe();

    const facesChannelId = `dash_faces_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channelFaces = supabase
      .channel(facesChannelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facial_match_events' }, payload => {
        if (payload.eventType === 'INSERT') {
          setFaceMatches(prev => [payload.new as FaceMatchEvent, ...prev].slice(0, 20));
        } else if (payload.eventType === 'UPDATE') {
          setFaceMatches(prev => prev.map(m => (m.id === payload.new.id ? (payload.new as FaceMatchEvent) : m)));
        }
      })
      .subscribe();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('vikrant:new_capture', handleLocalCapture);
        window.removeEventListener('vikrant:logs_cleared', handleLogsCleared);
      }
      supabase.removeChannel(channelAlerts);
      supabase.removeChannel(channelFaces);
    };
  }, []);

  const updateFaceMatchStatus = async (id: string, status: 'reviewed' | 'dismissed') => {
    await supabase.from('facial_match_events').update({ status }).eq('id', id);
    setExpandedFaceMatch(null);
  };

  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 bg-transparent overflow-y-auto">
      {/* High-Resolution Capture Inspector Modal */}
      {inspectCapture && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-panel p-5 rounded-2xl border border-cyan-400 max-w-2xl w-full flex flex-col gap-4 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2">
                <Scan size={18} className="text-cyan-400" />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  AI CAPTURED RECON PASSPORT
                </h3>
              </div>
              <button
                onClick={() => setInspectCapture(null)}
                className="text-foreground/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-sm font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            {/* Frame Image */}
            <div className="w-full aspect-video rounded-xl bg-black overflow-hidden relative border border-panel-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inspectCapture.photo_url} alt="Captured frame" className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/80 font-mono text-xs text-cyan-300 border border-cyan-400/40">
                {inspectCapture.substance_name || 'Prop Object Detected'}
              </div>
            </div>

            {/* Telemetry Grid */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-panel-border flex flex-col">
                <span className="text-[10px] text-foreground/40 uppercase">GPS COORDINATES</span>
                <span className="text-foreground/90 font-bold">
                  {(inspectCapture.latitude || 22.59548).toFixed(6)}° N, {(inspectCapture.longitude || 88.45420).toFixed(6)}° E
                </span>
                <span className="text-[10px] text-foreground/60">{inspectCapture.station || 'Active Station Sector'}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-panel-border flex flex-col">
                <span className="text-[10px] text-foreground/40 uppercase">STAMPED TIMESTAMP</span>
                <span className="text-foreground/90 font-bold">
                  {isMounted ? new Date(inspectCapture.timestamp).toLocaleString() : ''}
                </span>
                <span className="text-[10px] text-cyan-400 font-bold">
                  CONFIDENCE: {Math.round((inspectCapture.confidence_score || 0.88) * 100)}%
                </span>
              </div>
            </div>

            {/* Direct link to dedicated page */}
            <div className="flex justify-between items-center pt-2 border-t border-panel-border">
              <Link
                href="/dashboard/captures"
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
              >
                <span>Open Dedicated AI Captures Page</span>
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

      {/* KPI Strip */}
      <div className="flex gap-4 h-24 shrink-0">
        <KpiCard title="Active Units" value={stats.activeUnits} icon={<Wifi className="text-info" />} />
        <KpiCard title="Detections Today" value={stats.detectionsToday} icon={<Crosshair className="text-destructive" />} />
        <KpiCard title="AI Captures" value={recentCaptures.length} icon={<Scan className="text-cyan-400" />} />
        <KpiCard title="Avg Response" value={stats.avgResponseTime} />
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden min-h-[750px]">
        {/* Left / Center Col: Map (Top) & Video + Sensor Telemetry / Captures (Bottom) */}
        <div className="flex flex-col flex-1 gap-4 overflow-hidden">
          {/* Main Map with Path Trail & Coordinate Telemetry */}
          <div className="flex-1 min-h-[380px] glass-panel rounded-xl overflow-hidden relative">
            <div className="absolute top-4 left-4 z-10 glass-panel px-3 py-1 text-xs font-mono tracking-widest text-accent rounded-md flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              LIVE TACTICAL PATROL MAP
            </div>
            <MainMap />
          </div>

          {/* Bottom Dual Operations Tray with Mode Selector */}
          <div className="h-[360px] flex flex-col gap-2 shrink-0 overflow-hidden">
            {/* Tray Header & Tab Selector */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold tracking-wider text-foreground/70 uppercase flex items-center gap-1.5">
                  <Activity size={14} className="text-cyan-400" />
                  OPERATIONAL FEEDS & RECON
                </span>
                <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/10 text-[10px] font-mono">
                  <button
                    onClick={() => setBottomView('split')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      bottomView === 'split' ? 'bg-white/15 text-white font-bold' : 'text-foreground/50 hover:text-white'
                    }`}
                  >
                    COMBINED SPLIT
                  </button>
                  <button
                    onClick={() => setBottomView('captures')}
                    className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                      bottomView === 'captures' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-foreground/50 hover:text-white'
                    }`}
                  >
                    <Scan size={11} />
                    <span>AI CAPTURES ({recentCaptures.length})</span>
                  </button>
                  <button
                    onClick={() => setBottomView('sensors')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      bottomView === 'sensors' ? 'bg-white/15 text-white font-bold' : 'text-foreground/50 hover:text-white'
                    }`}
                  >
                    SENSORS ONLY
                  </button>
                </div>
              </div>

              {/* Link to Dedicated Page */}
              <Link
                href="/dashboard/captures"
                className="liquid-btn px-3 py-1 rounded-lg text-[10px] font-mono text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5"
              >
                <span>OPEN DEDICATED CAPTURES PAGE</span>
                <ChevronRight size={13} />
              </Link>
            </div>

            {/* Tray Content Panels */}
            {bottomView === 'split' ? (
              <div className="flex-1 flex gap-4 overflow-hidden">
                {/* 1. Live Video Feeds with Operator Phone Camera */}
                <div className="w-1/3 glass-panel rounded-xl p-3 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-mono tracking-widest text-foreground/70 flex items-center gap-2">
                      <Camera size={14} /> CAMERA EYE (AUTO-CAPTURE ON)
                    </h2>
                    <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                      SUB-SECOND AI
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <LiveCameraFeed unitCode="Q-01" location="NDLS Platform 1" className="h-full" />
                  </div>
                </div>

                {/* 2. Live Sensor Telemetry Panel */}
                <div className="flex-1 glass-panel rounded-xl overflow-y-auto p-1">
                  <LiveSensorPanel unitCode="Q-01" />
                </div>
              </div>
            ) : bottomView === 'captures' ? (
              /* Dedicated Live Captures View directly on Dashboard */
              <div className="flex-1 glass-panel rounded-xl p-3 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-mono font-bold text-cyan-400 tracking-wider">
                    AUTO-CAPTURED FRAMES FROM CAMERA EYE (CLICK TO INSPECT)
                  </span>
                  <span className="text-[10px] font-mono text-foreground/40">
                    STAMPED WITH GPS LOCATION & TIMESTAMP
                  </span>
                </div>
                <div className="flex-1 overflow-x-auto flex gap-3 p-1">
                  {recentCaptures.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-foreground/40 font-mono text-xs">
                      No captures yet. Point your camera at a bottle, bag, or packet to trigger auto-capture!
                    </div>
                  ) : (
                    recentCaptures.map(cap => (
                      <div
                        key={cap.id}
                        onClick={() => setInspectCapture(cap)}
                        className="w-56 h-full glass-panel rounded-xl overflow-hidden cursor-pointer hover:border-cyan-400 transition-all shrink-0 flex flex-col group border border-panel-border"
                      >
                        <div className="relative flex-1 bg-black overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cap.photo_url}
                            alt="Capture"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[8px] text-cyan-300 border border-cyan-400/40">
                            {cap.substance_name?.slice(0, 18) || 'AI Prop'}
                          </div>
                        </div>
                        <div className="p-2 bg-white/[0.03] font-mono text-[10px] space-y-1">
                          <div className="flex justify-between items-center text-foreground/90 font-bold">
                            <span className="truncate">{cap.substance_name?.slice(0, 16)}</span>
                            <span className="text-cyan-400">{Math.round((cap.confidence_score || 0.88) * 100)}%</span>
                          </div>
                          <div className="text-[9px] text-emerald-400 flex items-center gap-1 truncate">
                            <MapPin size={10} />
                            <span>{(cap.latitude || 28.6139).toFixed(4)}°, {(cap.longitude || 77.2090).toFixed(4)}°</span>
                          </div>
                          <div className="text-[8px] text-foreground/50 flex items-center gap-1">
                            <Clock size={10} />
                            <span>{isMounted ? new Date(cap.timestamp).toLocaleTimeString() : ''}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Sensor Panel Full */
              <div className="flex-1 glass-panel rounded-xl overflow-y-auto p-2">
                <LiveSensorPanel unitCode="Q-01" />
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Alert Feed & Facial Matches */}
        <div className="w-96 flex flex-col gap-4 overflow-hidden shrink-0">
          {/* Alert Feed Panel */}
          <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-panel-border flex items-center justify-between bg-transparent">
              <h2 className="text-xs font-mono tracking-widest text-foreground/70 flex items-center gap-2">
                <AlertTriangle size={14} /> LIVE ALERT FEED
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (window.confirm('Clear all recent detection and capture alerts from database?')) {
                      await clearDetectionEvents({ category: 'all' });
                    }
                  }}
                  className="text-[9px] font-mono text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-2 py-0.5 rounded border border-red-500/20 transition-all flex items-center gap-1"
                  title="Clear detection logs from database"
                >
                  <Trash2 size={10} />
                  CLEAR
                </button>
                <span className="text-[10px] bg-destructive/20 text-destructive px-2 py-0.5 rounded-full font-mono animate-pulse">
                  {stats.pendingAlerts} PENDING
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
              <AnimatePresence>
                {alerts.map((alert: any) => {
                  const isAiTrigger = alert.substance_category === 'AI Visual Trigger (Demo)';
                  return (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => alert.photo_url && setInspectCapture(alert)}
                      className={`p-2.5 rounded-lg border-l-4 glass-panel glass-panel-hover cursor-pointer ${
                        alert.confidence_tier === 'confirmed' ? 'border-destructive' :
                        alert.confidence_tier === 'presumptive' ? 'border-warning' : 'border-info'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-bold">{alert.unit_code || alert.unit_id?.slice(0, 6) || 'Q-01'}</span>
                          {isAiTrigger && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[8px] font-mono font-bold">
                              AI VISUAL
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-foreground/50">
                          {isMounted ? new Date(alert.timestamp).toLocaleTimeString() : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-1">
                        {alert.photo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={alert.photo_url}
                            alt="Snapshot"
                            className="w-10 h-10 object-cover rounded-md border border-cyan-500/30 bg-black shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate text-foreground/90">{alert.substance_name || alert.substance_category}</div>
                          {isAiTrigger && (
                            <div className="text-[9px] font-mono text-cyan-400">AI Visual Trigger (Demo)</div>
                          )}
                        </div>
                      </div>

                      <div className="text-[9px] uppercase tracking-wider text-foreground/60 flex justify-between items-center mt-1">
                        <span className="truncate max-w-[140px]">{alert.station || 'NDLS Sector'}</span>
                        <span className={`font-mono font-bold ${
                          alert.confidence_tier === 'confirmed' ? 'text-destructive' :
                          alert.confidence_tier === 'presumptive' ? 'text-warning' : 'text-info'
                        }`}>
                          {alert.confidence_tier} {alert.confidence_score ? `(${Math.round(alert.confidence_score * 100)}%)` : ''}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Facial Recognition / Watchlist Matches Panel */}
          <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden border-accent/20 border">
            <div className="p-4 border-b border-panel-border bg-transparent flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-mono tracking-widest text-accent flex items-center gap-2">
                  <ScanFace size={14} /> WATCHLIST MATCHES
                </h2>
                <div className="text-[9px] font-mono bg-accent/20 text-accent px-1.5 py-0.5 rounded">
                  {faceMatches.filter(m => m.status === 'new').length} NEW
                </div>
              </div>
              <div className="text-[9px] font-mono text-foreground/40 bg-white/[0.03] p-1.5 rounded flex items-start gap-1.5 border border-white/5">
                <ShieldAlert size={10} className="shrink-0 mt-0.5" />
                Watchlist-only matching, on-device processing. No raw biometric data stored unencrypted.
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
              <AnimatePresence>
                {faceMatches.map(match => (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-3 rounded-lg border border-panel-border transition-colors ${
                      match.status === 'new' ? 'bg-accent/5' : 'bg-transparent opacity-60'
                    }`}
                  >
                    <div 
                      className="flex justify-between items-start mb-2 cursor-pointer"
                      onClick={() => setExpandedFaceMatch(expandedFaceMatch === match.id ? null : match.id)}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-mono font-bold text-accent">Unit: {match.unit_id}</span>
                        <span className="text-[10px] text-foreground/70">{match.station}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-foreground/50">{isMounted ? new Date(match.timestamp).toLocaleTimeString() : ''}</span>
                        <span className={`text-[10px] font-mono mt-1 ${match.confidence > 0.85 ? 'text-destructive' : 'text-warning'}`}>
                          {(match.confidence * 100).toFixed(1)}% MATCH
                        </span>
                      </div>
                    </div>
                    
                    {expandedFaceMatch === match.id && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="mt-3 pt-3 border-t border-panel-border overflow-hidden"
                      >
                        <div className="flex gap-3 mb-3">
                          <div className="w-16 h-16 bg-black rounded border border-panel-border flex items-center justify-center relative overflow-hidden">
                            <ScanFace className="text-foreground/20 absolute" size={24} />
                            <div className="absolute inset-0 bg-accent/20 mix-blend-overlay"></div>
                          </div>
                          <div className="flex flex-col justify-center flex-1">
                            <div className="text-[10px] font-mono text-foreground/50 mb-1">LOCAL DB REF</div>
                            <div className="text-xs font-mono">WL-9381A</div>
                          </div>
                        </div>
                        {match.status === 'new' && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => updateFaceMatchStatus(match.id, 'dismissed')}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors font-mono text-[10px]"
                            >
                              <X size={12} /> DISMISS
                            </button>
                            <button 
                              onClick={() => updateFaceMatchStatus(match.id, 'reviewed')}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-destructive/20 text-destructive hover:bg-destructive hover:text-white transition-colors font-mono text-[10px] border border-destructive/30"
                            >
                              <Check size={12} /> CONFIRM THREAT
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon }: { title: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="flex-1 glass-panel rounded-xl p-4 flex flex-col justify-center relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
        {icon}
      </div>
      <div className="text-[10px] text-foreground/50 font-mono tracking-widest uppercase mb-1">{title}</div>
      <div className="text-3xl font-light tracking-tight flex items-center gap-3">
        {value}
        {icon && <span className="opacity-80">{icon}</span>}
      </div>
    </div>
  );
}
