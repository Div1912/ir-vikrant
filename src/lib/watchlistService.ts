'use client';

import { computeFaceSimilarity, extractFaceDescriptor } from './faceRecognitionEngine';

export interface SuspectProfile {
  id: string;
  name: string;
  alias?: string;
  warrantId: string;
  hazardLevel: 'CRITICAL' | 'HIGH' | 'MODERATE';
  offense: string;
  photoUrl: string;
  enrolledAt: string;
  descriptor?: number[];
  fullDescriptor?: number[];
}

const STORAGE_KEY = 'vikrant_suspect_watchlist_v5';

// Precomputed 128-d spatial cell HOG embeddings generated from BlazeFace landmark face crops
const SUSPECT_1_FACE_DESCRIPTOR = [
  0.17207, 0.31333, 0.05062, 0.06029, 0.04202, 0.11585, 0.01227, 0.00488, 0.01102, 0.04227,
  0.10162, 0.03081, 0.05367, 0.01895, 0.00476, 0.00136, 0.01662, 0.00675, 0.07141, 0.07255,
  0.04506, 0.0192, 0.00591, 0.0008, 0.00833, 0.00628, 0.15298, 0.08915, 0.06177, 0.02405,
  0.0059, 0.00223, 0.14503, 0.19103, 0.07209, 0.05614, 0.05195, 0.06034, 0.01024, 0.00298,
  0.01576, 0.04662, 0.15727, 0.22953, 0.04135, 0.01666, 0.01094, 0.0027, 0.02898, 0.07197,
  0.13146, 0.16729, 0.04753, 0.04071, 0.01098, 0.00233, 0.01397, 0.01994, 0.14719, 0.16793,
  0.05457, 0.02637, 0.00948, 0.00212, 0.08081, 0.09343, 0.0825, 0.10549, 0.12136, 0.11283,
  0.00993, 0.00283, 0.03863, 0.06058, 0.08082, 0.17561, 0.0871, 0.01786, 0.00997, 0.00205,
  0.01807, 0.02861, 0.23547, 0.23375, 0.06442, 0.03008, 0.00967, 0.00228, 0.05281, 0.10857,
  0.12193, 0.02072, 0.04401, 0.02499, 0.00851, 0.00231, 0.02319, 0.0247, 0.09681, 0.11946,
  0.04018, 0.01413, 0.00991, 0.00174, 0.0047, 0.00745, 0.18014, 0.21702, 0.01574, 0.00506,
  0.00916, 0.00254, 0.06222, 0.06915, 0.14375, 0.03934, 0.009, 0.01044, 0.00851, 0.00285,
  0.15353, 0.26224, 0.06505, 0.06717, 0.10547, 0.10477, 0.01123, 0.00466,
];

const SUSPECT_1_FULL_DESCRIPTOR = [
  0.05945, 0.05997, 0.23727, 0.07815, 0.07751, 0.08456, 0.01054, 0.00232, 0.049, 0.09043,
  0.3022, 0.1923, 0.07973, 0.12845, 0.00924, 0.00368, 0.07545, 0.03734, 0.11637, 0.14217,
  0.17571, 0.10014, 0.0059, 0.00224, 0.04186, 0.08088, 0.2099, 0.21293, 0.06208, 0.04638,
  0.00733, 0.00336, 0.00165, 0.01936, 0.08131, 0.06197, 0.01645, 0.01071, 0.00948, 0.00105,
  0.09944, 0.14606, 0.27282, 0.32673, 0.15695, 0.11481, 0.00795, 0.00423, 0.10707, 0.1498,
  0.15865, 0.14243, 0.11798, 0.10329, 0.0066, 0.00338, 0.03539, 0.04459, 0.13676, 0.14186,
  0.1244, 0.13098, 0.00674, 0.00232, 0.00406, 0.00665, 0.01894, 0.02472, 0.02066, 0.00981,
  0.00995, 0.00032, 0.11621, 0.04562, 0.03855, 0.05318, 0.10467, 0.10445, 0.00665, 0.00271,
  0.04302, 0.03916, 0.04961, 0.03849, 0.04914, 0.05874, 0.00882, 0.00205, 0.00479, 0.00975,
  0.03187, 0.0235, 0.00975, 0.00235, 0.01068, 0.00037, 0.00428, 0.00732, 0.05458, 0.03483,
  0.00436, 0.00589, 0.01162, 0.001, 0.03086, 0.04243, 0.13106, 0.08778, 0.06215, 0.01883,
  0.0116, 0.00309, 0.01196, 0.01727, 0.04688, 0.07142, 0.10154, 0.08372, 0.01045, 0.00254,
  0.00949, 0.00511, 0.06129, 0.0649, 0.02963, 0.00742, 0.01246, 0.00111,
];

