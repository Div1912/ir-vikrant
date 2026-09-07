import React from 'react';
import Link from 'next/link';
import { Map, Lock, ChevronRight, Scan, Zap, ShieldCheck } from 'lucide-react';
import VikrantLogo from '@/components/VikrantLogo';
import LandingBackground from '@/components/LandingBackground';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans relative overflow-x-hidden">
      {/* Cybernetic Tactical Recon Background - Modern Monochromatic */}
      <LandingBackground />
      
      {/* Header */}
      <header className="fixed top-0 w-full z-50 glass-panel border-x-0 border-t-0 border-b border-white/10 px-6 py-4 flex justify-between items-center backdrop-blur-2xl">
        <VikrantLogo size={36} showText={true} />
        
        <div className="flex items-center gap-4">
          <span className="hidden md:inline-flex items-center gap-2 text-[11px] font-mono tracking-wider text-zinc-300 bg-white/[0.04] border border-white/10 px-3 py-1.5 rounded-full shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            RPF HIGH SECURITY LEVEL 4
          </span>
          <Link
            href="/dashboard"
            className="text-xs font-mono liquid-btn-primary px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2"
          >
            <span>ENTER COMMAND</span>
            <Lock size={12} className="text-zinc-300" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 pt-32 px-6 flex flex-col relative z-10">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center mt-14 mb-24">
          {/* Modern Tactical Pill Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-white/12 bg-white/[0.04] backdrop-blur-xl text-zinc-300 text-xs font-mono mb-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            AUTONOMOUS QUADRUPED & RECON COMMAND
          </div>

          {/* Modern Typography Headline (No Color Gradients) */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-semibold tracking-[-0.035em] mb-6 leading-[1.06] text-white">
            Next-Gen Tactical <br />
            <span className="text-zinc-400 font-normal">
              Robotics Command.
            </span>
          </h1>

          {/* Modern Subheading */}
          <p className="text-base md:text-lg text-zinc-400 max-w-2xl font-normal mb-10 leading-relaxed font-sans">
            IR Vikrant is the centralized operational command center for AI-enabled quadruped security units, real-time visual recon, and narcotics/explosives trace detection across the Indian Railways network.
          </p>

          {/* Modern Liquid Glass CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="liquid-btn-primary px-8 py-4 rounded-2xl flex items-center gap-3 transition-all group font-sans tracking-wide text-sm font-medium shadow-2xl"
            >
              <span>LAUNCH COMMAND CENTER</span>
              <ChevronRight size={16} className="text-zinc-300 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/dashboard/captures"
              className="liquid-btn px-7 py-4 rounded-2xl flex items-center gap-2.5 text-zinc-300 hover:text-white font-sans text-sm font-medium"
            >
              <Scan size={16} className="text-zinc-400" />
              <span>AI RECON GALLERY</span>
            </Link>
          </div>
        </div>

        {/* Liquid Glass Feature Cards */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-24 w-full">
          <FeatureCard 
            icon={<Map size={22} className="text-zinc-200" />}
            title="Live GPS Trail & Telemetry"
            desc="Real-time geo-tracking with connected breadcrumb paths, coordinate log variations, and cumulative distance meters."
          />
          <FeatureCard 
            icon={<Scan size={22} className="text-zinc-200" />}
            title="AI Vision Auto-Capture"
            desc="On-device neural vision flags demo props (bottles, pouches, bags), captures frames, and logs evidence directly to Supabase."
          />
          <FeatureCard 
            icon={<Zap size={22} className="text-zinc-200" />}
            title="Robot Drive Power Interlock"
            desc="Direct command execution to energize robot actuator motor drives or trigger safety power stops."
          />
        </div>

        {/* Liquid Glass Mission Readiness Metrics Card */}
        <div className="max-w-6xl mx-auto glass-panel rounded-2xl p-10 md:p-12 mb-24 border border-white/10 w-full relative overflow-hidden shadow-2xl">
          <div className="text-center mb-10">
            <h2 className="text-xs font-mono tracking-[0.25em] text-zinc-400 mb-2 uppercase">NETWORK-WIDE SCALE</h2>
            <h3 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">Mission Readiness Metrics</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <Stat value="45+" label="ACTIVE UNITS" />
            <Stat value="< 1.8s" label="AI DETECTION LATENCY" />
            <Stat value="14,500+" label="SCANS PER DAY" />
            <Stat value="99.98%" label="SYSTEM AVAILABILITY" />
          </div>
        </div>
      </main>

      {/* Modern Liquid Glass Footer */}
      <footer className="border-t border-white/10 py-8 text-center relative z-10 bg-black/40 backdrop-blur-2xl">
        <div className="flex items-center justify-center gap-2 mb-2">
          <VikrantLogo size={20} />
          <span className="text-xs font-mono tracking-widest text-zinc-300 font-medium">
            IR VIKRANT • RAILWAY PROTECTION FORCE
          </span>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          Restricted Government Platform • Indian Railways Autonomous Robotics Network
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glass-panel p-8 rounded-2xl border border-white/10 flex flex-col items-start hover:border-white/20 transition-all group shadow-2xl">
      <div className="mb-6 p-3.5 bg-white/[0.04] rounded-xl inline-block border border-white/10 group-hover:border-white/20 group-hover:bg-white/[0.08] transition-colors shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2.5 text-white tracking-tight font-sans">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed font-sans">{desc}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-3xl md:text-5xl font-semibold tracking-tight text-white mb-2 font-sans">{value}</div>
      <div className="text-[11px] font-mono tracking-widest text-zinc-500 uppercase">{label}</div>
    </div>
  );
}
