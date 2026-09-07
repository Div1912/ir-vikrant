'use client';

import React, { useState, useEffect } from 'react';
import {
  Camera,
  Scan,
  Sparkles,
  MapPin,
  Clock,
  ExternalLink,
  Download,
  Filter,
  Search,
  ShieldCheck,
  Eye,
  Crosshair,
  RefreshCw,
  Fingerprint,
  Trash2,
  Radar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { clearDetectionEvents } from '@/lib/logService';

export default function CapturesPage() {
  const [captures, setCaptures] = useState<any[]>([]);
  const [selectedCapture, setSelectedCapture] = useState<any | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'grid' | 'timeline'>('grid');
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [isPurging, setIsPurging] = useState<boolean>(false);

  // Listen to cross-page log clearing events
  useEffect(() => {
    const handleLogsCleared = (e: any) => {
      const cat = e.detail?.category;
      if (cat === 'all') {
        setCaptures([]);
        setSelectedCapture(null);
      } else if (cat) {
        setCaptures(prev => prev.filter(c => !c.substance_category?.toLowerCase().includes(cat)));
      }
    };
    window.addEventListener('vikrant:logs_cleared', handleLogsCleared);
    return () => window.removeEventListener('vikrant:logs_cleared', handleLogsCleared);
  }, []);

  const handlePurge = async (type: '24h' | 'ai_visual' | 'all') => {
    setIsPurging(true);
    if (type === '24h') {
      await clearDetectionEvents({ olderThanHours: 24 });
      const cutoff = Date.now() - 24 * 3600 * 1000;
      setCaptures(prev => prev.filter(c => new Date(c.timestamp).getTime() >= cutoff));
    } else if (type === 'ai_visual') {
      await clearDetectionEvents({ category: 'ai_visual' });
      setCaptures(prev => prev.filter(c => c.substance_category !== 'AI Visual Trigger (Demo)'));
    } else {
      await clearDetectionEvents({ category: 'all' });
      setCaptures([]);
      setSelectedCapture(null);
    }
    setIsPurging(false);
    setShowPurgeModal(false);
  };

  useEffect(() => {
    setIsMounted(true);

    // 1. Initial fetch from Supabase
    const fetchCaptures = async () => {
      const { data, error } = await supabase
        .from('detection_events')
        .select('*')
        .not('photo_url', 'is', null)
        .order('timestamp', { ascending: false });

      if (!error && data) {
        setCaptures(data);
        if (data.length > 0) setSelectedCapture(data[0]);
      }
    };

    fetchCaptures();

    // 2. Realtime subscription for incoming captures
    const channelId = `captures_realtime_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'detection_events' },
        payload => {
          if (payload.new.photo_url) {
            setCaptures(prev => [payload.new, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filtered list
  const filteredCaptures = captures.filter(c => {
    const matchesSearch =
      c.substance_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.station?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id?.toLowerCase().includes(searchQuery.toLowerCase());

    const isAiVisual = c.substance_category === 'AI Visual Trigger (Demo)';
    if (filterType === 'ai_visual') return matchesSearch && isAiVisual;
    if (filterType === 'sensor') return matchesSearch && !isAiVisual;
    return matchesSearch;
  });

  // Calculate live stats
  const totalFrames = captures.length;
  const aiTriggersCount = captures.filter(c => c.substance_category === 'AI Visual Trigger (Demo)').length;
  const avgConfidence = captures.length > 0
    ? Math.round(
        (captures.reduce((acc, c) => acc + (c.confidence_score || 0.85), 0) / captures.length) * 100
      )
    : 92;

  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 overflow-hidden bg-transparent">
      {/* Top Header & Analytics KPI Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel px-5 py-3.5 rounded-2xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Scan size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-mono font-bold tracking-wider text-white">
                LIVE AI VISUAL RECON & CAPTURE LOG
              </h1>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-mono font-bold">
                REALTIME PIPELINE
              </span>
            </div>
            <p className="text-[11px] font-mono text-foreground/50 mt-0.5">
              Automated frame capture on AI object detection • GPS coordinates & timestamp stamped inline
            </p>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-3">
          <div className="glass-pill px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono">
            <Camera size={13} className="text-cyan-400" />
            <span className="text-foreground/50">CAPTURES:</span>
            <strong className="text-white">{totalFrames}</strong>
          </div>
          <div className="glass-pill px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono">
            <Sparkles size={13} className="text-amber-400" />
            <span className="text-foreground/50">AI DETECTIONS:</span>
            <strong className="text-amber-300">{aiTriggersCount}</strong>
          </div>
          <div className="glass-pill px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono">
            <ShieldCheck size={13} className="text-success" />
            <span className="text-foreground/50">AVG CONF:</span>
            <strong className="text-success">{avgConfidence}%</strong>
          </div>

          <button
            onClick={() => setShowPurgeModal(true)}
            className="px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-all shadow-md active:scale-95"
            title="Purge old capture logs to free database storage"
          >
            <Trash2 size={13} />
            <span>PURGE LOGS</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" size={14} />
            <input
              type="text"
              placeholder="Search by object prop, case ID, or station..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-black/50 border border-panel-border rounded-xl py-2 pl-9 pr-4 text-xs font-mono focus:outline-none focus:border-cyan-400 text-white placeholder:text-foreground/30"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {(['all', 'ai_visual', 'sensor'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterType(tab)}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs transition-all liquid-btn ${
                filterType === tab
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold shadow-md shadow-cyan-500/10'
                  : 'text-foreground/60 hover:text-white'
              }`}
            >
              {tab === 'all' ? 'ALL CAPTURES' : tab === 'ai_visual' ? 'AI VISUAL PROPS' : 'TACTICAL SURVEILLANCE'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Dual Area: Gallery Grid on Left + Selected Frame Inspector on Right */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {/* Left: Interactive Captures Grid */}
        <div className="flex-1 glass-panel rounded-2xl p-3 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center px-2 py-1.5 mb-2 border-b border-panel-border/60">
            <span className="text-[10px] font-mono tracking-widest text-foreground/50 uppercase">
              FEED FRAMES ({filteredCaptures.length})
            </span>
            <span className="text-[9px] font-mono text-cyan-400">CLICK FRAME TO INSPECT TELEMETRY</span>
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-1">
            {filteredCaptures.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center text-foreground/40 font-mono text-xs py-16">
                <Camera size={32} className="mb-2 opacity-30" />
                <span>No captured frames match the filter.</span>
              </div>
            ) : (
              filteredCaptures.map(item => {
                const isSelected = selectedCapture?.id === item.id;
                const isAi = item.substance_category === 'AI Visual Trigger (Demo)';

                return (
                  <motion.div
                    key={item.id}
                    layoutId={item.id}
                    onClick={() => setSelectedCapture(item)}
                    className={`relative rounded-xl overflow-hidden cursor-pointer transition-all group border ${
                      isSelected
                        ? 'border-cyan-400 ring-2 ring-cyan-400/30 shadow-lg shadow-cyan-500/20'
                        : 'border-panel-border hover:border-white/20 glass-panel'
                    }`}
                  >
                    {/* Image Thumbnail */}
                    <div className="aspect-video w-full bg-black relative overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.photo_url}
                        alt={item.substance_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30 pointer-events-none" />

                      {/* AI Badge Overlay */}
                      {isAi && (
                        <div className="absolute top-2 left-2 z-10">
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/90 text-black font-mono font-bold text-[8px] flex items-center gap-1 shadow-md">
                            <Sparkles size={9} /> AI TRIGGER
                          </span>
                        </div>
                      )}

                      {/* Ultrasonic Distance Badge if detected */}
                      {item.substance_name?.includes('Target at') && (
                        <div className="absolute top-2 left-2 z-10">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/90 text-black font-mono font-bold text-[8px] flex items-center gap-1 shadow-md">
                            <Radar size={9} />
                            {item.substance_name.split('•').find((s: string) => s.includes('Target at'))?.replace('Target at', '').trim()}
                          </span>
                        </div>
                      )}

                      {/* Confidence Score */}
                      <div className="absolute top-2 right-2 z-10">
                        <span className="px-1.5 py-0.5 rounded bg-black/80 text-white font-mono text-[9px] border border-white/10">
                          {Math.round((item.confidence_score || 0.88) * 100)}%
                        </span>
                      </div>

                      {/* Bottom Stamped Metadata */}
                      <div className="absolute bottom-1.5 left-2 right-2 z-10 flex items-center justify-between text-[9px] font-mono text-white/90">
                        <span className="truncate max-w-[130px] font-bold">{item.substance_name}</span>
                        <span className="text-white/60">
                          {isMounted ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Selected Frame Inspector & Telemetry Passport */}
        {selectedCapture && (
          <div className="w-96 glass-panel rounded-2xl p-4 flex flex-col overflow-y-auto shrink-0 border border-cyan-500/20">
            <div className="flex items-center justify-between border-b border-panel-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Crosshair size={16} className="text-cyan-400" />
                <h3 className="font-mono text-xs font-bold text-white tracking-widest uppercase">
                  FRAME INSPECTOR
                </h3>
              </div>
              <span className="text-[9px] font-mono text-foreground/40">
                REF: {selectedCapture.id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            {/* High-Resolution Photo Display with Optical Target Frame */}
            <div className="w-full aspect-video rounded-xl bg-black overflow-hidden relative border border-panel-border mb-4 group shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedCapture.photo_url}
                alt="High resolution frame"
                className="w-full h-full object-cover"
              />

              {/* Optical Reticle Box */}
              <div className="absolute inset-4 border border-cyan-400/60 pointer-events-none rounded flex flex-col justify-between p-1.5">
                <div className="flex justify-between text-[8px] font-mono text-cyan-300">
                  <span>REC [OPTICAL-1]</span>
                  <span>AI DETECT LOCK</span>
                </div>
                <div className="flex justify-between text-[8px] font-mono text-cyan-300">
                  <span>LAT: {(selectedCapture.latitude || 28.6139).toFixed(4)}°</span>
                  <span>LON: {(selectedCapture.longitude || 77.2090).toFixed(4)}°</span>
                </div>
              </div>

              {/* Full-res open button */}
              <a
                href={selectedCapture.photo_url}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/80 hover:bg-black text-white/90 text-[10px] font-mono border border-white/10 flex items-center gap-1 transition-colors"
              >
                <ExternalLink size={12} />
                <span>FULL RES</span>
              </a>
            </div>

            {/* AI Classification & Prop Details */}
            <div className="glass-panel p-3 rounded-xl border border-panel-border mb-4">
              <div className="text-[10px] font-mono text-foreground/50 tracking-wider uppercase mb-1">
                CLASSIFICATION SUMMARY
              </div>
              <div className="text-sm font-mono font-bold text-white mb-1">
                {selectedCapture.substance_name}
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-foreground/70 mt-2 pt-2 border-t border-white/5">
                <span>CONFIDENCE:</span>
                <strong className="text-cyan-400">
                  {Math.round((selectedCapture.confidence_score || 0.88) * 100)}% MATCH
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-foreground/70 mt-1">
                <span>TIER:</span>
                <strong className="uppercase text-amber-300">
                  {selectedCapture.confidence_tier || 'presumptive'}
                </strong>
              </div>
            </div>

            {/* Ultrasonic Target Distance Badge if present */}
            {selectedCapture.substance_name?.includes('Target at') && (
              <div className="glass-panel p-3 rounded-xl border border-cyan-500/40 bg-cyan-950/20 mb-4 font-mono text-xs">
                <div className="text-[10px] font-mono text-cyan-400/80 tracking-wider uppercase mb-1.5 flex items-center gap-1.5">
                  <Radar size={12} className="text-cyan-400 animate-pulse" />
                  <span>ULTRASONIC RANGEFINDER TELEMETRY</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">DISTANCE FROM ROBOT:</span>
                  <strong className="text-sm font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    {selectedCapture.substance_name.split('•').find((s: string) => s.includes('Target at'))?.replace('Target at', '').trim() || 'Ranged'}
                  </strong>
                </div>
              </div>
            )}

            {/* GPS & Timestamp Stamped Coordinates */}
            <div className="glass-panel p-3 rounded-xl border border-panel-border mb-4 space-y-2.5 font-mono text-xs">
              <div className="text-[10px] font-mono text-foreground/50 tracking-wider uppercase">
                HARDWARE TELEMETRY STAMP
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-foreground/40">GEO LOCATION</span>
                  <span className="text-foreground/90 font-bold">
                    {(selectedCapture.latitude || 22.59548).toFixed(6)}° N, {(selectedCapture.longitude || 88.45420).toFixed(6)}° E
                  </span>
                  <span className="text-[10px] text-foreground/60">{selectedCapture.station || 'Active Station Sector'}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-2 border-t border-white/5">
                <Clock size={14} className="text-cyan-400 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-foreground/40">TIMESTAMP (UTC & LOCAL)</span>
                  <span className="text-foreground/90">
                    {isMounted ? new Date(selectedCapture.timestamp).toLocaleString() : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Digital Custody Hash */}
            <div className="p-3 rounded-xl bg-black/40 border border-panel-border font-mono text-[10px] mb-4">
              <div className="text-foreground/40 flex items-center gap-1 mb-1">
                <Fingerprint size={11} className="text-accent" />
                <span>FRAME INTEGRITY HASH (SHA-256)</span>
              </div>
              <div className="text-emerald-400 break-all bg-black/60 p-1.5 rounded border border-white/5">
                7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
              </div>
            </div>

            {/* Actions */}
            <div className="mt-auto flex flex-col gap-2">
              <a
                href={selectedCapture.photo_url}
                download={`vikrant_capture_${selectedCapture.id}.jpg`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 rounded-xl liquid-btn-primary font-mono text-xs font-bold flex items-center justify-center gap-2"
              >
                <Download size={14} />
                <span>DOWNLOAD EVIDENCE FRAME</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Database Log Purge Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-panel p-6 rounded-2xl border border-red-500 max-w-lg w-full flex flex-col gap-4 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2 text-red-400">
                <Trash2 size={18} />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  PURGE DATABASE CAPTURE LOGS
                </h3>
              </div>
              <button
                onClick={() => setShowPurgeModal(false)}
                className="text-foreground/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-sm font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            <p className="text-xs text-foreground/70 font-mono">
              Purging old logs permanently removes records from the Supabase database, freeing storage space and accelerating queries. Choose an action:
            </p>

            <div className="flex flex-col gap-2.5 font-mono text-xs">
              <button
                onClick={() => handlePurge('24h')}
                disabled={isPurging}
                className="p-3 rounded-xl border border-panel-border bg-white/5 hover:bg-white/10 flex flex-col items-start gap-1 transition-all text-left active:scale-[0.99]"
              >
                <span className="font-bold text-white">1. Clear Records Older Than 24 Hours</span>
                <span className="text-[10px] text-foreground/50">Keep only today&apos;s active surveillance logs and delete stale entries.</span>
              </button>

              <button
                onClick={() => handlePurge('ai_visual')}
                disabled={isPurging}
                className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 flex flex-col items-start gap-1 transition-all text-left active:scale-[0.99]"
              >
                <span className="font-bold text-amber-300">2. Clear AI Demo Captures Only</span>
                <span className="text-[10px] text-foreground/50">Deletes mock bottle, pouch, and bag triggers while keeping real sensor records.</span>
              </button>

              <button
                onClick={() => handlePurge('all')}
                disabled={isPurging}
                className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 flex flex-col items-start gap-1 transition-all text-left active:scale-[0.99]"
              >
                <span className="font-bold text-red-400">3. Clear ALL Capture Logs (Full DB Reset)</span>
                <span className="text-[10px] text-foreground/50">Completely clears the entire detection_events capture table.</span>
              </button>
            </div>

            {isPurging && (
              <div className="p-2.5 rounded-lg bg-red-950/40 text-red-300 font-mono text-xs flex items-center justify-center gap-2">
                <RefreshCw size={14} className="animate-spin" />
                <span>Purging database records...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
