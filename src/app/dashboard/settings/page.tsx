'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Shield, Bell, Camera, Cpu, Wifi, Key, Save, Check, Smartphone, Radio } from 'lucide-react';
import VikrantLogo from '@/components/VikrantLogo';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [aiSensitivity, setAiSensitivity] = useState(42);
  const [autoCapture, setAutoCapture] = useState(true);
  const [shutterAudio, setShutterAudio] = useState(true);
  const [thermalSimulation, setThermalSimulation] = useState(true);

  // Global Camera Source Config (Applied across all pages)
  const [cameraSource, setCameraSource] = useState<'ip_webcam' | 'device'>('ip_webcam');
  const [ipWebcamUrl, setIpWebcamUrl] = useState<string>('http://10.35.147.163:8080/video');
  const [ipStreamMode, setIpStreamMode] = useState<'direct' | 'proxy'>('direct');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const savedSource = localStorage.getItem('vikrant_camera_source');
      if (savedSource === 'device' || savedSource === 'ip_webcam') setCameraSource(savedSource);
      
      let savedUrl = localStorage.getItem('vikrant_ip_webcam_url');
      if (savedUrl) {
        if (savedUrl.includes('10.35.147.52') || savedUrl.includes('10.35.147.247')) {
          savedUrl = savedUrl.replace('10.35.147.52', '10.35.147.163').replace('10.35.147.247', '10.35.147.163');
          localStorage.setItem('vikrant_ip_webcam_url', savedUrl);
        }
        setIpWebcamUrl(savedUrl);
      }

      let savedMode = localStorage.getItem('vikrant_ip_stream_mode');
      if (isCloud && savedMode === 'proxy') {
        savedMode = 'direct';
        localStorage.setItem('vikrant_ip_stream_mode', 'direct');
      }
      if (savedMode === 'direct' || savedMode === 'proxy') setIpStreamMode(savedMode);
    }
  }, []);

  const handleSave = () => {
    if (typeof window !== 'undefined') {
      let cleanUrl = ipWebcamUrl.trim();
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) cleanUrl = 'http://' + cleanUrl;
      cleanUrl = cleanUrl.replace(/\/+$/, '');
      if (!cleanUrl.includes('/video') && !cleanUrl.includes('/shot.jpg')) cleanUrl += '/video';

      localStorage.setItem('vikrant_camera_source', cameraSource);
      localStorage.setItem('vikrant_ip_webcam_url', cleanUrl);
      localStorage.setItem('vikrant_ip_stream_mode', ipStreamMode);
      setIpWebcamUrl(cleanUrl);

      window.dispatchEvent(
        new CustomEvent('vikrant:camera_settings_changed', {
          detail: { cameraSource, ipWebcamUrl: cleanUrl, ipStreamMode },
        })
      );
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex flex-col h-full w-full p-6 gap-6 overflow-y-auto bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between glass-panel px-6 py-4 rounded-2xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Settings size={22} />
          </div>
          <div>
            <h1 className="text-base font-mono font-bold text-white tracking-wider">
              OPERATIONAL SETTINGS & HARDWARE CONFIG
            </h1>
            <p className="text-[11px] font-mono text-foreground/50">
              IR Vikrant Autonomous Command • Unit Q-01 & Handheld Sensor Hub
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2"
        >
          {saved ? <Check size={14} /> : <Save size={14} />}
          <span>{saved ? 'SETTINGS COMMITTED' : 'SAVE CONFIGURATION'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">
        {/* 1. AI Vision & Optical Trigger Config */}
        <div className="glass-panel rounded-2xl p-5 border border-panel-border flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/5">
            <Camera size={16} className="text-cyan-400" />
            <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              AI Vision & Auto-Capture Tuning
            </h3>
          </div>

          <div className="space-y-4 font-mono text-xs">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-foreground/70">Detection Confidence Threshold</span>
                <strong className="text-cyan-400">{aiSensitivity}%</strong>
              </div>
              <input
                type="range"
                min="25"
                max="85"
                value={aiSensitivity}
                onChange={e => setAiSensitivity(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <span className="text-[9px] text-foreground/40 mt-1 block">
                Lower threshold accelerates trigger reaction time on props (bottles, bags, pouches).
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div>
                <div className="text-foreground/90 font-medium">Automatic Frame Capture</div>
                <div className="text-[10px] text-foreground/40">Upload to Supabase Storage on prop match</div>
              </div>
              <input
                type="checkbox"
                checked={autoCapture}
                onChange={e => setAutoCapture(e.target.checked)}
                className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div>
                <div className="text-foreground/90 font-medium">Shutter Audio & Flash</div>
                <div className="text-[10px] text-foreground/40">Synthesize audio beep and white flash on capture</div>
              </div>
              <input
                type="checkbox"
                checked={shutterAudio}
                onChange={e => setShutterAudio(e.target.checked)}
                className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div>
                <div className="text-foreground/90 font-medium">Simulated Thermal Pseudo-Color</div>
                <div className="text-[10px] text-foreground/40">Enable RGB-to-thermal false-color filter</div>
              </div>
              <input
                type="checkbox"
                checked={thermalSimulation}
                onChange={e => setThermalSimulation(e.target.checked)}
                className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 2. Global Surveillance Camera Source (Phone IP Cam vs Laptop WebCam) */}
        <div className="glass-panel rounded-2xl p-5 border border-cyan-500/30 flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/5">
            <Smartphone size={16} className="text-cyan-400" />
            <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              Primary Surveillance Camera Source
            </h3>
          </div>

          <div className="space-y-4 font-mono text-xs">
            <div>
              <label className="text-[10px] text-foreground/50 uppercase block mb-1.5">DEFAULT ACTIVE CAMERA</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCameraSource('ip_webcam')}
                  className={`p-2.5 rounded-xl border flex flex-col items-start gap-1 transition-all ${
                    cameraSource === 'ip_webcam'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 font-bold shadow-md'
                      : 'bg-black/40 text-foreground/50 border-panel-border hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <Smartphone size={14} />
                    <span>MOBILE PHONE CAM</span>
                  </span>
                  <span className="text-[9px] font-normal text-foreground/40">Android IP Webcam stream</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCameraSource('device')}
                  className={`p-2.5 rounded-xl border flex flex-col items-start gap-1 transition-all ${
                    cameraSource === 'device'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 font-bold shadow-md'
                      : 'bg-black/40 text-foreground/50 border-panel-border hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <Camera size={14} />
                    <span>LAPTOP / USB WEBCAM</span>
                  </span>
                  <span className="text-[9px] font-normal text-foreground/40">Built-in device camera</span>
                </button>
              </div>
            </div>

            {cameraSource === 'ip_webcam' && (
              <div className="space-y-2 pt-2 border-t border-white/5 animate-in fade-in">
                <div>
                  <label className="text-[10px] text-foreground/50 uppercase block mb-1">IP WEBCAM STREAM URL</label>
                  <input
                    type="text"
                    placeholder="http://10.35.147.163:8080/video"
                    value={ipWebcamUrl}
                    onChange={e => setIpWebcamUrl(e.target.value)}
                    className="w-full bg-black/60 border border-panel-border rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400 text-xs"
                  />
                </div>

                <div className="flex items-center justify-between text-[9px] flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-foreground/50 font-bold">PRESETS:</span>
                    <button
                      type="button"
                      onClick={() => setIpWebcamUrl('http://10.35.147.163:8080/video')}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-cyan-500/20 text-white/80"
                    >
                      10.35.147.163 (HTTP)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIpWebcamUrl('https://10.35.147.163:8080/video');
                        window.open('https://10.35.147.163:8080', '_blank');
                      }}
                      className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30"
                      title="Opens phone HTTPS in tab to trust cert"
                    >
                      10.35.147.163 (HTTPS ↗)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIpWebcamUrl('http://10.35.147.52:8080/video')}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-cyan-500/20 text-white/60"
                    >
                      10.35.147.52 (Old)
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-foreground/50">ROUTE:</span>
                    <button
                      type="button"
                      onClick={() => setIpStreamMode('direct')}
                      className={`px-1.5 py-0.5 rounded ${ipStreamMode === 'direct' ? 'bg-cyan-500/30 text-cyan-300 font-bold' : 'text-foreground/40'}`}
                    >
                      DIRECT
                    </button>
                    <button
                      type="button"
                      onClick={() => setIpStreamMode('proxy')}
                      className={`px-1.5 py-0.5 rounded ${ipStreamMode === 'proxy' ? 'bg-cyan-500/30 text-cyan-300 font-bold' : 'text-foreground/40'}`}
                    >
                      PROXY
                    </button>
                  </div>
                </div>

                <div className="text-[9px] text-cyan-300/90 bg-cyan-950/40 p-2 rounded-lg border border-cyan-500/20 flex flex-col gap-1 mt-2">
                  <span className="font-bold text-cyan-400">⚡ VERCEL (HTTPS) STREAMING TIP:</span>
                  <span>Browsers block local HTTP streams on secure websites. In Chrome/Edge: click the tune/padlock icon left of the URL in the address bar ➔ <strong>Site settings</strong> ➔ Set <strong>Insecure content</strong> to <strong>Allow</strong> ➔ Refresh.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Security & RPF Station Identity */}
        <div className="glass-panel rounded-2xl p-5 border border-panel-border flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/5">
            <Shield size={16} className="text-emerald-400" />
            <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              Operator & Sector Identity
            </h3>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div>
              <label className="text-[10px] text-foreground/50 uppercase block mb-1">STATION CODE</label>
              <input
                type="text"
                defaultValue="NDLS (New Delhi Central)"
                className="w-full bg-black/50 border border-panel-border rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-[10px] text-foreground/50 uppercase block mb-1">DIVISION & ZONE</label>
              <input
                type="text"
                defaultValue="Delhi Division • Northern Railway Zone"
                className="w-full bg-black/50 border border-panel-border rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-[10px] text-foreground/50 uppercase block mb-1">DUTY OFFICER ID</label>
              <input
                type="text"
                defaultValue="Insp. Rajesh Kumar (RPF-8492)"
                className="w-full bg-black/50 border border-panel-border rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-[10px] text-foreground/50 uppercase block mb-1">DATA REPOSITORY</label>
              <div className="p-2.5 rounded-xl bg-black/40 border border-panel-border text-[10px] text-foreground/60 flex items-center justify-between">
                <span>Supabase PostgreSQL + Realtime</span>
                <span className="text-emerald-400 font-bold">CONNECTED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
