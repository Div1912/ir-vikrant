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
    <div className="flex flex-col h-full w-full p-4 gap-4 overflow-y-auto">
      <div className="flex justify-between items-center glass-panel px-4 py-3 rounded-xl shrink-0">
        <div className="flex items-center gap-3 text-sm font-mono tracking-widest text-foreground/70">
          <Activity size={16} /> 
          SYSTEM HEALTH & INTEGRATIONS
        </div>
        <button className="text-xs flex items-center gap-2 font-mono px-3 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors">
          <RefreshCw size={12} /> RUN DIAGNOSTICS
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Integrations */}
        <div className="glass-panel rounded-xl p-4">
          <h2 className="text-xs font-mono tracking-widest text-foreground/50 mb-4 flex items-center gap-2">
            <Network size={14} /> EXTERNAL INTEGRATIONS
          </h2>
          <div className="flex flex-col gap-3">
            {INTEGRATIONS.map(int => (
              <div key={int.name} className="p-3 border border-panel-border bg-black/20 rounded-lg flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium">{int.name}</div>
                  <div className="text-[10px] font-mono text-foreground/50 mt-1">Ping: {int.ping} • Last Sync: {int.lastSync}</div>
                </div>
                <div className={`text-[10px] font-mono uppercase px-2 py-1 rounded border flex items-center gap-2 ${
                  int.status === 'online' ? 'border-success text-success bg-success/10' :
                  int.status === 'degraded' ? 'border-warning text-warning bg-warning/10' :
                  'border-destructive text-destructive bg-destructive/10'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${int.status === 'online' ? 'bg-success' : int.status === 'degraded' ? 'bg-warning' : 'bg-destructive'}`} />
                  {int.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Core Infrastructure */}
        <div className="glass-panel rounded-xl p-4">
          <h2 className="text-xs font-mono tracking-widest text-foreground/50 mb-4 flex items-center gap-2">
            <Server size={14} /> COMMAND CENTER INFRASTRUCTURE
          </h2>
          <div className="flex flex-col gap-3">
            {INFRA.map(inf => (
              <div key={inf.name} className="p-3 border border-panel-border bg-black/20 rounded-lg flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded">
                    {inf.name.includes('Database') ? <Database size={16} /> : 
                     inf.name.includes('Gateway') ? <Network size={16} /> : 
                     <HardDrive size={16} />}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{inf.name}</div>
                    <div className="text-[10px] font-mono text-foreground/50 mt-1">Load: {inf.load}</div>
                  </div>
                </div>
                <div className={`text-[10px] font-mono uppercase px-2 py-1 rounded border ${
                  inf.status === 'nominal' ? 'border-info/30 text-info' :
                  'border-warning/30 text-warning'
                }`}>
                  {inf.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Status */}
      <div className="glass-panel rounded-xl p-4 border border-success/20">
        <h2 className="text-xs font-mono tracking-widest text-success mb-4 flex items-center gap-2">
          <ShieldCheck size={14} /> SECURITY & ACCESS CONTROL
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <SecMetric label="Active Sessions" value="14" />
          <SecMetric label="Failed Logins (24h)" value="0" />
          <SecMetric label="DB RLS Status" value="ENFORCED" color="text-success" />
          <SecMetric label="Encryption" value="AES-256 GCM" />
        </div>
      </div>
    </div>
  );
}

function SecMetric({ label, value, color = "text-foreground" }: { label: string, value: string, color?: string }) {
  return (
    <div className="p-3 bg-black/20 rounded border border-panel-border/50">
      <div className="text-[10px] font-mono text-foreground/50 tracking-widest mb-1 uppercase">{label}</div>
      <div className={`text-lg font-mono ${color}`}>{value}</div>
    </div>
  );
}
