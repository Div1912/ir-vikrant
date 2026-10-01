'use client';

import { computeFaceSimilarity, extractFaceDescriptor, getHuman } from './faceRecognitionEngine';

export interface SuspectProfile {
  id: string;
  name: string;
  alias?: string;
  warrantId: string;
  hazardLevel: 'CRITICAL' | 'HIGH' | 'MODERATE';
  offense: string;
  photoUrl: string;
  fullPhotoUrl?: string;
  enrolledAt: string;
  descriptor?: number[];
  fullDescriptor?: number[];
  descriptorVersion?: number;
}

const STORAGE_KEY = 'vikrant_suspect_watchlist_v8';

// Active Enrolled Culprits with tight face portrait reference photos
export const DEFAULT_SUSPECTS: SuspectProfile[] = [
  {
    id: 'wl-001',
    name: 'Suspect Alpha (Vikram Malhotra)',
    alias: 'Vicky',
    warrantId: 'RPF-2026-4091',
    hazardLevel: 'CRITICAL',
    offense: 'Inter-State Contraband Transit & Railway Property Sabotage',
    photoUrl: '/watchlist/suspect_1_face.jpg',
    fullPhotoUrl: '/watchlist/photo_2026-09-07_00-55-28.jpg',
    enrolledAt: '2026-09-07T00:55:28.000Z',
    descriptorVersion: 8,
  },
  {
    id: 'wl-002',
    name: 'Suspect Beta (Sunil Verma)',
    alias: 'Soni',
    warrantId: 'RPF-2026-8824',
    hazardLevel: 'HIGH',
    offense: 'Organized Baggage Theft Syndicate & Platform Trespass',
    photoUrl: '/watchlist/suspect_2_face.jpg',
    fullPhotoUrl: '/watchlist/photo_2026-09-07_00-55-34.jpg',
    enrolledAt: '2026-09-07T00:55:34.000Z',
    descriptorVersion: 8,
  },
];

function isInvalidV8Descriptor(desc?: number[], version?: number): boolean {
  if (version !== 8) return true;
  if (!desc || desc.length !== 1024) return true;
  if (desc.every(v => v === 0)) return true;
  return false;
}

/**
 * Loads an image from a URL or base64 and extracts its 1024-d neural face embedding.
 */
export async function computeSuspectEmbeddingFromPhoto(
  photoUrl: string,
  customCrop?: { x: number; y: number; width: number; height: number }
): Promise<{ descriptor: number[]; fullDescriptor: number[] }> {
  if (typeof window === 'undefined' || !photoUrl) {
    return { descriptor: new Array(1024).fill(0), fullDescriptor: new Array(1024).fill(0) };
  }

  try {
    const img = new Image();
    if (!photoUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = photoUrl;

    await new Promise<void>((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for embedding'));
    });

    // Draw to an offscreen canvas to guarantee WebGL texture compatibility
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { descriptor: new Array(1024).fill(0), fullDescriptor: new Array(1024).fill(0) };
    }
    ctx.drawImage(img, 0, 0);

    const descriptor = await extractFaceDescriptor(canvas, customCrop);
    const fullDescriptor = customCrop ? await extractFaceDescriptor(canvas) : descriptor;

    return { descriptor, fullDescriptor };
  } catch (err) {
    console.warn('[Watchlist] computeSuspectEmbeddingFromPhoto error:', err);
    return { descriptor: new Array(1024).fill(0), fullDescriptor: new Array(1024).fill(0) };
  }
}

/**
 * Retrieves the suspect watchlist from local storage with seamless migration from v7/v6/v5.
 * Automatically generates 1024-d neural embeddings for any enrolled suspect that lacks them.
 */
