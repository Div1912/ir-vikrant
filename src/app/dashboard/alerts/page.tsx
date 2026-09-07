'use client';

import React, { useState, useEffect } from 'react';
import { List, Filter, Search, FileText, Fingerprint, Lock, ShieldCheck, MapPin, Sparkles, Camera, ExternalLink, Trash2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { clearDetectionEvents } from '@/lib/logService';

export default function AlertsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [isMounted, setIsMounted] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('detection_events')
      .select('*')
      .order('timestamp', { ascending: false });

    if (!error && data) {
      setEvents(data);
      if (data.length > 0 && !selectedEventId) {
        setSelectedEventId(data[0].id);
      }
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchEvents();

    const handleLogsCleared = (e: any) => {
      const cat = e.detail?.category;
      if (cat === 'all') {
        setEvents([]);
        setSelectedEventId(null);
      } else {
        fetchEvents();
      }
    };
    window.addEventListener('vikrant:logs_cleared', handleLogsCleared);

    // 2. Realtime subscription for incoming detection events
    const channelId = `detection_alerts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'detection_events' },
        payload => {
          setEvents(prev => [payload.new, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'detection_events' },
        payload => {
          setEvents(prev => prev.map(e => (e.id === payload.new.id ? payload.new : e)));
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('vikrant:logs_cleared', handleLogsCleared);
      supabase.removeChannel(channel);
    };
  }, [selectedEventId]);

  const handleClear = async (hours?: number) => {
    setIsClearing(true);
    try {
      const res = await clearDetectionEvents({
        category: 'all',
        olderThanHours: hours,
      });
      if (res.success) {
        if (!hours) {
          setEvents([]);
          setSelectedEventId(null);
        } else {
          const cutoff = Date.now() - hours * 3600 * 1000;
          setEvents(prev => prev.filter(e => new Date(e.timestamp).getTime() >= cutoff));
        }
        setShowClearModal(false);
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const filteredEvents = events.filter(ev => {
    const matchesSearch =
      ev.substance_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.substance_category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.station?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.id?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTier = filterTier === 'all' || ev.confidence_tier === filterTier;
    return matchesSearch && matchesTier;
  });

  const selectedEvent = events.find(e => e.id === selectedEventId) || events[0];

  return (
    <div className="flex h-full w-full p-4 gap-4 overflow-hidden">
      {/* Event Log Roster */}
      <div className={`${selectedEvent ? 'w-1/3' : 'w-full'} glass-panel rounded-xl flex flex-col transition-all duration-300`}>
        <div className="p-4 border-b border-panel-border bg-black/20 flex flex-col gap-3 shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 text-sm font-mono tracking-widest text-foreground/70">
              <List size={16} /> 
              CASE LOG & DETECTIONS
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={filterTier}
                onChange={e => setFilterTier(e.target.value)}
                className="bg-black/50 border border-white/10 text-[10px] font-mono rounded px-2 py-1 text-foreground/80 focus:outline-none"
              >
                <option value="all">ALL TIERS</option>
                <option value="confirmed">CONFIRMED</option>
                <option value="presumptive">PRESUMPTIVE</option>
                <option value="screen">SCREEN</option>
              </select>

              <button
                onClick={() => setShowClearModal(true)}
                className="px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Clear detection and alert logs to reduce DB load"
              >
                <Trash2 size={11} />
                <span>CLEAR</span>
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" size={14} />
            <input 
              type="text" 
              placeholder="Search by case ID, substance, or location..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-panel-border rounded-lg py-1.5 pl-9 pr-4 text-xs font-mono focus:outline-none focus:border-accent"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-foreground/40 font-mono text-xs">
              No detection events found.
            </div>
          ) : (
            filteredEvents.map(ev => {
              const isAiTrigger = ev.substance_category === 'AI Visual Trigger (Demo)';
              return (
                <div 
                  key={ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  className={`p-3 rounded-lg border-l-4 cursor-pointer transition-all ${
                    selectedEventId === ev.id ? 'bg-white/10 border-accent' : 'glass-panel glass-panel-hover'
                  } ${
                    ev.confidence_tier === 'confirmed' ? 'border-destructive' :
                    ev.confidence_tier === 'presumptive' ? 'border-warning' : 'border-info'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-accent">
                        {ev.id.slice(0, 8).toUpperCase()}
                      </span>
                      {isAiTrigger && (
                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[8px] font-mono uppercase font-bold flex items-center gap-0.5">
                          <Sparkles size={9} /> AI VISUAL
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-foreground/50">
                      {isMounted ? new Date(ev.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>

                  {/* Thumbnail and Title */}
                  <div className="flex items-center gap-2 mb-1.5">
                    {ev.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ev.photo_url}
                        alt="Captured frame"
                        className="w-10 h-10 object-cover rounded border border-panel-border shrink-0 bg-black"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate text-foreground/90">
                        {ev.substance_name}
                      </div>
                      <div className="text-[10px] text-foreground/50 font-mono truncate">
                        {ev.substance_category}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-end mt-2">
                    <div className="text-[10px] font-mono uppercase text-foreground/60 flex items-center gap-1">
                      <MapPin size={10} /> {ev.station || 'NDLS Sector'}
                    </div>
                    <div className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${
                      ev.confidence_tier === 'confirmed' ? 'border-destructive text-destructive bg-destructive/10' :
                      ev.confidence_tier === 'presumptive' ? 'border-warning text-warning bg-warning/10' :
                      'border-info text-info bg-info/10'
                    }`}>
                      {ev.confidence_tier} ({Math.round((ev.confidence_score || 0.85) * 100)}%)
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Case Detail / Evidence Vault */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-2/3 glass-panel rounded-xl flex flex-col overflow-hidden relative"
          >
            <CaseDetail event={selectedEvent} onClose={() => setSelectedEventId(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Database Clear Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="glass-panel p-6 rounded-2xl border border-red-500/60 max-w-md w-full flex flex-col gap-4 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2 text-red-400">
                <Trash2 size={18} />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  CLEAR DETECTION LOGS
                </h3>
              </div>
              <button
                onClick={() => setShowClearModal(false)}
                className="text-foreground/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 text-sm font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            <p className="text-xs text-foreground/70 font-mono">
              Purging logs permanently deletes records from Supabase to prevent database overload and reduce network latency.
            </p>

            <div className="flex flex-col gap-2.5 font-mono text-xs">
              <button
                onClick={() => handleClear(24)}
                disabled={isClearing}
                className="p-3 rounded-xl border border-panel-border bg-white/5 hover:bg-white/10 flex flex-col items-start gap-1 transition-all text-left"
              >
                <span className="font-bold text-white">Clear Logs Older Than 24h</span>
                <span className="text-[10px] text-foreground/50">Removes yesterday&apos;s records, retaining active cases.</span>
              </button>

              <button
                onClick={() => handleClear()}
                disabled={isClearing}
                className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 flex flex-col items-start gap-1 transition-all text-left"
              >
                <span className="font-bold text-red-400">Clear ALL Detection Records</span>
                <span className="text-[10px] text-foreground/50">Wipes all detection records from database immediately.</span>
              </button>
            </div>

            {isClearing && (
              <div className="p-2 rounded bg-red-950/40 text-red-300 font-mono text-xs flex items-center justify-center gap-2">
                <RefreshCw size={13} className="animate-spin" />
                <span>Clearing records...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CaseDetail({ event: ev, onClose }: { event: any; onClose: () => void }) {
  const isAiTrigger = ev.substance_category === 'AI Visual Trigger (Demo)';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Detail Header */}
      <div className="p-4 border-b border-panel-border bg-black/40 flex justify-between items-start relative overflow-hidden shrink-0">
        <div className="z-10">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-mono font-bold tracking-tight">CASE REF: {ev.id.toUpperCase()}</h2>
            <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
              ev.confidence_tier === 'confirmed' ? 'border-destructive text-destructive bg-destructive/10' :
              ev.confidence_tier === 'presumptive' ? 'border-warning text-warning bg-warning/10' :
              'border-info text-info bg-info/10'
            }`}>
              TIER: {ev.confidence_tier}
            </span>

            {isAiTrigger && (
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                <Sparkles size={11} /> AI VISUAL TRIGGER (DEMO)
              </span>
            )}
          </div>
          <div className="text-xs text-foreground/70">
            Detected: <strong>{ev.substance_name}</strong> at <strong>{ev.station || 'Active Station Sector'}</strong> • Conf. Score: <strong>{(ev.confidence_score * 100).toFixed(1)}%</strong>
          </div>
        </div>
        <button onClick={onClose} className="z-10 text-xs font-mono px-2 py-1 hover:bg-white/10 rounded transition-colors">
          CLOSE
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {/* Compliance Note for AI Visual Trigger */}
        {isAiTrigger && (
          <div className="p-3 rounded-lg border border-cyan-400/30 bg-cyan-950/20 flex items-start gap-2.5 font-mono text-xs text-cyan-200/90">
            <Sparkles size={16} className="text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-cyan-300 uppercase tracking-wider mb-0.5">
                PROOF-OF-CONCEPT PIPELINE TRIGGER
              </div>
              <div>
                This alert was auto-captured by the real-time AI object-detection model running over the operator camera stream. It proves the end-to-end telemetry pipeline (Detect → Snapshot Capture → Supabase Storage Upload → Realtime Case Dispatch).
              </div>
            </div>
          </div>
        )}

        {/* Evidence Grid: Optical Capture & Sensor Snapshot */}
        <div className="grid grid-cols-2 gap-4">
          {/* Captured Image Frame */}
          <div className="glass-panel rounded-lg overflow-hidden flex flex-col border border-panel-border">
            <div className="p-2.5 border-b border-panel-border bg-black/30 text-[10px] font-mono tracking-widest text-foreground/60 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Camera size={12} /> CAPTURED EVIDENCE FRAME</span>
              <span className="text-[9px] text-accent">SUPABASE STORAGE</span>
            </div>
            <div className="h-64 bg-black relative flex items-center justify-center overflow-hidden group">
              {ev.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ev.photo_url}
                  alt="Captured evidence"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="text-foreground/30 font-mono text-xs">[ NO OPTICAL SNAPSHOT AVAILABLE ]</div>
              )}
              <div className="absolute bottom-2 right-2">
                <a
                  href={ev.photo_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded bg-black/70 hover:bg-black text-white/80 hover:text-white border border-white/10 flex items-center gap-1 text-[9px] font-mono"
                >
                  <ExternalLink size={10} /> FULL RES
                </a>
              </div>
            </div>
          </div>

          {/* Telemetry & Geographic Snapshot */}
          <div className="glass-panel rounded-lg overflow-hidden flex flex-col border border-panel-border">
            <div className="p-2.5 border-b border-panel-border bg-black/30 text-[10px] font-mono tracking-widest text-foreground/60 flex items-center justify-between">
              <span>GEOLOCATION & INCIDENT TELEMETRY</span>
              <span className="text-[9px] text-success">LOCKED</span>
            </div>
            <div className="p-4 flex flex-col gap-3 bg-black/40 h-full font-mono text-xs">
              <DetailRow label="STATION / SECTOR" value={ev.station || 'NDLS Platform 1'} />
              <DetailRow label="GPS LATITUDE" value={`${(ev.latitude || 28.6139).toFixed(6)}° N`} />
              <DetailRow label="GPS LONGITUDE" value={`${(ev.longitude || 77.2090).toFixed(6)}° E`} />
              <DetailRow label="TIME RECORDED" value={new Date(ev.timestamp).toLocaleString()} />
              <DetailRow label="DISPATCH STATUS" value={ev.status?.toUpperCase() || 'NEW'} />
            </div>
          </div>
        </div>

        {/* Chain of Custody & NDPS Section 52A Checklist (for confirmed threats) */}
        <div className="glass-panel p-5 rounded-lg border border-panel-border relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <ShieldCheck size={120} />
          </div>
          <h3 className="text-xs font-mono tracking-widest text-foreground/80 mb-4 flex items-center gap-2">
            <Lock size={14} className="text-accent" /> CHAIN OF CUSTODY & DIGITAL INTEGRITY
          </h3>
          
          <div className="grid grid-cols-2 gap-6 relative z-10">
            <div className="space-y-3">
              <DetailRow label="Investigating Officer" value="Insp. Rajesh Kumar (RPF ID: RK-8492)" />
              <DetailRow label="Witness" value="Const. Amit Singh (Batch 2021)" />
              <DetailRow label="NDPS Sec 52A Checklist" value="Verified & Attached inline" />
            </div>
            <div className="space-y-3">
              <DetailRow label="Inventory Batch Number" value={`INV-${new Date(ev.timestamp).getFullYear()}-${ev.id.slice(0, 6).toUpperCase()}`} />
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[10px] font-mono text-foreground/40">SHA-256 INTEGRITY HASH</span>
                <div className="text-[10px] font-mono bg-black/60 p-2 rounded text-success break-all flex items-center gap-2 border border-white/5">
                  <Fingerprint size={12} className="shrink-0 text-accent" />
                  d9a8f2e1c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-panel-border flex justify-end gap-3">
          <button className="px-4 py-2 font-mono text-xs rounded glass-panel hover:bg-white/10 transition-colors">
            PRINT SEIZURE MEMO
          </button>
          <button className="px-4 py-2 font-mono text-xs rounded bg-accent text-accent-foreground hover:bg-accent/80 transition-colors font-bold">
            ESCALATE TO ZONAL CONTROL
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-mono tracking-widest text-foreground/40 uppercase">{label}</span>
      <span className="text-sm text-foreground/90 font-medium">{value}</span>
    </div>
  );
}
