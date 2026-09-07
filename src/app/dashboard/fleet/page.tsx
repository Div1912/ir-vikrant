'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  Radio,
  Battery,
  Activity,
  Wifi,
  ShieldAlert,
  Cpu,
  Navigation,
  AlertOctagon,
  RotateCcw,
  Zap,
  Route,
  MapPin,
  Clock,
  Compass,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import RobotPowerControl from '@/components/RobotPowerControl';
import LiveSensorPanel from '@/components/LiveSensorPanel';
import { findNearestRailwayStation } from '@/lib/railwayStations';

const FleetTimelineMap = dynamic(() => import('@/components/FleetTimelineMap'), { ssr: false });

export default function FleetStatusPage() {
  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUnits = async () => {
      const { data } = await supabase.from('units').select('*').order('unit_code');
      if (data) {
        setUnits(data);
        if (data.length > 0 && !selectedUnitId) {
          // Select Q-01 by default
          const q1 = data.find(u => u.unit_code === 'Q-01');
          if (q1) setSelectedUnitId(q1.id);
        }
      }
    };
    fetchUnits();

    // Dynamically update Q-01 station if browser geolocation is available
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        const nearest = findNearestRailwayStation(latitude, longitude);
        setUnits(prev =>
          prev.map(u => (u.unit_code === 'Q-01' ? { ...u, station: nearest.name, zone: nearest.zone } : u))
        );
        supabase.from('units').update({ station: nearest.name, zone: nearest.zone }).eq('unit_code', 'Q-01').then();
      });
    }

    const channel = supabase
      .channel(`fleet_units_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, payload => {
        setUnits(prev => {
          const newUnits = [...prev];
          const item = payload.new as any;
          const idx = newUnits.findIndex(u => u.id === item.id);
          if (idx !== -1) newUnits[idx] = { ...newUnits[idx], ...item };
          else newUnits.push(item);
          return newUnits;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUnitId]);

  const selectedUnit = units.find(u => u.id === selectedUnitId) || units[0];

  return (
    <div className="flex h-full w-full p-4 gap-4 overflow-hidden bg-transparent">
      {/* Fleet Roster List (Left Column) */}
      <div className="w-2/5 glass-panel rounded-2xl flex flex-col transition-all duration-300 overflow-hidden shrink-0">
        <div className="p-4 border-b border-panel-border bg-black/40 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3 text-sm font-mono tracking-widest text-foreground/70">
            <Radio size={16} className="text-cyan-400" />
            <span>ROBOTIC FLEET ROSTER</span>
          </div>
          <div className="text-xs font-mono px-2.5 py-0.5 bg-cyan-500/10 text-cyan-300 rounded-full border border-cyan-500/30">
            {units.filter(u => u.status === 'active' || u.status === 'patrolling').length} ACTIVE PATROLS
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {units.map(unit => {
            const isActive = unit.status === 'active' || unit.status === 'patrolling';
            const isSelected = selectedUnit?.id === unit.id;

            return (
              <div
                key={unit.id}
                onClick={() => setSelectedUnitId(unit.id)}
                className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                    : 'border-panel-border hover:border-white/20 glass-panel'
                }`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white">{unit.unit_code}</span>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-white/10 text-foreground/70">
                      {unit.type}
                    </span>
                  </div>

                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                      isActive
                        ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10 font-bold'
                        : unit.status === 'charging'
                        ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                        : 'border-white/10 text-foreground/40 bg-black/40'
                    }`}
                  >
                    {unit.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono mt-2">
                  <span className="text-foreground/70 flex items-center gap-1">
                    <MapPin size={11} className="text-cyan-400" />
                    {unit.station || 'Local Station Sector'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Battery size={13} className={unit.battery_pct < 20 ? 'text-destructive' : 'text-emerald-400'} />
                    <span className="text-foreground/90">{unit.battery_pct || 85}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unit Detail & Live Google Maps Timeline (Right Column) */}
      <div className="flex-1 glass-panel rounded-2xl flex flex-col overflow-hidden">
        {selectedUnit && (
          <UnitDetail
            unit={selectedUnit}
            onClose={() => setSelectedUnitId(null)}
            onStatusChange={newStatus => {
              setUnits(prev => prev.map(u => (u.id === selectedUnit.id ? { ...u, status: newStatus } : u)));
            }}
          />
        )}
      </div>
    </div>
  );
}

function UnitDetail({
  unit,
  onClose,
  onStatusChange,
}: {
  unit: any;
  onClose: () => void;
  onStatusChange?: (newStatus: string) => void;
}) {
  const [failsafeEvents, setFailsafeEvents] = useState<any[]>([]);
  const [isConfirmingEStop, setIsConfirmingEStop] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [detailTab, setDetailTab] = useState<'timeline' | 'vitals'>('timeline');

  useEffect(() => {
    setIsMounted(true);
    if (!unit) return;

    const fetchEvents = async () => {
      const { data } = await supabase
        .from('failsafe_events')
        .select('*')
        .eq('unit_id', unit.id)
        .order('timestamp', { ascending: false })
        .limit(5);
      if (data) setFailsafeEvents(data);
    };
    fetchEvents();

    const channel = supabase
      .channel(`fleet_failsafe_${unit.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'failsafe_events', filter: `unit_id=eq.${unit.id}` },
        payload => {
          setFailsafeEvents(prev => [payload.new, ...prev].slice(0, 5));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [unit?.id]);

  if (!unit) return null;

  const handleManualOverride = async () => {
    const newState = unit.mission_state === 'manual-override' ? 'idle' : 'manual-override';
    await supabase.from('units').update({ mission_state: newState }).eq('id', unit.id);
    await supabase.from('mission_events').insert([
      { unit_id: unit.id, action: `manual-override-${newState === 'manual-override' ? 'engaged' : 'disengaged'}` },
    ]);
  };

  const handleEStop = async () => {
    await supabase
      .from('units')
      .update({ e_stop_triggered: true, e_stop_armed: false, status: 'offline', mission_state: 'idle' })
      .eq('id', unit.id);
    await supabase.from('failsafe_events').insert([{ unit_id: unit.id, event_type: 'e_stop_triggered', resolved: false }]);
    setIsConfirmingEStop(false);
    if (onStatusChange) onStatusChange('offline');
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* E-Stop Confirmation Modal */}
      {isConfirmingEStop && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
          <div className="glass-panel p-6 rounded-2xl border border-destructive max-w-sm w-full text-center">
            <AlertOctagon size={48} className="text-destructive mx-auto mb-4 animate-pulse" />
            <h3 className="text-xl font-bold mb-2 font-mono">ENGAGE EMERGENCY STOP?</h3>
            <p className="text-xs text-foreground/70 mb-6">
              This will cut high-voltage motor power instantly. Unit will halt in place.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setIsConfirmingEStop(false)}
                className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors font-mono text-xs"
              >
                CANCEL
              </button>
              <button
                onClick={handleEStop}
                className="flex-1 py-2 rounded-xl bg-destructive text-white hover:bg-destructive/80 transition-colors font-mono text-xs font-bold"
              >
                CONFIRM E-STOP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Header & Mode Switcher */}
      <div className="p-4 border-b border-panel-border bg-black/40 flex flex-wrap justify-between items-center gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-mono font-bold tracking-tight text-white">{unit.unit_code}</h2>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase ${
                unit.status === 'active' || unit.status === 'patrolling'
                  ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10'
                  : 'border-white/10 text-foreground/50 bg-black/40'
              }`}
            >
              {unit.status}
            </span>
            <span className="text-xs font-mono text-foreground/60">• {unit.station}</span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-black/50 rounded-xl p-0.5 border border-white/10 text-xs font-mono">
            <button
              onClick={() => setDetailTab('timeline')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                detailTab === 'timeline'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                  : 'text-foreground/60 hover:text-white'
              }`}
            >
              <Route size={13} />
              <span>LIVE TIMELINE MAP</span>
            </button>
            <button
              onClick={() => setDetailTab('vitals')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                detailTab === 'vitals'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                  : 'text-foreground/60 hover:text-white'
              }`}
            >
              <Activity size={13} />
              <span>VITALS & TELEMETRY</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {detailTab === 'timeline' ? (
          /* 1. Google Maps Style Live Timeline Map */
          <div className="flex-1 flex flex-col gap-4 min-h-[500px]">
            {/* Embedded Live Moving Quadruped Timeline Map */}
            <div className="flex-1 w-full min-h-[380px] rounded-2xl overflow-hidden border border-panel-border">
              <FleetTimelineMap unitId={unit.id} unitCode={unit.unit_code} />
            </div>

            {/* Quick Robot Power Control Strip */}
            {unit.type === 'quadruped' && (
              <RobotPowerControl unit={unit} onStatusChange={onStatusChange} />
            )}
          </div>
        ) : (
          /* 2. Full Vitals, Sensors & Fail-safe Telemetry */
          <div className="flex flex-col gap-4">
            {/* Robot Power Control */}
            {unit.type === 'quadruped' && (
              <RobotPowerControl unit={unit} onStatusChange={onStatusChange} />
            )}

            {/* Live Sensor Array Telemetry */}
            <LiveSensorPanel unitId={unit.id} unitCode={unit.unit_code} />

            {/* Vitals Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel p-4 rounded-xl flex flex-col gap-2">
                <div className="text-[10px] font-mono tracking-widest text-foreground/50 flex items-center gap-2">
                  <Battery size={12} /> POWER SYSTEM
                </div>
                <div className="text-2xl font-light text-white">{unit.battery_pct || 85}%</div>
                <div className="w-full bg-black rounded-full h-1.5 mt-2">
                  <div
                    className={`h-1.5 rounded-full ${(unit.battery_pct || 85) < 20 ? 'bg-destructive' : 'bg-emerald-400'}`}
                    style={{ width: `${unit.battery_pct || 85}%` }}
                  />
                </div>
              </div>

              <div className="glass-panel p-4 rounded-xl flex flex-col gap-2">
                <div className="text-[10px] font-mono tracking-widest text-foreground/50 flex items-center gap-2">
                  <Cpu size={12} /> SENSOR HEALTH
                </div>
                <div className="text-lg font-mono uppercase text-emerald-400">NOMINAL</div>
                <div className="text-[10px] font-mono text-foreground/40 mt-auto">All spectrometer & LiDAR arrays locked</div>
              </div>
            </div>

            {/* Fail-Safe & Hardware Interlock */}
            <div className={`glass-panel rounded-xl overflow-hidden border ${unit.e_stop_triggered ? 'border-destructive' : 'border-emerald-500/20'}`}>
              <div className="bg-black/40 p-3 border-b border-panel-border flex items-center justify-between">
                <div className={`text-[10px] font-mono tracking-widest flex items-center gap-2 ${unit.e_stop_triggered ? 'text-destructive' : 'text-foreground/70'}`}>
                  <ShieldAlert size={12} /> FAIL-SAFE & HARDWARE INTERLOCK
                </div>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-black/40 rounded-xl border border-panel-border flex flex-col items-center justify-center">
                    <span className="text-[9px] font-mono text-foreground/50 uppercase mb-1">E-STOP</span>
                    <span className={`text-[10px] font-mono font-bold ${unit.e_stop_triggered ? 'text-destructive' : unit.e_stop_armed ? 'text-emerald-400' : 'text-warning'}`}>
                      {unit.e_stop_triggered ? 'TRIGGERED' : unit.e_stop_armed ? 'ARMED' : 'DISARMED'}
                    </span>
                  </div>
                  <div className="p-2 bg-black/40 rounded-xl border border-panel-border flex flex-col items-center justify-center">
                    <span className="text-[9px] font-mono text-foreground/50 uppercase mb-1">WATCHDOG</span>
                    <span className={`text-[10px] font-mono font-bold ${unit.watchdog_status === 'fault' ? 'text-destructive' : 'text-emerald-400'}`}>
                      {unit.watchdog_status?.toUpperCase() || 'NORMAL'}
                    </span>
                  </div>
                  <div className="p-2 bg-black/40 rounded-xl border border-panel-border flex flex-col items-center justify-center">
                    <span className="text-[9px] font-mono text-foreground/50 uppercase mb-1">SAFE FOLD</span>
                    <span className={`text-[10px] font-mono font-bold ${unit.safe_fold_state ? 'text-emerald-400' : 'text-foreground/70'}`}>
                      {unit.safe_fold_state ? 'ENGAGED' : 'READY'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <button
                    onClick={() => setIsConfirmingEStop(true)}
                    disabled={unit.e_stop_triggered}
                    className="w-24 h-24 shrink-0 rounded-2xl bg-destructive/10 border-2 border-destructive flex flex-col items-center justify-center text-destructive hover:bg-destructive hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <AlertOctagon size={28} className="mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold font-mono">E-STOP</span>
                  </button>

                  <div className="flex-1 bg-black/40 rounded-xl border border-panel-border p-2.5 h-24 overflow-y-auto">
                    <div className="text-[9px] font-mono text-foreground/40 uppercase mb-1 sticky top-0 bg-black/80 px-1">
                      FAULT LOG
                    </div>
                    {failsafeEvents.length === 0 ? (
                      <div className="text-[10px] font-mono text-foreground/50 px-1">No faults recorded.</div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {failsafeEvents.map(ev => (
                          <div key={ev.id} className="text-[9px] font-mono flex items-start gap-2 px-1">
                            <span className="text-foreground/40 shrink-0">
                              {isMounted ? new Date(ev.timestamp).toLocaleTimeString() : ''}
                            </span>
                            <span className={ev.resolved ? 'text-emerald-400' : 'text-warning'}>
                              {ev.event_type}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
