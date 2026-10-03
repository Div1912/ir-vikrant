'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  Navigation,
  Wind,
  Flame,
  Pill,
  Sparkles,
  Activity,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Target,
  Radio,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  Maximize2,
  Shield,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DirectionalPlumeTelemetry {
  front_mq2?: number;  // backward compat
  right_mq3?: number;  // backward compat
  rear_mq5?: number;   // backward compat
  left_mq135?: number; // backward compat
  front_mq3?: number;  // accurate hardware: Front = MQ-3
  right_mq2?: number;  // accurate hardware: Right = MQ-2
  rear_mq135?: number; // accurate hardware: Rear = MQ-135
  left_mq5?: number;   // accurate hardware: Left = MQ-5
  delta_front: number; // relative % spike FRONT (MQ-3)
  delta_right: number; // relative % spike RIGHT (MQ-2)
  delta_rear: number;  // relative % spike REAR (MQ-135)
  delta_left: number;  // relative % spike LEFT (MQ-5)
  bearing_deg: number; // -180 to +180
  magnitude: number;   // 0 to 200+
  action: 'IDLE' | 'FORWARD' | 'TURN_RIGHT' | 'TURN_LEFT' | 'TURN_REVERSE' | 'OBSTACLE_HOLD';
  distance_cm?: number;
  highest_dir?: 'FRONT' | 'RIGHT' | 'REAR' | 'LEFT' | 'CALM';
  highest_sensor?: string;
  highest_gas?: string;
  highest_delta?: number;
}

interface DirectionalOdorRadarProps {
  telemetry?: DirectionalPlumeTelemetry | null;
  onSimulateAction?: (sim: DirectionalPlumeTelemetry) => void;
  className?: string;
}