export async function getWatchlist(): Promise<SuspectProfile[]> {
  if (typeof window === 'undefined') return DEFAULT_SUSPECTS;

  try {
    let cached = localStorage.getItem(STORAGE_KEY);
    // Backward compatibility: load previous enrolled suspects from v7, v6, or v5
    if (!cached) {
      const prevCached =
        localStorage.getItem('vikrant_suspect_watchlist_v7') ||
        localStorage.getItem('vikrant_suspect_watchlist_v6') ||
        localStorage.getItem('vikrant_suspect_watchlist_v5');
      if (prevCached) {
        cached = prevCached;
      }
    }

    let list: SuspectProfile[] = cached ? JSON.parse(cached) : [...DEFAULT_SUSPECTS];
    let needsUpdate = false;

    // Upgrade default suspects to clean face portraits if pointing to old wide images
    for (const item of list) {
      if (item.id === 'wl-001' && item.photoUrl.includes('photo_2026-09-07_00-55-28')) {
        item.photoUrl = '/watchlist/suspect_1_face.jpg';
        item.fullPhotoUrl = '/watchlist/photo_2026-09-07_00-55-28.jpg';
        needsUpdate = true;
      } else if (item.id === 'wl-002' && item.photoUrl.includes('photo_2026-09-07_00-55-34')) {
        item.photoUrl = '/watchlist/suspect_2_face.jpg';
        item.fullPhotoUrl = '/watchlist/photo_2026-09-07_00-55-34.jpg';
        needsUpdate = true;
      }
    }

    // Ensure default trained suspects are always present
    for (const def of DEFAULT_SUSPECTS) {
      const idx = list.findIndex(s => s.id === def.id);
      if (idx === -1) {
        list.push(def);
        needsUpdate = true;
      }
    }

    // Identify any suspects that need v8 1024-d neural embedding calculation
    const pendingSuspects = list.filter(
      s => isInvalidV8Descriptor(s.descriptor, s.descriptorVersion) && s.photoUrl
    );

    if (pendingSuspects.length > 0) {
      Promise.all(
        pendingSuspects.map(async suspect => {
          try {
            const { descriptor, fullDescriptor } = await computeSuspectEmbeddingFromPhoto(suspect.photoUrl);
            if (descriptor && descriptor.length === 1024 && !descriptor.every(v => v === 0)) {
              suspect.descriptor = descriptor;
              suspect.fullDescriptor = fullDescriptor;
              suspect.descriptorVersion = 8;
              needsUpdate = true;
            }
          } catch {}
        })
      ).then(() => {
        if (needsUpdate && typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
          window.dispatchEvent(new CustomEvent('vikrant:watchlist_updated', { detail: list }));
          console.log('[Watchlist] Synchronized v8 1024-d neural embeddings for suspects');
        }
      });
    }

    if (needsUpdate || !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    return list;
  } catch (err) {
    console.warn('[Watchlist] Storage load error:', err);
    return DEFAULT_SUSPECTS;
  }
}

/**
 * Enrolls a new suspect and immediately generates their 1024-d neural face embedding.
 */
export async function enrollSuspect(
  suspectData: Omit<SuspectProfile, 'id' | 'enrolledAt'>,
  customFaceCrop?: { x: number; y: number; width: number; height: number }
): Promise<SuspectProfile> {
  const list = await getWatchlist();
  const id = `wl-${Date.now().toString(36)}`;
  const enrolledAt = new Date().toISOString();

  let descriptor = suspectData.descriptor;
  let fullDescriptor = suspectData.fullDescriptor;

  if (isInvalidV8Descriptor(descriptor, suspectData.descriptorVersion) && suspectData.photoUrl) {
    try {
      const result = await computeSuspectEmbeddingFromPhoto(suspectData.photoUrl, customFaceCrop);
      if (result.descriptor && result.descriptor.length === 1024) {
        descriptor = result.descriptor;
        fullDescriptor = result.fullDescriptor;
      }
    } catch (err) {
      console.warn('[Watchlist] Enroll descriptor extraction error:', err);
    }
  }

  const newSuspect: SuspectProfile = {
    ...suspectData,
    id,
    enrolledAt,
    descriptor,
    fullDescriptor,
    descriptorVersion: 8,
  };

  const updated = [newSuspect, ...list];
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('vikrant:watchlist_updated', { detail: updated }));
  }

  return newSuspect;
}

/**
 * Removes a suspect from the active watchlist.
 */
export async function removeSuspect(id: string): Promise<SuspectProfile[]> {
  const list = await getWatchlist();
  const updated = list.filter(s => s.id !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('vikrant:watchlist_updated', { detail: updated }));
  }
  return updated;
}

/**
 * Compares a live face embedding vector against all suspects in the watchlist.
 */
export function findBestSuspectMatch(
  liveFaceDescriptor: number[],
  watchlist: SuspectProfile[],
  threshold = 0.68
): {
  isMatch: boolean;
  suspect: SuspectProfile | null;
  confidence: number;
  matchedType: 'face' | 'full_photo';
} {
  let bestSim = 0;
  let bestSuspect: SuspectProfile | null = null;
  let bestType: 'face' | 'full_photo' = 'face';

  if (!liveFaceDescriptor || liveFaceDescriptor.length < 32 || !watchlist || watchlist.length === 0) {
    return { isMatch: false, suspect: null, confidence: 0, matchedType: 'face' };
  }

  for (const suspect of watchlist) {
    let sim = 0;
    let currentType: 'face' | 'full_photo' = 'face';

    // 1. Check against primary facial descriptor (strictly equal dimensions)
    if (suspect.descriptor && suspect.descriptor.length === liveFaceDescriptor.length) {
      const faceSim = computeFaceSimilarity(liveFaceDescriptor, suspect.descriptor);
      if (faceSim > sim) {
        sim = faceSim;
        currentType = 'face';
      }
    }

    // 2. Also check against full photo descriptor (strictly equal dimensions)
    if (suspect.fullDescriptor && suspect.fullDescriptor.length === liveFaceDescriptor.length) {
      const fullSim = computeFaceSimilarity(liveFaceDescriptor, suspect.fullDescriptor);
      if (fullSim > sim) {
        sim = fullSim;
        currentType = 'full_photo';
      }
    }

    if (sim > bestSim) {
      bestSim = sim;
      bestSuspect = suspect;
      bestType = currentType;
    }
  }

  return {
    isMatch: bestSim >= threshold && bestSuspect !== null,
    suspect: bestSuspect,
    confidence: Number(bestSim.toFixed(3)),
    matchedType: bestType,
  };
}
