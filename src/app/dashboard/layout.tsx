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
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAFAFA] text-slate-900 relative font-sans">
      {/* Ghost Luma 3D WebGL Particle Wave & Ambient Orbs Background */}
      <DashboardBackground />

      {/* Ghost Side Navigation Rail */}
      <nav className="w-64 flex-shrink-0 flex flex-col h-full bg-white/80 backdrop-blur-2xl border-r border-slate-200/80 z-40 relative shadow-sm">
        {/* Brand Logo & Ghost Header */}
        <div className="h-20 flex items-center gap-3 px-6 border-b border-slate-200/80">
          <Link href="/dashboard" className="flex items-center gap-3 group" title="IR Vikrant Ghost Command Center">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shadow-sm group-hover:border-sky-400 group-hover:bg-sky-100/80 transition-all">
              <VikrantLogo size={22} />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold tracking-[0.18em] text-base text-slate-900">
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
                  flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-xs font-mono transition-all group relative
                  ${
                    isActive
                      ? 'bg-sky-500/10 text-sky-900 border-l-2 border-sky-600 font-semibold shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  }
                `}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-700'
                  }`}
                />
                <span className="truncate">{item.label}</span>

                {item.isNew && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse shadow-[0_0_6px_#0284c7]" />
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom Utility / Settings */}
        <div className="p-3 border-t border-slate-200/80 flex flex-col gap-1.5">
          <Link
            href="/dashboard/settings"
            className={`
              flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono transition-all group
              ${
                pathname === '/dashboard/settings'
                  ? 'bg-sky-500/10 text-sky-900 border-l-2 border-sky-600 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
              }
            `}
          >
            <Settings
              className={`w-4 h-4 transition-colors ${
                pathname === '/dashboard/settings' ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-700'
              }`}
            />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      {/* Main Content Area with Ghost Top Header */}
      <div className="flex-1 relative overflow-hidden flex flex-col z-10 bg-transparent min-w-0">
        {/* Top Header */}
        <header className="h-20 bg-white/75 backdrop-blur-2xl border-b border-slate-200/80 flex items-center justify-between px-8 sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight uppercase text-slate-900 font-mono flex items-center gap-2">
              <span className="text-sky-600">/</span> {activeTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Live System Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 border border-sky-200/80 rounded-xl text-xs font-mono text-sky-900 shadow-xs">
              <div className="w-2 h-2 rounded-full bg-sky-600 shadow-[0_0_8px_#0284c7] animate-pulse" />
              <span className="hidden sm:inline text-slate-600">GHOST NODE:</span>
              <span className="font-bold text-sky-700">ACTIVE</span>
            </div>

            {/* Defense Shield Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs font-mono text-emerald-800 shadow-xs">
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
