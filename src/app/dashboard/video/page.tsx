'use client';

import React, { useState } from 'react';
import { Camera, Maximize, Settings2, Video as VideoIcon, Radio, Eye, Flame, Check } from 'lucide-react';
import LiveCameraFeed from '@/components/LiveCameraFeed';

const MOCK_FEEDS = [
  { id: '1', unit: 'Q-01', mode: 'optical', status: 'live', location: 'NDLS Platform 1', isLiveCam: true },
  { id: '2', unit: 'Q-02', mode: 'optical', status: 'live', location: 'NDLS Platform 4', isLiveCam: false },
  { id: '3', unit: 'Q-03', mode: 'optical', status: 'buffering', location: 'NDLS Concourse', isLiveCam: false },
  { id: '4', unit: 'H-01', mode: 'optical', status: 'live', location: 'Parcel Office', isLiveCam: false },
  { id: '5', unit: 'H-02', mode: 'optical', status: 'lost', location: 'Parking', isLiveCam: false },
  { id: '6', unit: 'Q-04', mode: 'thermal', status: 'live', location: 'VIP Gate', isLiveCam: false },
];

export default function VideoWallPage() {
  const [feeds, setFeeds] = useState(MOCK_FEEDS);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const toggleMode = (id: string) => {
    setFeeds(feeds.map(f => (f.id === id ? { ...f, mode: f.mode === 'thermal' ? 'optical' : 'thermal' } : f)));
  };

  if (focusedId) {
    const feed = feeds.find(f => f.id === focusedId)!;
    return (
      <div className="flex flex-col h-full w-full p-4 gap-4 font-sans bg-transparent">
        <div className="flex justify-between items-center glass-liquid-panel px-5 py-4 rounded-3xl shrink-0 border border-white/80 shadow-md">
          <div className="flex items-center gap-3 text-sm font-sans font-bold tracking-tight text-slate-950">
            <VideoIcon size={20} className="text-sky-600" /> 
            FOCUS VIEW: {feed.unit} ({feed.location})
          </div>
          <button
            onClick={() => setFocusedId(null)}
            className="text-xs px-4 py-2 liquid-btn border border-white/80 rounded-2xl font-sans font-bold transition-all shadow-xs"
          >
            EXIT FOCUS
          </button>
        </div>
        <div className="flex-1 glass-liquid-panel rounded-3xl overflow-hidden relative border border-white/80 shadow-md">
          {feed.isLiveCam ? (
            <LiveCameraFeed unitCode={feed.unit} location={feed.location} className="w-full h-full" />
          ) : (
            <FeedRenderer feed={feed} onToggleMode={() => toggleMode(feed.id)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full p-4 gap-4 font-sans bg-transparent">
      <div className="flex justify-between items-center glass-liquid-panel px-5 py-4 rounded-3xl shrink-0 border border-white/80 shadow-md">
        <div className="flex items-center gap-3 text-sm font-sans font-bold tracking-tight text-slate-950">
          <VideoIcon size={20} className="text-sky-600" /> 
          TACTICAL VIDEO WALL (OPERATOR LIVE FEEDS)
        </div>
        <div className="text-xs font-sans font-bold px-3 py-1 bg-white/60 text-emerald-900 rounded-full border border-white/80 shadow-xs backdrop-blur-md">
          {feeds.filter(f => f.status === 'live').length} ACTIVE STREAMS
        </div>
      </div>
      
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 grid-rows-2 gap-4">
        {feeds.map(feed => (
          <div key={feed.id} className="glass-liquid-panel rounded-3xl overflow-hidden relative group border border-white/80 shadow-md">
            {feed.isLiveCam ? (
              <div className="w-full h-full relative">
                <LiveCameraFeed unitCode={feed.unit} location={feed.location} className="w-full h-full" />
                <button
                  onClick={() => setFocusedId(feed.id)}
                  className="absolute top-3 right-14 z-20 p-2 bg-slate-900/80 hover:bg-slate-900 rounded-xl border border-slate-700 text-white transition-colors backdrop-blur-sm shadow-md"
                  title="Focus View"
                >
                  <Maximize size={14} />
                </button>
              </div>
            ) : (
              <FeedRenderer
                feed={feed}
                onToggleMode={() => toggleMode(feed.id)}
                onFocus={() => setFocusedId(feed.id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedRenderer({
  feed,
  onToggleMode,
  onFocus,
}: {
  feed: any;
  onToggleMode: () => void;
  onFocus?: () => void;
}) {
  return (
    <>
      {feed.status === 'live' ? (
        <video 
          autoPlay
          loop
          muted
          playsInline 
          className={`w-full h-full object-cover ${
            feed.mode === 'thermal'
              ? 'hue-rotate-[180deg] saturate-200 contrast-125'
              : 'grayscale opacity-80'
          }`}
        >
          <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4" />
        </video>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 gap-3">
          <Radio size={32} className={`text-slate-600 ${feed.status === 'buffering' ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-sans font-bold text-slate-400 uppercase tracking-tight">
            {feed.status === 'lost' ? 'SIGNAL LOST' : 'BUFFERING...'}
          </span>
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/60 pointer-events-none" />
      
      <div className="absolute top-3 left-3">
        <span className="text-xs font-sans font-bold bg-slate-950/80 px-2.5 py-1 rounded-lg text-white backdrop-blur-sm border border-slate-700 shadow-md">
          {feed.unit}
        </span>
        <div className="text-[11px] text-slate-300 mt-1 font-sans font-medium">{feed.location}</div>
      </div>
      
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full inline-block shadow-md ${
            feed.status === 'live'
              ? 'bg-emerald-500 animate-pulse'
              : feed.status === 'buffering'
              ? 'bg-amber-500'
              : 'bg-red-500'
          }`}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 flex justify-between items-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onToggleMode}
          className="p-2 bg-slate-900/80 hover:bg-slate-900 rounded-xl border border-slate-700 text-white transition-colors shadow-md backdrop-blur-sm"
          title="Toggle Mode"
        >
          <Settings2 size={16} />
        </button>
        <div className="text-[10px] font-sans text-slate-300 tracking-tight font-bold uppercase pointer-events-none">
          {feed.mode} MODE
        </div>
        {onFocus && (
          <button
            onClick={onFocus}
            className="p-2 bg-slate-900/80 hover:bg-slate-900 rounded-xl border border-slate-700 text-white transition-colors shadow-md backdrop-blur-sm"
            title="Focus View"
          >
            <Maximize size={16} />
          </button>
        )}
      </div>
    </>
  );
}
