'use client';

import React from 'react';
import ParticleWave from './ParticleWave';

export default function DashboardBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#FAFAFA]">
      {/* Radiant Ambient Light Mesh & Glowing Orbs (Loda Bright Theme) */}
      <div className="fixed -top-40 left-1/4 w-[750px] h-[750px] bg-gradient-to-br from-sky-200/60 via-blue-100/50 to-transparent rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed -bottom-24 right-1/4 w-[650px] h-[650px] bg-gradient-to-tl from-indigo-200/50 via-sky-100/40 to-transparent rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed top-1/3 right-10 w-[450px] h-[450px] bg-gradient-to-bl from-cyan-100/40 via-sky-50/30 to-transparent rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(56,189,248,0.18),rgba(248,250,252,0.6)_60%,#FAFAFA_100%)]" />

      {/* 3D Liquid Glass WebGL Particle Wave Background */}
      <ParticleWave className="opacity-100" transparent={true} />

      {/* Ghost NAVIC Satellite & Orbital Telemetry HUD */}
      <div className="fixed top-3 right-6 z-10 hidden xl:flex items-center gap-3 font-mono text-[10px] text-slate-800 border border-white/80 px-3.5 py-1.5 rounded-full bg-white/70 backdrop-blur-xl shadow-xs">
        <span className="w-2 h-2 rounded-full bg-sky-600 shadow-[0_0_8px_#0284c7] animate-pulse" />
        <span className="tracking-widest font-bold text-slate-900">GHOST RECON MATRIX</span>
        <span className="text-slate-300">•</span>
        <span className="text-slate-600 font-semibold">ISRO NAVIC L1/L5 ACTIVE</span>
      </div>

      {/* Corner Telemetry Reticles */}
      <div className="fixed bottom-3 left-4 z-10 hidden md:block font-mono text-[9px] text-slate-600 font-medium tracking-wider">
        GRID SECTOR: <span className="text-sky-700 font-bold">22.5954° N, 88.4542° E</span> // AES-256 GHOST RECON
      </div>
    </div>
  );
}
