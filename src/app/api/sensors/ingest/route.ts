import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findNearestRailwayStation } from '@/lib/railwayStations';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      unit_id = 'c7569eb7-87ab-43db-905b-54baf7b106fc',
      sensor_type,
      value,
      unit_of_measure = 'ppm',
      latitude = 22.59548,
      longitude = 88.45420,
      distance_m,
      distance_cm,
    } = body;

    if (!sensor_type || value === undefined || value === null) {
      return NextResponse.json(
        { error: 'sensor_type and value are required fields.' },
        { status: 400 }
      );
    }

    const numValue = Number(value);
    const recorded_at = new Date().toISOString();

    // 1. Insert primary sensor into sensor_readings
    const { data: insertedSensor, error: sensorError } = await supabase
      .from('sensor_readings')
      .insert({
        unit_id,
        sensor_type,
        value: numValue,
        unit_of_measure,
        recorded_at,
      })
      .select()
      .single();

    if (sensorError) {
      console.error('[API Ingest] Supabase sensor insert error:', sensorError);
      return NextResponse.json({ error: sensorError.message }, { status: 500 });
    }

    // Optional: Log ultrasonic distance if provided
    const distM = distance_m !== undefined ? Number(distance_m) : distance_cm !== undefined ? Number(distance_cm) / 100 : null;
    if (distM !== null && !isNaN(distM)) {
      try {
        await supabase.from('sensor_readings').insert({
          unit_id,
          sensor_type: 'ultrasonic_distance',
          value: Number(distM.toFixed(2)),
          unit_of_measure: 'm',
          recorded_at,
        });
      } catch (err) {
        console.warn('[API Ingest] Ultrasonic reading insert skipped:', err);
      }
    }

    // 2. Check if spike exceeds threshold and auto-log detection event
    const isNarcotics = sensor_type.includes('narcotics') || sensor_type.includes('mq3') || sensor_type.includes('mq135');
    const isExplosives = sensor_type.includes('explosives') || sensor_type.includes('rdx') || sensor_type.includes('mems');

    let thresholdExceeded = false;
    if (isNarcotics && numValue >= 40.0) thresholdExceeded = true;
    if (isExplosives && numValue >= 50.0) thresholdExceeded = true;

    let detectionEvent = null;

    if (thresholdExceeded) {
      const nearestSt = findNearestRailwayStation(latitude, longitude);
      const category = isNarcotics ? 'Narcotics MOS (MQ-3/MQ-135)' : 'Explosives Trace (RDX)';
      const distTag = distM !== null && !isNaN(distM) ? ` • Target at ${distM.toFixed(2)}m from robot` : '';
      const substanceName = isNarcotics
        ? `Narcotics Vapor Spike: ${numValue} ppm (MQ-3 e-Nose)${distTag}`
        : `High Explosive Trace Spike: ${numValue} ng/L (RDX / MEMS)${distTag}`;

      const { data: newEvent, error: eventError } = await supabase
        .from('detection_events')
        .insert({
          unit_id,
          substance_category: category,
          substance_name: substanceName,
          confidence_tier: 'confirmed',
          confidence_score: 0.95,
          latitude,
          longitude,
          station: nearestSt.fullLabel,
          status: 'new',
          timestamp: recorded_at,
        })
        .select()
        .single();

      if (!eventError) {
        detectionEvent = newEvent;
      }
    }

    return NextResponse.json({
      success: true,
      data: insertedSensor,
      thresholdExceeded,
      detectionEvent,
    });
  } catch (err: any) {
    console.error('[API Ingest] Handler error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
