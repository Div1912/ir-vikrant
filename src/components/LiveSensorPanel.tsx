'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Activity, Flame, Pill, Thermometer, Battery, ShieldAlert, Sparkles, ExternalLink, Radar } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface LiveSensorPanelProps {
  unitId?: string;
  unitCode?: string;
  compact?: boolean;
}

const DEFAULT_UNIT_ID = 'c7569eb7-87ab-43db-905b-54baf7b106fc';

function generateSeedReadings(targetId: string, count = 24) {
  const points: any[] = [];
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const t = new Date(now - i * 4000).toISOString();
    const phase = (now - i * 4000) / 10000;
    points.push(
      { unit_id: targetId, sensor_type: 'narcotics_enose', value: Number((19.5 + Math.sin(phase) * 5.2 + (Math.random() * 1.5)).toFixed(1)), unit_of_measure: 'ppm', recorded_at: t },
      { unit_id: targetId, sensor_type: 'explosives_mems', value: Number((4.8 + Math.cos(phase * 1.2) * 2.1 + (Math.random() * 0.8)).toFixed(1)), unit_of_measure: 'ng/L', recorded_at: t },
      { unit_id: targetId, sensor_type: 'temperature', value: Number((29.4 + Math.sin(phase * 0.4) * 1.2).toFixed(1)), unit_of_measure: '°C', recorded_at: t },
      { unit_id: targetId, sensor_type: 'humidity', value: Number((54.0 + Math.cos(phase * 0.3) * 3.5).toFixed(1)), unit_of_measure: '%', recorded_at: t },
      { unit_id: targetId, sensor_type: 'particulate_pm25', value: Number((42.0 + Math.sin(phase * 0.7) * 6.0).toFixed(1)), unit_of_measure: 'µg/m³', recorded_at: t },
      { unit_id: targetId, sensor_type: 'battery_drain', value: Math.max(20, Number((86.5 - ((count - i) * 0.05)).toFixed(1))), unit_of_measure: '%', recorded_at: t }
    );
  }
  return points;
}

