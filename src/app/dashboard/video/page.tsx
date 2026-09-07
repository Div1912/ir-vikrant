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
      <div className="flex flex-col h-full w-full p-4 gap-4">
        <div className="flex justify-between items-center glass-panel px-4 py-3 rounded-xl shrink-0">
          <div className="flex items-center gap-3 text-sm font-mono tracking-widest text-foreground/70">
            <VideoIcon size={16} /> 
            FOCUS VIEW: {feed.unit} ({feed.location})
          </div>
          <button
            onClick={() => setFocusedId(null)}
            className="text-xs px-3 py-1 bg-white/10 hover:bg-white/20 rounded font-mono transition-colors"
          >
            EXIT FOCUS
          </button>
        </div>
        <div className="flex-1 glass-panel rounded-xl overflow-hidden relative">
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
    <div className="flex flex-col h-full w-full p-4 gap-4">
      <div className="flex justify-between items-center glass-panel px-4 py-3 rounded-xl shrink-0">
        <div className="flex items-center gap-3 text-sm font-mono tracking-widest text-foreground/70">
          <VideoIcon size={16} /> 
          TACTICAL VIDEO WALL (OPERATOR LIVE FEEDS)
        </div>
        <div className="text-xs font-mono text-foreground/50">
          {feeds.filter(f => f.status === 'live').length} ACTIVE STREAMS
        </div>
      </div>
      
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 grid-rows-2 gap-4">
        {feeds.map(feed => (
          <div key={feed.id} className="glass-panel rounded-xl overflow-hidden relative group">
            {feed.isLiveCam ? (
              <div className="w-full h-full relative">
                <LiveCameraFeed unitCode={feed.unit} location={feed.location} className="w-full h-full" />
                <button
                  onClick={() => setFocusedId(feed.id)}
                  className="absolute top-2 right-12 z-20 p-1.5 bg-black/60 hover:bg-black/80 rounded border border-white/10 text-white/70 hover:text-white transition-colors"
                  title="Focus View"
                >
                  <Maximize size={13} />
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
              : 'grayscale opacity-70'
          }`}
        >
          <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4" />
        </video>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black/50 gap-3">
          <Radio size={32} className={`opacity-20 ${feed.status === 'buffering' ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-mono text-foreground/30 uppercase tracking-widest">
            {feed.status === 'lost' ? 'SIGNAL LOST' : 'BUFFERING...'}
          </span>
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/60 pointer-events-none" />
      
      <div className="absolute top-3 left-3">
        <span className="text-xs font-mono bg-black/60 px-2 py-1 rounded text-white backdrop-blur-sm border border-white/10">
          {feed.unit}
        </span>
        <div className="text-[10px] text-white/50 mt-1 font-mono">{feed.location}</div>
      </div>
      
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full inline-block shadow-[0_0_8px_rgba(0,0,0,0.5)] ${
            feed.status === 'live'
              ? 'bg-success animate-pulse'
              : feed.status === 'buffering'
              ? 'bg-warning'
              : 'bg-destructive'
          }`}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 flex justify-between items-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onToggleMode}
          className="p-2 bg-black/60 hover:bg-black/80 rounded border border-white/10 text-white/70 hover:text-white transition-colors"
          title="Toggle Mode"
        >
          <Settings2 size={16} />
        </button>
        <div className="text-[10px] font-mono text-white/50 tracking-widest uppercase pointer-events-none">
          {feed.mode} MODE
        </div>
        {onFocus && (
          <button
            onClick={onFocus}
            className="p-2 bg-black/60 hover:bg-black/80 rounded border border-white/10 text-white/70 hover:text-white transition-colors"
            title="Focus View"
          >
            <Maximize size={16} />
          </button>
        )}
      </div>
    </>
  );
}