const SUSPECT_2_FACE_DESCRIPTOR = [
  0.19795, 0.09777, 0.08959, 0.12555, 0.01083, 0.01336, 0.00829, 0.00325, 0.0106, 0.02834,
  0.04449, 0.22428, 0.05135, 0.01665, 0.01255, 0.00325, 0.0088, 0.03757, 0.15659, 0.11793,
  0.05391, 0.01408, 0.01231, 0.00308, 0.00977, 0.00876, 0.04691, 0.05283, 0.12373, 0.09521,
  0.00697, 0.00222, 0.06188, 0.02816, 0.15545, 0.1583, 0.05248, 0.03124, 0.01338, 0.00282,
  0.09146, 0.07825, 0.09313, 0.07029, 0.02044, 0.03563, 0.01381, 0.00217, 0.01692, 0.04816,
  0.07248, 0.12444, 0.11887, 0.05396, 0.01187, 0.00282, 0.06304, 0.02913, 0.07294, 0.11729,
  0.07389, 0.06645, 0.0099, 0.00292, 0.02646, 0.05224, 0.04095, 0.10569, 0.29708, 0.15129,
  0.01042, 0.00276, 0.03429, 0.07604, 0.17964, 0.32803, 0.09742, 0.01406, 0.0108, 0.00326,
  0.03641, 0.04985, 0.11727, 0.21626, 0.04491, 0.04848, 0.00931, 0.00219, 0.11186, 0.2382,
  0.07195, 0.02259, 0.01026, 0.00782, 0.00834, 0.00243, 0.22249, 0.01385, 0.00509, 0.0151,
  0.1362, 0.16252, 0.01077, 0.00427, 0.00632, 0.01371, 0.13221, 0.17981, 0.05037, 0.00351,
  0.00608, 0.00229, 0.06173, 0.1, 0.08424, 0.05011, 0.00846, 0.01135, 0.00616, 0.00163,
  0.05454, 0.13663, 0.04901, 0.10497, 0.03175, 0.01294, 0.01166, 0.00268,
];

const SUSPECT_2_FULL_DESCRIPTOR = [
  0.00121, 0.00037, 0.00061, 0.00939, 0.00347, 0.00348, 0.01075, 0.00014, 0.08604, 0.05578,
  0.02678, 0.03114, 0.02217, 0.03548, 0.01011, 0.00194, 0.02445, 0.05025, 0.1177, 0.1887,
  0.14144, 0.03248, 0.00719, 0.00378, 0.03403, 0.0549, 0.00058, 0.0008, 0.00504, 0.01581,
  0.01029, 0.00069, 0.04202, 0.01762, 0.06716, 0.09005, 0.03739, 0.03396, 0.0089, 0.00157,
  0.0627, 0.07396, 0.11885, 0.13615, 0.05529, 0.1033, 0.01461, 0.00406, 0.09214, 0.17428,
  0.16079, 0.27454, 0.06695, 0.06618, 0.01013, 0.00338, 0.09004, 0.10585, 0.05184, 0.03063,
  0.05105, 0.15818, 0.00861, 0.00206, 0.41267, 0.25352, 0.04772, 0.03558, 0.03242, 0.13615,
  0.00661, 0.00449, 0.08474, 0.03093, 0.05186, 0.07801, 0.06276, 0.08315, 0.01664, 0.00269,
  0.13112, 0.14367, 0.12317, 0.09172, 0.0552, 0.08171, 0.01299, 0.0035, 0.04815, 0.01353,
  0.00869, 0.03603, 0.13968, 0.22936, 0.01622, 0.00308, 0.23628, 0.08547, 0.08966, 0.07767,
  0.03366, 0.16434, 0.00837, 0.00395, 0.06565, 0.01703, 0.03379, 0.04685, 0.08924, 0.16216,
  0.01434, 0.00225, 0.07482, 0.0883, 0.07615, 0.05527, 0.02665, 0.03429, 0.01168, 0.00202,
  0.06744, 0.08496, 0.09783, 0.03892, 0.06618, 0.03732, 0.01544, 0.00349,
];

// Active Enrolled Culprits trained from user-uploaded photos
export const DEFAULT_SUSPECTS: SuspectProfile[] = [
  {
    id: 'wl-001',
    name: 'Suspect Alpha (Vikram Malhotra)',
    alias: 'Vicky',
    warrantId: 'RPF-2026-4091',
    hazardLevel: 'CRITICAL',
    offense: 'Inter-State Contraband Transit & Railway Property Sabotage',
    photoUrl: '/watchlist/photo_2026-09-07_00-55-28.jpg',
    enrolledAt: '2026-09-07T00:55:28.000Z',
    descriptor: SUSPECT_1_FACE_DESCRIPTOR,
    fullDescriptor: SUSPECT_1_FULL_DESCRIPTOR,
  },
  {
    id: 'wl-002',
    name: 'Suspect Beta (Sunil Verma)',
    alias: 'Soni',
    warrantId: 'RPF-2026-8824',
    hazardLevel: 'HIGH',
    offense: 'Organized Baggage Theft Syndicate & Platform Trespass',
    photoUrl: '/watchlist/photo_2026-09-07_00-55-34.jpg',
    enrolledAt: '2026-09-07T00:55:34.000Z',
    descriptor: SUSPECT_2_FACE_DESCRIPTOR,
    fullDescriptor: SUSPECT_2_FULL_DESCRIPTOR,
  },
];

