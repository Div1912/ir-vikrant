'use client';

import React, { useEffect, useRef } from 'react';

export default function LandingBackground() {
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

    const nodeCount = Math.min(Math.floor((width * height) / 25000), 55);
    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      baseRadius: number;
      color: string;
      pulsePhase: number;
      pulseSpeed: number;
    }

    const nodes: Node[] = [];
    const colors = [
      'rgba(2, 132, 199, ',
      'rgba(14, 165, 233, ',
      'rgba(56, 189, 248, ',
      'rgba(148, 163, 184, ',
    ];

    for (let i = 0; i < nodeCount; i++) {
      const baseRadius = Math.random() * 2.0 + 1.5;
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: baseRadius,
        baseRadius,
        color: colors[Math.floor(Math.random() * colors.length)],
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03,
      });
    }

    interface Packet {
      fromIndex: number;
      toIndex: number;
      progress: number;
      speed: number;
    }
    const packets: Packet[] = [];
    let packetTimer = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        if (mouse.active) {
          const dx = mouse.x - node.x;
          const dy = mouse.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            const force = (140 - dist) / 140;
            node.x -= (dx / dist) * force * 1.4;
            node.y -= (dy / dist) * force * 1.4;
          }
        }

        node.pulsePhase += node.pulseSpeed;
        const pulse = Math.sin(node.pulsePhase) * 0.35 + 1;
        node.radius = node.baseRadius * pulse;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color + '0.85)';
        ctx.shadowColor = 'rgba(2, 132, 199, 0.4)';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw connection lines with high contrast on light background
      const maxDistance = 140;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            const alpha = (1 - dist / maxDistance) * 0.25;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            packetTimer++;
            if (packetTimer > 60 && packets.length < 6 && Math.random() < 0.08) {
              packetTimer = 0;
              packets.push({
                fromIndex: i,
                toIndex: j,
                progress: 0,
                speed: 0.01 + Math.random() * 0.015,
              });
            }
          }
        }
      }

      // Draw traveling glowing packets
      for (let p = packets.length - 1; p >= 0; p--) {
        const pkt = packets[p];
        pkt.progress += pkt.speed;

        const from = nodes[pkt.fromIndex];
        const to = nodes[pkt.toIndex];

        if (!from || !to || pkt.progress >= 1) {
          packets.splice(p, 1);
          continue;
        }

        const curX = from.x + (to.x - from.x) * pkt.progress;
        const curY = from.y + (to.y - from.y) * pkt.progress;

        ctx.beginPath();
        ctx.arc(curX, curY, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.shadowColor = '#0284c7';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
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
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden bg-slate-50">
      {/* 1. Tactical Constellation Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-80 pointer-events-none"
      />

      {/* 2. Soft Ambient Neutral Light */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[850px] h-[450px] bg-sky-100/60 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[650px] h-[350px] bg-sky-50/80 blur-[130px] rounded-full pointer-events-none" />

      {/* 3. 3D Perspective Tactical Grid Floor */}
      <div 
        className="absolute bottom-0 inset-x-0 h-[48vh] overflow-hidden opacity-40 pointer-events-none"
        style={{
          perspective: '650px',
          perspectiveOrigin: '50% 10%',
        }}
      >
        <div 
          className="w-[200%] -ml-[50%] h-[200%] origin-top animate-grid-scroll"
          style={{
            transform: 'rotateX(72deg) translateY(-20px)',
            backgroundImage: `
              linear-gradient(to right, rgba(148, 163, 184, 0.25) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(148, 163, 184, 0.25) 1px, transparent 1px)
            `,
            backgroundSize: '44px 44px',
            maskImage: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, transparent 85%)',
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, transparent 85%)',
          }}
        />
        {/* Horizon glowing line */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-sky-500/40 to-transparent shadow-[0_0_15px_rgba(2,132,199,0.3)]" />
      </div>

      {/* 4. Holographic Quadruped Robot Wireframe Blueprint */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[620px] opacity-[0.35] pointer-events-none">
        <svg
          viewBox="0 0 1000 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full animate-hologram-pulse"
        >
          <defs>
            <pattern id="blueprintGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="0.8" />
            </pattern>
          </defs>

          {/* Blueprint Grid Plane */}
          <rect x="80" y="40" width="840" height="520" fill="url(#blueprintGrid)" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1.2" strokeDasharray="4 4" rx="8" />

          {/* Outer Technical Frame Brackets */}
          <path d="M 70 60 L 70 40 L 90 40" stroke="#0284c7" strokeWidth="2" />
          <path d="M 910 40 L 930 40 L 930 60" stroke="#0284c7" strokeWidth="2" />
          <path d="M 70 540 L 70 560 L 90 560" stroke="#0284c7" strokeWidth="2" />
          <path d="M 910 560 L 930 560 L 930 540" stroke="#0284c7" strokeWidth="2" />

          {/* Technical Specs & Header */}
          <text x="96" y="64" fill="#0f172a" fontSize="11" fontFamily="sans-serif" letterSpacing="2" fontWeight="bold">
            SYSTEM SCHEMATIC // IRV-Q4 AUTONOMOUS QUADRUPED
          </text>
          <text x="96" y="80" fill="#475569" fontSize="9" fontFamily="sans-serif" letterSpacing="1" fontWeight="600">
            REF: INDIAN RAILWAYS RECON SPEC REV 4.8.2 | ACTIVE PAYLOAD: MQ-3 + AI VISION
          </text>
          <text x="820" y="64" fill="#0369a1" fontSize="10" fontFamily="sans-serif" textAnchor="end" fontWeight="bold">
            [ ONLINE: TELEMETRY SYNCED ]
          </text>

          {/* Coordinate Calipers & Reticles */}
          <circle cx="500" cy="290" r="210" stroke="rgba(2, 132, 199, 0.25)" strokeWidth="1.2" strokeDasharray="6 6" />
          <circle cx="500" cy="290" r="160" stroke="rgba(2, 132, 199, 0.2)" strokeWidth="1" />
          <line x1="500" y1="70" x2="500" y2="510" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="280" y1="290" x2="720" y2="290" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1" strokeDasharray="4 4" />

          {/* QUADRUPED ROBOT WIREFRAME BODY */}
          <g transform="translate(50, 20)">
            {/* Ground Contact Line */}
            <line x1="220" y1="430" x2="680" y2="430" stroke="#0284c7" strokeWidth="2" strokeDasharray="8 4" />
            <text x="640" y="446" fill="#475569" fontSize="9" fontFamily="sans-serif" fontWeight="bold">GROUND DATUM // 0.00m</text>

            {/* Back Left Leg */}
            <path d="M 320 230 L 270 310 L 255 400 L 245 428" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="270" cy="310" r="5" stroke="#0284c7" strokeWidth="2" fill="#ffffff" />
            <circle cx="245" cy="428" r="4" fill="#0284c7" />

            {/* Front Left Leg */}
            <path d="M 530 230 L 580 305 L 565 395 L 555 428" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="580" cy="305" r="5" stroke="#0284c7" strokeWidth="2" fill="#ffffff" />
            <circle cx="555" cy="428" r="4" fill="#0284c7" />

            {/* Main Robot Torso / Chassis */}
            <polygon 
              points="290,210 330,185 510,185 570,205 595,245 560,265 330,265 295,245" 
              stroke="#0284c7" 
              strokeWidth="2.5" 
              fill="rgba(224, 242, 254, 0.4)" 
            />
            {/* Internal Armor Ribs */}
            <line x1="370" y1="185" x2="370" y2="265" stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="440" y1="185" x2="440" y2="265" stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="510" y1="185" x2="510" y2="265" stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1.5" strokeDasharray="3 3" />

            {/* Core Battery Pack */}
            <rect x="350" y="205" width="140" height="42" stroke="#0369a1" strokeWidth="1.8" fill="rgba(240, 249, 255, 0.8)" rx="3" />
            <text x="420" y="231" fill="#0369a1" fontSize="9" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1" fontWeight="bold">
              LFP CORE // 48V 35Ah
            </text>

            {/* Forward Sensor Head */}
            <polygon points="570,205 620,200 645,225 635,250 595,245" stroke="#0284c7" strokeWidth="2.2" fill="rgba(224, 242, 254, 0.6)" />
            <circle cx="635" cy="222" r="7" stroke="#0284c7" strokeWidth="2" fill="#ffffff" />
            <circle cx="635" cy="222" r="3.5" fill="#0284c7" />

            {/* Top LiDAR */}
            <rect x="410" y="162" width="40" height="23" stroke="#0284c7" strokeWidth="1.8" fill="rgba(224, 242, 254, 0.8)" rx="2" />
            <path d="M 415 162 C 415 152 445 152 445 162" stroke="#0284c7" strokeWidth="1.8" fill="none" />
            <line x1="430" y1="152" x2="430" y2="135" stroke="#0284c7" strokeWidth="1.8" />
            <circle cx="430" cy="133" r="3.5" fill="#0284c7" />

            {/* Front Right Foreleg (Primary) */}
            <circle cx="550" cy="240" r="8" stroke="#0284c7" strokeWidth="2.2" fill="#ffffff" />
            <path d="M 550 240 L 615 325 L 585 410 L 575 428" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
            <circle cx="615" cy="325" r="7" stroke="#0284c7" strokeWidth="2" fill="#ffffff" />
            <circle cx="615" cy="325" r="3" fill="#0284c7" />
            <path d="M 567 428 L 583 428" stroke="#0284c7" strokeWidth="4.5" strokeLinecap="round" />

            {/* Rear Right Hindleg (Primary) */}
            <circle cx="320" cy="240" r="8" stroke="#0284c7" strokeWidth="2.2" fill="#ffffff" />
            <path d="M 320 240 L 260 330 L 290 410 L 298 428" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
            <circle cx="260" cy="330" r="7" stroke="#0284c7" strokeWidth="2" fill="#ffffff" />
            <circle cx="260" cy="330" r="3" fill="#0284c7" />
            <path d="M 290 428 L 306 428" stroke="#0284c7" strokeWidth="4.5" strokeLinecap="round" />
          </g>
        </svg>
      </div>

      {/* 5. Tactical Radar Sweeper (Top-Right) */}
      <div className="absolute top-20 right-8 lg:right-24 w-64 h-64 md:w-80 md:h-80 pointer-events-none opacity-40">
        <div className="relative w-full h-full rounded-full border border-slate-300 bg-white/40">
          {/* Concentric rings */}
          <div className="absolute inset-[15%] rounded-full border border-slate-300 border-dashed" />
          <div className="absolute inset-[35%] rounded-full border border-slate-300" />
          <div className="absolute inset-[55%] rounded-full border border-slate-300 border-dashed" />
          <div className="absolute inset-[75%] rounded-full border border-slate-300" />

          {/* Crosshairs */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-slate-300" />
          <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-slate-300" />

          {/* Rotating Radar Sweep Beam */}
          <div 
            className="absolute inset-0 rounded-full animate-radar-spin origin-center pointer-events-none"
            style={{
              background: 'conic-gradient(from 0deg, rgba(2, 132, 199, 0.25) 0deg, rgba(2, 132, 199, 0) 55deg, transparent 55deg)',
            }}
          />

          {/* Radar Blips */}
          <div className="absolute top-[28%] left-[62%] flex items-center gap-1.5 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-600 shadow-[0_0_8px_#0284c7]" />
            <span className="text-[9px] font-sans text-sky-900 font-bold bg-white/90 px-1.5 py-0.5 rounded border border-sky-300 shadow-xs">
              VK-01 [MQ-3]
            </span>
          </div>

          <div className="absolute top-[65%] left-[32%] flex items-center gap-1.5 animate-pulse" style={{ animationDelay: '1.2s' }}>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-[0_0_8px_#059669]" />
            <span className="text-[9px] font-sans text-emerald-900 font-bold bg-white/90 px-1.5 py-0.5 rounded border border-emerald-300 shadow-xs">
              VK-02 [CLEAR]
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
