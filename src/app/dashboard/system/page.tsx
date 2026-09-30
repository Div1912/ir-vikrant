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
      <div className="flex justify-between items-center glass-panel px-5 py-4 rounded-2xl shrink-0 border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-sans font-bold tracking-tight text-slate-900">
          <Activity size={20} className="text-sky-600" /> 
          SYSTEM HEALTH & INTEGRATIONS
        </div>
        <button className="text-xs flex items-center gap-2 font-sans font-bold px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-300 transition-colors shadow-xs">
          <RefreshCw size={14} /> RUN DIAGNOSTICS
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Integrations */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200/90 shadow-sm">
          <h2 className="text-xs font-sans font-bold tracking-tight text-slate-800 mb-4 flex items-center gap-2 uppercase">
            <Network size={16} className="text-sky-600" /> EXTERNAL INTEGRATIONS
          </h2>
          <div className="flex flex-col gap-3">
            {INTEGRATIONS.map(int => (
              <div key={int.name} className="p-3.5 border border-slate-200 bg-white/90 rounded-xl flex justify-between items-center shadow-xs">
                <div>
                  <div className="text-sm font-bold text-slate-900">{int.name}</div>
                  <div className="text-xs font-sans text-slate-600 mt-0.5 font-medium">Ping: {int.ping} • Last Sync: {int.lastSync}</div>
                </div>
                <div className={`text-[10px] font-sans font-bold uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                  int.status === 'online' ? 'border-emerald-200 text-emerald-800 bg-emerald-50' :
                  int.status === 'degraded' ? 'border-amber-200 text-amber-800 bg-amber-50' :
                  'border-red-200 text-red-800 bg-red-50'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${int.status === 'online' ? 'bg-emerald-600' : int.status === 'degraded' ? 'bg-amber-600' : 'bg-red-600'}`} />
                  {int.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Core Infrastructure */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200/90 shadow-sm">
          <h2 className="text-xs font-sans font-bold tracking-tight text-slate-800 mb-4 flex items-center gap-2 uppercase">
            <Server size={16} className="text-sky-600" /> COMMAND CENTER INFRASTRUCTURE
          </h2>
          <div className="flex flex-col gap-3">
            {INFRA.map(inf => (
              <div key={inf.name} className="p-3.5 border border-slate-200 bg-white/90 rounded-xl flex justify-between items-center shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-sky-50 text-sky-700 rounded-xl border border-sky-200">
                    {inf.name.includes('Database') ? <Database size={18} /> : 
                     inf.name.includes('Gateway') ? <Network size={18} /> : 
                     <HardDrive size={18} />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{inf.name}</div>
                    <div className="text-xs font-sans text-slate-600 mt-0.5 font-medium">Load: {inf.load}</div>
                  </div>
                </div>
                <div className={`text-[10px] font-sans font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                  inf.status === 'nominal' ? 'border-sky-200 text-sky-800 bg-sky-50' :
                  'border-amber-200 text-amber-800 bg-amber-50'
                }`}>
                  {inf.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Status */}
      <div className="glass-panel rounded-2xl p-5 border border-emerald-200 bg-emerald-50/40 shadow-sm">
        <h2 className="text-xs font-sans font-bold tracking-tight text-emerald-900 mb-4 flex items-center gap-2 uppercase">
          <ShieldCheck size={18} className="text-emerald-700" /> SECURITY & ACCESS CONTROL
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SecMetric label="Active Sessions" value="14" />
          <SecMetric label="Failed Logins (24h)" value="0" />
          <SecMetric label="DB RLS Status" value="ENFORCED" color="text-emerald-700" />
          <SecMetric label="Encryption" value="AES-256 GCM" />
        </div>
      </div>
    </div>
  );
}

function SecMetric({ label, value, color = "text-slate-900" }: { label: string, value: string, color?: string }) {
  return (
    <div className="p-3.5 bg-white/90 rounded-xl border border-slate-200 shadow-xs">
      <div className="text-[10px] font-sans font-bold text-slate-500 tracking-tight mb-1 uppercase">{label}</div>
      <div className={`text-lg font-sans font-bold ${color}`}>{value}</div>
    </div>
  );
}