function isInvalidDescriptor(desc?: number[]): boolean {
  if (!desc || desc.length !== 128) return true;
  if (desc.every(v => v === 0)) return true;
  if (Math.abs(desc[1] - Math.sin(0.3) * 0.1) < 0.001 || Math.abs(desc[1] - Math.sin(0.4) * 0.1) < 0.001) {
    return true;
  }
  return false;
}

export async function getWatchlist(): Promise<SuspectProfile[]> {
  if (typeof window === 'undefined') return DEFAULT_SUSPECTS;

  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    let list: SuspectProfile[] = cached ? JSON.parse(cached) : [...DEFAULT_SUSPECTS];
    let needsUpdate = false;

    // Ensure our default trained suspects are always present with fresh multi-scale descriptors
    for (const def of DEFAULT_SUSPECTS) {
      const idx = list.findIndex(s => s.id === def.id);
      if (idx === -1) {
        list.unshift(def);
        needsUpdate = true;
      } else if (!list[idx].descriptor || !list[idx].fullDescriptor || isInvalidDescriptor(list[idx].descriptor)) {
        list[idx] = { ...def };
        needsUpdate = true;
      }
    }

    // Ensure descriptors are properly computed for custom enrolled suspects
    for (const suspect of list) {
      if (isInvalidDescriptor(suspect.descriptor) || isInvalidDescriptor(suspect.fullDescriptor)) {
        try {
          const img = new Image();
          if (!suspect.photoUrl.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
          }
          img.src = suspect.photoUrl;
          await new Promise((res, rej) => {
            if (img.complete && img.naturalWidth > 0) return res(null);
            img.onload = () => res(null);
            img.onerror = rej;
          });

          // 1. Full photo vector
          suspect.fullDescriptor = await extractFaceDescriptor(img);

          // 2. Face crop vector (centered top 65%)
          const w = img.naturalWidth || 100;
          const h = img.naturalHeight || 100;
          const crop = {
            x: Math.round(w * 0.15),
            y: Math.round(h * 0.05),
            width: Math.round(w * 0.70),
            height: Math.round(h * 0.60),
          };
          suspect.descriptor = await extractFaceDescriptor(img, crop);
          needsUpdate = true;
        } catch {
          // If image fails, keep existing
        }
      }
    }

    if (needsUpdate || !cached) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    return list;
  } catch (err) {
    console.warn('[Watchlist] Storage load error:', err);
    return DEFAULT_SUSPECTS;
  }
}

export async function enrollSuspect(
  suspectData: Omit<SuspectProfile, 'id' | 'enrolledAt'>,
  customFaceCrop?: { x: number; y: number; width: number; height: number }
): Promise<SuspectProfile> {
  const list = await getWatchlist();
  const id = `wl-${Date.now().toString(36)}`;
  const enrolledAt = new Date().toISOString();

  let descriptor = suspectData.descriptor;
  let fullDescriptor = suspectData.fullDescriptor;

  if (isInvalidDescriptor(descriptor) || isInvalidDescriptor(fullDescriptor)) {
    try {
      const img = new Image();
      if (!suspectData.photoUrl.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.src = suspectData.photoUrl;
      await new Promise((res, rej) => {
        if (img.complete && img.naturalWidth > 0) return res(null);
        img.onload = () => res(null);
        img.onerror = rej;
      });

      // 1. Full photo descriptor
      fullDescriptor = await extractFaceDescriptor(img);

      // 2. Face crop descriptor
      const w = img.naturalWidth || 100;
      const h = img.naturalHeight || 100;
      const crop = customFaceCrop || {
        x: Math.round(w * 0.15),
        y: Math.round(h * 0.05),
        width: Math.round(w * 0.70),
        height: Math.round(h * 0.60),
      };
      descriptor = await extractFaceDescriptor(img, crop);
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
  };

  const updated = [newSuspect, ...list];
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  return newSuspect;
}

export async function removeSuspect(id: string): Promise<SuspectProfile[]> {
  const list = await getWatchlist();
  const updated = list.filter(s => s.id !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export function findBestSuspectMatch(
  liveFaceDescriptor: number[],
  watchlist: SuspectProfile[],
  threshold = 0.64
): { isMatch: boolean; suspect: SuspectProfile | null; confidence: number } {
  let bestSim = 0;
  let bestSuspect: SuspectProfile | null = null;

  for (const suspect of watchlist) {
    let sim = 0;
    if (suspect.descriptor && suspect.descriptor.length === 128) {
      const s = computeFaceSimilarity(liveFaceDescriptor, suspect.descriptor);
      if (s > sim) sim = s;
    }
    if (suspect.fullDescriptor && suspect.fullDescriptor.length === 128) {
      const s = computeFaceSimilarity(liveFaceDescriptor, suspect.fullDescriptor);
      if (s > sim) sim = s;
    }
    if (sim > bestSim) {
      bestSim = sim;
      bestSuspect = suspect;
    }
  }

  return {
    isMatch: bestSim >= threshold && bestSuspect !== null,
    suspect: bestSuspect,
    confidence: Number(bestSim.toFixed(3)),
  };
}
