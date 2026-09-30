'use client';

import React from 'react';
import ParticleWave from './ParticleWave';

export default function DashboardBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#03040a]">
      {/* Luminous Ambient Glowing Light Orbs (Ghost Luma Theme) */}
      <div className="fixed -top-32 left-1/3 w-[650px] h-[650px] bg-gradient-to-br from-[#b8d4f0]/20 via-sky-600/15 to-transparent rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed -bottom-20 right-1/4 w-[550px] h-[550px] bg-gradient-to-tl from-indigo-600/20 via-[#b8d4f0]/15 to-transparent rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(184,212,240,0.15),rgba(15,23,42,0.4)_55%,rgba(3,4,10,0.85)_100%)]" />

      {/* 3D Liquid Glass WebGL Particle Wave Background */}
      <ParticleWave className="opacity-95" transparent={true} />

      {/* Ghost NAVIC Satellite & Orbital Telemetry HUD */}
      <div className="fixed top-3 right-6 z-10 hidden xl:flex items-center gap-3 font-mono text-[10px] text-[#b8d4f0]/80 border border-[#b8d4f0]/20 px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-xl shadow-[0_0_20px_rgba(184,212,240,0.08)]">
        <span className="w-2 h-2 rounded-full bg-[#b8d4f0] shadow-[0_0_10px_#b8d4f0] animate-pulse" />
        <span className="tracking-widest font-bold">GHOST RECON MATRIX</span>
        <span className="text-white/30">•</span>
        <span className="text-zinc-400">ISRO NAVIC L1/L5 ACTIVE</span>
      </div>

      {/* Corner Telemetry Reticles */}
      <div className="fixed bottom-3 left-4 z-10 hidden md:block font-mono text-[9px] text-zinc-500 tracking-wider">
        GRID SECTOR: <span className="text-[#b8d4f0]/90">22.5954° N, 88.4542° E</span> // AES-256 GHOST RECON
      </div>
    </div>
  );
}
