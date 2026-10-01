'use client';

import React from 'react';
import ParticleWave from './ParticleWave';

export default function DashboardBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-gradient-to-br from-sky-100/50 via-cyan-50/30 to-slate-100/40">
      {/* Radiant Ambient Light Mesh & Glowing Orbs (Direct Glow Behind Sidebar & Panels) */}
      <div className="fixed -top-20 -left-28 w-[650px] h-[1050px] bg-gradient-to-r from-sky-300/70 via-cyan-200/50 to-transparent rounded-full blur-[110px] pointer-events-none z-0 animate-pulse duration-[7000ms]" />
      <div className="fixed -top-40 left-1/3 w-[850px] h-[850px] bg-gradient-to-br from-sky-300/65 via-cyan-200/55 to-transparent rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="fixed -bottom-24 right-1/4 w-[750px] h-[750px] bg-gradient-to-tl from-indigo-300/55 via-sky-200/45 to-transparent rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="fixed top-1/3 right-10 w-[550px] h-[550px] bg-gradient-to-bl from-cyan-200/50 via-sky-100/40 to-transparent rounded-full blur-[110px] pointer-events-none z-0" />
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-10%,rgba(56,189,248,0.35),rgba(248,250,252,0.4)_65%,rgba(241,245,249,0.8)_100%)]" />

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
