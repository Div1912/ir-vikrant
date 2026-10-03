'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  Navigation,
  Wind,
  ShieldAlert,
  Flame,
  Pill,
  Sparkles,
  Zap,
  Activity,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
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

  // Preset Simulated Plume Scenarios
  const triggerSimulation = (direction: 'right' | 'left' | 'front' | 'rear' | 'clean') => {
    setActiveSimulationMode(direction);
    let sim: DirectionalPlumeTelemetry;

    if (direction === 'front') {
      // High Narcotics / Solvent vapor spike directly in FRONT (MQ-3) + Front Ultrasonic
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
        bearing_deg: 1.5,
        magnitude: 181.0,
        action: 'FORWARD',
        distance_cm: 85.0,
      };
    } else if (direction === 'right') {
      // High Combustible Gas / Smoke spike on RIGHT (MQ-2)
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
        bearing_deg: 88.5,
        magnitude: 174.0,
        action: 'TURN_RIGHT',
        distance_cm: 110.0,
      };
    } else if (direction === 'rear') {
      // Chemical Precursor / Toxic Vapor trace behind robot in REAR (MQ-135)
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
        bearing_deg: 178.5,
        magnitude: 166.5,
        action: 'TURN_REVERSE',
        distance_cm: 130.0,
      };
    } else if (direction === 'left') {
      // Natural Gas / Methane / LPG spike on LEFT (MQ-5)
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
        bearing_deg: -88.0,
        magnitude: 96.5,
        action: 'TURN_LEFT',
        distance_cm: 105.0,
      };
    } else {
      // Clean Ambient Air
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
      };
    }

    setTelemetry(sim);
    if (onSimulateAction) onSimulateAction(sim);
    window.dispatchEvent(new CustomEvent('vikrant:directional_plume', { detail: sim }));
  };

  const isPlumeActive = telemetry.magnitude >= 25.0;

  // Determine compass rotation angle
  const arrowAngle = telemetry.bearing_deg;

  return (
    <div className={`glass-panel rounded-3xl p-5 border border-white/80 shadow-md flex flex-col gap-4 font-sans ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-2xl bg-sky-500/15 border border-sky-300 text-sky-700 shadow-xs">
            <Compass size={18} className={isPlumeActive ? 'animate-spin' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-sans text-xs font-bold text-slate-900 tracking-tight uppercase">
                360° CHEMICAL ODOR RADAR • CHEMOTAXIS COMPASS
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${
                isPlumeActive ? 'bg-red-500/15 text-red-800 border-red-300 animate-pulse' : 'bg-emerald-500/15 text-emerald-800 border-emerald-300'
              }`}>
                {isPlumeActive ? 'PLUME LOCK ENGAGED' : 'CALM AMBIENT AIR'}
              </span>
            </div>
            <p className="text-[11px] font-sans text-slate-600 font-medium">
              Autonomous quadruped gradient navigation across 4 orthogonal MQ sensors
            </p>
          </div>
        </div>

        {/* Quadruped Motion Action Status Pill */}
        <div className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 font-mono text-xs font-bold shadow-xs ${
          telemetry.action === 'FORWARD' ? 'bg-emerald-500/20 text-emerald-900 border-emerald-400' :
          telemetry.action === 'TURN_RIGHT' ? 'bg-sky-500/20 text-sky-950 border-sky-400' :
          telemetry.action === 'TURN_LEFT' ? 'bg-purple-500/20 text-purple-950 border-purple-400' :
          telemetry.action === 'TURN_REVERSE' ? 'bg-rose-500/20 text-rose-950 border-rose-400' :
          telemetry.action === 'OBSTACLE_HOLD' ? 'bg-amber-500/20 text-amber-950 border-amber-400 animate-pulse' :
          'bg-slate-100 text-slate-700 border-slate-300'
        }`}>
          <Navigation size={13} className={isPlumeActive ? 'animate-bounce text-sky-600' : 'text-slate-500'} />
          <span>ROBOT: {telemetry.action.replace('_', ' ')}</span>
          {isPlumeActive && <span className="text-[10px] text-sky-700">({telemetry.bearing_deg > 0 ? `+${telemetry.bearing_deg.toFixed(0)}°` : `${telemetry.bearing_deg.toFixed(0)}°`})</span>}
        </div>
      </div>

      {/* Main Radar & 4-Quadrant Display Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Left Column: Interactive Circular Radar Dial (7 Cols) */}
        <div className="md:col-span-7 flex flex-col items-center justify-center p-3 relative">
          <div className="relative w-64 h-64 rounded-full border-2 border-slate-300/80 bg-slate-900/90 shadow-xl flex items-center justify-center overflow-hidden">
            {/* Concentric distance rings */}
            <div className="absolute inset-4 rounded-full border border-sky-500/20 border-dashed" />
            <div className="absolute inset-12 rounded-full border border-sky-500/30" />
            <div className="absolute inset-20 rounded-full border border-sky-500/40 border-dashed" />
            <div className="absolute inset-28 rounded-full border border-sky-500/50" />

            {/* Crosshairs */}
            <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-sky-500/30 -translate-x-1/2" />
            <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-sky-500/30 -translate-y-1/2" />

            {/* Sweep radar ray animation */}
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(56,189,248,0.25)_360deg)] animate-[spin_4s_linear_infinite]" />

            {/* Radial Plume Glow if Active */}
            {isPlumeActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.85, scale: 1 }}
                className="absolute w-24 h-24 rounded-full bg-rose-500/40 blur-xl pointer-events-none"
                style={{
                  transform: `translate(${Math.sin((telemetry.bearing_deg * Math.PI) / 180) * 60}px, ${-Math.cos((telemetry.bearing_deg * Math.PI) / 180) * 60}px)`,
                }}
              />
            )}

            {/* Rotating Directional Compass Needle */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-500 ease-out"
              style={{ transform: `rotate(${arrowAngle}deg)` }}
            >
              <div className="relative flex flex-col items-center">
                {/* Arrow Head */}
                <div
                  className={`w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent ${
                    isPlumeActive
                      ? 'border-b-[38px] border-b-rose-500 drop-shadow-[0_0_12px_#f43f5e]'
                      : 'border-b-[28px] border-b-sky-400 drop-shadow-[0_0_8px_#38bdf8]'
                  }`}
                />
                {/* Arrow Shaft */}
                <div className={`w-1.5 h-16 ${isPlumeActive ? 'bg-rose-500' : 'bg-sky-400/80'} rounded-full`} />
                {/* Tail Counterweight */}
                <div className="w-3 h-3 rounded-full bg-slate-200 mt-1" />
              </div>
            </div>

            {/* Center Robot Pivot Hub */}
            <div className="relative z-10 w-8 h-8 rounded-full bg-slate-950 border-2 border-white flex items-center justify-center shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
            </div>

            {/* North / Front Pod Badge (0°) */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-950/90 border border-rose-400 text-[10px] font-mono font-bold text-rose-300">
              FRONT • MQ-3 + US (0°)
            </div>

            {/* East / Right Pod Badge (90°) */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-slate-950/90 border border-sky-400 text-[10px] font-mono font-bold text-sky-300">
              RIGHT • MQ-2 (+90°)
            </div>

            {/* South / Rear Pod Badge (180°) */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-950/90 border border-teal-400 text-[10px] font-mono font-bold text-teal-300">
              REAR • MQ-135 (180°)
            </div>

            {/* West / Left Pod Badge (270°) */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-slate-950/90 border border-amber-400 text-[10px] font-mono font-bold text-amber-300">
              LEFT • MQ-5 (-90°)
            </div>
          </div>

          {/* Compass Telemetry Readout */}
          <div className="flex items-center gap-4 mt-3 text-xs font-mono font-bold">
            <span className="text-slate-800">
              BEARING: <strong className="text-sky-700">{telemetry.bearing_deg.toFixed(1)}°</strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-800">
              GRADIENT: <strong className={isPlumeActive ? 'text-rose-600' : 'text-slate-600'}>+{telemetry.magnitude.toFixed(1)}% ΔS</strong>
            </span>
          </div>
        </div>

        {/* Right Column: 4 Directional Sensor Telemetry Bars & Simulator (5 Cols) */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="text-xs font-sans font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex justify-between items-center">
            <span>QUADRANT EXCITATION (Δ% ABOVE CLEAN AIR)</span>
            <span className="text-[10px] text-slate-500 font-semibold">Normalized Baseline</span>
          </div>

          {/* 1. FRONT (MQ-3) - Narcotics & Solvents Specialist */}
          <div className="p-2.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 shadow-xs flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs font-sans">
              <span className="font-bold text-rose-950 flex items-center gap-1.5">
                <Pill size={13} className="text-rose-600" />
                <span>FRONT (MQ-3): Alcohol / Narcotics Vapors</span>
              </span>
              <span className="font-mono font-bold text-rose-700">+{telemetry.delta_front.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-rose-600 transition-all duration-300"
                style={{ width: `${Math.min(100, (telemetry.delta_front / 150) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>RAW: {telemetry.front_mq3 ?? telemetry.right_mq3 ?? 26} ADC</span>
              <span>HEADING: 0° (FRONT)</span>
            </div>
          </div>

          {/* 2. RIGHT (MQ-2) - Combustible Gas & Smoke */}
          <div className="p-2.5 rounded-2xl bg-white/60 border border-white/90 shadow-xs flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs font-sans">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Flame size={13} className="text-sky-600" />
                <span>RIGHT (MQ-2): Combustible Gas / Smoke</span>
              </span>
              <span className="font-mono font-bold text-sky-700">+{telemetry.delta_right.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-sky-600 transition-all duration-300"
                style={{ width: `${Math.min(100, (telemetry.delta_right / 150) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>RAW: {telemetry.right_mq2 ?? telemetry.front_mq2 ?? 41} ADC</span>
              <span>HEADING: +90° (RIGHT)</span>
            </div>
          </div>

          {/* 3. REAR (MQ-135) - Air Quality & Toxic Precursors */}
          <div className="p-2.5 rounded-2xl bg-white/60 border border-white/90 shadow-xs flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs font-sans">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Wind size={13} className="text-teal-600" />
                <span>REAR (MQ-135): Hazardous Precursors / NH₃</span>
              </span>
              <span className="font-mono font-bold text-teal-700">+{telemetry.delta_rear.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-teal-600 transition-all duration-300"
                style={{ width: `${Math.min(100, (telemetry.delta_rear / 150) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>RAW: {telemetry.rear_mq135 ?? telemetry.left_mq135 ?? 49} ADC</span>
              <span>HEADING: 180° (REAR)</span>
            </div>
          </div>

          {/* 4. LEFT (MQ-5) - Natural Gas & Methane */}
          <div className="p-2.5 rounded-2xl bg-white/60 border border-white/90 shadow-xs flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs font-sans">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Activity size={13} className="text-amber-600" />
                <span>LEFT (MQ-5): Natural Gas / Methane / LPG</span>
              </span>
              <span className="font-mono font-bold text-amber-700">+{telemetry.delta_left.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-amber-600 transition-all duration-300"
                style={{ width: `${Math.min(100, (telemetry.delta_left / 150) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>RAW: {telemetry.left_mq5 ?? telemetry.rear_mq5 ?? 496} ADC</span>
              <span>HEADING: -90° (LEFT)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Simulator Test Controls Row */}
      <div className="pt-3 border-t border-white/60 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 text-xs font-sans text-slate-700 font-semibold">
          <Sparkles size={13} className="text-amber-600" />
          <span>DEMO PLUME INJECTOR:</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => triggerSimulation('right')}
            className={`px-3 py-1 rounded-xl text-xs font-sans font-bold border transition-all active:scale-95 shadow-xs ${
              activeSimulationMode === 'right'
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-white/80 hover:bg-white text-slate-900 border-slate-300'
            }`}
            title="Simulate narcotics solvent plume approaching from the right flank"
          >
            👉 RIGHT (NARCOTICS MQ-3)
          </button>

          <button
            onClick={() => triggerSimulation('left')}
            className={`px-3 py-1 rounded-xl text-xs font-sans font-bold border transition-all active:scale-95 shadow-xs ${
              activeSimulationMode === 'left'
                ? 'bg-teal-600 text-white border-teal-700'
                : 'bg-white/80 hover:bg-white text-slate-900 border-slate-300'
            }`}
            title="Simulate chemical precursor vapor on the left"
          >
            👈 LEFT (PRECURSORS MQ-135)
          </button>

          <button
            onClick={() => triggerSimulation('front')}
            className={`px-3 py-1 rounded-xl text-xs font-sans font-bold border transition-all active:scale-95 shadow-xs ${
              activeSimulationMode === 'front'
                ? 'bg-sky-600 text-white border-sky-700'
                : 'bg-white/80 hover:bg-white text-slate-900 border-slate-300'
            }`}
            title="Simulate front gas plume"
          >
            ☝ FRONT (MQ-2)
          </button>

          <button
            onClick={() => triggerSimulation('rear')}
            className={`px-3 py-1 rounded-xl text-xs font-sans font-bold border transition-all active:scale-95 shadow-xs ${
              activeSimulationMode === 'rear'
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-white/80 hover:bg-white text-slate-900 border-slate-300'
            }`}
            title="Simulate plume behind robot"
          >
            👇 REAR (MQ-5)
          </button>

          <button
            onClick={() => triggerSimulation('clean')}
            className="p-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 text-xs font-sans font-bold flex items-center gap-1 border border-slate-300"
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
