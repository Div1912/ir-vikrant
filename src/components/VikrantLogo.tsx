'use client';

import React from 'react';

interface VikrantLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export default function VikrantLogo({
  size = 36,
  showText = false,
  className = '',
}: VikrantLogoProps) {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Modern Liquid Glass Insignia */}
      <div 
        className="relative flex items-center justify-center rounded-xl p-1.5 transition-transform duration-300 hover:scale-105"
        style={{
          width: size,
          height: size,
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        }}
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]"
        >
          {/* Outer Tactical Octagon Shield */}
          <polygon
            points="30,8 70,8 92,30 92,70 70,92 30,92 8,70 8,30"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="3.5"
            strokeLinejoin="round"
            fill="rgba(10, 10, 12, 0.85)"
          />

          {/* Central Chevron Pattern */}
          <path
            d="M50 18 L76 44 L68 52 L50 34 L32 52 L24 44 Z"
            fill="#ffffff"
            opacity="0.9"
          />
          <path
            d="M50 42 L68 60 L60 68 L50 58 L40 68 L32 60 Z"
            fill="#a1a1aa"
            opacity="0.8"
          />

          {/* Quadruped Articulated Footprints */}
          <circle cx="26" cy="74" r="4.5" fill="#ffffff" />
          <circle cx="74" cy="74" r="4.5" fill="#ffffff" />
          <line x1="26" y1="74" x2="38" y2="62" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2.5" />
          <line x1="74" y1="74" x2="62" y2="62" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2.5" />

          {/* Central AI Core */}
          <circle cx="50" cy="50" r="6" fill="#ffffff" />
          <circle cx="50" cy="50" r="10" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="1.5" strokeDasharray="3 3" />
        </svg>

        {/* Live Active Status Indicator Dot */}
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
      </div>

      {showText && (
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-bold tracking-widest text-white">
              IR <span className="text-zinc-300">VIKRANT</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 border border-white/10 text-[8px] font-mono font-medium">
              v2.4
            </span>
          </div>
          <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
            RPF AUTONOMOUS COMMAND
          </span>
        </div>
      )}
    </div>
  );
}
