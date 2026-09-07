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
  { name: 'Narcotics', value: 75, color: '#3b82f6' }, // accent (info)
  { name: 'Explosives', value: 25, color: '#ef4444' }, // destructive
];

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 overflow-y-auto">
      <div className="flex justify-between items-center glass-panel px-4 py-3 rounded-xl shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3 text-sm font-mono tracking-widest text-foreground/70">
          <BarChart3 size={16} /> 
          INTELLIGENCE & ANALYTICS
        </div>
        <button className="text-xs flex items-center gap-2 font-mono px-3 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors">
          <Download size={12} /> EXPORT CSV
        </button>
      </div>
      
      <div className="grid grid-cols-3 gap-4 shrink-0">
        <StatCard title="TOTAL DETECTIONS (30D)" value="1,248" trend="+12%" />
        <StatCard title="CONFIRMED THREATS" value="84" trend="-5%" />
        <StatCard title="SCAN VOLUME" value="142.5K" trend="+22%" />
      </div>

      <div className="grid grid-cols-2 gap-4 h-[400px]">
        {/* Trend Line Chart */}
        <div className="glass-panel rounded-xl p-4 flex flex-col">
          <h3 className="text-xs font-mono tracking-widest text-foreground/50 mb-4">DETECTION TRENDS (24H)</h3>
          <div className="flex-1 w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} 
                  itemStyle={{ fontSize: '12px' }}
                  labelStyle={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}
                />
                <Line type="monotone" dataKey="narcotics" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="explosives" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Zone Bar Chart */}
        <div className="glass-panel rounded-xl p-4 flex flex-col">
          <h3 className="text-xs font-mono tracking-widest text-foreground/50 mb-4">DETECTIONS BY ZONE</h3>
          <div className="flex-1 w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.5)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.5)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} 
                />
                <Bar dataKey="detections" fill="#ffffff" radius={[0, 4, 4, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 h-[300px]">
        {/* Substance Donut */}
        <div className="glass-panel rounded-xl p-4 flex flex-col">
          <h3 className="text-xs font-mono tracking-widest text-foreground/50 mb-4">SUBSTANCE BREAKDOWN</h3>
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
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} 
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
              <span className="text-2xl font-light">100%</span>
              <span className="text-[10px] text-foreground/50 font-mono tracking-widest">SCANNED</span>
            </div>
          </div>
        </div>
        
        {/* Heatmap / Additional Data Placeholder */}
        <div className="col-span-2 glass-panel rounded-xl p-4 flex flex-col items-center justify-center text-foreground/30">
          <div className="text-xs font-mono tracking-widest border border-dashed border-foreground/20 p-8 rounded-lg">
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
    <div className="glass-panel rounded-xl p-5 flex flex-col">
      <div className="text-[10px] font-mono tracking-widest text-foreground/50 mb-2">{title}</div>
      <div className="flex items-end justify-between">
        <div className="text-4xl font-light">{value}</div>
        <div className={`text-xs font-mono mb-1 ${isPositive ? 'text-success' : 'text-destructive'}`}>
          {trend}
        </div>
      </div>
    </div>
  );
}
