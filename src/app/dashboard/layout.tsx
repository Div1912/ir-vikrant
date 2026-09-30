'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Activity, 
  Map, 
  Video, 
  List, 
  BarChart3, 
  Settings, 
  Radio, 
  Scan, 
  Pill, 
  Flame, 
  ScanFace,
  Ghost,
  Shield,
  Search,
  Bell
} from 'lucide-react';
import VikrantLogo from '@/components/VikrantLogo';
import DashboardBackground from '@/components/DashboardBackground';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Main Ops', icon: Map },
  { href: '/dashboard/watchlist', label: 'Watchlist', icon: ScanFace, isNew: true },
  { href: '/dashboard/narcotics', label: 'Narcotics', icon: Pill, isNew: true },
  { href: '/dashboard/explosives', label: 'Explosives', icon: Flame, isNew: true },
  { href: '/dashboard/captures', label: 'AI Captures', icon: Scan },
  { href: '/dashboard/video', label: 'Live Video', icon: Video },
  { href: '/dashboard/fleet', label: 'Fleet Status', icon: Radio },
  { href: '/dashboard/alerts', label: 'Alerts Log', icon: List },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/system', label: 'System', icon: Activity },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Get readable active page title
  const activeNavItem = NAV_ITEMS.find(item => item.href === pathname);
  const activeTitle = activeNavItem ? activeNavItem.label : pathname.split('/').pop() || 'Overview';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#03040a] text-foreground relative font-sans">
      {/* Ghost Luma 3D WebGL Particle Wave & Ambient Orbs Background */}
      <DashboardBackground />

      {/* Ghost Side Navigation Rail */}
      <nav className="w-64 flex-shrink-0 flex flex-col h-full bg-black/60 backdrop-blur-2xl border-r border-white/10 z-40 relative">
        {/* Brand Logo & Ghost Header */}
        <div className="h-20 flex items-center gap-3 px-6 border-b border-white/10">
          <Link href="/dashboard" className="flex items-center gap-3 group" title="IR Vikrant Ghost Command Center">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-[#b8d4f0]/30 flex items-center justify-center shadow-[0_0_15px_rgba(184,212,240,0.15)] group-hover:border-[#b8d4f0]/60 transition-all">
              <VikrantLogo size={22} />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold tracking-[0.18em] text-base bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-[#b8d4f0]">
                VIKRANT
              </span>
              <span className="text-[9px] font-mono text-[#b8d4f0]/70 tracking-widest uppercase">
                GHOST RECON AI
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-5 px-3 flex flex-col gap-1.5">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-xs font-mono transition-all group relative
                  ${
                    isActive
                      ? 'bg-white/10 text-white border-l-2 border-[#b8d4f0] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] font-semibold'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                  }
                `}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-[#b8d4f0]' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                />
                <span className="truncate">{item.label}</span>

                {item.isNew && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#b8d4f0] animate-pulse shadow-[0_0_6px_#b8d4f0]" />
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom Utility / Settings */}
        <div className="p-3 border-t border-white/10 flex flex-col gap-1.5">
          <Link
            href="/dashboard/settings"
            className={`
              flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono transition-all group
              ${
                pathname === '/dashboard/settings'
                  ? 'bg-white/10 text-white border-l-2 border-[#b8d4f0] font-semibold'
                  : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
              }
            `}
          >
            <Settings
              className={`w-4 h-4 transition-colors ${
                pathname === '/dashboard/settings' ? 'text-[#b8d4f0]' : 'text-zinc-500 group-hover:text-zinc-300'
              }`}
            />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      {/* Main Content Area with Ghost Top Header */}
      <div className="flex-1 relative overflow-hidden flex flex-col z-10 bg-transparent min-w-0">
        {/* Top Header */}
        <header className="h-20 bg-black/40 backdrop-blur-2xl border-b border-white/10 flex items-center justify-between px-8 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight uppercase text-white font-mono flex items-center gap-2">
              <span className="text-[#b8d4f0]">/</span> {activeTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Live System Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#b8d4f0]/10 border border-[#b8d4f0]/20 rounded-xl text-xs font-mono text-[#b8d4f0]">
              <div className="w-2 h-2 rounded-full bg-[#b8d4f0] shadow-[0_0_8px_#b8d4f0] animate-pulse" />
              <span className="hidden sm:inline text-zinc-400">GHOST NODE:</span>
              <span className="font-bold">ACTIVE</span>
            </div>

            {/* Defense Shield Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-mono text-emerald-400">
              <Shield className="w-3.5 h-3.5" />
              <span>ISRO NAVIC SECURE</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 relative overflow-y-auto p-6 bg-transparent">
          {children}
        </main>
      </div>
    </div>
  );
}
