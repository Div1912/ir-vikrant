'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import {
  Crosshair,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Navigation,
  Route,
  Activity,
  ChevronUp,
  ChevronDown,
  Clock,
  Compass,
} from 'lucide-react';
import { findNearestRailwayStation, reverseGeocodeLocation } from '@/lib/railwayStations';

// Custom icons using standard Leaflet DivIcon with Tailwind
const createUnitIcon = (label: string, isQuadruped: boolean) => {
  return L.divIcon({
    className: 'custom-tactical-unit-icon',
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -50%); cursor:pointer;">
        <div style="background: rgba(9,9,11,0.92); border: 1px solid ${isQuadruped ? '#3b82f6' : '#22c55e'}; border-radius: 4px; padding: 1px 5px; font-family: monospace; font-size: 9px; font-weight: bold; color: white; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.7); margin-bottom: 2px;">
          ${label}
        </div>
        <div style="width: 14px; height: 14px; border-radius: 50%; background: ${isQuadruped ? '#3b82f6' : '#22c55e'}; border: 2px solid white; box-shadow: 0 0 10px ${isQuadruped ? '#3b82f6' : '#22c55e'};"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

const createDeviceIcon = () => {
  return L.divIcon({
    className: 'custom-device-beacon-icon',
    html: `
      <div style="position: relative; width: 36px; height: 36px; transform: translate(-50%, -50%); display:flex; align-items:center; justify-content:center;">
        <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: #3b82f6; opacity: 0.35; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background: rgba(59, 130, 246, 0.3); border: 1px dashed #60a5fa;"></div>
        <div style="width: 12px; height: 12px; border-radius: 50%; background: #38bdf8; border: 2px solid white; box-shadow: 0 0 14px #38bdf8; z-index: 10;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

type PositionPoint = {
  id: string;
  unit_id: string;
  unit_code?: string;
  latitude: number;
  longitude: number;
  accuracy_m?: number;
  recorded_at: string;
};

type DeviceCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

// Calculate Haversine distance in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Smooth Camera Controller
function CameraController({
  center,
  follow,
}: {
  center: [number, number] | null;
  follow: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (center && follow) {
      map.flyTo(center, Math.max(map.getZoom(), 16), { duration: 1.2 });
    }
  }, [center, follow, map]);
  return null;
}

export default function MainMap() {
  const [trailPositions, setTrailPositions] = useState<PositionPoint[]>([]);
  const [deviceCoords, setDeviceCoords] = useState<DeviceCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'acquiring' | 'locked' | 'error'>('acquiring');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const [followDevice, setFollowDevice] = useState<boolean>(true);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [showTelemetryTray, setShowTelemetryTray] = useState<boolean>(false);
  const [currentStationName, setCurrentStationName] = useState<string>('Acquiring nearby station via GPS...');
  const [liveClock, setLiveClock] = useState<string>('');

  const watchIdRef = useRef<number | null>(null);

  // Live second clock for telemetry header
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync Device location to Supabase and local state
  const syncLocation = useCallback(
    async (coords: GeolocationCoordinates, unitId: string | null) => {
      const { latitude, longitude, accuracy } = coords;
      const devData: DeviceCoords = {
        latitude,
        longitude,
        accuracy,
        timestamp: Date.now(),
      };
      setDeviceCoords(devData);
      setGpsStatus('locked');
      setGpsErrorMsg(null);

      // Dynamically resolve the nearest Indian Railway station from live coordinates!
      const nearest = findNearestRailwayStation(latitude, longitude);
      setCurrentStationName(nearest.fullLabel);

      // Asynchronously enrich with city/district name if available
      reverseGeocodeLocation(latitude, longitude).then(loc => {
        if (loc) setCurrentStationName(`${nearest.name} (${nearest.code}) • ${loc}`);
      });

      const newPoint: PositionPoint = {
        id: `device-${Date.now()}`,
        unit_id: unitId || 'q1',
        unit_code: 'Q-01',
        latitude,
        longitude,
        accuracy_m: accuracy,
        recorded_at: new Date().toISOString(),
      };

      setTrailPositions(prev => [...prev, newPoint]);

      // Update unit station in Supabase and insert position
      if (unitId) {
        try {
          await supabase.from('units').update({
            station: nearest.name,
            zone: nearest.zone
          }).eq('id', unitId);

          await supabase.from('live_positions').insert({
            unit_id: unitId,
            latitude,
            longitude,
            accuracy_m: accuracy,
          });
        } catch (err) {
          console.error('[GPS] Supabase insert/update failed:', err);
        }
      }
    },
    []
  );

  // Start browser geolocation with quick fix & watchPosition
  const startGeolocation = useCallback(
    (targetUnitId: string | null) => {
      if (!('geolocation' in navigator)) {
        setGpsStatus('error');
        setGpsErrorMsg('Geolocation API not supported by this browser.');
        return;
      }

      setGpsStatus('acquiring');
      setGpsErrorMsg(null);

      // Quick Wi-Fi / IP fix first
      navigator.geolocation.getCurrentPosition(
        pos => syncLocation(pos.coords, targetUnitId),
        err => console.warn('[GPS] Initial quick fix failed:', err.message),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      const onWatchSuccess = (pos: GeolocationPosition) => {
        syncLocation(pos.coords, targetUnitId);
      };

      const onWatchError = (err: GeolocationPositionError) => {
        if (err.code === 3 || err.code === 2) {
          // Fallback to standard accuracy
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
          }
          watchIdRef.current = navigator.geolocation.watchPosition(
            onWatchSuccess,
            fallbackErr => {
              setGpsStatus('error');
              setGpsErrorMsg(fallbackErr.message);
            },
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
          );
        } else {
          setGpsStatus('error');
          setGpsErrorMsg(err.message);
        }
      };

      watchIdRef.current = navigator.geolocation.watchPosition(
        onWatchSuccess,
        onWatchError,
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
      );
    },
    [syncLocation]
  );

  // Fetch initial data & subscribe to Realtime
  useEffect(() => {
    let isMounted = true;
    let channel: any;

    const init = async () => {
      // 1. Fetch unit
      let q1Id: string | null = null;
      const { data: units } = await supabase.from('units').select('id, unit_code, station, zone');
      if (units && isMounted) {
        const q1 = units.find(u => u.unit_code === 'Q-01');
        if (q1) {
          q1Id = q1.id;
          setActiveUnitId(q1.id);
          if (q1.station && q1.station !== 'New Delhi') {
            setCurrentStationName(`${q1.station} / ${q1.zone || 'Eastern Railway'}`);
          }
        }
      }

      // 2. Fetch live_positions history for trail (last 60 points)
      let query = supabase
        .from('live_positions')
        .select('*')
        .order('recorded_at', { ascending: true })
        .limit(60);

      if (q1Id) {
        query = query.eq('unit_id', q1Id);
      }

      const { data: positionsData } = await query;
      if (positionsData && isMounted && positionsData.length > 0) {
        setTrailPositions(positionsData);
      }

      // 3. Start Geolocation
      startGeolocation(q1Id);

      // 4. Realtime subscription
      const channelId = `live_positions_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      channel = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'live_positions' },
          payload => {
            if (!isMounted) return;
            const newPoint = payload.new as PositionPoint;
            setTrailPositions(prev => [...prev, newPoint]);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [startGeolocation]);

  // Derived Trail Polylines
  const polylineCoords = useMemo(() => {
    return trailPositions.map(p => [p.latitude, p.longitude] as [number, number]);
  }, [trailPositions]);

  // Split into older path and most recent segment (for distinct highlight)
  const historicalPath = useMemo(() => {
    if (polylineCoords.length <= 1) return polylineCoords;
    return polylineCoords.slice(0, polylineCoords.length - 1);
  }, [polylineCoords]);

  const latestSegment = useMemo(() => {
    if (polylineCoords.length <= 1) return [];
    return polylineCoords.slice(polylineCoords.length - 2);
  }, [polylineCoords]);

  // Compute Cumulative Distance Traveled over time & chart points
  const { totalDistanceMeters, telemetryChartData } = useMemo(() => {
    let dist = 0;
    const chartPoints: any[] = [];

    for (let i = 0; i < trailPositions.length; i++) {
      const p = trailPositions[i];
      if (i > 0) {
        const prev = trailPositions[i - 1];
        dist += getDistanceMeters(prev.latitude, prev.longitude, p.latitude, p.longitude);
      }
      const timeStr = new Date(p.recorded_at).toLocaleTimeString([], {
        minute: '2-digit',
        second: '2-digit',
      });
      chartPoints.push({
        time: timeStr,
        lat: Number(p.latitude.toFixed(5)),
        lon: Number(p.longitude.toFixed(5)),
        distance: Math.round(dist),
      });
    }

    return { totalDistanceMeters: Math.round(dist), telemetryChartData: chartPoints };
  }, [trailPositions]);

  // Active current point
  const currentPoint = useMemo(() => {
    if (deviceCoords) {
      return {
        lat: deviceCoords.latitude,
        lon: deviceCoords.longitude,
        acc: deviceCoords.accuracy,
      };
    }
    if (trailPositions.length > 0) {
      const last = trailPositions[trailPositions.length - 1];
      return { lat: last.latitude, lon: last.longitude, acc: last.accuracy_m || 5 };
    }
    return { lat: 28.6139, lon: 77.209, acc: 10 };
  }, [deviceCoords, trailPositions]);

  return (
    <div className="w-full h-full relative z-0 flex flex-col overflow-hidden">
      {/* Map Surface */}
      <div className="flex-1 w-full h-full relative">
        <MapContainer
          center={[currentPoint.lat, currentPoint.lon]}
          zoom={16}
          style={{ height: '100%', width: '100%', background: '#09090b' }}
          zoomControl={false}
        >
          <CameraController
            center={deviceCoords ? [deviceCoords.latitude, deviceCoords.longitude] : null}
            follow={followDevice}
          />

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />

          {/* 1. Historical Breadcrumb Trail (Connected Polyline) */}
          {historicalPath.length > 1 && (
            <Polyline
              positions={historicalPath}
              pathOptions={{
                color: '#3b82f6',
                weight: 3,
                opacity: 0.5,
                dashArray: '5, 6',
                lineJoin: 'round',
              }}
            />
          )}

          {/* 2. Most Recent Segment Highlight (High-Contrast Solid Line) */}
          {latestSegment.length === 2 && (
            <Polyline
              positions={latestSegment}
              pathOptions={{
                color: '#38bdf8',
                weight: 5,
                opacity: 0.95,
                lineCap: 'round',
              }}
            />
          )}

          {/* 3. Trail Breadcrumb Waypoint Dots */}
          {trailPositions.slice(-15).map((point, idx) => (
            <Circle
              key={`${point.id || 'pt'}_${point.recorded_at || idx}_${idx}`}
              center={[point.latitude, point.longitude]}
              radius={1.5}
              pathOptions={{
                color: idx === trailPositions.slice(-15).length - 1 ? '#38bdf8' : '#3b82f6',
                fillColor: '#ffffff',
                fillOpacity: 0.9,
                weight: 1,
              }}
            />
          ))}

          {/* 4. Current Device / Unit Marker */}
          {deviceCoords ? (
            <>
              <Circle
                center={[deviceCoords.latitude, deviceCoords.longitude]}
                radius={Math.max(deviceCoords.accuracy, 15)}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.12,
                  weight: 1,
                  dashArray: '4, 4',
                }}
              />
              <Marker
                position={[deviceCoords.latitude, deviceCoords.longitude]}
                icon={createDeviceIcon()}
              >
                <Popup className="glass-panel text-foreground">
                  <div className="font-mono text-xs p-1">
                    <div className="text-accent font-bold mb-1 flex items-center gap-1.5">
                      <Navigation size={12} />
                      OPERATOR HARDWARE (GPS TRACKED)
                    </div>
                    <div><strong>Lat:</strong> {deviceCoords.latitude.toFixed(6)}</div>
                    <div><strong>Lon:</strong> {deviceCoords.longitude.toFixed(6)}</div>
                    <div><strong>Accuracy:</strong> ±{Math.round(deviceCoords.accuracy)}m</div>
                    <div><strong>Distance Patrol:</strong> {totalDistanceMeters} m</div>
                  </div>
                </Popup>
              </Marker>
            </>
          ) : (
            <Marker
              position={[currentPoint.lat, currentPoint.lon]}
              icon={createUnitIcon('Q-01', true)}
            >
              <Popup className="glass-panel text-foreground">
                <div className="font-mono text-xs p-1">
                  <div className="font-bold text-accent mb-1">Q-01 Quadruped</div>
                  <div><strong>Lat:</strong> {currentPoint.lat.toFixed(5)}</div>
                  <div><strong>Lon:</strong> {currentPoint.lon.toFixed(5)}</div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Floating Top-Right GPS Status HUD */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2 pointer-events-auto">
          <div className="glass-panel px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2.5 border border-panel-border bg-black/75 backdrop-blur-md shadow-lg">
            {gpsStatus === 'locked' && deviceCoords ? (
              <>
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <div className="flex flex-col text-left">
                  <span className="text-[10px] text-success font-bold tracking-wider flex items-center gap-1">
                    <CheckCircle2 size={11} /> GPS LOCKED
                  </span>
                  <span className="text-[9px] text-foreground/60">
                    {deviceCoords.latitude.toFixed(4)}°, {deviceCoords.longitude.toFixed(4)}° (±{Math.round(deviceCoords.accuracy)}m)
                  </span>
                </div>
              </>
            ) : gpsStatus === 'acquiring' ? (
              <>
                <RefreshCw size={12} className="animate-spin text-warning" />
                <span className="text-warning text-[10px] tracking-wider uppercase">Acquiring Live GPS...</span>
              </>
            ) : (
              <>
                <AlertCircle size={13} className="text-destructive" />
                <div className="flex flex-col text-left">
                  <span className="text-destructive text-[10px] font-bold tracking-wider uppercase">GPS Offline</span>
                  <span className="text-[9px] text-foreground/60 max-w-[180px] truncate" title={gpsErrorMsg || ''}>
                    {gpsErrorMsg || 'Position unavailable'}
                  </span>
                </div>
              </>
            )}

            <div className="flex items-center gap-1.5 ml-2 border-l border-white/10 pl-2">
              {gpsStatus === 'error' && (
                <button
                  onClick={() => startGeolocation(activeUnitId)}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 text-[9px] text-white rounded transition-colors"
                >
                  Retry
                </button>
              )}
              {deviceCoords && (
                <button
                  onClick={() => setFollowDevice(!followDevice)}
                  className={`p-1.5 rounded transition-colors ${followDevice ? 'bg-accent text-white' : 'bg-white/5 hover:bg-white/10 text-foreground/60'}`}
                  title={followDevice ? 'Lock Camera to Unit' : 'Free Camera'}
                >
                  <Crosshair size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Corner Brackets */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-accent opacity-50 z-10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-accent opacity-50 z-10 pointer-events-none" />
      </div>

      {/* Real-time Location Bar & Coordinate Log Tray */}
      <div className="glass-panel border-x-0 border-b-0 border-t border-panel-border bg-black/85 backdrop-blur-md z-20 flex flex-col shrink-0">
        {/* Strip: Coordinates, Station, Distance & Expand Toggle */}
        <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Coordinates */}
            <div className="flex items-center gap-1.5 text-foreground/90">
              <Compass size={14} className="text-accent" />
              <span className="font-bold tracking-wider">
                {currentPoint.lat.toFixed(5)}° N, {currentPoint.lon.toFixed(5)}° E
              </span>
            </div>

            {/* Station / Zone */}
            <div className="flex items-center gap-1.5 text-foreground/60 border-l border-white/10 pl-3">
              <Route size={14} className="text-success" />
              <span className="truncate max-w-[260px]">{currentStationName}</span>
            </div>

            {/* Total Distance Traveled */}
            <div className="flex items-center gap-1.5 text-foreground/60 border-l border-white/10 pl-3">
              <Activity size={13} className="text-cyan-400" />
              <span>SESSION PATROL:</span>
              <strong className="text-cyan-300">
                {totalDistanceMeters >= 1000
                  ? `${(totalDistanceMeters / 1000).toFixed(2)} km`
                  : `${totalDistanceMeters} m`}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Clock */}
            <div className="flex items-center gap-1.5 text-[10px] text-foreground/50">
              <Clock size={12} />
              <span>{liveClock || 'SYNCING...'}</span>
            </div>

            {/* Toggle Coordinate Graph Drawer */}
            <button
              onClick={() => setShowTelemetryTray(v => !v)}
              className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-foreground/80 border border-white/10 text-[10px] flex items-center gap-1 transition-colors"
            >
              <span>COORDINATE LOGS</span>
              {showTelemetryTray ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
          </div>
        </div>

        {/* Collapsible Coordinate Log Graphs (Lat vs Time, Lon vs Time, Cumulative Distance) */}
        {showTelemetryTray && (
          <div className="p-4 border-t border-panel-border/60 grid grid-cols-1 md:grid-cols-3 gap-3 bg-black/60 animate-in slide-in-from-bottom-2">
            {/* Latitude vs Time */}
            <div className="glass-panel p-2.5 rounded-lg border border-panel-border bg-black/40 flex flex-col">
              <div className="text-[10px] font-mono text-foreground/60 mb-1 flex justify-between">
                <span>LATITUDE VARIATION</span>
                <span className="text-accent">{currentPoint.lat.toFixed(5)}°</span>
              </div>
              <div className="h-20 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryChartData.slice(-25)}>
                    <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={8} tickLine={false} />
                    <YAxis domain={['dataMin - 0.0005', 'dataMax + 0.0005']} stroke="rgba(255,255,255,0.3)" fontSize={8} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px' }} />
                    <Line type="monotone" dataKey="lat" stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Longitude vs Time */}
            <div className="glass-panel p-2.5 rounded-lg border border-panel-border bg-black/40 flex flex-col">
              <div className="text-[10px] font-mono text-foreground/60 mb-1 flex justify-between">
                <span>LONGITUDE VARIATION</span>
                <span className="text-accent">{currentPoint.lon.toFixed(5)}°</span>
              </div>
              <div className="h-20 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryChartData.slice(-25)}>
                    <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={8} tickLine={false} />
                    <YAxis domain={['dataMin - 0.0005', 'dataMax + 0.0005']} stroke="rgba(255,255,255,0.3)" fontSize={8} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px' }} />
                    <Line type="monotone" dataKey="lon" stroke="#818cf8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Distance Traveled Over Time */}
            <div className="glass-panel p-2.5 rounded-lg border border-panel-border bg-black/40 flex flex-col">
              <div className="text-[10px] font-mono text-foreground/60 mb-1 flex justify-between">
                <span>CUMULATIVE DISTANCE</span>
                <span className="text-cyan-400">{totalDistanceMeters} m</span>
              </div>
              <div className="h-20 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryChartData.slice(-25)}>
                    <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={8} tickLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={8} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px' }} />
                    <Line type="monotone" dataKey="distance" name="Meters" stroke="#2dd4bf" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
