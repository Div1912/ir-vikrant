'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Map, Video, List, BarChart3, Settings, Radio, Scan, Pill, Flame, ScanFace } from 'lucide-react';
import VikrantLogo from '@/components/VikrantLogo';
import DashboardBackground from '@/components/DashboardBackground';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground relative">
      {/* Tactical Satellite Recon & NAVIC Hex Grid Background */}
      <DashboardBackground />

      {/* Side Navigation Rail - Transparent Liquid Glass Aesthetic */}
      <nav className="w-24 flex-shrink-0 flex flex-col items-center py-4 glass-panel border-r border-white/10 border-y-0 border-l-0 rounded-none z-40 backdrop-blur-md">
        {/* Brand Tactical Logo */}
        <Link href="/dashboard" className="mb-6 hover:scale-105 transition-transform flex flex-col items-center gap-1" title="IR Vikrant Command Center">
          <VikrantLogo size={36} />
          <span className="text-[9px] font-mono font-bold tracking-widest text-zinc-300 mt-1">
            VIKRANT
          </span>
        </Link>
        
        {/* Navigation Actions */}
        <div className="flex flex-col gap-1.5 w-full px-1.5 overflow-y-auto">
          <NavItem href="/dashboard" icon={<Map size={18} />} title="Main Ops" active={pathname === '/dashboard'} />
          <NavItem href="/dashboard/watchlist" icon={<ScanFace size={18} />} title="Watchlist" active={pathname === '/dashboard/watchlist'} isNew={true} />
          <NavItem href="/dashboard/narcotics" icon={<Pill size={18} />} title="Narcotics" active={pathname === '/dashboard/narcotics'} isNew={true} />
          <NavItem href="/dashboard/explosives" icon={<Flame size={18} />} title="Explosives" active={pathname === '/dashboard/explosives'} isNew={true} />
          <NavItem href="/dashboard/captures" icon={<Scan size={18} />} title="AI Captures" active={pathname === '/dashboard/captures'} />
          <NavItem href="/dashboard/video" icon={<Video size={18} />} title="Live Video" active={pathname === '/dashboard/video'} />
          <NavItem href="/dashboard/fleet" icon={<Radio size={18} />} title="Fleet Status" active={pathname === '/dashboard/fleet'} />
          <NavItem href="/dashboard/alerts" icon={<List size={18} />} title="Alerts & Log" active={pathname === '/dashboard/alerts'} />
          <NavItem href="/dashboard/analytics" icon={<BarChart3 size={18} />} title="Analytics" active={pathname === '/dashboard/analytics'} />
          <NavItem href="/dashboard/system" icon={<Activity size={18} />} title="System" active={pathname === '/dashboard/system'} />
        </div>

        {/* Bottom Utility */}
        <div className="mt-auto flex flex-col gap-2 w-full px-1.5">
          <NavItem href="/dashboard/settings" icon={<Settings size={18} />} title="Settings" active={pathname === '/dashboard/settings'} />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col z-10 bg-transparent">
        {children}
      </main>
    </div>
  );
}

function NavItem({
  href,
  icon,
  title,
  active,
  isNew,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  active: boolean;
  isNew?: boolean;
}) {
  return (
    <Link 
      href={href} 
      className={`relative flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all group liquid-btn ${
        active 
          ? 'bg-white/[0.12] text-white border-white/25 shadow-lg shadow-black/40' 
          : 'text-foreground/50 hover:text-white hover:border-white/20'
      }`}
      title={title}
    >
      <div className="relative">
        {icon}
        {isNew && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white animate-pulse" />
        )}
      </div>
      <span className={`text-[9px] font-mono mt-1 tracking-tight text-center truncate ${active ? 'font-semibold text-white' : 'text-foreground/60'}`}>
        {title}
      </span>
      {/* Active side indicator bar */}
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-white shadow-[0_0_8px_#ffffff]" />
      )}
    </Link>
  );
}