export default function DirectionalOdorRadar({
  telemetry: externalTelemetry,
  onSimulateAction,
  className = '',
}: DirectionalOdorRadarProps) {
  // Local telemetry state if running internal demo/mock or synced with serial
  const [telemetry, setTelemetry] = useState<DirectionalPlumeTelemetry>({
    front_mq3: 26,
    right_mq2: 41,
    rear_mq135: 49,
    left_mq5: 496,
    front_mq2: 41,
    right_mq3: 26,
    rear_mq5: 496,
    left_mq135: 49,
    delta_front: 0.8,
    delta_right: 1.0,
    delta_rear: 0.8,
    delta_left: 0.1,
    bearing_deg: 0,
    magnitude: 1.2,
    action: 'IDLE',
    distance_cm: 125,
  });

  const [activeSimulationMode, setActiveSimulationMode] = useState<string | null>(null);

  // Sync external telemetry if provided
  useEffect(() => {
    if (externalTelemetry) {
      setTelemetry(externalTelemetry);
    }
  }, [externalTelemetry]);

  // Listen to global window event for cross-component directional telemetry updates
  useEffect(() => {
    const handlePlumeEvent = (e: any) => {
      if (e.detail) {
        setTelemetry(prev => ({ ...prev, ...e.detail }));
      }
    };
    window.addEventListener('vikrant:directional_plume', handlePlumeEvent);
    return () => window.removeEventListener('vikrant:directional_plume', handlePlumeEvent);
  }, []);

  // Compute 4 Quadrants & Identify Highest Gas Direction
  const quadrantSensors = useMemo(() => {
    const dFront = Number(telemetry.delta_front ?? 0);
    const dRight = Number(telemetry.delta_right ?? 0);
    const dRear  = Number(telemetry.delta_rear ?? 0);
    const dLeft  = Number(telemetry.delta_left ?? 0);

    const rawFront = telemetry.front_mq3 ?? telemetry.right_mq3 ?? 26;
    const rawRight = telemetry.right_mq2 ?? telemetry.front_mq2 ?? 41;
    const rawRear  = telemetry.rear_mq135 ?? telemetry.left_mq135 ?? 49;
    const rawLeft  = telemetry.left_mq5 ?? telemetry.rear_mq5 ?? 496;

    return [
      {
        dir: 'FRONT' as const,
        label: 'FRONT',
        angle: 0,
        sensor: 'MQ-3',
        substance: 'Alcohol / Narcotics / Solvent Vapors',
        delta: dFront,
        raw: rawFront,
        pin: 'A0',
        color: 'rose',
        glowColor: '#f43f5e',
        badgeBg: 'bg-rose-500',
        textColor: 'text-rose-400',
      },
      {
        dir: 'RIGHT' as const,
        label: 'RIGHT',
        angle: 90,
        sensor: 'MQ-2',
        substance: 'Combustible Gas / LPG / Smoke',
        delta: dRight,
        raw: rawRight,
        pin: 'A1',
        color: 'sky',
        glowColor: '#0ea5e9',
        badgeBg: 'bg-sky-500',
        textColor: 'text-sky-400',
      },
      {
        dir: 'REAR' as const,
        label: 'REAR',
        angle: 180,
        sensor: 'MQ-135',
        substance: 'Air Quality / Toxic Precursors / NH₃',
        delta: dRear,
        raw: rawRear,
        pin: 'A2',
        color: 'teal',
        glowColor: '#14b8a6',
        badgeBg: 'bg-teal-500',
        textColor: 'text-teal-400',
      },
      {
        dir: 'LEFT' as const,
        label: 'LEFT',
        angle: -90,
        sensor: 'MQ-5',
        substance: 'Natural Gas / Methane / LPG',
        delta: dLeft,
        raw: rawLeft,
        pin: 'A3',
        color: 'amber',
        glowColor: '#f59e0b',
        badgeBg: 'bg-amber-500',
        textColor: 'text-amber-400',
      },
    ];
  }, [telemetry]);

  // Determine dominant sensor with highest delta
  const dominant = useMemo(() => {
    return quadrantSensors.reduce((max, cur) => (cur.delta > max.delta ? cur : max), quadrantSensors[0]);
  }, [quadrantSensors]);

  // Is an active plume detected?
  const isPlumeActive = dominant.delta >= 8.0 || telemetry.magnitude >= 12.0;

  // Preset Simulated Plume Scenarios
  const triggerSimulation = (direction: 'front' | 'right' | 'rear' | 'left' | 'clean') => {
    setActiveSimulationMode(direction);
    let sim: DirectionalPlumeTelemetry;

    if (direction === 'front') {
      sim = {
        front_mq3: 145,
        right_mq2: 42,
        rear_mq135: 49,
        left_mq5: 497,
        front_mq2: 42,
        right_mq3: 145,
        rear_mq5: 497,
        left_mq135: 49,
        delta_front: 182.0,
        delta_right: 3.5,
        delta_rear: 1.0,
        delta_left: 0.2,
        bearing_deg: 0.0,
        magnitude: 181.0,
        action: 'FORWARD',
        distance_cm: 85.0,
        highest_dir: 'FRONT',
        highest_sensor: 'MQ-3',
        highest_gas: 'Alcohol / Narcotics / Solvent Vapors',
        highest_delta: 182.0,
      };
    } else if (direction === 'right') {
      sim = {
        front_mq3: 28,
        right_mq2: 240,
        rear_mq135: 50,
        left_mq5: 496,
        front_mq2: 240,
        right_mq3: 28,
        rear_mq5: 496,
        left_mq135: 50,
        delta_front: 4.2,
        delta_right: 175.4,
        delta_rear: 2.1,
        delta_left: 0.5,
        bearing_deg: 90.0,
        magnitude: 174.0,
        action: 'TURN_RIGHT',
        distance_cm: 110.0,
        highest_dir: 'RIGHT',
        highest_sensor: 'MQ-2',
        highest_gas: 'Combustible Gas / LPG / Smoke',
        highest_delta: 175.4,
      };
    } else if (direction === 'rear') {
      sim = {
        front_mq3: 26,
        right_mq2: 41,
        rear_mq135: 220,
        left_mq5: 498,
        front_mq2: 41,
        right_mq3: 26,
        rear_mq5: 498,
        left_mq135: 220,
        delta_front: 1.5,
        delta_right: 2.0,
        delta_rear: 168.0,
        delta_left: 0.8,
        bearing_deg: 180.0,
        magnitude: 166.5,
        action: 'TURN_REVERSE',
        distance_cm: 130.0,
        highest_dir: 'REAR',
        highest_sensor: 'MQ-135',
        highest_gas: 'Air Quality / Toxic Precursors / NH₃',
        highest_delta: 168.0,
      };
    } else if (direction === 'left') {
      sim = {
        front_mq3: 27,
        right_mq2: 42,
        rear_mq135: 50,
        left_mq5: 980,
        front_mq2: 42,
        right_mq3: 27,
        rear_mq5: 980,
        left_mq135: 50,
        delta_front: 2.0,
        delta_right: 3.0,
        delta_rear: 1.2,
        delta_left: 97.7,
        bearing_deg: -90.0,
        magnitude: 96.5,
        action: 'TURN_LEFT',
        distance_cm: 105.0,
        highest_dir: 'LEFT',
        highest_sensor: 'MQ-5',
        highest_gas: 'Natural Gas / Methane / LPG',
        highest_delta: 97.7,
      };
    } else {
      sim = {
        front_mq3: 26,
        right_mq2: 41,
        rear_mq135: 49,
        left_mq5: 496,
        front_mq2: 41,
        right_mq3: 26,
        rear_mq5: 496,
        left_mq135: 49,
        delta_front: 0.8,
        delta_right: 1.0,
        delta_rear: 0.8,
        delta_left: 0.1,
        bearing_deg: 0,
        magnitude: 1.2,
        action: 'IDLE',
        distance_cm: 125.0,
        highest_dir: 'CALM',
        highest_sensor: 'NONE',
        highest_gas: 'CLEAN AIR',
        highest_delta: 0.0,
      };
    }

    setTelemetry(sim);
    if (onSimulateAction) onSimulateAction(sim);
    window.dispatchEvent(new CustomEvent('vikrant:directional_plume', { detail: sim }));
  };

  const arrowAngle = telemetry.bearing_deg;

  return (
    <div className={`glass-panel rounded-3xl p-5 sm:p-6 border border-white/80 shadow-md flex flex-col gap-4 font-sans ${className}`}>
      {/* 1. Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/60 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-sky-500/15 border border-sky-300 text-sky-700 shadow-xs">
            <Radio size={20} className={isPlumeActive ? 'animate-pulse text-rose-600' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-sans text-sm font-black text-slate-900 tracking-tight uppercase">
                360° Chemical Odor Radar • Rectangular Chemotaxis HUD
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-all ${
                isPlumeActive
                  ? 'bg-rose-500/20 text-rose-900 border-rose-400 animate-pulse shadow-xs'
                  : 'bg-emerald-500/15 text-emerald-800 border-emerald-300'
              }`}>
                {isPlumeActive ? '⚡ ACTIVE PLUME TRACKED' : 'CALM AMBIENT AIR'}
              </span>
            </div>
            <p className="text-[11px] font-sans text-slate-600 font-medium">
              Wide-angle autonomous quadruped gradient navigation (MQ-3 Front, MQ-2 Right, MQ-135 Rear, MQ-5 Left)
            </p>
          </div>
        </div>

        {/* Quadruped Motion Action Status Pill */}
        <div className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 font-mono text-xs font-bold shadow-xs ${
          telemetry.action === 'FORWARD' ? 'bg-emerald-500/20 text-emerald-950 border-emerald-400' :
          telemetry.action === 'TURN_RIGHT' ? 'bg-sky-500/20 text-sky-950 border-sky-400' :
          telemetry.action === 'TURN_LEFT' ? 'bg-purple-500/20 text-purple-950 border-purple-400' :
          telemetry.action === 'TURN_REVERSE' ? 'bg-rose-500/20 text-rose-950 border-rose-400' :
          telemetry.action === 'OBSTACLE_HOLD' ? 'bg-amber-500/20 text-amber-950 border-amber-400 animate-pulse' :
          'bg-slate-100 text-slate-700 border-slate-300'
        }`}>
          <Navigation size={14} className={isPlumeActive ? 'animate-bounce text-sky-600' : 'text-slate-500'} />
          <span>ROBOT: {telemetry.action.replace('_', ' ')}</span>
          {isPlumeActive && (
            <span className="text-[10px] font-mono text-sky-800">
              ({telemetry.bearing_deg >= 0 ? `+${telemetry.bearing_deg.toFixed(0)}°` : `${telemetry.bearing_deg.toFixed(0)}°`})
            </span>
          )}
        </div>
      </div>

      {/* 2. DEDICATED HIGH GAS DIRECTION ALERT BANNER */}
      <AnimatePresence mode="wait">
        {isPlumeActive ? (
          <motion.div
            key="active-plume-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-rose-500/15 via-amber-500/15 to-rose-500/15 border-2 border-rose-500/70 shadow-md flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-md animate-pulse shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-mono text-[10px] font-black uppercase tracking-wider">
                    PRIMARY ODOR SOURCE DETECTED
                  </span>
                  <span className="text-rose-950 font-black text-sm uppercase tracking-wide flex items-center gap-1.5">
                    DIRECTION: <span className="underline decoration-rose-500 font-extrabold text-rose-700">{dominant.label}</span>
                    <span className="text-xs text-rose-700">
                      ({dominant.angle >= 0 ? `+${dominant.angle}°` : `${dominant.angle}°`})
                    </span>
                  </span>
                </div>
                <p className="text-xs font-semibold text-rose-900 mt-0.5">
                  Dominant Sensor: <strong className="text-rose-950">{dominant.sensor}</strong> ({dominant.substance}) • Peak Surge:{' '}
                  <strong className="font-mono text-rose-700">+{dominant.delta.toFixed(1)}% ΔS</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-mono text-rose-800 font-bold uppercase tracking-wide">
                  AUTONOMOUS STEERING
                </span>
                <span className="px-3 py-1 rounded-xl bg-slate-900 text-rose-300 font-mono font-black text-xs shadow-inner flex items-center gap-1.5">
                  <Navigation size={12} className="text-rose-400" />
                  {telemetry.action.replace('_', ' ')}
                </span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="calm-ambient-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/50 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 text-emerald-950 font-bold">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>AMBIENT CLEAN AIR • ALL 4 SENSORS BALANCED BELOW THRESHOLD (NO GAS PLUME)</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-emerald-800 font-semibold">
              <span>SPIKE THRESHOLD: +10% BASELINE</span>
              <span>•</span>
              <span>FRONT US: {telemetry.distance_cm !== undefined ? `${telemetry.distance_cm.toFixed(0)} cm` : 'CLEAR'}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. RECTANGULAR RADAR DISPLAY (FILLS CARD COMPLETELY, NO CIRCLE!) */}
      <div
        className={`relative w-full h-[360px] sm:h-[420px] md:h-[450px] rounded-3xl bg-slate-950 border-2 overflow-hidden shadow-2xl transition-all duration-500 flex items-center justify-center ${
          isPlumeActive && dominant.dir === 'FRONT'
            ? 'border-t-4 border-t-rose-500 shadow-[0_-8px_30px_rgba(244,63,94,0.35)] border-slate-800'
            : isPlumeActive && dominant.dir === 'RIGHT'
            ? 'border-r-4 border-r-sky-500 shadow-[8px_0_30px_rgba(14,165,233,0.35)] border-slate-800'
            : isPlumeActive && dominant.dir === 'REAR'
            ? 'border-b-4 border-b-teal-500 shadow-[0_8px_30px_rgba(20,184,166,0.35)] border-slate-800'
            : isPlumeActive && dominant.dir === 'LEFT'
            ? 'border-l-4 border-l-amber-500 shadow-[-8px_0_30px_rgba(245,158,11,0.35)] border-slate-800'
            : 'border-slate-800'
        }`}
      >
        {/* Background Cartesian Tactical Grid (Rectangular HUD Pattern) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(56, 189, 248, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.15) 1px, transparent 1px)`,
            backgroundSize: '36px 36px',
          }}
        />

        {/* Concentric Distance & Gradient Rings (Aviation / Marine Radar style) */}
        <div className="absolute w-[200px] h-[200px] rounded-full border border-sky-500/20 border-dashed pointer-events-none" />
        <div className="absolute w-[320px] h-[320px] rounded-full border border-sky-500/25 pointer-events-none" />
        <div className="absolute w-[440px] h-[440px] rounded-full border border-sky-500/20 border-dashed pointer-events-none" />
        <div className="absolute w-[580px] h-[580px] rounded-full border border-sky-500/15 pointer-events-none" />

        {/* Axial Crosshairs */}
        <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-sky-500/40 -translate-x-1/2 pointer-events-none" />
        <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-sky-500/40 -translate-y-1/2 pointer-events-none" />
        <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-sky-500/15 -translate-x-1/2 rotate-45 pointer-events-none" />
        <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-sky-500/15 -translate-x-1/2 -rotate-45 pointer-events-none" />

        {/* 360° Radar Sweep Line (Sweeping across the rectangular canvas) */}
        <div className="absolute inset-0 pointer-events-none bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(56,189,248,0.20)_360deg)] animate-[spin_4s_linear_infinite]" />

        {/* Dynamic Edge Plume Glow (Illuminates the active rectangular perimeter side) */}
        {isPlumeActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.6, 0.9, 0.6] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className={`absolute pointer-events-none blur-2xl ${
              dominant.dir === 'FRONT'
                ? 'top-0 left-0 right-0 h-32 bg-rose-500/40'
                : dominant.dir === 'RIGHT'
                ? 'top-0 bottom-0 right-0 w-36 bg-sky-500/40'
                : dominant.dir === 'REAR'
                ? 'bottom-0 left-0 right-0 h-32 bg-teal-500/40'
                : 'top-0 bottom-0 left-0 w-36 bg-amber-500/40'
            }`}
          />
        )}

        {/* Rotating Vector Compass Needle */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-500 ease-out z-10"
          style={{ transform: `rotate(${arrowAngle}deg)` }}
        >
          <div className="relative flex flex-col items-center">
            {/* Arrow Head */}
            <div
              className={`w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent ${
                isPlumeActive
                  ? 'border-b-[48px] drop-shadow-[0_0_18px_currentColor]'
                  : 'border-b-[36px] border-b-sky-400 drop-shadow-[0_0_10px_#38bdf8]'
              }`}
              style={isPlumeActive ? { borderBottomColor: dominant.glowColor, color: dominant.glowColor } : {}}
            />
            {/* Arrow Shaft */}
            <div
              className="w-2.5 h-24 rounded-full transition-colors shadow-lg"
              style={{ backgroundColor: isPlumeActive ? dominant.glowColor : 'rgba(56, 189, 248, 0.85)' }}
            />
            {/* Tail Counterweight */}
            <div className="w-4 h-4 rounded-full bg-slate-200 mt-1 shadow-md" />
          </div>
        </div>

        {/* Center Robot Chassis Hub */}
        <div className="relative z-20 w-12 h-12 rounded-2xl bg-slate-900 border-2 border-white/90 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.8)]">
          <span className="text-[8px] font-mono font-black text-sky-400 tracking-tighter">ROBOT</span>
          <span
            className={`w-3 h-3 rounded-full mt-0.5 ${isPlumeActive ? 'animate-ping' : ''}`}
            style={{ backgroundColor: isPlumeActive ? dominant.glowColor : '#38bdf8' }}
          />
        </div>

        {/* ---------------------------------------------------- */}
        {/* FOUR EDGE DOCKED SENSOR BADGES (NO CIRCLE, NO OVERLAP) */}
        {/* ---------------------------------------------------- */}

        {/* 1. TOP EDGE DOCK: FRONT (MQ-3 + US 0°) */}
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-xl border backdrop-blur-md transition-all shadow-lg flex items-center gap-2 font-mono text-xs font-bold ${
            dominant.dir === 'FRONT' && isPlumeActive
              ? 'bg-rose-600 text-white border-rose-300 ring-4 ring-rose-500/40 scale-105 animate-pulse'
              : 'bg-slate-900/90 text-rose-300 border-rose-500/40 hover:border-rose-400'
          }`}
        >
          <ArrowUp size={14} className={dominant.dir === 'FRONT' && isPlumeActive ? 'text-white animate-bounce' : 'text-rose-400'} />
          <span>▲ FRONT (0°): MQ-3</span>
          <span className="px-1.5 py-0.2 rounded bg-black/40 text-[11px]">
            {telemetry.delta_front > 0 ? `+${telemetry.delta_front.toFixed(1)}%` : '0%'}
          </span>
          <span className="text-[10px] text-slate-300 font-normal">Alcohol/Narcotics</span>
        </div>

        {/* 2. RIGHT EDGE DOCK: RIGHT (MQ-2 +90°) */}
        <div
          className={`absolute right-3 top-1/2 -translate-y-1/2 z-20 px-3.5 py-1.5 rounded-xl border backdrop-blur-md transition-all shadow-lg flex flex-col items-end font-mono text-xs font-bold ${
            dominant.dir === 'RIGHT' && isPlumeActive
              ? 'bg-sky-600 text-white border-sky-300 ring-4 ring-sky-500/40 scale-105 animate-pulse'
              : 'bg-slate-900/90 text-sky-300 border-sky-500/40 hover:border-sky-400'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span>RIGHT (+90°): MQ-2</span>
            <ArrowRight size={14} className={dominant.dir === 'RIGHT' && isPlumeActive ? 'text-white animate-bounce' : 'text-sky-400'} />
          </div>
          <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
            <span className="text-slate-300 font-normal">Combustible/LPG</span>
            <span className="px-1.5 py-0.2 rounded bg-black/40 font-bold">
              {telemetry.delta_right > 0 ? `+${telemetry.delta_right.toFixed(1)}%` : '0%'}
            </span>
          </div>
        </div>

        {/* 3. BOTTOM EDGE DOCK: REAR (MQ-135 180°) */}
        <div
          className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-xl border backdrop-blur-md transition-all shadow-lg flex items-center gap-2 font-mono text-xs font-bold ${
            dominant.dir === 'REAR' && isPlumeActive
              ? 'bg-teal-600 text-white border-teal-300 ring-4 ring-teal-500/40 scale-105 animate-pulse'
              : 'bg-slate-900/90 text-teal-300 border-teal-500/40 hover:border-teal-400'
          }`}
        >
          <ArrowDown size={14} className={dominant.dir === 'REAR' && isPlumeActive ? 'text-white animate-bounce' : 'text-teal-400'} />
          <span>▼ REAR (180°): MQ-135</span>
          <span className="px-1.5 py-0.2 rounded bg-black/40 text-[11px]">
            {telemetry.delta_rear > 0 ? `+${telemetry.delta_rear.toFixed(1)}%` : '0%'}
          </span>
          <span className="text-[10px] text-slate-300 font-normal">Precursors/NH₃</span>
        </div>

        {/* 4. LEFT EDGE DOCK: LEFT (MQ-5 -90°) */}
        <div
          className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 px-3.5 py-1.5 rounded-xl border backdrop-blur-md transition-all shadow-lg flex flex-col items-start font-mono text-xs font-bold ${
            dominant.dir === 'LEFT' && isPlumeActive
              ? 'bg-amber-600 text-white border-amber-300 ring-4 ring-amber-500/40 scale-105 animate-pulse'
              : 'bg-slate-900/90 text-amber-300 border-amber-500/40 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <ArrowLeft size={14} className={dominant.dir === 'LEFT' && isPlumeActive ? 'text-white animate-bounce' : 'text-amber-400'} />
            <span>LEFT (-90°): MQ-5</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-black/40 font-bold">
              {telemetry.delta_left > 0 ? `+${telemetry.delta_left.toFixed(1)}%` : '0%'}
            </span>
            <span className="text-slate-300 font-normal">Methane/Natural Gas</span>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* FOUR CORNER HUD OVERLAYS (FLUID TACTICAL TELEMETRY) */}
        {/* ---------------------------------------------------- */}

        {/* Top-Left Corner HUD: Bearing & Plume Gradient */}
        <div className="absolute top-3 left-3 z-10 hidden sm:flex flex-col gap-0.5 bg-slate-900/80 p-2.5 rounded-xl border border-sky-500/30 font-mono text-[10px] text-slate-300 shadow-md">
          <span className="text-sky-400 font-bold tracking-wider">ODOR VECTOR</span>
          <span>
            BEARING: <strong className="text-white text-xs">{telemetry.bearing_deg.toFixed(1)}°</strong>
          </span>
          <span>
            GRADIENT:{' '}
            <strong className={isPlumeActive ? 'text-rose-400 text-xs' : 'text-slate-200'}>
              +{telemetry.magnitude.toFixed(1)}% ΔS
            </strong>
          </span>
        </div>

        {/* Top-Right Corner HUD: Ultrasonic Front Range */}
        <div className="absolute top-3 right-3 z-10 hidden sm:flex flex-col gap-0.5 bg-slate-900/80 p-2.5 rounded-xl border border-sky-500/30 font-mono text-[10px] text-slate-300 shadow-md items-end">
          <span className="text-sky-400 font-bold tracking-wider">FRONT ULTRASONIC</span>
          <span>
            DISTANCE:{' '}
            <strong className="text-white text-xs">
              {telemetry.distance_cm !== undefined ? `${telemetry.distance_cm.toFixed(1)} cm` : 'CLEAR'}
            </strong>
          </span>
          <span>
            STATUS:{' '}
            <strong
              className={
                telemetry.distance_cm && telemetry.distance_cm < 30 ? 'text-rose-400 font-bold animate-pulse' : 'text-emerald-400'
              }
            >
              {telemetry.distance_cm && telemetry.distance_cm < 30 ? 'OBSTACLE DETECTED' : 'CLEAR PATH'}
            </strong>
          </span>
        </div>

        {/* Bottom-Left Corner HUD: Dominant Sensor Status */}
        <div className="absolute bottom-3 left-3 z-10 hidden sm:flex flex-col gap-0.5 bg-slate-900/80 p-2.5 rounded-xl border border-sky-500/30 font-mono text-[10px] text-slate-300 shadow-md">
          <span className="text-sky-400 font-bold tracking-wider">DOMINANT SOURCE</span>
          <span>
            SENSOR: <strong className="text-white text-xs">{isPlumeActive ? dominant.sensor : 'BALANCED'}</strong>
          </span>
          <span>
            DIRECTION: <strong className={isPlumeActive ? 'text-rose-400 font-bold' : 'text-slate-300'}>{isPlumeActive ? dominant.label : 'CALM'}</strong>
          </span>
        </div>

        {/* Bottom-Right Corner HUD: Quadruped Locomotion Action */}
        <div className="absolute bottom-3 right-3 z-10 hidden sm:flex flex-col gap-0.5 bg-slate-900/80 p-2.5 rounded-xl border border-sky-500/30 font-mono text-[10px] text-slate-300 shadow-md items-end">
          <span className="text-sky-400 font-bold tracking-wider">STEERING COMMAND</span>
          <span className="text-xs font-black text-rose-300 tracking-wider">
            {telemetry.action.replace('_', ' ')}
          </span>
          <span className="text-[9px] text-slate-400">AUTONOMOUS PURSUIT</span>
        </div>
      </div>

      {/* 4. FOUR SENSOR TELEMETRY CARDS GRID (FULL-WIDTH RECTANGULAR LAYOUT) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
        {quadrantSensors.map(sensor => {
          const isHighest = isPlumeActive && dominant.dir === sensor.dir;
          return (
            <div
              key={sensor.dir}
              className={`p-3.5 rounded-2xl transition-all shadow-xs flex flex-col gap-2 ${
                isHighest
                  ? 'bg-rose-50/90 border-2 border-rose-400 shadow-md ring-2 ring-rose-300/40'
                  : 'bg-white/60 border border-white/90 hover:border-slate-300'
              }`}
            >
              <div className="flex justify-between items-center text-xs font-sans">
                <div className="flex items-center gap-2">
                  {sensor.dir === 'FRONT' && <Pill size={15} className="text-rose-600" />}
                  {sensor.dir === 'RIGHT' && <Flame size={15} className="text-sky-600" />}
                  {sensor.dir === 'REAR' && <Wind size={15} className="text-teal-600" />}
                  {sensor.dir === 'LEFT' && <Activity size={15} className="text-amber-600" />}
                  <span className="font-black text-slate-900">
                    {sensor.label} ({sensor.sensor})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  {isHighest && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-600 text-white animate-pulse">
                      ★ HIGH
                    </span>
                  )}
                  <span className={`font-bold text-xs ${isHighest ? 'text-rose-700' : 'text-slate-700'}`}>
                    +{sensor.delta.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    sensor.dir === 'FRONT' ? 'bg-rose-600' :
                    sensor.dir === 'RIGHT' ? 'bg-sky-600' :
                    sensor.dir === 'REAR' ? 'bg-teal-600' : 'bg-amber-600'
                  }`}
                  style={{ width: `${Math.min(100, (sensor.delta / 150) * 100)}%` }}
                />
              </div>

              <div className="flex flex-col gap-0.5 text-[10px] text-slate-600 font-sans">
                <span className="font-medium truncate">{sensor.substance}</span>
                <div className="flex justify-between font-mono text-slate-500 pt-0.5">
                  <span>RAW: {sensor.raw} (PIN {sensor.pin})</span>
                  <span>HEADING: {sensor.angle >= 0 ? `+${sensor.angle}°` : `${sensor.angle}°`}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. DEMO PLUME INJECTOR ROW */}
      <div className="pt-3 border-t border-white/60 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 text-xs font-sans text-slate-700 font-semibold">
          <Sparkles size={14} className="text-amber-600" />
          <span>DEMO PLUME INJECTOR:</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => triggerSimulation('front')}
            className={`px-3 py-1 rounded-xl text-xs font-sans font-bold border transition-all active:scale-95 shadow-xs flex items-center gap-1 ${
              activeSimulationMode === 'front'
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-white/80 hover:bg-white text-slate-900 border-slate-300'
            }`}
            title="Simulate narcotics/alcohol vapor approaching directly from FRONT (MQ-3)"
          >
            <span>☝️</span>
            <span>FRONT (MQ-3 NARCOTICS)</span>
          </button>

          <button
            onClick={() => triggerSimulation('right')}
            className={`px-3 py-1 rounded-xl text-xs font-sans font-bold border transition-all active:scale-95 shadow-xs flex items-center gap-1 ${
              activeSimulationMode === 'right'
                ? 'bg-sky-600 text-white border-sky-700'
                : 'bg-white/80 hover:bg-white text-slate-900 border-slate-300'
            }`}
            title="Simulate combustible gas/smoke approaching from RIGHT (MQ-2)"
          >
            <span>👉</span>
            <span>RIGHT (MQ-2 SMOKE/LPG)</span>
          </button>

          <button
            onClick={() => triggerSimulation('rear')}
            className={`px-3 py-1 rounded-xl text-xs font-sans font-bold border transition-all active:scale-95 shadow-xs flex items-center gap-1 ${
              activeSimulationMode === 'rear'
                ? 'bg-teal-600 text-white border-teal-700'
                : 'bg-white/80 hover:bg-white text-slate-900 border-slate-300'
            }`}
            title="Simulate toxic precursor vapor behind robot in REAR (MQ-135)"
          >
            <span>👇</span>
            <span>REAR (MQ-135 TOXIC/NH3)</span>
          </button>

          <button
            onClick={() => triggerSimulation('left')}
            className={`px-3 py-1 rounded-xl text-xs font-sans font-bold border transition-all active:scale-95 shadow-xs flex items-center gap-1 ${
              activeSimulationMode === 'left'
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-white/80 hover:bg-white text-slate-900 border-slate-300'
            }`}
            title="Simulate natural gas/methane approaching from LEFT (MQ-5)"
          >
            <span>👈</span>
            <span>LEFT (MQ-5 METHANE)</span>
          </button>

          <button
            onClick={() => triggerSimulation('clean')}
            className="p-1.5 px-3 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 text-xs font-sans font-bold flex items-center gap-1 border border-slate-300"
            title="Reset to clean ambient air"
          >
            <RotateCcw size={12} />
            <span>RESET</span>
          </button>
        </div>
      </div>
    </div>
  );
}
