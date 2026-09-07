-- IR Vikrant Supabase Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles (extends Supabase Auth)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'zonal_control', 'divisional_control', 'post_operator')) NOT NULL,
  zone TEXT,
  division TEXT,
  post TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by users in the same zone/division or admins"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.id = auth.uid() AND (p2.role = 'admin' OR p2.zone = profiles.zone)
    )
  );

-- 2. Units (Quadruped & Handheld)
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_code TEXT UNIQUE NOT NULL,
  type TEXT CHECK (type IN ('quadruped', 'handheld')) NOT NULL,
  station TEXT,
  zone TEXT,
  status TEXT DEFAULT 'offline',
  battery_pct INTEGER CHECK (battery_pct >= 0 AND battery_pct <= 100),
  last_seen TIMESTAMPTZ,
  sensor_health JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Units viewable based on role"
  ON public.units FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.zone = units.zone)
    )
  );

-- 3. Live Positions (Realtime)
CREATE TABLE public.live_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.live_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live positions viewable based on role"
  ON public.live_positions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE u.id = live_positions.unit_id AND (p.role = 'admin' OR p.zone = u.zone)
    )
  );

-- 4. Video Feeds
CREATE TABLE public.video_feeds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  feed_url TEXT NOT NULL,
  mode TEXT CHECK (mode IN ('thermal', 'optical')) DEFAULT 'optical',
  status TEXT DEFAULT 'buffering',
  last_frame_at TIMESTAMPTZ
);

ALTER TABLE public.video_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Video feeds viewable based on role"
  ON public.video_feeds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE u.id = video_feeds.unit_id AND (p.role = 'admin' OR p.zone = u.zone)
    )
  );

-- 5. Detection Events
CREATE TABLE public.detection_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  substance_category TEXT NOT NULL,
  substance_name TEXT NOT NULL,
  confidence_tier TEXT CHECK (confidence_tier IN ('screen', 'presumptive', 'confirmed')) NOT NULL,
  confidence_score DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  station TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  status TEXT CHECK (status IN ('new', 'under review', 'escalated', 'closed')) DEFAULT 'new',
  photo_url TEXT,
  video_clip_url TEXT
);

ALTER TABLE public.detection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Detection events viewable based on role"
  ON public.detection_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE u.id = detection_events.unit_id AND (p.role = 'admin' OR p.zone = u.zone)
    )
  );

-- 6. Evidence Records
CREATE TABLE public.evidence_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES public.detection_events(id) ON DELETE CASCADE,
  serial_number TEXT UNIQUE NOT NULL,
  officer_id UUID REFERENCES public.profiles(id),
  witness_name TEXT,
  ndps_checklist JSONB DEFAULT '{}'::jsonb,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.evidence_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Evidence records viewable based on role"
  ON public.evidence_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.detection_events e
      JOIN public.units u ON u.id = e.unit_id
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE e.id = evidence_records.event_id AND (p.role = 'admin' OR p.zone = u.zone)
    )
  );

-- 7. Integration Status
CREATE TABLE public.integration_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('online', 'degraded', 'offline')) DEFAULT 'offline',
  last_checked TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.integration_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Integration status viewable by all authenticated users"
  ON public.integration_status FOR SELECT
  TO authenticated
  USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.detection_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.units;
