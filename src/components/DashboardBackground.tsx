'use client';

import React from 'react';
import ParticleWave from './ParticleWave';

export default function DashboardBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#FAFAFA]">
      {/* Radiant Ambient Light Mesh & Glowing Orbs (Loda Bright Theme - High Vibrancy) */}
      <div className="fixed -top-40 left-1/4 w-[850px] h-[850px] bg-gradient-to-br from-sky-300/70 via-cyan-200/60 to-transparent rounded-full blur-[130px] pointer-events-none z-0 animate-pulse duration-[8000ms]" />
      <div className="fixed -bottom-24 right-1/4 w-[750px] h-[750px] bg-gradient-to-tl from-indigo-300/60 via-sky-200/50 to-transparent rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="fixed top-1/3 right-10 w-[550px] h-[550px] bg-gradient-to-bl from-cyan-200/55 via-sky-100/45 to-transparent rounded-full blur-[110px] pointer-events-none z-0" />
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_85%_65%_at_50%_-10%,rgba(56,189,248,0.32),rgba(248,250,252,0.5)_65%,#FAFAFA_100%)]" />

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
