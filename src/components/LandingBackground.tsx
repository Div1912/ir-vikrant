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

    const nodeCount = Math.min(Math.floor((width * height) / 25000), 60);
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
      'rgba(255, 255, 255, ',
      'rgba(248, 250, 252, ',
      'rgba(226, 232, 240, ',
      'rgba(203, 213, 225, ',
    ];

    for (let i = 0; i < nodeCount; i++) {
      const baseRadius = Math.random() * 1.8 + 1.8;
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: baseRadius,
        baseRadius,
        color: colors[Math.floor(Math.random() * colors.length)],
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.025 + Math.random() * 0.03,
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
          if (dist < 150) {
            const force = (150 - dist) / 150;
            node.x -= (dx / dist) * force * 1.4;
            node.y -= (dy / dist) * force * 1.4;
          }
        }

        node.pulsePhase += node.pulseSpeed;
        const pulse = Math.sin(node.pulsePhase) * 0.4 + 1;
        node.radius = node.baseRadius * pulse;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color + '0.9)';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw connection lines with high contrast
      const maxDistance = 145;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            const alpha = (1 - dist / maxDistance) * 0.35;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
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
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12;
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
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden bg-transparent">
      {/* 1. Tactical Constellation Canvas - High Visibility Monochrome */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-90 pointer-events-none"
      />

      {/* 2. Soft Ambient Neutral Light */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[850px] h-[450px] bg-white/[0.04] blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[650px] h-[350px] bg-white/[0.03] blur-[150px] rounded-full pointer-events-none" />

      {/* 3. 3D Perspective Tactical Grid Floor - Bold & Crisp */}
      <div 
        className="absolute bottom-0 inset-x-0 h-[48vh] overflow-hidden opacity-50 pointer-events-none"
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
              linear-gradient(to right, rgba(255, 255, 255, 0.18) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.18) 1px, transparent 1px)
            `,
            backgroundSize: '44px 44px',
            maskImage: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, transparent 85%)',
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, transparent 85%)',
          }}
        />
        {/* Horizon glowing laser line */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
      </div>

      {/* 4. Holographic Quadruped Robot Wireframe Blueprint - Bold High-Contrast (Visible on Dashboard & Landing) */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[620px] opacity-[0.55] pointer-events-none">
        <svg
          viewBox="0 0 1000 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_0_20px_rgba(255,255,255,0.2)] animate-hologram-pulse"
        >
          <defs>
            <pattern id="blueprintGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.8" />
            </pattern>
          </defs>

          {/* Blueprint Grid Plane */}
          <rect x="80" y="40" width="840" height="520" fill="url(#blueprintGrid)" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.2" strokeDasharray="4 4" rx="8" />

          {/* Outer Technical Frame Brackets */}
          <path d="M 70 60 L 70 40 L 90 40" stroke="#ffffff" strokeWidth="2" />
          <path d="M 910 40 L 930 40 L 930 60" stroke="#ffffff" strokeWidth="2" />
          <path d="M 70 540 L 70 560 L 90 560" stroke="#ffffff" strokeWidth="2" />
          <path d="M 910 560 L 930 560 L 930 540" stroke="#ffffff" strokeWidth="2" />

          {/* Technical Specs & Header */}
          <text x="96" y="64" fill="#ffffff" fontSize="11" fontFamily="monospace" letterSpacing="3" fontWeight="bold" opacity="0.95">
            SYSTEM SCHEMATIC // IRV-Q4 AUTONOMOUS QUADRUPED
          </text>
          <text x="96" y="80" fill="#e2e8f0" fontSize="9" fontFamily="monospace" letterSpacing="1" opacity="0.85">
            REF: INDIAN RAILWAYS RECON SPEC REV 4.8.2 | ACTIVE PAYLOAD: MQ-3 + HC-SR04
          </text>
          <text x="820" y="64" fill="#ffffff" fontSize="10" fontFamily="monospace" textAnchor="end" fontWeight="bold" opacity="0.95">
            [ ONLINE: TELEMETRY SYNCED ]
          </text>

          {/* Coordinate Calipers & Reticles */}
          <circle cx="500" cy="290" r="210" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="1.2" strokeDasharray="6 6" />
          <circle cx="500" cy="290" r="160" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1" />
          <line x1="500" y1="70" x2="500" y2="510" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="280" y1="290" x2="720" y2="290" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1" strokeDasharray="4 4" />

          {/* QUADRUPED ROBOT WIREFRAME BODY (High-Contrast Monochrome) */}
          <g transform="translate(50, 20)">
            {/* Ground Contact Line */}
            <line x1="220" y1="430" x2="680" y2="430" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="2" strokeDasharray="8 4" />
            <text x="640" y="446" fill="#e2e8f0" fontSize="9" fontFamily="monospace" opacity="0.8">GROUND DATUM // 0.00m</text>

            {/* Back Left Leg */}
            <path d="M 320 230 L 270 310 L 255 400 L 245 428" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="270" cy="310" r="5" stroke="#ffffff" strokeWidth="2" fill="#08090c" />
            <circle cx="245" cy="428" r="4" fill="#ffffff" />

            {/* Front Left Leg */}
            <path d="M 530 230 L 580 305 L 565 395 L 555 428" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="580" cy="305" r="5" stroke="#ffffff" strokeWidth="2" fill="#08090c" />
            <circle cx="555" cy="428" r="4" fill="#ffffff" />

            {/* Main Robot Torso / Chassis */}
            <polygon 
              points="290,210 330,185 510,185 570,205 595,245 560,265 330,265 295,245" 
              stroke="#ffffff" 
              strokeWidth="2.5" 
              fill="rgba(255, 255, 255, 0.05)" 
            />
            {/* Internal Armor Ribs */}
            <line x1="370" y1="185" x2="370" y2="265" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="440" y1="185" x2="440" y2="265" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="510" y1="185" x2="510" y2="265" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />

            {/* Core Battery Pack */}
            <rect x="350" y="205" width="140" height="42" stroke="#ffffff" strokeWidth="1.8" fill="rgba(255, 255, 255, 0.08)" rx="3" />
            <text x="420" y="231" fill="#ffffff" fontSize="9" fontFamily="monospace" textAnchor="middle" letterSpacing="2" fontWeight="bold">
              LFP CORE // 48V 35Ah
            </text>

            {/* Forward Sensor Head */}
            <polygon points="570,205 620,200 645,225 635,250 595,245" stroke="#ffffff" strokeWidth="2.2" fill="rgba(255, 255, 255, 0.08)" />
            <circle cx="635" cy="222" r="7" stroke="#ffffff" strokeWidth="2" fill="#08090c" />
            <circle cx="635" cy="222" r="3.5" fill="#ffffff" />

            {/* Top LiDAR */}
            <rect x="410" y="162" width="40" height="23" stroke="#ffffff" strokeWidth="1.8" fill="rgba(255, 255, 255, 0.08)" rx="2" />
            <path d="M 415 162 C 415 152 445 152 445 162" stroke="#ffffff" strokeWidth="1.8" fill="none" />
            <line x1="430" y1="152" x2="430" y2="135" stroke="#ffffff" strokeWidth="1.8" />
            <circle cx="430" cy="133" r="3.5" fill="#ffffff" />

            {/* Front Right Foreleg (Primary) */}
            <circle cx="550" cy="240" r="8" stroke="#ffffff" strokeWidth="2.2" fill="#08090c" />
            <path d="M 550 240 L 615 325 L 585 410 L 575 428" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            <circle cx="615" cy="325" r="7" stroke="#ffffff" strokeWidth="2" fill="#08090c" />
            <circle cx="615" cy="325" r="3" fill="#ffffff" />
            <path d="M 567 428 L 583 428" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />

            {/* Rear Right Hindleg (Primary) */}
            <circle cx="320" cy="240" r="8" stroke="#ffffff" strokeWidth="2.2" fill="#08090c" />
            <path d="M 320 240 L 260 330 L 290 410 L 298 428" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            <circle cx="260" cy="330" r="7" stroke="#ffffff" strokeWidth="2" fill="#08090c" />
            <circle cx="260" cy="330" r="3" fill="#ffffff" />
            <path d="M 290 428 L 306 428" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />

            {/* SENSOR CALLOUT 1: MQ-3 Gas e-Nose */}
            <g>
              <line x1="645" y1="240" x2="730" y2="190" stroke="#ffffff" strokeWidth="1.5" />
              <circle cx="645" cy="240" r="3.5" fill="#ffffff" />
              <rect x="730" y="173" width="145" height="34" stroke="#ffffff" strokeWidth="1.5" fill="rgba(255, 255, 255, 0.12)" rx="5" />
              <text x="740" y="188" fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold">
                MQ-3 e-NOSE SENSOR
              </text>
              <text x="740" y="200" fill="#e2e8f0" fontSize="8" fontFamily="monospace">
                TRACE: ALCOHOL / VOCs
              </text>
            </g>

            {/* SENSOR CALLOUT 2: HC-SR04 Ultrasonic Sonar */}
            <g>
              <line x1="640" y1="225" x2="730" y2="270" stroke="#ffffff" strokeWidth="1.5" />
              <circle cx="640" cy="225" r="3.5" fill="#ffffff" />
              <rect x="730" y="253" width="145" height="34" stroke="#ffffff" strokeWidth="1.5" fill="rgba(255, 255, 255, 0.12)" rx="5" />
              <text x="740" y="268" fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold">
                HC-SR04 ULTRASONIC
              </text>
              <text x="740" y="280" fill="#e2e8f0" fontSize="8" fontFamily="monospace">
                RANGE: 2cm - 400cm
              </text>
            </g>

            {/* SENSOR CALLOUT 3: 12-DOF Actuators */}
            <g>
              <line x1="260" y1="330" x2="170" y2="360" stroke="#ffffff" strokeWidth="1.5" />
              <circle cx="260" cy="330" r="3.5" fill="#ffffff" />
              <rect x="25" y="343" width="145" height="34" stroke="#ffffff" strokeWidth="1.5" fill="rgba(255, 255, 255, 0.12)" rx="5" />
              <text x="35" y="358" fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold">
                12-DOF TORQUE JOINTS
              </text>
              <text x="35" y="370" fill="#e2e8f0" fontSize="8" fontFamily="monospace">
                PLANETARY GEAR 18Nm
              </text>
            </g>
          </g>
        </svg>
      </div>

      {/* 5. Tactical Radar Sweeper - High-Contrast Monochrome (Top-Right) */}
      <div className="absolute top-20 right-8 lg:right-24 w-64 h-64 md:w-80 md:h-80 pointer-events-none opacity-50">
        <div className="relative w-full h-full rounded-full border border-white/25 bg-white/[0.03]">
          {/* Concentric rings */}
          <div className="absolute inset-[15%] rounded-full border border-white/20 border-dashed" />
          <div className="absolute inset-[35%] rounded-full border border-white/25" />
          <div className="absolute inset-[55%] rounded-full border border-white/20 border-dashed" />
          <div className="absolute inset-[75%] rounded-full border border-white/30" />

          {/* Crosshairs */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/20" />
          <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-white/20" />

          {/* Rotating Radar Sweep Beam */}
          <div 
            className="absolute inset-0 rounded-full animate-radar-spin origin-center pointer-events-none"
            style={{
              background: 'conic-gradient(from 0deg, rgba(255, 255, 255, 0.35) 0deg, rgba(255, 255, 255, 0) 55deg, transparent 55deg)',
            }}
          />

          {/* Radar Blips */}
          <div className="absolute top-[28%] left-[62%] flex items-center gap-1.5 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_#ffffff]" />
            <span className="text-[9px] font-mono text-white font-bold bg-black/80 px-1.5 py-0.5 rounded border border-white/30 shadow-md">
              VK-01 [MQ-3]
            </span>
          </div>

          <div className="absolute top-[65%] left-[32%] flex items-center gap-1.5 animate-pulse" style={{ animationDelay: '1.2s' }}>
            <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_#ffffff]" />
            <span className="text-[9px] font-mono text-white font-bold bg-black/80 px-1.5 py-0.5 rounded border border-white/30 shadow-md">
              VK-02 [CLEAR]
            </span>
          </div>

          {/* Range Labels */}
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-zinc-300 font-bold">000° // 2500m</span>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-zinc-300 font-bold">180°</span>
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-mono text-zinc-300 font-bold">090°</span>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-mono text-zinc-300 font-bold">270°</span>
        </div>
      </div>

      {/* 6. Vertical Telemetry Sidebands */}
      <div className="hidden xl:flex flex-col justify-between absolute left-6 top-32 bottom-24 w-12 opacity-50 text-[9px] font-mono text-zinc-300 pointer-events-none select-none">
        <div className="space-y-3">
          <div className="w-5 h-[1.5px] bg-white" />
          <div className="tracking-widest uppercase [writing-mode:vertical-lr] rotate-180 font-bold">
            RPF-SECTOR // SEC-09-HQ
          </div>
          <div className="text-[8px] text-zinc-400">28.6139° N</div>
          <div className="text-[8px] text-zinc-400">77.2090° E</div>
        </div>

        <div className="space-y-2 py-4 border-y border-white/20">
          <div className="text-[8px] text-white font-bold">SATCOM</div>
          <div className="w-2 h-2 rounded-full bg-white animate-ping" />
          <div className="text-[7px] text-zinc-400">NAVIC-7</div>
        </div>

        <div className="space-y-2">
          <div className="text-[8px] text-zinc-400 font-bold">SYS.VER: 4.8</div>
          <div className="w-5 h-[1.5px] bg-white" />
        </div>
      </div>

      <div className="hidden xl:flex flex-col justify-between items-end absolute right-6 top-32 bottom-24 w-16 opacity-50 text-[9px] font-mono text-zinc-300 pointer-events-none select-none text-right">
        <div className="space-y-3 flex flex-col items-end">
          <div className="w-5 h-[1.5px] bg-white" />
          <div className="text-[8px] text-white font-bold">SERIAL SYNC</div>
          <div className="text-[8px] text-zinc-400">9600 BAUD</div>
          <div className="text-[8px] text-zinc-400">ADC: 10-BIT</div>
        </div>

        <div className="space-y-1.5 py-4 border-y border-white/20 flex flex-col items-end">
          <div className="text-[8px] text-white font-bold">BUS STATUS</div>
          <div className="text-[7px] text-zinc-400">RX: ACTIVE</div>
          <div className="text-[7px] text-zinc-400">TX: READY</div>
        </div>

        <div className="space-y-2 flex flex-col items-end">
          <div className="text-[8px] text-zinc-400">AES-256-GCM</div>
          <div className="w-5 h-[1.5px] bg-white" />
        </div>
      </div>
    </div>
  );
}
