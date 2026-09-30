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
      <div className="w-2/5 glass-panel rounded-2xl flex flex-col transition-all duration-300 overflow-hidden shrink-0 border border-slate-200/90 shadow-sm">
        <div className="p-4 border-b border-slate-200 bg-white/60 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3 text-sm font-sans font-bold tracking-tight text-slate-900">
            <Radio size={18} className="text-sky-600" />
            <span>ROBOTIC FLEET ROSTER</span>
          </div>
          <div className="text-xs font-sans font-bold px-2.5 py-0.5 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200">
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
                    ? 'border-sky-500 bg-sky-50/90 shadow-sm'
                    : 'border-slate-200 bg-white/80 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-sm font-bold text-slate-900">{unit.unit_code}</span>
                    <span className="text-[10px] font-sans font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {unit.type}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-sans px-2.5 py-0.5 rounded-full border uppercase font-bold ${
                      isActive
                        ? 'border-emerald-200 text-emerald-800 bg-emerald-50'
                        : unit.status === 'charging'
                        ? 'border-sky-200 text-sky-800 bg-sky-50'
                        : 'border-slate-200 text-slate-600 bg-slate-100'
                    }`}
                  >
                    {unit.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-sans mt-2">
                  <span className="text-slate-600 font-medium flex items-center gap-1">
                    <MapPin size={12} className="text-sky-600" />
                    {unit.station || 'Local Station Sector'}
                  </span>

                  <div className="flex items-center gap-1.5 font-bold">
                    <Battery size={14} className={unit.battery_pct < 20 ? 'text-red-600' : 'text-emerald-600'} />
                    <span className="text-slate-900">{unit.battery_pct || 85}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unit Detail & Live Google Maps Timeline (Right Column) */}
      <div className="flex-1 glass-panel rounded-2xl flex flex-col overflow-hidden border border-slate-200/90 shadow-sm">
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
    <div className="flex flex-col h-full relative overflow-hidden text-slate-900 font-sans">
      {/* E-Stop Confirmation Modal */}
      {isConfirmingEStop && (
        <div className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white p-6 rounded-2xl border border-red-500 max-w-sm w-full text-center shadow-2xl">
            <AlertOctagon size={48} className="text-red-600 mx-auto mb-4 animate-pulse" />
            <h3 className="text-xl font-bold mb-2 font-sans text-slate-900">ENGAGE EMERGENCY STOP?</h3>
            <p className="text-xs text-slate-600 mb-6 font-medium">
              This will cut high-voltage motor power instantly. Unit will halt in place.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setIsConfirmingEStop(false)}
                className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors font-sans text-xs font-bold text-slate-700"
              >
                CANCEL
              </button>
              <button
                onClick={handleEStop}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors font-sans text-xs font-bold shadow-sm"
              >
                CONFIRM E-STOP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Header & Mode Switcher */}
      <div className="p-4 border-b border-slate-200 bg-white/80 flex flex-wrap justify-between items-center gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-sans font-bold tracking-tight text-slate-950">{unit.unit_code}</h2>
            <span
              className={`text-xs font-sans font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                unit.status === 'active' || unit.status === 'patrolling'
                  ? 'border-emerald-200 text-emerald-800 bg-emerald-50'
                  : 'border-slate-200 text-slate-600 bg-slate-100'
              }`}
            >
              {unit.status}
            </span>
            <span className="text-xs font-sans text-slate-600 font-medium">• {unit.station}</span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 text-xs font-sans">
            <button
              onClick={() => setDetailTab('timeline')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 font-bold ${
                detailTab === 'timeline'
                  ? 'bg-white text-sky-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Route size={14} />
              <span>LIVE TIMELINE MAP</span>
            </button>
            <button
              onClick={() => setDetailTab('vitals')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 font-bold ${
                detailTab === 'vitals'
                  ? 'bg-white text-sky-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity size={14} />
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
            <div className="flex-1 w-full min-h-[380px] rounded-2xl overflow-hidden border border-slate-300 shadow-inner">
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
              <div className="glass-panel p-4 rounded-xl flex flex-col gap-2 border border-slate-200/90 shadow-sm">
                <div className="text-xs font-sans font-bold tracking-tight text-slate-600 flex items-center gap-2 uppercase">
                  <Battery size={14} /> POWER SYSTEM
                </div>
                <div className="text-3xl font-sans font-bold text-slate-950">{unit.battery_pct || 85}%</div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full ${(unit.battery_pct || 85) < 20 ? 'bg-red-600' : 'bg-emerald-600'}`}
                    style={{ width: `${unit.battery_pct || 85}%` }}
                  />
                </div>
              </div>

              <div className="glass-panel p-4 rounded-xl flex flex-col gap-2 border border-slate-200/90 shadow-sm">
                <div className="text-xs font-sans font-bold tracking-tight text-slate-600 flex items-center gap-2 uppercase">
                  <Cpu size={14} /> SENSOR HEALTH
                </div>
                <div className="text-xl font-sans font-bold text-emerald-800">NOMINAL</div>
                <div className="text-xs font-sans text-slate-500 font-medium mt-auto">All spectrometer & LiDAR arrays locked</div>
              </div>
            </div>

            {/* Fail-Safe & Hardware Interlock */}
            <div className={`glass-panel rounded-xl overflow-hidden border shadow-sm ${unit.e_stop_triggered ? 'border-red-400 bg-red-50/30' : 'border-slate-200/90'}`}>
              <div className="bg-white/80 p-3 border-b border-slate-200 flex items-center justify-between">
                <div className={`text-xs font-sans font-bold tracking-tight flex items-center gap-2 uppercase ${unit.e_stop_triggered ? 'text-red-700' : 'text-slate-800'}`}>
                  <ShieldAlert size={14} /> FAIL-SAFE & HARDWARE INTERLOCK
                </div>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-sans font-bold text-slate-500 uppercase mb-0.5">E-STOP</span>
                    <span className={`text-xs font-sans font-bold ${unit.e_stop_triggered ? 'text-red-700' : unit.e_stop_armed ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {unit.e_stop_triggered ? 'TRIGGERED' : unit.e_stop_armed ? 'ARMED' : 'DISARMED'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-sans font-bold text-slate-500 uppercase mb-0.5">WATCHDOG</span>
                    <span className={`text-xs font-sans font-bold ${unit.watchdog_status === 'fault' ? 'text-red-700' : 'text-emerald-700'}`}>
                      {unit.watchdog_status?.toUpperCase() || 'NORMAL'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-sans font-bold text-slate-500 uppercase mb-0.5">SAFE FOLD</span>
                    <span className={`text-xs font-sans font-bold ${unit.safe_fold_state ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {unit.safe_fold_state ? 'ENGAGED' : 'READY'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <button
                    onClick={() => setIsConfirmingEStop(true)}
                    disabled={unit.e_stop_triggered}
                    className="w-24 h-24 shrink-0 rounded-2xl bg-red-50 border-2 border-red-500 flex flex-col items-center justify-center text-red-700 hover:bg-red-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm"
                  >
                    <AlertOctagon size={28} className="mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold font-sans">E-STOP</span>
                  </button>

                  <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 p-3 h-24 overflow-y-auto">
                    <div className="text-[10px] font-sans font-bold text-slate-500 uppercase mb-1 sticky top-0 bg-slate-50 px-1">
                      FAULT LOG
                    </div>
                    {failsafeEvents.length === 0 ? (
                      <div className="text-xs font-sans text-slate-500 px-1 font-medium">No faults recorded.</div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {failsafeEvents.map(ev => (
                          <div key={ev.id} className="text-xs font-sans flex items-start gap-2 px-1">
                            <span className="text-slate-500 shrink-0 font-medium">
                              {isMounted ? new Date(ev.timestamp).toLocaleTimeString() : ''}
                            </span>
                            <span className={ev.resolved ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
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
