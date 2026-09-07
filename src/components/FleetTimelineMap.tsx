'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from '@/lib/supabase';
import {
  Navigation,
  Route,
  Clock,
  Compass,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  MapPin,
  Sparkles,
  Activity,
  Zap,
  LocateFixed,
} from 'lucide-react';
import { findNearestRailwayStation, getHaversineKm } from '@/lib/railwayStations';

// Tactical Quadruped Robot Icon with directional heading cone and live badge
const createQuadrupedIcon = (headingDeg: number = 0, isMoving: boolean = false) => {
  return L.divIcon({
    className: 'custom-fleet-quadruped-icon',
    html: `
      <div style="position: relative; width: 44px; height: 44px; transform: translate(-50%, -50%); display:flex; align-items:center; justify-content:center;">
        <!-- Radar pulse ring -->
        <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: #38bdf8; opacity: ${isMoving ? '0.35' : '0.12'}; ${isMoving ? 'animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;' : ''}"></div>
        <!-- Directional heading cone -->
        <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; border: 2px dashed #38bdf8; transform: rotate(${headingDeg}deg);"></div>
        <!-- Robot Core Icon -->
        <div style="width: 22px; height: 22px; border-radius: 6px; background: #0284c7; border: 2px solid #ffffff; box-shadow: 0 0 14px #38bdf8; display:flex; align-items:center; justify-content:center; z-index: 10;">
          <div style="width: 7px; height: 7px; border-radius: 50%; background: ${isMoving ? '#4ade80' : '#ffffff'};"></div>
        </div>
        <!-- Unit Tag Label -->
        <div style="position: absolute; bottom: -14px; background: rgba(9,9,11,0.92); border: 1px solid #38bdf8; border-radius: 3px; padding: 0 4px; font-family: monospace; font-size: 8px; font-weight: bold; color: white; white-space: nowrap;">
          Q-01 ${isMoving ? 'PATROL' : 'LIVE'}
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

// Start / Origin Marker Icon
const createOriginIcon = () => {
  return L.divIcon({
    className: 'custom-origin-icon',
    html: `
      <div style="transform: translate(-50%, -50%); display:flex; align-items:center; justify-content:center;">
        <div style="width: 18px; height: 18px; border-radius: 50%; background: #10b981; border: 2px solid white; display:flex; align-items:center; justify-content:center; font-family: monospace; font-size: 8px; font-weight: bold; color: black; box-shadow: 0 2px 8px rgba(0,0,0,0.6);">
          A
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

function CameraController({ center, trigger }: { center: [number, number] | null; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (center && trigger > 0) {
      map.flyTo(center, Math.max(map.getZoom(), 17), { duration: 1.0 });
    }
  }, [center, trigger, map]);
  return null;
}

interface FleetTimelineMapProps {
  unitId?: string;
  unitCode?: string;
}

interface PositionRecord {
  latitude: number;
  longitude: number;
  recorded_at: string;
}

export default function FleetTimelineMap({ unitId, unitCode = 'Q-01' }: FleetTimelineMapProps) {
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [currentCoord, setCurrentCoord] = useState<[number, number]>([22.59548, 88.45420]);
  const [currentStation, setCurrentStation] = useState<string>('Bidhan Nagar Road (BNR) • Eastern Railway');
  const [sessionDistance, setSessionDistance] = useState<number>(0);
  const [speedKmh, setSpeedKmh] = useState<number>(0.0);
  const [heading, setHeading] = useState<number>(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'locked' | 'error'>('acquiring');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [centerTrigger, setCenterTrigger] = useState<number>(1);
  const [sessionStartTime, setSessionStartTime] = useState<string>('');

  const watchIdRef = useRef<number | null>(null);
  const lastLoggedCoordRef = useRef<[number, number] | null>(null);
  const simStepRef = useRef<number>(0);

  // Set session start time on client mount
  useEffect(() => {
    setSessionStartTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, []);

  // Handle incoming real GPS position
  const handleGpsUpdate = useCallback((latitude: number, longitude: number, accuracy?: number, speed?: number | null, headingDeg?: number | null) => {
    setCurrentCoord([latitude, longitude]);
    setGpsStatus('locked');
    if (accuracy !== undefined) setGpsAccuracy(Math.round(accuracy));

    // Dynamic Station resolution
    const stationInfo = findNearestRailwayStation(latitude, longitude);
    setCurrentStation(stationInfo.fullLabel);

    // Speed in km/h (only show speed if genuinely moving > 0.3 m/s)
    if (speed !== null && speed !== undefined && speed > 0.3) {
      setSpeedKmh(Number((speed * 3.6).toFixed(1)));
    } else {
      setSpeedKmh(0.0);
    }

    if (headingDeg !== null && headingDeg !== undefined && !isNaN(headingDeg)) {
      setHeading(headingDeg);
    }

    // Accumulate distance ONLY if moved > 4 meters from last recorded point (eliminates stationary GPS jitter!)
    const lastCoord = lastLoggedCoordRef.current;
    if (lastCoord) {
      const dMeters = getHaversineKm(lastCoord[0], lastCoord[1], latitude, longitude) * 1000;
      if (dMeters >= 4) {
        lastLoggedCoordRef.current = [latitude, longitude];
        setPositions(prev => [
          ...prev,
          { latitude, longitude, recorded_at: new Date().toISOString() }
        ]);
        setSessionDistance(prev => prev + Math.round(dMeters));

        // Save position to Supabase for historical timeline
        if (unitId) {
          supabase.from('live_positions').insert({
            unit_id: unitId,
            latitude,
            longitude,
            accuracy_m: accuracy || 5,
          }).then();
        }
      }
    } else {
      // First point
      lastLoggedCoordRef.current = [latitude, longitude];
      setPositions([{ latitude, longitude, recorded_at: new Date().toISOString() }]);
    }
  }, [unitId]);

  // 1. Start Real Geolocation Watch
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('error');
      return;
    }

    setGpsStatus('acquiring');

    // Quick initial position fix
    navigator.geolocation.getCurrentPosition(
      pos => {
        handleGpsUpdate(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          pos.coords.speed,
          pos.coords.heading
        );
      },
      err => {
        console.warn('[Timeline GPS] Initial quick fix error:', err.message);
      },
      { enableHighAccuracy: false, timeout: 6000 }
    );

    // Continuous watch
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        handleGpsUpdate(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          pos.coords.speed,
          pos.coords.heading
        );
      },
      err => {
        console.warn('[Timeline GPS] Watch error:', err.message);
        if (err.code === 1) setGpsStatus('error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    );

    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [handleGpsUpdate]);

  // 2. Fetch existing history from Supabase live_positions
  useEffect(() => {
    const fetchHistory = async () => {
      let query = supabase
        .from('live_positions')
        .select('latitude, longitude, recorded_at')
        .order('recorded_at', { ascending: true })
        .limit(50);

      if (unitId) {
        query = query.eq('unit_id', unitId);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        setPositions(data);
        const latest = data[data.length - 1];
        setCurrentCoord([latest.latitude, latest.longitude]);
        lastLoggedCoordRef.current = [latest.latitude, latest.longitude];
        const st = findNearestRailwayStation(latest.latitude, latest.longitude);
        setCurrentStation(st.fullLabel);

        // Calculate cumulative distance across existing points
        let cumDist = 0;
        for (let i = 1; i < data.length; i++) {
          cumDist += getHaversineKm(data[i - 1].latitude, data[i - 1].longitude, data[i].latitude, data[i].longitude) * 1000;
        }
        setSessionDistance(Math.round(cumDist));
      }
    };

    fetchHistory();
  }, [unitId]);

  // 3. Optional Simulation Loop (DISABLED by default — only fires if user explicitly clicks DEMO WALK!)
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      simStepRef.current += 1;
      const step = simStepRef.current;
      const angle = (step * 0.2) % (2 * Math.PI);
      const stepDistMeters = 5.5; // ~5.5 meters per step
      const latDelta = (stepDistMeters / 111139) * Math.cos(angle);
      const lonDelta = (stepDistMeters / (111139 * Math.cos((currentCoord[0] * Math.PI) / 180))) * Math.sin(angle);

      const nextLat = Number((currentCoord[0] + latDelta).toFixed(6));
      const nextLon = Number((currentCoord[1] + lonDelta).toFixed(6));

      handleGpsUpdate(nextLat, nextLon, 3, 1.4, Math.round((angle * 180) / Math.PI));
    }, 2500);

    return () => clearInterval(interval);
  }, [isSimulating, currentCoord, handleGpsUpdate]);

  // Derived polylines of traveled path
  const polylinePoints = useMemo(() => {
    return positions.map(p => [p.latitude, p.longitude] as [number, number]);
  }, [positions]);

  const originPoint = positions.length > 0 ? [positions[0].latitude, positions[0].longitude] as [number, number] : null;

  // Clear session trail
  const handleClearTrail = () => {
    setPositions([{ latitude: currentCoord[0], longitude: currentCoord[1], recorded_at: new Date().toISOString() }]);
    lastLoggedCoordRef.current = [currentCoord[0], currentCoord[1]];
    setSessionDistance(0);
    setSpeedKmh(0.0);
  };

  const isMoving = speedKmh > 0.4 || isSimulating;

  return (
    <div className="flex flex-col h-full w-full rounded-2xl overflow-hidden glass-panel border border-cyan-500/20">
      {/* Google Maps Style Timeline Control Header */}
      <div className="p-3.5 border-b border-panel-border bg-black/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Route size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-xs font-bold text-white tracking-wider uppercase">
                {unitCode} LIVE PATROL TIMELINE
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 border ${
                  isMoving
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isMoving ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
                {isMoving ? 'MOVING' : 'STATIONARY'}
              </span>
              {gpsAccuracy && (
                <span className="text-[9px] font-mono text-foreground/40 hidden sm:inline">
                  (GPS ±{gpsAccuracy}m)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-foreground/60 mt-0.5">
              <MapPin size={11} className="text-cyan-400 shrink-0" />
              <span className="text-white font-medium truncate max-w-[320px]">{currentStation}</span>
            </div>
          </div>
        </div>

        {/* Real-time Telemetry Stats (Tied to Real Movement) */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col text-right font-mono">
            <span className="text-[9px] text-foreground/40 uppercase">DISTANCE PATROLLED</span>
            <span className="text-xs font-bold text-cyan-400">
              {sessionDistance >= 1000 ? `${(sessionDistance / 1000).toFixed(2)} km` : `${sessionDistance} m`}
            </span>
          </div>

          <div className="flex flex-col text-right font-mono border-l border-white/10 pl-3">
            <span className="text-[9px] text-foreground/40 uppercase">SPEED</span>
            <span className="text-xs font-bold text-white">{speedKmh.toFixed(1)} km/h</span>
          </div>

          <div className="flex items-center gap-2 pl-2">
            {/* Center Map Button */}
            <button
              onClick={() => setCenterTrigger(c => c + 1)}
              title="Center Map on Robot"
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <LocateFixed size={14} />
            </button>

            {/* Clear Trail Button */}
            <button
              onClick={handleClearTrail}
              title="Reset Session Distance & Trail"
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-foreground/70 hover:text-white transition-colors"
            >
              <RotateCcw size={14} />
            </button>

            {/* Optional Simulation Toggle (OFF by default) */}
            <button
              onClick={() => {
                if (isSimulating) {
                  setIsSimulating(false);
                  setSpeedKmh(0.0);
                } else {
                  setIsSimulating(true);
                }
              }}
              className={`px-2.5 py-1.5 rounded-xl font-mono text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                isSimulating
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-white/5 text-foreground/60 hover:text-white border border-white/10'
              }`}
            >
              {isSimulating ? <Pause size={12} /> : <Play size={12} />}
              <span>{isSimulating ? 'STOP SIM' : 'DEMO WALK'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Map Surface */}
      <div className="flex-1 w-full h-full relative min-h-[320px]">
        <MapContainer
          center={currentCoord}
          zoom={17}
          style={{ height: '100%', width: '100%', background: '#08090c' }}
          zoomControl={false}
        >
          <CameraController center={currentCoord} trigger={centerTrigger} />

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />

          {/* 1. Real Traveled Path Breadcrumbs (Google Maps Timeline Cyan Route) */}
          {polylinePoints.length > 1 && (
            <Polyline
              positions={polylinePoints}
              pathOptions={{
                color: '#0284c7',
                weight: 4,
                opacity: 0.85,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          )}

          {/* 2. Start / Origin Waypoint Marker */}
          {originPoint && (
            <Marker position={originPoint} icon={createOriginIcon()}>
              <Popup className="glass-panel text-foreground">
                <div className="font-mono text-xs p-1">
                  <strong className="text-emerald-400">PATROL ORIGIN (POINT A)</strong>
                  <div className="text-[10px] text-foreground/60 mt-0.5">Session Start: {sessionStartTime || '08:00'}</div>
                  <div className="text-[10px] text-foreground/60">
                    {originPoint[0].toFixed(5)}° N, {originPoint[1].toFixed(5)}° E
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* 3. Real-Time Quadruped Marker (Anchored to Real GPS) */}
          <Marker position={currentCoord} icon={createQuadrupedIcon(heading, isMoving)}>
            <Popup className="glass-panel text-foreground">
              <div className="font-mono text-xs p-1">
                <div className="text-cyan-400 font-bold mb-1 flex items-center gap-1">
                  <Zap size={12} />
                  QUADRUPED {unitCode} ({isMoving ? 'ACTIVE WALK' : 'STATIONARY'})
                </div>
                <div><strong>Station:</strong> {currentStation}</div>
                <div><strong>Coordinates:</strong> {currentCoord[0].toFixed(5)}° N, {currentCoord[1].toFixed(5)}° E</div>
                <div><strong>Session Distance:</strong> {sessionDistance} m</div>
                <div><strong>Speed:</strong> {speedKmh.toFixed(1)} km/h</div>
                {gpsAccuracy && <div><strong>GPS Accuracy:</strong> ±{gpsAccuracy} m</div>}
              </div>
            </Popup>
          </Marker>

          {/* Real GPS Accuracy Ring */}
          {gpsAccuracy && gpsAccuracy < 80 && (
            <Circle
              center={currentCoord}
              radius={gpsAccuracy}
              pathOptions={{
                color: '#38bdf8',
                weight: 1,
                fillColor: '#38bdf8',
                fillOpacity: 0.08,
                dashArray: '3, 6',
              }}
            />
          )}
        </MapContainer>

        {/* Live Coordinate & Status Overlay */}
        <div className="absolute bottom-3 left-3 z-10 glass-panel px-3 py-1.5 rounded-xl border border-panel-border bg-black/80 font-mono text-[10px] flex items-center gap-2">
          <Compass size={13} className="text-cyan-400" />
          <span className="text-white font-bold">
            {currentCoord[0].toFixed(5)}° N, {currentCoord[1].toFixed(5)}° E
          </span>
          <span className="text-foreground/40">•</span>
          <span className={gpsStatus === 'locked' ? 'text-emerald-400' : 'text-amber-400'}>
            {gpsStatus === 'locked' ? `GPS LOCKED (±${gpsAccuracy || 5}m)` : 'ACQUIRING GPS...'}
          </span>
        </div>
      </div>

      {/* Google Maps Style Bottom Timeline Stops Reel */}
      <div className="p-3 border-t border-panel-border bg-black/80 backdrop-blur-md flex items-center gap-3 overflow-x-auto shrink-0 font-mono text-[10px]">
        <span className="text-foreground/40 uppercase tracking-wider shrink-0">TIMELINE STOPS:</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 size={10} /> Session Origin ({sessionStartTime || 'Start'})
          </span>
          <span className="text-foreground/30">→</span>
          <span className="px-2 py-0.5 rounded bg-white/5 text-foreground/70 border border-white/10 flex items-center gap-1">
            <MapPin size={10} className="text-cyan-400" /> {currentStation.split('•')[0].trim()}
          </span>
          <span className="text-foreground/30">→</span>
          <span className={`px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${
            isMoving
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 animate-pulse'
              : 'bg-white/10 text-white border-white/20'
          }`}>
            <Activity size={10} /> {isMoving ? `Patrol Sweep (${sessionDistance}m)` : `Stationary at Sector (${sessionDistance}m)`}
          </span>
        </div>
      </div>
    </div>
  );
}
