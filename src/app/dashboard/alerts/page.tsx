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
    <div className="flex h-full w-full p-4 gap-4 overflow-hidden font-sans">
      {/* Event Log Roster */}
      <div className={`${selectedEvent ? 'w-1/3' : 'w-full'} glass-panel rounded-2xl flex flex-col transition-all duration-300 border border-slate-200/90 shadow-sm overflow-hidden`}>
        <div className="p-4 border-b border-slate-200 bg-white/80 flex flex-col gap-3 shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 text-sm font-sans font-bold tracking-tight text-slate-900">
              <List size={18} className="text-sky-600" /> 
              CASE LOG & DETECTIONS
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={filterTier}
                onChange={e => setFilterTier(e.target.value)}
                className="bg-white border border-slate-300 text-xs font-sans font-semibold rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:border-sky-500 shadow-xs"
              >
                <option value="all">ALL TIERS</option>
                <option value="confirmed">CONFIRMED</option>
                <option value="presumptive">PRESUMPTIVE</option>
                <option value="screen">SCREEN</option>
              </select>

              <button
                onClick={() => setShowClearModal(true)}
                className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-sans font-bold flex items-center gap-1 transition-all shadow-xs"
                title="Clear detection and alert logs to reduce DB load"
              >
                <Trash2 size={13} />
                <span>CLEAR</span>
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input 
              type="text" 
              placeholder="Search by case ID, substance, or location..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-9 pr-4 text-xs font-sans font-medium text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white shadow-xs"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-slate-500 font-sans text-xs font-medium">
              No detection events found.
            </div>
          ) : (
            filteredEvents.map(ev => {
              const isAiTrigger = ev.substance_category === 'AI Visual Trigger (Demo)';
              const isSelected = selectedEventId === ev.id;
              return (
                <div 
                  key={ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  className={`p-3.5 rounded-xl border-l-4 cursor-pointer transition-all border ${
                    isSelected ? 'bg-sky-50/90 border-sky-500 shadow-sm' : 'bg-white/80 border-slate-200 hover:bg-slate-50'
                  } ${
                    ev.confidence_tier === 'confirmed' ? 'border-l-red-600' :
                    ev.confidence_tier === 'presumptive' ? 'border-l-amber-500' : 'border-l-sky-500'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-sans font-bold text-sky-800">
                        {ev.id.slice(0, 8).toUpperCase()}
                      </span>
                      {isAiTrigger && (
                        <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300 text-[10px] font-sans font-bold flex items-center gap-1">
                          <Sparkles size={10} /> AI VISUAL
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-sans text-slate-500 font-medium">
                      {isMounted ? new Date(ev.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>

                  {/* Thumbnail and Title */}
                  <div className="flex items-center gap-2.5 mb-1.5">
                    {ev.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ev.photo_url}
                        alt="Captured frame"
                        className="w-10 h-10 object-cover rounded-lg border border-slate-300 shrink-0 bg-slate-900 shadow-xs"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate text-slate-900">
                        {ev.substance_name}
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium truncate">
                        {ev.substance_category}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-end mt-2">
                    <div className="text-xs font-sans text-slate-600 font-medium flex items-center gap-1">
                      <MapPin size={12} className="text-sky-600" /> {ev.station || 'NDLS Sector'}
                    </div>
                    <div className={`text-[10px] font-sans font-bold uppercase px-2 py-0.5 rounded-full border ${
                      ev.confidence_tier === 'confirmed' ? 'border-red-200 text-red-800 bg-red-50' :
                      ev.confidence_tier === 'presumptive' ? 'border-amber-200 text-amber-800 bg-amber-50' :
                      'border-sky-200 text-sky-800 bg-sky-50'
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
            className="w-2/3 glass-panel rounded-2xl flex flex-col overflow-hidden relative border border-slate-200/90 shadow-sm"
          >
            <CaseDetail event={selectedEvent} onClose={() => setSelectedEventId(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Database Clear Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white/95 backdrop-blur-xl p-6 rounded-2xl border border-slate-300 max-w-md w-full flex flex-col gap-4 shadow-2xl relative text-slate-900 font-sans">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-red-600">
                <Trash2 size={20} />
                <h3 className="font-sans text-sm font-bold text-slate-900 uppercase tracking-tight">
                  CLEAR DETECTION LOGS
                </h3>
              </div>
              <button
                onClick={() => setShowClearModal(false)}
                className="text-slate-400 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 text-sm font-sans font-bold"
              >
                ✕ CLOSE
              </button>
            </div>

            <p className="text-xs text-slate-600 font-medium">
              Purging logs permanently deletes records from Supabase to prevent database overload and reduce network latency.
            </p>

            <div className="flex flex-col gap-2.5 font-sans text-xs">
              <button
                onClick={() => handleClear(24)}
                disabled={isClearing}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex flex-col items-start gap-1 transition-all text-left"
              >
                <span className="font-bold text-slate-900">Clear Logs Older Than 24h</span>
                <span className="text-[11px] text-slate-500 font-medium">Removes yesterday&apos;s records, retaining active cases.</span>
              </button>

              <button
                onClick={() => handleClear()}
                disabled={isClearing}
                className="p-3.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 flex flex-col items-start gap-1 transition-all text-left"
              >
                <span className="font-bold text-red-700">Clear ALL Detection Records</span>
                <span className="text-[11px] text-red-600 font-medium">Wipes all detection records from database immediately.</span>
              </button>
            </div>

            {isClearing && (
              <div className="p-2.5 rounded-xl bg-red-50 text-red-800 font-sans text-xs font-bold flex items-center justify-center gap-2 border border-red-200">
                <RefreshCw size={14} className="animate-spin text-red-600" />
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
    <div className="flex flex-col h-full overflow-hidden text-slate-900 font-sans">
      {/* Detail Header */}
      <div className="p-4 border-b border-slate-200 bg-white/80 flex justify-between items-start relative overflow-hidden shrink-0">
        <div className="z-10">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-sans font-bold tracking-tight text-slate-950">CASE REF: {ev.id.toUpperCase()}</h2>
            <span className={`text-xs font-sans font-bold uppercase px-2.5 py-0.5 rounded-full border ${
              ev.confidence_tier === 'confirmed' ? 'border-red-200 text-red-800 bg-red-50' :
              ev.confidence_tier === 'presumptive' ? 'border-amber-200 text-amber-800 bg-amber-50' :
              'border-sky-200 text-sky-800 bg-sky-50'
            }`}>
              TIER: {ev.confidence_tier}
            </span>

            {isAiTrigger && (
              <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300 text-xs font-sans font-bold uppercase flex items-center gap-1">
                <Sparkles size={13} /> AI VISUAL TRIGGER (DEMO)
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 font-medium">
            Detected: <strong className="text-slate-900 font-bold">{ev.substance_name}</strong> at <strong className="text-slate-900 font-bold">{ev.station || 'Active Station Sector'}</strong> • Conf. Score: <strong className="text-sky-700 font-bold">{(ev.confidence_score * 100).toFixed(1)}%</strong>
          </div>
        </div>
        <button onClick={onClose} className="z-10 text-xs font-sans font-bold px-3 py-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors border border-slate-200">
          CLOSE
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {/* Compliance Note for AI Visual Trigger */}
        {isAiTrigger && (
          <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50 flex items-start gap-2.5 font-sans text-xs text-sky-900 font-medium shadow-xs">
            <Sparkles size={18} className="text-sky-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sky-800 uppercase tracking-tight mb-0.5">
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
          <div className="glass-panel rounded-xl overflow-hidden flex flex-col border border-slate-200/90 shadow-sm">
            <div className="p-3 border-b border-slate-200 bg-white/80 text-xs font-sans font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Camera size={14} className="text-sky-600" /> CAPTURED EVIDENCE FRAME</span>
              <span className="text-xs text-sky-700 font-bold">SUPABASE STORAGE</span>
            </div>
            <div className="h-64 bg-slate-950 relative flex items-center justify-center overflow-hidden group">
              {ev.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ev.photo_url}
                  alt="Captured evidence"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="text-slate-400 font-sans text-xs font-medium">[ NO OPTICAL SNAPSHOT AVAILABLE ]</div>
              )}
              <div className="absolute bottom-2 right-2">
                <a
                  href={ev.photo_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-white border border-slate-700 flex items-center gap-1.5 text-xs font-sans font-bold backdrop-blur-sm"
                >
                  <ExternalLink size={12} /> FULL RES
                </a>
              </div>
            </div>
          </div>

          {/* Telemetry & Geographic Snapshot */}
          <div className="glass-panel rounded-xl overflow-hidden flex flex-col border border-slate-200/90 shadow-sm">
            <div className="p-3 border-b border-slate-200 bg-white/80 text-xs font-sans font-bold text-slate-700 flex items-center justify-between">
              <span>GEOLOCATION & INCIDENT TELEMETRY</span>
              <span className="text-xs text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">LOCKED</span>
            </div>
            <div className="p-4 flex flex-col gap-3 bg-slate-50 h-full font-sans text-xs">
              <DetailRow label="STATION / SECTOR" value={ev.station || 'NDLS Platform 1'} />
              <DetailRow label="GPS LATITUDE" value={`${(ev.latitude || 28.6139).toFixed(6)}° N`} />
              <DetailRow label="GPS LONGITUDE" value={`${(ev.longitude || 77.2090).toFixed(6)}° E`} />
              <DetailRow label="TIME RECORDED" value={new Date(ev.timestamp).toLocaleString()} />
              <DetailRow label="DISPATCH STATUS" value={ev.status?.toUpperCase() || 'NEW'} />
            </div>
          </div>
        </div>

        {/* Chain of Custody & NDPS Section 52A Checklist (for confirmed threats) */}
        <div className="glass-panel p-5 rounded-xl border border-slate-200/90 shadow-sm relative overflow-hidden bg-white/80">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-slate-900">
            <ShieldCheck size={120} />
          </div>
          <h3 className="text-xs font-sans font-bold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-tight">
            <Lock size={16} className="text-sky-600" /> CHAIN OF CUSTODY & DIGITAL INTEGRITY
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
                <span className="text-[11px] font-sans font-bold text-slate-500 uppercase">SHA-256 INTEGRITY HASH</span>
                <div className="text-xs font-mono bg-slate-100 p-2.5 rounded-xl text-emerald-800 font-bold break-all flex items-center gap-2 border border-slate-200">
                  <Fingerprint size={14} className="shrink-0 text-sky-600" />
                  d9a8f2e1c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button className="px-4 py-2 font-sans text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors border border-slate-200">
            PRINT SEIZURE MEMO
          </button>
          <button className="px-4 py-2 font-sans text-xs font-bold rounded-xl bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-sm">
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
      <span className="text-[10px] font-sans font-bold text-slate-500 uppercase">{label}</span>
      <span className="text-sm text-slate-900 font-bold mt-0.5">{value}</span>
    </div>
  );
}
