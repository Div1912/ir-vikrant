'use client';

import React from 'react';
import ParticleWave from './ParticleWave';

export default function DashboardBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#FAFAFA]">
      {/* Luminous Ambient Glowing Light Orbs (Ghost Bright Luma Theme) */}
      <div className="fixed -top-32 left-1/3 w-[650px] h-[650px] bg-gradient-to-br from-sky-200/50 via-blue-100/40 to-transparent rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed -bottom-20 right-1/4 w-[550px] h-[550px] bg-gradient-to-tl from-indigo-200/40 via-sky-100/30 to-transparent rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(56,189,248,0.15),rgba(248,250,252,0.7)_60%,#FAFAFA_100%)]" />

      {/* 3D Liquid Glass WebGL Particle Wave Background */}
      <ParticleWave className="opacity-90" transparent={true} />

      {/* Ghost NAVIC Satellite & Orbital Telemetry HUD */}
      <div className="fixed top-3 right-6 z-10 hidden xl:flex items-center gap-3 font-mono text-[10px] text-slate-700 border border-slate-200/80 px-3.5 py-1.5 rounded-full bg-white/80 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <span className="w-2 h-2 rounded-full bg-sky-600 shadow-[0_0_8px_#0284c7] animate-pulse" />
        <span className="tracking-widest font-bold text-slate-900">GHOST RECON MATRIX</span>
        <span className="text-slate-300">•</span>
        <span className="text-slate-500">ISRO NAVIC L1/L5 ACTIVE</span>
      </div>

      {/* Corner Telemetry Reticles */}
      <div className="fixed bottom-3 left-4 z-10 hidden md:block font-mono text-[9px] text-slate-500 tracking-wider">
        GRID SECTOR: <span className="text-sky-700 font-bold">22.5954° N, 88.4542° E</span> // AES-256 GHOST RECON
      </div>
    </div>
  );
}
