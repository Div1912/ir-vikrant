'use client';

import React from 'react';
import { Activity, Server, Network, ShieldCheck, Database, HardDrive, RefreshCw } from 'lucide-react';

const INTEGRATIONS = [
  { name: 'RailTel VSS Link', status: 'online', ping: '12ms', lastSync: 'Just now' },
  { name: 'Rail Prahari API', status: 'online', ping: '45ms', lastSync: '2m ago' },
  { name: 'Bhashini API (Translation)', status: 'degraded', ping: '312ms', lastSync: '15m ago' },
  { name: 'NDPS Case Registry DB', status: 'online', ping: '22ms', lastSync: 'Just now' },
];

const INFRA = [
  { name: 'Core Database (Supabase)', status: 'nominal', load: '14%' },
  { name: 'Realtime WebSocket Cluster', status: 'nominal', load: '42%' },
  { name: 'Video Ingestion Nodes', status: 'nominal', load: '68%' },
  { name: 'LoRa Mesh Gateway', status: 'failover', load: '12%' },
];

export default function SystemHealthPage() {
  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 overflow-y-auto font-sans bg-transparent">
      {/* Header */}
      <div className="flex justify-between items-center glass-liquid-panel px-5 py-4 rounded-3xl shrink-0 border border-white/80 shadow-md">
        <div className="flex items-center gap-3 text-sm font-sans font-bold tracking-tight text-slate-950">
          <Activity size={20} className="text-sky-600" /> 
          SYSTEM HEALTH & INTEGRATIONS
        </div>
        <button className="text-xs flex items-center gap-2 font-sans font-bold px-4 py-2 liquid-btn border border-white/80 rounded-2xl transition-all shadow-xs">
          <RefreshCw size={14} /> RUN DIAGNOSTICS
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Integrations */}
        <div className="glass-liquid-panel rounded-3xl p-5 border border-white/80 shadow-md">
          <h2 className="text-xs font-sans font-bold tracking-tight text-slate-950 mb-4 flex items-center gap-2 uppercase">
            <Network size={16} className="text-sky-600" /> EXTERNAL INTEGRATIONS
          </h2>
          <div className="flex flex-col gap-3">
            {INTEGRATIONS.map(int => (
              <div key={int.name} className="p-4 border border-white/80 glass-liquid rounded-2xl flex justify-between items-center shadow-xs">
                <div>
                  <div className="text-sm font-bold text-slate-950">{int.name}</div>
                  <div className="text-xs font-sans text-slate-700 mt-0.5 font-semibold">Ping: {int.ping} • Last Sync: {int.lastSync}</div>
                </div>
                <div className={`text-[10px] font-sans font-bold uppercase px-3 py-1 rounded-full border flex items-center gap-1.5 backdrop-blur-md ${
                  int.status === 'online' ? 'border-emerald-300 text-emerald-950 bg-emerald-500/20' :
                  int.status === 'degraded' ? 'border-amber-300 text-amber-950 bg-amber-500/20' :
                  'border-red-300 text-red-950 bg-red-500/20'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${int.status === 'online' ? 'bg-emerald-600' : int.status === 'degraded' ? 'bg-amber-600' : 'bg-red-600'}`} />
                  {int.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Core Infrastructure */}
        <div className="glass-liquid-panel rounded-3xl p-5 border border-white/80 shadow-md">
          <h2 className="text-xs font-sans font-bold tracking-tight text-slate-950 mb-4 flex items-center gap-2 uppercase">
            <Server size={16} className="text-sky-600" /> COMMAND CENTER INFRASTRUCTURE
          </h2>
          <div className="flex flex-col gap-3">
            {INFRA.map(inf => (
              <div key={inf.name} className="p-4 border border-white/80 glass-liquid rounded-2xl flex justify-between items-center shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/70 text-sky-700 rounded-xl border border-white/90 shadow-xs">
                    {inf.name.includes('Database') ? <Database size={18} /> : 
                     inf.name.includes('Gateway') ? <Network size={18} /> : 
                     <HardDrive size={18} />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-950">{inf.name}</div>
                    <div className="text-xs font-sans text-slate-700 mt-0.5 font-semibold">Load: {inf.load}</div>
                  </div>
                </div>
                <div className={`text-[10px] font-sans font-bold uppercase px-3 py-1 rounded-full border backdrop-blur-md ${
                  inf.status === 'nominal' ? 'border-sky-300 text-sky-950 bg-sky-500/20' :
                  'border-amber-300 text-amber-950 bg-amber-500/20'
                }`}>
                  {inf.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Status */}
      <div className="glass-liquid-panel rounded-3xl p-5 border border-emerald-300/80 bg-emerald-500/10 shadow-md">
        <h2 className="text-xs font-sans font-bold tracking-tight text-emerald-950 mb-4 flex items-center gap-2 uppercase">
          <ShieldCheck size={18} className="text-emerald-700" /> SECURITY & ACCESS CONTROL
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SecMetric label="Active Sessions" value="14" />
          <SecMetric label="Failed Logins (24h)" value="0" />
          <SecMetric label="DB RLS Status" value="ENFORCED" color="text-emerald-800" />
          <SecMetric label="Encryption" value="AES-256 GCM" />
        </div>
      </div>
    </div>
  );
}

function SecMetric({ label, value, color = "text-slate-950" }: { label: string, value: string, color?: string }) {
  return (
    <div className="p-4 glass-liquid rounded-2xl border border-white/80 shadow-xs">
      <div className="text-[10px] font-sans font-bold text-slate-600 tracking-tight mb-1 uppercase">{label}</div>
      <div className={`text-lg font-sans font-bold ${color}`}>{value}</div>
    </div>
  );
}
