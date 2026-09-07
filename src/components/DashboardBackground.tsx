'use client';

import React, { useEffect, useRef } from 'react';

export default function DashboardBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const mouse = { x: -1000, y: -1000, active: false };
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const handleMouseLeave = () => {
      mouse.active = false;
      mouse.x = -1000;
      mouse.y = -1000;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    // Hexagonal Grid Configuration
    const hexRadius = 42;
    const hexHeight = hexRadius * 2;
    const hexWidth = Math.sqrt(3) * hexRadius;
    const vertDistance = (hexHeight * 3) / 4;
    const horizDistance = hexWidth;

    interface HexCell {
      x: number;
      y: number;
      brightness: number;
      label?: string;
      labelFade: number;
      pingPhase: number;
      isPingTarget: boolean;
    }

    const cells: HexCell[] = [];
    const railwaySectors = [
      'SEC-07: NDLS',
      'SEC-12: HWH',
      'SEC-04: BNR',
      'SEC-09: DLI',
      'SEC-18: CNB',
      'SEC-02: BCT',
      'SEC-11: MAS',
      'SEC-15: GKP',
    ];

    const cols = Math.ceil(width / horizDistance) + 2;
    const rows = Math.ceil(height / vertDistance) + 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const xOffset = (r % 2 === 1) ? horizDistance / 2 : 0;
        const x = c * horizDistance + xOffset;
        const y = r * vertDistance;

        // Assign sector labels to select sparse cells
        let label: string | undefined;
        if (Math.random() < 0.045 && railwaySectors.length > 0) {
          label = railwaySectors[Math.floor(Math.random() * railwaySectors.length)];
        }

        cells.push({
          x,
          y,
          brightness: 0,
          label,
          labelFade: 0,
          pingPhase: Math.random() * Math.PI * 2,
          isPingTarget: Math.random() < 0.08,
        });
      }
    }

    // Helper to draw a single regular hexagon
    const drawHexagon = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = cx + r * Math.cos(angle);
        const hy = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
    };

    let tick = 0;

    const render = () => {
      tick++;
      ctx.clearRect(0, 0, width, height);

      // Render Hexagonal Defense Matrix
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];

        // Proximity glow on mouse hover
        if (mouse.active) {
          const dx = mouse.x - cell.x;
          const dy = mouse.y - cell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            const targetBrightness = (1 - dist / 180) * 0.45;
            if (targetBrightness > cell.brightness) {
              cell.brightness = targetBrightness;
            }
          }
        }

        // Ambient periodic sector ping
        if (cell.isPingTarget) {
          cell.pingPhase += 0.02;
          const pingVal = (Math.sin(cell.pingPhase) + 1) / 2; // 0 to 1
          if (pingVal > 0.85) {
            cell.brightness = Math.max(cell.brightness, (pingVal - 0.85) * 2.2);
          }
        }

        // Smooth decay
        cell.brightness *= 0.94;
        if (cell.brightness < 0.01) cell.brightness = 0;

        // Base idle grid stroke
        const baseAlpha = 0.045;
        const totalAlpha = baseAlpha + cell.brightness;

        drawHexagon(cell.x, cell.y, hexRadius - 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${totalAlpha})`;
        ctx.lineWidth = cell.brightness > 0.1 ? 1.4 : 0.75;
        ctx.stroke();

        // Subtle fill for illuminated cells
        if (cell.brightness > 0.08) {
          ctx.fillStyle = `rgba(255, 255, 255, ${cell.brightness * 0.15})`;
          ctx.fill();
        }

        // Sector ID Tag for designated cells
        if (cell.label && cell.brightness > 0.12) {
          ctx.font = '8px monospace';
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, cell.brightness * 2)})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.label, cell.x, cell.y);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden bg-transparent">
      {/* 1. Interactive Tactical Hexagonal Recon Matrix (Canvas) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-85"
      />

      {/* 2. ISRO NAVIC Satellite Orbital Trajectory Paths & Constellation Beacons */}
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
      >
        {/* Orbital Trajectory Arc 1 (NAVIC-01 / 02) */}
        <path
          d="M -100 200 C 400 50 1100 120 1700 350"
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth="1.2"
          strokeDasharray="6 6"
        />
        {/* Satellite Node 1: NAVIC-01 */}
        <circle cx="520" cy="115" r="4" fill="#ffffff" />
        <circle cx="520" cy="115" r="10" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1" strokeDasharray="3 3" />
        <text x="535" y="118" fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold">
          SAT: NAVIC-01 [GSO 55°E]
        </text>

        {/* Orbital Trajectory Arc 2 (NAVIC-03 / 04 Cross-Equatorial) */}
        <path
          d="M -50 650 C 350 480 950 350 1650 500"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1.2"
          strokeDasharray="8 4"
        />
        {/* Satellite Node 2: NAVIC-03 */}
        <circle cx="980" cy="385" r="4" fill="#ffffff" />
        <circle cx="980" cy="385" r="12" stroke="rgba(255, 255, 255, 0.35)" strokeWidth="1" strokeDasharray="4 4" />
        <text x="995" y="389" fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold">
          SAT: NAVIC-03 [GEO 83°E] // UPLINK ACTIVE
        </text>

        {/* Orbital Trajectory Arc 3 (NAVIC-07 Polar Recon Vector) */}
        <path
          d="M 250 -50 C 380 400 700 750 1150 950"
          stroke="rgba(255, 255, 255, 0.16)"
          strokeWidth="1.2"
          strokeDasharray="4 6"
        />
        {/* Satellite Node 3: NAVIC-07 */}
        <circle cx="620" cy="650" r="4" fill="#ffffff" />
        <circle cx="620" cy="650" r="9" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1" />
        <text x="635" y="654" fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold">
          SAT: NAVIC-07 [IGSO 111.75°E]
        </text>

        {/* Global Positioning Caliper Crosshairs */}
        <g stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1">
          <line x1="140" y1="80" x2="160" y2="80" />
          <line x1="150" y1="70" x2="150" y2="90" />
          <circle cx="150" cy="80" r="18" fill="none" strokeDasharray="2 2" />

          <line x1="1440" y1="780" x2="1460" y2="780" />
          <line x1="1450" y1="770" x2="1450" y2="790" />
          <circle cx="1450" cy="780" r="18" fill="none" strokeDasharray="2 2" />
        </g>
      </svg>

      {/* 3. Subtle Tactical Horizon Ambient Glow */}
      <div className="absolute top-0 right-1/4 w-[700px] h-[350px] bg-white/[0.035] blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 w-[800px] h-[350px] bg-white/[0.03] blur-[160px] rounded-full pointer-events-none" />

      {/* 4. Top-Right Mission Clock & Orbital Telemetry Badge */}
      <div className="hidden lg:flex items-center gap-4 absolute top-5 right-8 opacity-45 pointer-events-none text-right font-mono">
        <div>
          <div className="text-[9px] text-zinc-300 font-bold uppercase tracking-widest">
            NAVIC RECON CONSTELLATION
          </div>
          <div className="text-[8px] text-zinc-500">
            7 OF 7 SATELLITES LOCKED // DOPPLER ACCURACY &lt; 0.05m/s
          </div>
        </div>
        <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_#ffffff]" />
      </div>

      {/* 5. Precision Corner Brackets & Telemetry Coordinates */}
      {/* Top Left Reticle */}
      <div className="hidden xl:block absolute top-6 left-28 opacity-40 font-mono text-[8px] text-zinc-400 pointer-events-none select-none">
        <div className="w-6 h-[1.5px] bg-white mb-1" />
        <div>SYS-ID: IRV-OPS-CMD // SEC-09</div>
        <div className="text-zinc-500">REF: 28.6139° N, 77.2090° E</div>
      </div>

      {/* Bottom Right Reticle */}
      <div className="hidden xl:block absolute bottom-6 right-8 opacity-40 font-mono text-[8px] text-zinc-400 pointer-events-none select-none text-right">
        <div>FREQUENCY: L1 (1575.42 MHz) + L5 (1176.45 MHz)</div>
        <div className="text-zinc-500">ENCRYPTION: AES-256-GCM // HARDWARE SECURE ENCLAVE</div>
        <div className="w-6 h-[1.5px] bg-white mt-1 ml-auto" />
      </div>
    </div>
  );
}
