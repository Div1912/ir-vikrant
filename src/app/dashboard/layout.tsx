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
    <div className="flex h-screen w-screen overflow-hidden bg-transparent text-slate-900 relative font-sans">
      {/* Ghost Luma 3D WebGL Particle Wave & Ambient Orbs Background */}
      <DashboardBackground />

      {/* iOS Liquid Crystal Side Navigation Rail */}
      <nav className="w-64 flex-shrink-0 flex flex-col h-full bg-white/20 backdrop-blur-3xl border-r border-white/50 z-40 relative shadow-[4px_0_32px_rgba(2,132,199,0.08)]">
        {/* Brand Logo & Ghost Header */}
        <div className="h-20 flex items-center gap-3 px-6 border-b border-white/50">
          <Link href="/dashboard" className="flex items-center gap-3 group" title="IR Vikrant Ghost Command Center">
            <div className="w-9.5 h-9.5 rounded-2xl bg-white/60 border border-white/80 flex items-center justify-center shadow-xs group-hover:scale-105 transition-all">
              <VikrantLogo size={22} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-[0.18em] text-base text-slate-900">
                VIKRANT
              </span>
              <span className="text-[9px] font-mono text-sky-700 font-bold tracking-widest uppercase">
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
                  flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-xs font-mono transition-all group relative
                  ${
                    isActive
                      ? 'bg-gradient-to-r from-sky-500/35 to-blue-600/20 text-sky-950 font-bold border border-white/90 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.95),0_4px_16px_rgba(2,132,199,0.2)] backdrop-blur-xl'
                      : 'text-slate-800 hover:bg-white/40 hover:border hover:border-white/60 hover:text-slate-950 font-semibold'
                  }
                `}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-sky-600' : 'text-slate-600 group-hover:text-slate-900'
                  }`}
                />
                <span className="truncate">{item.label}</span>

                {item.isNew && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse shadow-[0_0_8px_#0284c7]" />
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom Utility / Settings */}
        <div className="p-3 border-t border-white/50 flex flex-col gap-1.5">
          <Link
            href="/dashboard/settings"
            className={`
              flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-mono transition-all group
              ${
                pathname === '/dashboard/settings'
                  ? 'bg-gradient-to-r from-sky-500/35 to-blue-600/20 text-sky-950 font-bold border border-white/90 shadow-xs'
                  : 'text-slate-800 hover:bg-white/40 hover:border hover:border-white/60 hover:text-slate-950 font-semibold'
              }
            `}
          >
            <Settings
              className={`w-4 h-4 transition-colors ${
                pathname === '/dashboard/settings' ? 'text-sky-600' : 'text-slate-600 group-hover:text-slate-900'
              }`}
            />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      {/* Main Content Area with Ghost Top Header */}
      <div className="flex-1 relative overflow-hidden flex flex-col z-10 bg-transparent min-w-0">
        {/* Top Header */}
        <header className="h-20 bg-white/25 backdrop-blur-3xl border-b border-white/50 flex items-center justify-between px-8 sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight uppercase text-slate-900 font-mono flex items-center gap-2">
              <span className="text-sky-600">/</span> {activeTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Live System Status Pill */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white/60 border border-white/80 rounded-full text-xs font-mono text-slate-900 shadow-sm backdrop-blur-md">
              <div className="w-2 h-2 rounded-full bg-sky-600 shadow-[0_0_8px_#0284c7] animate-pulse" />
              <span className="hidden sm:inline text-slate-600">GHOST NODE:</span>
              <span className="font-bold text-sky-700">ACTIVE</span>
            </div>

            {/* Defense Shield Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-400/40 rounded-full text-xs font-mono text-emerald-900 shadow-sm backdrop-blur-md font-semibold">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
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
