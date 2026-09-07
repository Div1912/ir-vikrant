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

export default function LiveSensorPanel({
  unitId,
  unitCode = 'Q-01',
  compact = false,
}: LiveSensorPanelProps) {
  const [timeRange, setTimeRange] = useState<'5m' | '1h' | '24h'>('1h');
  const [readings, setReadings] = useState<any[]>([]);
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

    if (unitId) {
      query = query.eq('unit_id', unitId);
    }

    // Filter by time range
    const now = Date.now();
    let cutoff = now - 60 * 60 * 1000; // default 1 hour
    if (timeRange === '5m') cutoff = now - 5 * 60 * 1000;
    if (timeRange === '24h') cutoff = now - 24 * 60 * 60 * 1000;

    query = query.gte('recorded_at', new Date(cutoff).toISOString()).limit(120);

    const { data, error } = await query;
    if (!error && data) {
      setReadings(data);
    }
  }, [unitId, timeRange]);

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

  // Background Simulator: Emits live telemetry every 4s and auto-triggers detection if threshold exceeded
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(async () => {
      // Pick target unit id or fallback
      const targetId = unitId;
      if (!targetId) return;

      const nowIso = new Date().toISOString();
      const rand = Math.random();

      // Base narcotics value (15-28 ppm) with occasional spike
      const willSpike = rand > 0.88;
      const narcoticsVal = willSpike ? Number((48 + Math.random() * 25).toFixed(1)) : Number((18 + Math.sin(Date.now() / 10000) * 6 + (Math.random() * 2)).toFixed(1));
      const explosivesVal = willSpike ? Number((68 + Math.random() * 30).toFixed(1)) : Number((4 + Math.cos(Date.now() / 8000) * 2 + (Math.random() * 1.5)).toFixed(1));
      const tempVal = Number((29.2 + Math.sin(Date.now() / 25000) * 1.5).toFixed(1));
      const humidityVal = Number((52 + Math.cos(Date.now() / 30000) * 4).toFixed(1));
      const dustVal = Number((42 + Math.sin(Date.now() / 15000) * 8).toFixed(1));
      const batteryVal = Math.max(15, Number((88 - (Date.now() % 3600000) / 150000).toFixed(1)));

      const newRows = [
        { unit_id: targetId, sensor_type: 'narcotics_enose', value: narcoticsVal, unit_of_measure: 'ppm', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'explosives_mems', value: explosivesVal, unit_of_measure: 'ng/L', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'temperature', value: tempVal, unit_of_measure: '°C', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'humidity', value: humidityVal, unit_of_measure: '%', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'particulate_pm25', value: dustVal, unit_of_measure: 'µg/m³', recorded_at: nowIso },
        { unit_id: targetId, sensor_type: 'battery_drain', value: batteryVal, unit_of_measure: '%', recorded_at: nowIso },
      ];

      await supabase.from('sensor_readings').insert(newRows);

      // Threshold check: if value crosses threshold, auto-create detection event!
      if (willSpike) {
        const substanceName = narcoticsVal > 40 ? 'Heroin/Synthetic Opioid Precursor' : 'PETN Secondary Booster';
        const category = narcoticsVal > 40 ? 'Narcotics' : 'Explosives';

        await supabase.from('detection_events').insert({
          unit_id: targetId,
          substance_category: category,
          substance_name: substanceName,
          confidence_tier: 'confirmed',
          confidence_score: 0.94,
          station: 'NDLS Sector 4 Sweep',
          status: 'new',
          timestamp: nowIso
        });

        setLastThresholdAlert(`${category.toUpperCase()} SPIKE DETECTED (${narcoticsVal > 40 ? narcoticsVal + ' ppm' : explosivesVal + ' ng/L'})`);
        setTimeout(() => setLastThresholdAlert(null), 5000);
      }
    }, 4500);

    return () => clearInterval(interval);
  }, [isSimulating, unitId]);

  // Manually trigger spike for demo
  const triggerManualSpike = async () => {
    if (!unitId) return;
    const nowIso = new Date().toISOString();
    const spikeNarcotics = 78.4;
    const spikeExplosives = 92.1;

    await supabase.from('sensor_readings').insert([
      { unit_id: unitId, sensor_type: 'narcotics_enose', value: spikeNarcotics, unit_of_measure: 'ppm', recorded_at: nowIso },
      { unit_id: unitId, sensor_type: 'explosives_mems', value: spikeExplosives, unit_of_measure: 'ng/L', recorded_at: nowIso }
    ]);

    await supabase.from('detection_events').insert({
      unit_id: unitId,
      substance_category: 'Explosives',
      substance_name: 'RDX/PETN Trace Residue',
      confidence_tier: 'confirmed',
      confidence_score: 0.96,
      station: 'NDLS Platform Concourse',
      status: 'new',
      timestamp: nowIso
    });

    setLastThresholdAlert('THRESHOLD ALARM: RDX DETECTED (92.1 ng/L)');
    setTimeout(() => setLastThresholdAlert(null), 5000);
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
    <div className="glass-panel rounded-xl p-4 border border-panel-border flex flex-col gap-3">
      {/* Header with Title, Time Range Toggle & Manual Spike Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-panel-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          <h3 className="text-xs font-mono font-bold tracking-widest text-foreground/90 uppercase">
            LIVE SENSOR ARRAY TELEMETRY
          </h3>
          <span className="text-[10px] font-mono text-foreground/50">
            • {unitCode} (Realtime Stream)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Ultrasonic Live Distance Pill */}
          {liveDistance !== null && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-mono text-[10px] animate-pulse">
              <Radar size={12} className="text-cyan-400" />
              <span>RANGE: {liveDistance.m.toFixed(2)}m ({liveDistance.cm}cm)</span>
            </div>
          )}

          {/* Threshold alert pill */}
          {lastThresholdAlert && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-destructive/20 border border-destructive text-destructive font-mono text-[10px] animate-pulse">
              <ShieldAlert size={12} />
              <span>{lastThresholdAlert}</span>
            </div>
          )}

          {/* Spike Test Button */}
          <button
            onClick={triggerManualSpike}
            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-mono text-[10px] flex items-center gap-1 transition-all active:scale-95"
            title="Inject real-time trace detection spike into sensor readings & trigger live alert"
          >
            <Sparkles size={11} />
            <span>TEST SPIKE</span>
          </button>

          {/* Time Range Filter Buttons */}
          <div className="flex items-center bg-black/40 rounded border border-panel-border p-0.5 text-[10px] font-mono">
            {(['5m', '1h', '24h'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  timeRange === t ? 'bg-white/20 text-white font-bold' : 'text-foreground/50 hover:text-foreground'
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
        <div className="glass-panel rounded-lg p-3 border border-panel-border/70 flex flex-col bg-black/30">
          <div className="flex items-center justify-between mb-2">
            <Link href="/dashboard/narcotics" className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-foreground/80 hover:text-cyan-400 group transition-colors">
              <Pill size={13} className="text-blue-400 group-hover:text-cyan-400" />
              <span>NARCOTICS MOS ARRAY (e-NOSE)</span>
              <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <span className="text-[10px] font-mono text-blue-400 font-bold">
              THRESHOLD: 40.0 ppm
            </span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                <YAxis domain={[0, 85]} stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} unit="ppm" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="narcotics" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Explosives Trace MEMS / DSC */}
        <div className="glass-panel rounded-lg p-3 border border-panel-border/70 flex flex-col bg-black/30">
          <div className="flex items-center justify-between mb-2">
            <Link href="/dashboard/explosives" className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-foreground/80 hover:text-rose-400 group transition-colors">
              <Flame size={13} className="text-rose-400 group-hover:text-rose-400" />
              <span>EXPLOSIVES TRACE (MEMS / DSC)</span>
              <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <span className="text-[10px] font-mono text-rose-400 font-bold">
              THRESHOLD: 50.0 ng/L
            </span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} unit="ng" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="explosives" stroke="#ef4444" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Environmental Atmosphere (Temp / Humidity / PM2.5) */}
        <div className="glass-panel rounded-lg p-3 border border-panel-border/70 flex flex-col bg-black/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-foreground/80">
              <Thermometer size={13} className="text-emerald-400" />
              <span>ENVIRONMENT (TEMP / RH / PM2.5)</span>
            </div>
            <span className="text-[10px] font-mono text-foreground/50">MULTI-CHANNEL</span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="temp" name="Temp (°C)" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="humidity" name="RH (%)" stroke="#06b6d4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="dust" name="PM2.5 (µg)" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Legend wrapperStyle={{ fontSize: '9px', fontFamily: 'monospace' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Battery Drain Session Curve */}
        <div className="glass-panel rounded-lg p-3 border border-panel-border/70 flex flex-col bg-black/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-foreground/80">
              <Battery size={13} className="text-cyan-400" />
              <span>BATTERY DRAIN CURVE (SESSION)</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 font-bold">DISCHARGE RATE NOMINAL</span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="battery" name="Battery %" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
