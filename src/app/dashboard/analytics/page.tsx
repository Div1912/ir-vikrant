'use client';

import React from 'react';
import { BarChart3, Download } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';

const trendData = [
  { time: '00:00', explosives: 0, narcotics: 2 },
  { time: '04:00', explosives: 1, narcotics: 1 },
  { time: '08:00', explosives: 0, narcotics: 5 },
  { time: '12:00', explosives: 2, narcotics: 8 },
  { time: '16:00', explosives: 1, narcotics: 6 },
  { time: '20:00', explosives: 0, narcotics: 4 },
];

const zoneData = [
  { name: 'Northern', detections: 45 },
  { name: 'Western', detections: 32 },
  { name: 'Central', detections: 28 },
  { name: 'Eastern', detections: 15 },
  { name: 'Southern', detections: 19 },
];

const substanceData = [
  { name: 'Narcotics', value: 75, color: '#0284c7' },
  { name: 'Explosives', value: 25, color: '#e11d48' },
];

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 overflow-y-auto font-sans bg-transparent">
      {/* Header */}
      <div className="flex justify-between items-center glass-panel px-5 py-4 rounded-2xl shrink-0 sticky top-0 z-10 border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-sans font-bold tracking-tight text-slate-900">
          <BarChart3 size={20} className="text-sky-600" /> 
          INTELLIGENCE & ANALYTICS
        </div>
        <button className="text-xs flex items-center gap-2 font-sans font-bold px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-300 transition-colors shadow-xs">
          <Download size={14} /> EXPORT CSV
        </button>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <StatCard title="TOTAL DETECTIONS (30D)" value="1,248" trend="+12%" />
        <StatCard title="CONFIRMED THREATS" value="84" trend="-5%" />
        <StatCard title="SCAN VOLUME" value="142.5K" trend="+22%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[400px]">
        {/* Trend Line Chart */}
        <div className="glass-panel rounded-2xl p-5 flex flex-col border border-slate-200/90 shadow-sm">
          <h3 className="text-xs font-sans font-bold tracking-tight text-slate-800 uppercase mb-4">DETECTION TRENDS (24H)</h3>
          <div className="flex-1 w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                <XAxis dataKey="time" stroke="#334155" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                <YAxis stroke="#334155" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} 
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}
                />
                <Line type="monotone" dataKey="narcotics" stroke="#0284c7" strokeWidth={3} dot={{ r: 4, fill: '#0284c7' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="explosives" stroke="#e11d48" strokeWidth={3} dot={{ r: 4, fill: '#e11d48' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Zone Bar Chart */}
        <div className="glass-panel rounded-2xl p-5 flex flex-col border border-slate-200/90 shadow-sm">
          <h3 className="text-xs font-sans font-bold tracking-tight text-slate-800 uppercase mb-4">DETECTIONS BY ZONE</h3>
          <div className="flex-1 w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" horizontal={false} />
                <XAxis type="number" stroke="#334155" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#334155" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(241, 245, 249, 0.8)' }}
                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} 
                />
                <Bar dataKey="detections" fill="#0284c7" radius={[0, 6, 6, 0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[300px]">
        {/* Substance Donut */}
        <div className="glass-panel rounded-2xl p-5 flex flex-col border border-slate-200/90 shadow-sm">
          <h3 className="text-xs font-sans font-bold tracking-tight text-slate-800 uppercase mb-4">SUBSTANCE BREAKDOWN</h3>
          <div className="flex-1 w-full h-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={substanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {substanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #cbd5e1', borderRadius: '12px' }} 
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
              <span className="text-2xl font-bold text-slate-900">100%</span>
              <span className="text-[10px] text-slate-600 font-sans font-bold tracking-wider">SCANNED</span>
            </div>
          </div>
        </div>
        
        {/* Heatmap / Additional Data Placeholder */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 flex flex-col items-center justify-center text-slate-500 border border-slate-200/90 shadow-sm">
          <div className="text-xs font-sans font-bold tracking-tight border border-dashed border-slate-300 p-8 rounded-xl bg-slate-50/50 text-slate-600">
            [ TIME OF DAY HEATMAP RENDERING ENGINE STANDBY ]
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend }: { title: string, value: string, trend: string }) {
  const isPositive = trend.startsWith('+');
  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col border border-slate-200/90 shadow-sm">
      <div className="text-[11px] font-sans font-bold tracking-tight text-slate-600 mb-2 uppercase">{title}</div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-sans font-bold text-slate-950">{value}</div>
        <div className={`text-xs font-sans font-bold mb-1 px-2 py-0.5 rounded-full ${isPositive ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {trend}
        </div>
      </div>
    </div>
  );
}
