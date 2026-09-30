'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Shield, Bell, Camera, Cpu, Wifi, Key, Save, Check, Smartphone, Radio } from 'lucide-react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [aiSensitivity, setAiSensitivity] = useState(42);
  const [autoCapture, setAutoCapture] = useState(true);
  const [shutterAudio, setShutterAudio] = useState(true);
  const [thermalSimulation, setThermalSimulation] = useState(true);

  // Global Camera Source Config (Applied across all pages)
  const [cameraSource, setCameraSource] = useState<'ip_webcam' | 'device'>('ip_webcam');
  const [ipWebcamUrl, setIpWebcamUrl] = useState<string>('http://10.35.147.105:8080/video');
  const [ipStreamMode, setIpStreamMode] = useState<'direct' | 'proxy'>('direct');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const savedSource = localStorage.getItem('vikrant_camera_source');
      if (savedSource === 'device' || savedSource === 'ip_webcam') setCameraSource(savedSource);
      
      let savedUrl = localStorage.getItem('vikrant_ip_webcam_url');
      if (savedUrl) {
        if (savedUrl.includes('10.35.147.')) {
          savedUrl = savedUrl.replace(/10\.35\.147\.\d+/, '10.35.147.105');
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
      {/* Header Rail */}
      <div className="flex items-center justify-between glass-panel px-6 py-4 rounded-2xl shrink-0 border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 shadow-sm">
            <Settings size={24} />
          </div>
          <div>
            <h1 className="text-base font-sans font-bold text-slate-900 tracking-tight">
              OPERATIONAL SETTINGS & HARDWARE CONFIG
            </h1>
            <p className="text-xs font-sans text-slate-600 font-medium">
              IR Vikrant Autonomous Command • Unit Q-01 & Handheld Sensor Hub
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-xl text-xs font-sans font-bold flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all active:scale-95"
        >
          {saved ? <Check size={16} /> : <Save size={16} />}
          <span>{saved ? 'SETTINGS COMMITTED' : 'SAVE CONFIGURATION'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">
        {/* 1. AI Vision & Optical Trigger Config */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <Camera size={18} className="text-sky-600" />
            <h3 className="font-sans text-xs font-bold text-slate-900 uppercase tracking-tight">
              AI Vision & Auto-Capture Tuning
            </h3>
          </div>

          <div className="space-y-4 font-sans text-xs">
            <div>
              <div className="flex justify-between items-center mb-1.5 font-semibold text-slate-800">
                <span>Detection Confidence Threshold</span>
                <strong className="text-sky-700 font-bold">{aiSensitivity}%</strong>
              </div>
              <input
                type="range"
                min="25"
                max="85"
                value={aiSensitivity}
                onChange={e => setAiSensitivity(Number(e.target.value))}
                className="w-full accent-sky-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                Lower threshold accelerates trigger reaction time on props (bottles, bags, pouches).
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div>
                <div className="text-slate-900 font-bold">Automatic Frame Capture</div>
                <div className="text-[11px] text-slate-500 font-medium">Upload to Supabase Storage on prop match</div>
              </div>
              <input
                type="checkbox"
                checked={autoCapture}
                onChange={e => setAutoCapture(e.target.checked)}
                className="w-4 h-4 accent-sky-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div>
                <div className="text-slate-900 font-bold">Shutter Audio & Flash</div>
                <div className="text-[11px] text-slate-500 font-medium">Synthesize audio beep and white flash on capture</div>
              </div>
              <input
                type="checkbox"
                checked={shutterAudio}
                onChange={e => setShutterAudio(e.target.checked)}
                className="w-4 h-4 accent-sky-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div>
                <div className="text-slate-900 font-bold">Simulated Thermal Pseudo-Color</div>
                <div className="text-[11px] text-slate-500 font-medium">Enable RGB-to-thermal false-color filter</div>
              </div>
              <input
                type="checkbox"
                checked={thermalSimulation}
                onChange={e => setThermalSimulation(e.target.checked)}
                className="w-4 h-4 accent-sky-600 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 2. Global Surveillance Camera Source */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <Smartphone size={18} className="text-sky-600" />
            <h3 className="font-sans text-xs font-bold text-slate-900 uppercase tracking-tight">
              Primary Surveillance Camera Source
            </h3>
          </div>

          <div className="space-y-4 font-sans text-xs">
            <div>
              <label className="text-[11px] text-slate-500 font-bold uppercase block mb-1.5">DEFAULT ACTIVE CAMERA</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCameraSource('ip_webcam')}
                  className={`p-3 rounded-xl border flex flex-col items-start gap-1 transition-all ${
                    cameraSource === 'ip_webcam'
                      ? 'bg-sky-50 text-sky-900 border-sky-300 font-bold shadow-xs'
                      : 'bg-white/80 text-slate-700 border-slate-200 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <Smartphone size={15} />
                    <span>MOBILE PHONE CAM</span>
                  </span>
                  <span className="text-[10px] font-normal text-slate-500">Android IP Webcam stream</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCameraSource('device')}
                  className={`p-3 rounded-xl border flex flex-col items-start gap-1 transition-all ${
                    cameraSource === 'device'
                      ? 'bg-sky-50 text-sky-900 border-sky-300 font-bold shadow-xs'
                      : 'bg-white/80 text-slate-700 border-slate-200 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <Camera size={15} />
                    <span>LAPTOP / USB WEBCAM</span>
                  </span>
                  <span className="text-[10px] font-normal text-slate-500">Built-in device camera</span>
                </button>
              </div>
            </div>

            {cameraSource === 'ip_webcam' && (
              <div className="space-y-3 pt-3 border-t border-slate-200 animate-in fade-in">
                <div>
                  <label className="text-[11px] text-slate-500 font-bold uppercase block mb-1">IP WEBCAM STREAM URL</label>
                  <input
                    type="text"
                    placeholder="http://10.35.147.105:8080/video"
                    value={ipWebcamUrl}
                    onChange={e => setIpWebcamUrl(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-medium text-xs shadow-xs"
                  />
                </div>

                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-500 font-bold">PRESETS:</span>
                    <button
                      type="button"
                      onClick={() => setIpWebcamUrl('http://10.35.147.105:8080/video')}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium border border-slate-200"
                    >
                      10.35.147.105 (HTTP)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIpWebcamUrl('https://10.35.147.105:8080/video');
                        window.open('https://10.35.147.105:8080', '_blank');
                      }}
                      className="px-2.5 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 font-bold"
                      title="Opens phone HTTPS in tab to trust cert"
                    >
                      10.35.147.105 (HTTPS ↗)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIpWebcamUrl('http://10.35.147.52:8080/video')}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                    >
                      10.35.147.52 (Old)
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="text-slate-500">ROUTE:</span>
                    <button
                      type="button"
                      onClick={() => setIpStreamMode('direct')}
                      className={`px-2 py-0.5 rounded font-bold ${ipStreamMode === 'direct' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      DIRECT
                    </button>
                    <button
                      type="button"
                      onClick={() => setIpStreamMode('proxy')}
                      className={`px-2 py-0.5 rounded font-bold ${ipStreamMode === 'proxy' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      PROXY
                    </button>
                  </div>
                </div>

                <div className="text-xs text-sky-900 bg-sky-50 p-3 rounded-xl border border-sky-200 flex flex-col gap-1 mt-2 font-medium">
                  <span className="font-bold text-sky-800">⚡ VERCEL (HTTPS) STREAMING TIP:</span>
                  <span>Browsers block local HTTP streams on secure websites. In Chrome/Edge: click the tune/padlock icon left of the URL in the address bar ➔ <strong>Site settings</strong> ➔ Set <strong>Insecure content</strong> to <strong>Allow</strong> ➔ Refresh.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Security & RPF Station Identity */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <Shield size={18} className="text-emerald-600" />
            <h3 className="font-sans text-xs font-bold text-slate-900 uppercase tracking-tight">
              Operator & Sector Identity
            </h3>
          </div>

          <div className="space-y-3 font-sans text-xs">
            <div>
              <label className="text-[11px] text-slate-500 font-bold uppercase block mb-1">STATION CODE</label>
              <input
                type="text"
                defaultValue="NDLS (New Delhi Central)"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-medium"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-500 font-bold uppercase block mb-1">DIVISION & ZONE</label>
              <input
                type="text"
                defaultValue="Delhi Division • Northern Railway Zone"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-medium"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-500 font-bold uppercase block mb-1">DUTY OFFICER ID</label>
              <input
                type="text"
                defaultValue="Insp. Rajesh Kumar (RPF-8492)"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-medium"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-500 font-bold uppercase block mb-1">DATA REPOSITORY</label>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between font-medium">
                <span>Supabase PostgreSQL + Realtime</span>
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">CONNECTED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
