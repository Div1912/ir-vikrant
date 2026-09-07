import { supabase } from '@/lib/supabase';

export interface ClearLogOptions {
  category?: 'narcotics' | 'explosives' | 'facial' | 'ai_visual' | 'all';
  olderThanHours?: number; // e.g. 24 for 24 hours, 168 for 7 days
}

export interface ClearLogResult {
  success: boolean;
  count?: number;
  error?: string;
}

/**
 * Delete records from `detection_events` table in Supabase.
 * Uses explicit filters to comply with PostgREST unconstrained delete prevention.
 */
export async function clearDetectionEvents(options: ClearLogOptions = {}): Promise<ClearLogResult> {
  try {
    const { category = 'all', olderThanHours } = options;

    let query = supabase.from('detection_events').delete();

    // 1. Apply category filter
    if (category === 'narcotics') {
      query = query.or('substance_category.ilike.%narcotics%,substance_name.ilike.%mq-3%,substance_name.ilike.%mq-135%');
    } else if (category === 'explosives') {
      query = query.or('substance_category.ilike.%explosives%,substance_name.ilike.%rdx%,substance_name.ilike.%petn%,substance_name.ilike.%mems%');
    } else if (category === 'facial') {
      query = query.or('substance_category.ilike.%facial%,substance_name.ilike.%suspect%,substance_name.ilike.%culprit%');
    } else if (category === 'ai_visual') {
      query = query.ilike('substance_category', '%AI Visual%');
    } else {
      // Clear all: satisfies PostgREST WHERE clause requirement
      query = query.neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // 2. Apply time-based cutoff if requested
    if (olderThanHours !== undefined && olderThanHours > 0) {
      const cutoffTime = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
      query = query.lt('timestamp', cutoffTime);
    }

    const { error, count } = await query;

    if (error) {
      console.warn('[LogService] Error deleting detection events:', error.message);
      return { success: false, error: error.message };
    }

    // Broadcast event to notify all active pages/tabs to update their state
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vikrant:logs_cleared', {
          detail: { category, olderThanHours, timestamp: Date.now() },
        })
      );
    }

    return { success: true, count: count ?? undefined };
  } catch (err: any) {
    console.warn('[LogService] Unexpected error deleting detection events:', err);
    return { success: false, error: err.message || 'Unknown delete error' };
  }
}

/**
 * Delete records from `facial_match_events` table in Supabase.
 */
export async function clearFacialMatchEvents(olderThanHours?: number): Promise<ClearLogResult> {
  try {
    let query = supabase.from('facial_match_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (olderThanHours !== undefined && olderThanHours > 0) {
      const cutoffTime = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
      query = query.lt('timestamp', cutoffTime);
    }

    const { error, count } = await query;

    if (error) {
      console.warn('[LogService] Error deleting facial match events:', error.message);
      return { success: false, error: error.message };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vikrant:logs_cleared', {
          detail: { category: 'facial', olderThanHours, timestamp: Date.now() },
        })
      );
    }

    return { success: true, count: count ?? undefined };
  } catch (err: any) {
    console.warn('[LogService] Unexpected error deleting facial match events:', err);
    return { success: false, error: err.message || 'Unknown delete error' };
  }
}