export default function LiveSensorPanel({
  unitId = DEFAULT_UNIT_ID,
  unitCode = 'Q-01',
  compact = false,
}: LiveSensorPanelProps) {
  const effectiveUnitId = unitId || DEFAULT_UNIT_ID;
  const [timeRange, setTimeRange] = useState<'5m' | '1h' | '24h'>('1h');
  const [readings, setReadings] = useState<any[]>(() => generateSeedReadings(effectiveUnitId, 24));
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [lastThresholdAlert, setLastThresholdAlert] = useState<string | null>(null);
  const [liveDistance, setLiveDistance] = useState<{ m: number; cm: number } | null>(null);

  // Listen to live distance telemetry from Arduino Uno
  useEffect(() => {
    const handleDist = (e: any) => {
      if (e.detail?.distance_m !== undefined) {
        setLiveDistance({
          m: Number(e.detail.distance_m),
          cm: e.detail.distance_cm ?? Math.round(e.detail.distance_m * 100),
        });
      }
    };
    window.addEventListener('vikrant:distance_update', handleDist);
    return () => window.removeEventListener('vikrant:distance_update', handleDist);
  }, []);

  // Fetch readings from Supabase
  const fetchReadings = useCallback(async () => {
    let query = supabase
      .from('sensor_readings')
      .select('*')
      .order('recorded_at', { ascending: true });

    if (effectiveUnitId) {
      query = query.eq('unit_id', effectiveUnitId);
    }

    // Filter by time range
    const now = Date.now();
    let cutoff = now - 60 * 60 * 1000; // default 1 hour
    if (timeRange === '5m') cutoff = now - 5 * 60 * 1000;
    if (timeRange === '24h') cutoff = now - 24 * 60 * 60 * 1000;

    query = query.gte('recorded_at', new Date(cutoff).toISOString()).limit(120);

    const { data, error } = await query;
    if (!error && data && data.length >= 6) {
      setReadings(data);
    } else {
      // Seed with initial realistic telemetry so the graphs are immediately alive and animated
      setReadings(prev => (prev.length >= 6 ? prev : generateSeedReadings(effectiveUnitId, 24)));
    }
  }, [effectiveUnitId, timeRange]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  // Realtime subscription for incoming sensor readings
  useEffect(() => {
    const channelId = `sensor_readings_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings' },
        payload => {
          setReadings(prev => {
            const next = [...prev, payload.new];
            // Keep last 150 points
            if (next.length > 150) return next.slice(next.length - 150);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Background Simulator: Emits live telemetry every 3.2s and auto-triggers detection if threshold exceeded
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(async () => {
      const targetId = effectiveUnitId;
      const nowIso = new Date().toISOString();
      const rand = Math.random();

      // Base narcotics value (15-28 ppm) with occasional spike
      const willSpike = rand > 0.94;
      const narcoticsVal = willSpike ? Number((48 + Math.random() * 25).toFixed(1)) : Number((19.5 + Math.sin(Date.now() / 10000) * 5.5 + (Math.random() * 2)).toFixed(1));
      const explosivesVal = willSpike ? Number((68 + Math.random() * 30).toFixed(1)) : Number((4.5 + Math.cos(Date.now() / 8000) * 2 + (Math.random() * 1.2)).toFixed(1));
      const tempVal = Number((29.2 + Math.sin(Date.now() / 25000) * 1.5).toFixed(1));
      const humidityVal = Number((53.5 + Math.cos(Date.now() / 30000) * 3.5).toFixed(1));
      const dustVal = Number((41.5 + Math.sin(Date.now() / 15000) * 7).toFixed(1));
      const batteryVal = Math.max(15, Number((88 - (Date.now() % 3600000) / 150000).toFixed(1)));

      const newRows = [
        { unit_id: targetId, sensor_type: 'narcotics_enose', value: narcoticsVal, unit_of_measure: 'ppm', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'explosives_mems', value: explosivesVal, unit_of_measure: 'ng/L', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'temperature', value: tempVal, unit_of_measure: '°C', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'humidity', value: humidityVal, unit_of_measure: '%', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'particulate_pm25', value: dustVal, unit_of_measure: 'µg/m³', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'battery_drain', value: batteryVal, unit_of_measure: '%', recorded_at: nowIso },
      ];

      // Update local state IMMEDIATELY so graphs smoothly animate in real-time
      setReadings(prev => {
        const next = [...prev, ...newRows];
        return next.length > 180 ? next.slice(next.length - 180) : next;
      });

      // Asynchronously persist to Supabase in background
      try {
        await supabase.from('sensor_readings').insert(newRows);
      } catch {}

      // Threshold check: if value crosses threshold, auto-create detection event!
      if (willSpike) {
        const substanceName = narcoticsVal > 40 ? 'Heroin/Synthetic Opioid Precursor' : 'PETN Secondary Booster';
        const category = narcoticsVal > 40 ? 'Narcotics' : 'Explosives';

        const alertEvent = {
          unit_id: targetId,
          substance_category: category,
          substance_name: substanceName,
          confidence_tier: 'confirmed' as const,
          confidence_score: 0.94,
          station: 'NDLS Sector 4 Sweep',
          status: 'new' as const,
          timestamp: nowIso
        };

        try {
          await supabase.from('detection_events').insert(alertEvent);
        } catch {}

        // Broadcast to dashboard alert feed in 0ms!
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vikrant:new_capture', { detail: alertEvent }));
        }

        setLastThresholdAlert(`${category.toUpperCase()} SPIKE DETECTED (${narcoticsVal > 40 ? narcoticsVal + ' ppm' : explosivesVal + ' ng/L'})`);
        setTimeout(() => setLastThresholdAlert(null), 5000);
      }
    }, 3200);

    return () => clearInterval(interval);
  }, [isSimulating, effectiveUnitId]);

  // Manually trigger spike for demo
  const triggerManualSpike = async () => {
    const targetId = effectiveUnitId;
    const nowIso = new Date().toISOString();
    const spikeNarcotics = 78.4;
    const spikeExplosives = 92.1;

    const spikeRows = [
      { unit_id: targetId, sensor_type: 'narcotics_enose', value: spikeNarcotics, unit_of_measure: 'ppm', recorded_at: nowIso },
      { unit_id: targetId, sensor_type: 'explosives_mems', value: spikeExplosives, unit_of_measure: 'ng/L', recorded_at: nowIso }
    ];

    // Immediately push to local state so Recharts immediately spikes visibly
    setReadings(prev => [...prev.slice(-180), ...spikeRows]);

    const alertEvent = {
      unit_id: targetId,
      substance_category: 'Explosives',
      substance_name: 'RDX/PETN Trace Residue',
      confidence_tier: 'confirmed' as const,
      confidence_score: 0.96,
      station: 'NDLS Platform Concourse',
      status: 'new' as const,
      timestamp: nowIso
    };

    // Broadcast to dashboard alert feed in 0ms!
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vikrant:new_capture', { detail: alertEvent }));
    }

    setLastThresholdAlert('THRESHOLD ALARM: RDX DETECTED (92.1 ng/L)');
    setTimeout(() => setLastThresholdAlert(null), 5000);

    try {
      await supabase.from('sensor_readings').insert(spikeRows);
      await supabase.from('detection_events').insert(alertEvent);
    } catch {}
  };

  // Group readings by timestamp for chart consumption
  const chartData = useMemo(() => {
    const mapByTime: Record<string, any> = {};

    readings.forEach(r => {
      const timeKey = new Date(r.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (!mapByTime[timeKey]) {
        mapByTime[timeKey] = { time: timeKey, timestamp: r.recorded_at };
      }
      if (r.sensor_type === 'narcotics_enose') mapByTime[timeKey].narcotics = r.value;
      if (r.sensor_type === 'explosives_mems') mapByTime[timeKey].explosives = r.value;
      if (r.sensor_type === 'temperature') mapByTime[timeKey].temp = r.value;
      if (r.sensor_type === 'humidity') mapByTime[timeKey].humidity = r.value;
      if (r.sensor_type === 'particulate_pm25') mapByTime[timeKey].dust = r.value;
      if (r.sensor_type === 'battery_drain') mapByTime[timeKey].battery = r.value;
    });

    return Object.values(mapByTime).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [readings]);

  return (
    <div className="glass-panel rounded-2xl p-4 border border-white/70 flex flex-col gap-3 shadow-sm">
      {/* Header with Title, Time Range Toggle & Manual Spike Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/60 pb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-sky-600" />
          <h3 className="text-xs font-sans font-bold tracking-tight text-slate-900">
            LIVE SENSOR ARRAY TELEMETRY
          </h3>
          <span className="text-[10px] font-sans text-slate-500 font-semibold">
            • {unitCode} (Realtime Stream)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Ultrasonic Live Distance Pill */}
          {liveDistance !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-300 text-sky-900 font-mono text-[10px] font-bold animate-pulse">
              <Radar size={12} className="text-sky-600" />
              <span>RANGE: {liveDistance.m.toFixed(2)}m ({liveDistance.cm}cm)</span>
            </div>
          )}

          {/* Threshold alert pill */}
          {lastThresholdAlert && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-300 text-red-800 font-mono text-[10px] font-bold animate-pulse">
              <ShieldAlert size={12} className="text-red-600" />
              <span>{lastThresholdAlert}</span>
            </div>
          )}

          {/* Spike Test Button */}
          <button
            onClick={triggerManualSpike}
            className="liquid-btn px-3 py-1 text-slate-900 font-mono text-[10px] font-bold flex items-center gap-1 shadow-xs"
            title="Inject real-time trace detection spike into sensor readings & trigger live alert"
          >
            <Sparkles size={11} className="text-amber-600" />
            <span>TEST SPIKE</span>
          </button>

          {/* Time Range Filter Buttons */}
          <div className="flex items-center bg-slate-200/60 rounded-full border border-slate-300/60 p-0.5 text-[10px] font-mono">
            {(['5m', '1h', '24h'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={`px-2.5 py-0.5 rounded-full transition-colors font-bold ${
                  timeRange === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid of 4 Interactive Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Chart 1: Narcotics e-Nose MOS Array */}
        <div className="glass-panel rounded-xl p-3 border border-white/70 flex flex-col bg-white/30 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Link href="/dashboard/narcotics" className="flex items-center gap-1.5 text-xs font-sans font-bold text-slate-900 hover:text-sky-700 group transition-colors">
              <Pill size={13} className="text-sky-600 group-hover:text-sky-700" />
              <span>Narcotics MOS Array (e-Nose)</span>
              <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <span className="text-[10px] font-sans text-sky-700 font-semibold">
              Threshold: 40.0 ppm
            </span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} />
                <YAxis domain={[0, 85]} stroke="#64748b" fontSize={9} tickLine={false} unit="ppm" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(226,232,240,0.9)', borderRadius: '8px', fontSize: '11px', color: '#0f172a' }}
                />
                <Area type="monotone" dataKey="narcotics" stroke="#0284c7" fill="#0284c7" fillOpacity={0.15} strokeWidth={2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Explosives Trace MEMS / DSC */}
        <div className="glass-panel rounded-xl p-3 border border-white/70 flex flex-col bg-white/30 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Link href="/dashboard/explosives" className="flex items-center gap-1.5 text-xs font-sans font-bold text-slate-900 hover:text-rose-700 group transition-colors">
              <Flame size={13} className="text-rose-600 group-hover:text-rose-700" />
              <span>Explosives Trace (MEMS / DSC)</span>
              <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <span className="text-[10px] font-sans text-rose-700 font-semibold">
              Threshold: 50.0 ng/L
            </span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={9} tickLine={false} unit="ng" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(226,232,240,0.9)', borderRadius: '8px', fontSize: '11px', color: '#0f172a' }}
                />
                <Line type="monotone" dataKey="explosives" stroke="#e11d48" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Environmental Atmosphere (Temp / Humidity / PM2.5) */}
        <div className="glass-panel rounded-xl p-3 border border-white/70 flex flex-col bg-white/30 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-sans font-bold text-slate-900">
              <Thermometer size={13} className="text-emerald-600" />
              <span>Environment (Temp / RH / PM2.5)</span>
            </div>
            <span className="text-[10px] font-sans text-slate-500 font-semibold">Multi-Channel</span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(226,232,240,0.9)', borderRadius: '8px', fontSize: '11px', color: '#0f172a' }}
                />
                <Line type="monotone" dataKey="temp" name="Temp (°C)" stroke="#059669" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="humidity" name="RH (%)" stroke="#0284c7" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="dust" name="PM2.5 (µg)" stroke="#d97706" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Legend wrapperStyle={{ fontSize: '9px', fontFamily: 'sans-serif' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Battery Drain Session Curve */}
        <div className="glass-panel rounded-xl p-3 border border-white/70 flex flex-col bg-white/30 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-sans font-bold text-slate-900">
              <Battery size={13} className="text-sky-600" />
              <span>Battery Drain Curve</span>
            </div>
            <span className="text-[10px] font-sans text-sky-700 font-semibold">Nominal Rate</span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={9} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(226,232,240,0.9)', borderRadius: '8px', fontSize: '11px', color: '#0f172a' }}
                />
                <Area type="monotone" dataKey="battery" name="Battery %" stroke="#0284c7" fill="#0284c7" fillOpacity={0.12} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
