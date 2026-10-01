import React from 'react';
import Link from 'next/link';
import { Map, Lock, ChevronRight, Scan, Zap, ShieldCheck, Camera, Activity } from 'lucide-react';
import VikrantLogo from '@/components/VikrantLogo';
import DashboardBackground from '@/components/DashboardBackground';
import LandingBackground from '@/components/LandingBackground';

export default function LandingPage() {
  return (
    <div className="min-h-screen text-slate-900 flex flex-col font-sans relative overflow-x-hidden bg-transparent">
      {/* 3D Liquid Crystal Wave & Ambient Light Mesh Background (Identical to Dashboard) */}
      <DashboardBackground />
      <LandingBackground />
      
      {/* iOS Liquid Crystal Transparent Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/60 px-6 py-4 flex justify-between items-center backdrop-blur-3xl bg-white/35 shadow-sm">
        <VikrantLogo size={36} showText={true} />
        
        <div className="flex items-center gap-4">
          <span className="hidden md:inline-flex items-center gap-2 text-xs font-sans font-bold tracking-tight text-sky-950 bg-white/60 border border-white/80 px-3.5 py-1.5 rounded-full shadow-xs backdrop-blur-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shadow-[0_0_8px_#059669]" />
            RPF HIGH SECURITY LEVEL 4
          </span>
          <Link
            href="/dashboard"
            className="text-xs font-sans font-bold px-4.5 py-2.5 rounded-2xl transition-all flex items-center gap-2 liquid-btn-primary shadow-md active:scale-95"
          >
            <span>ENTER COMMAND</span>
            <Lock size={14} className="text-sky-100" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 pt-32 px-6 flex flex-col relative z-10">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center mt-12 mb-20">
          {/* Modern Tactical Pill Badge */}
          <div className="inline-flex items-center gap-2.5 px-4.5 py-1.5 rounded-full border border-white/80 bg-white/50 backdrop-blur-2xl text-sky-950 text-xs font-sans font-bold mb-8 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-sky-600 animate-pulse shadow-[0_0_8px_#0284c7]" />
            AUTONOMOUS QUADRUPED & RECON COMMAND
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 leading-[1.06] text-slate-950">
            Next-Gen Tactical <br />
            <span className="bg-gradient-to-r from-sky-700 via-blue-800 to-indigo-900 bg-clip-text text-transparent font-bold">
              Robotics Command.
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-base md:text-lg text-slate-700 max-w-2xl font-semibold mb-10 leading-relaxed font-sans">
            IR Vikrant is the centralized operational command center for AI-enabled quadruped security units, real-time visual recon, and high-efficiency facial & contraband threat interception across the Indian Railways network.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="px-8 py-4 rounded-2xl flex items-center gap-3 transition-all group font-sans tracking-tight text-sm font-bold liquid-btn-primary shadow-lg active:scale-95"
            >
              <span>LAUNCH COMMAND CENTER</span>
              <ChevronRight size={18} className="text-sky-100 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/dashboard/captures"
              className="px-7 py-4 rounded-2xl flex items-center gap-2.5 liquid-btn border border-white/80 font-sans text-sm font-bold shadow-xs transition-colors"
            >
              <Scan size={18} className="text-sky-600" />
              <span>AI RECON GALLERY</span>
            </Link>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-20 w-full">
          <FeatureCard 
            icon={<Map size={24} className="text-sky-600" />}
            title="Live GPS Trail & Telemetry"
            desc="Real-time geo-tracking with connected breadcrumb paths, coordinate log variations, and cumulative distance meters."
          />
          <FeatureCard 
            icon={<Scan size={24} className="text-sky-600" />}
            title="AI Vision Auto-Capture"
            desc="On-device neural vision flags contraband, weapons, and parcels, captures annotated frames, and dispatches evidence directly to Supabase."
          />
          <FeatureCard 
            icon={<Zap size={24} className="text-sky-600" />}
            title="Robot Drive Power Interlock"
            desc="Direct command execution to energize robot actuator motor drives or trigger safety power stops."
          />
        </div>

        {/* Mission Readiness Metrics Card */}
        <div className="max-w-6xl mx-auto glass-liquid-panel rounded-3xl p-10 md:p-12 mb-20 border border-white/80 bg-white/35 backdrop-blur-3xl w-full relative overflow-hidden shadow-lg text-slate-900">
          <div className="text-center mb-10">
            <h2 className="text-xs font-sans font-bold tracking-wider text-sky-800 mb-2 uppercase">NETWORK-WIDE SCALE</h2>
            <h3 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-950">Mission Readiness Metrics</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <Stat value="45+" label="ACTIVE UNITS" />
            <Stat value="< 180ms" label="AI DETECTION LATENCY" />
            <Stat value="14,500+" label="SCANS PER DAY" />
            <Stat value="99.98%" label="SYSTEM AVAILABILITY" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/50 py-8 text-center relative z-10 bg-white/40 backdrop-blur-3xl">
        <div className="flex items-center justify-center gap-2 mb-2">
          <VikrantLogo size={22} />
          <span className="text-xs font-sans tracking-tight text-slate-900 font-bold">
            IR VIKRANT • RAILWAY PROTECTION FORCE
          </span>
        </div>
        <div className="text-xs text-slate-600 font-sans font-semibold">
          Restricted Government Platform • Indian Railways Autonomous Robotics Network
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glass-liquid p-8 rounded-3xl border border-white/70 bg-white/40 backdrop-blur-2xl flex flex-col items-start hover:border-sky-400 transition-all group shadow-md hover:-translate-y-1">
      <div className="mb-5 p-3.5 bg-white/70 rounded-2xl inline-block border border-white/90 group-hover:bg-sky-50 transition-colors shadow-xs">
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-2.5 text-slate-950 tracking-tight font-sans">{title}</h3>
      <p className="text-xs md:text-sm text-slate-700 leading-relaxed font-sans font-medium">{desc}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-3xl md:text-5xl font-bold tracking-tight text-slate-950 mb-2 font-sans">{value}</div>
      <div className="text-xs font-sans font-bold tracking-tight text-slate-500 uppercase">{label}</div>
    </div>
  );
}
