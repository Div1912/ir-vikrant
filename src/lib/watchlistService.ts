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

const STORAGE_KEY = 'vikrant_suspect_watchlist_v6';

// Precomputed 128-d spatial cell HOG & center-surround contrast embeddings generated from BlazeFace landmark face crops
const SUSPECT_1_FACE_DESCRIPTOR = [
  0.19988, 0.07609, 0.04644, 0.04232, 0.03685, 0.06772, -0.03305, 0.13416, 0.02166, 0.07375,
  0.17674, 0.12375, 0.0493, 0.02726, 0.02746, 0.06978, 0.00539, 0.01014, 0.15937, 0.17216,
  0.02143, 0.00257, 0.01294, 0.05682, 0.09906, 0.07058, 0.10894, 0.08529, 0.12541, 0.07727,
  -0.00471, 0.02939, 0.13923, 0.15975, 0.03655, 0.03424, 0.04009, 0.0813, 0.00033, 0.05287,
  0.0314, 0.0641, 0.10578, 0.1636, 0.10843, 0.02876, 0.02486, 0.09023, 0.1315, 0.09997,
  0.08455, 0.06028, 0.06751, 0.11405, 0.03154, 0.07705, 0.02115, 0.04151, 0.10157, 0.1845,
  0.09415, 0.01563, -0.02208, 0.07556, 0.09391, 0.10922, 0.0567, 0.0505, 0.14093, 0.09621,
  -0.01226, 0.06451, 0.08502, 0.13047, 0.10915, 0.12487, 0.04799, 0.03967, -0.04772, 0.05987,
  0.03172, 0.04404, 0.11817, 0.16512, 0.10015, 0.03781, -0.04739, 0.09475, 0.13804, 0.12053,
  0.06619, 0.02828, 0.10264, 0.07958, 0.00536, 0.05898, 0.15198, 0.11225, 0.04412, 0.05457,
  0.10643, 0.0607, -0.07234, 0.08848, 0.01339, 0.00341, 0.01272, 0.10748, 0.20802, 0.02132,
  -0.01711, 0.075, 0.0217, 0.047, 0.18794, 0.13203, 0.00753, 0.01209, 0.03223, 0.07224,
  0.17693, 0.12311, 0.05432, 0.0187, 0.00693, 0.07632, 0.00292, 0.07775,
];

const SUSPECT_1_FULL_DESCRIPTOR = [
  0.04939, 0.04983, 0.19714, 0.06493, 0.0644, 0.07026, -0.03478, 0.06239, 0.02911, 0.05373,
  0.17953, 0.11425, 0.04737, 0.07631, 0.04055, 0.09924, 0.06305, 0.0312, 0.09725, 0.11881,
  0.14684, 0.08369, -0.00542, 0.06022, 0.03106, 0.06001, 0.15574, 0.15799, 0.04606, 0.03441,
  0.05777, 0.09041, 0.00373, 0.04369, 0.18345, 0.13982, 0.03711, 0.02416, -0.01402, 0.02825,
  0.0475, 0.06977, 0.13031, 0.15606, 0.07496, 0.05484, 0.05095, 0.11409, 0.07935, 0.11101,
  0.11757, 0.10555, 0.08743, 0.07654, -0.04627, 0.09105, 0.03093, 0.03898, 0.11956, 0.12401,
  0.10875, 0.1145, -0.02673, 0.06253, 0.02454, 0.04128, 0.1144, 0.14988, 0.12537, 0.05926,
  0.00201, 0.00856, 0.13583, 0.05333, 0.04506, 0.06216, 0.12234, 0.1222, -0.00786, 0.07289,
  0.08963, 0.08138, 0.1033, 0.08016, 0.10213, 0.12207, 0.02525, 0.05534, 0.02705, 0.05559,
  0.17988, 0.13263, 0.05605, 0.01327, 0.00152, 0.00994, 0.01554, 0.02692, 0.19842, 0.12661,
  0.01621, 0.0214, 0.00008, 0.02685, 0.04144, 0.0568, 0.17543, 0.1175, 0.08319, 0.02533,
  0.02626, 0.08322, 0.01805, 0.02607, 0.07077, 0.10779, 0.15326, 0.12636, -0.00249, 0.06856,
  0.0241, 0.01285, 0.15433, 0.16315, 0.0745, 0.01885, -0.00093, 0.02998,
];

const SUSPECT_2_FACE_DESCRIPTOR = [
  0.12618, 0.10643, 0.11054, 0.12748, 0.02912, 0.02672, 0.00621, 0.06604, 0.04484, 0.05069,
  0.05193, 0.20694, 0.0733, 0.04251, -0.04021, 0.07782, 0.0486, 0.10318, 0.16238, 0.13002,
  0.02523, 0.01907, -0.03543, 0.08286, 0.03594, 0.02565, 0.05643, 0.11488, 0.13079, 0.14779,
  -0.01723, 0.05286, 0.09092, 0.03237, 0.14305, 0.15314, 0.04748, 0.04242, 0.04329, 0.05148,
  0.16556, 0.08765, 0.10785, 0.07332, 0.04176, 0.05862, -0.00602, 0.03076, 0.03029, 0.02574,
  0.03856, 0.17914, 0.14022, 0.04962, 0.00589, 0.04477, 0.10094, 0.03703, 0.11543, 0.11357,
  0.06706, 0.12248, 0.02042, 0.07192, 0.03438, 0.06224, 0.02237, 0.06771, 0.15212, 0.15491,
  -0.00971, 0.06165, 0.02029, 0.05888, 0.11961, 0.18403, 0.06787, 0.02489, -0.00732, 0.0901,
  0.04411, 0.03391, 0.10776, 0.18427, 0.06622, 0.06506, 0.0052, 0.06351, 0.17884, 0.15574,
  0.02344, 0.01031, 0.01301, 0.01475, -0.00765, 0.06009, 0.1263, 0.0078, 0.00136, 0.01515,
  0.17787, 0.09695, -0.01468, 0.11646, 0.01257, 0.03539, 0.09815, 0.20362, 0.05653, 0.03976,
  0.00591, 0.06749, 0.07163, 0.14008, 0.13703, 0.11016, 0.03526, 0.01924, -0.00057, 0.05454,
  0.06604, 0.17484, 0.07386, 0.11586, 0.05813, 0.00973, -0.0111, 0.0763,
];

const SUSPECT_2_FULL_DESCRIPTOR = [
  0.02642, 0.01074, 0.01606, 0.20734, 0.09036, 0.07585, 0.00119, 0.00287, 0.1752, 0.11406,
  0.05453, 0.06341, 0.0454, 0.07224, 0.01293, 0.04124, 0.02179, 0.04458, 0.1044, 0.16748,
  0.12545, 0.02881, -0.056, 0.0802, 0.12242, 0.19842, 0.00207, 0.00287, 0.01944, 0.05687,
  0.00377, 0.01464, 0.07703, 0.03231, 0.1231, 0.16506, 0.06876, 0.06226, 0.00608, 0.03336,
  0.0639, 0.07549, 0.12122, 0.13874, 0.05634, 0.10526, 0.02183, 0.0862, 0.05749, 0.10873,
  0.10032, 0.17128, 0.04177, 0.04129, 0.00816, 0.0718, 0.09642, 0.11334, 0.05552, 0.03279,
  0.05466, 0.16938, -0.01705, 0.04366, 0.19575, 0.12022, 0.02263, 0.01687, 0.01537, 0.06462,
  -0.03905, 0.09531, 0.12253, 0.04482, 0.07488, 0.11264, 0.09081, 0.12007, 0.02486, 0.05722,
  0.11835, 0.12967, 0.11117, 0.08278, 0.04993, 0.07385, 0.03887, 0.07436, 0.04204, 0.01181,
  0.00769, 0.03167, 0.12194, 0.20035, 0.00434, 0.0654, 0.17529, 0.06341, 0.06651, 0.05762,
  0.02497, 0.12192, -0.03495, 0.08394, 0.07695, 0.01996, 0.03961, 0.05492, 0.10461, 0.19008,
  -0.01364, 0.04772, 0.11595, 0.13684, 0.11801, 0.08565, 0.0415, 0.05313, 0.00199, 0.04291,
  0.0959, 0.12082, 0.13928, 0.05535, 0.09426, 0.05324, 0.01704, 0.07403,
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
  return false;
}

export async function getWatchlist(): Promise<SuspectProfile[]> {
  if (typeof window === 'undefined') return DEFAULT_SUSPECTS;

  try {
    let cached = localStorage.getItem(STORAGE_KEY);
    // Backward compatibility: load from v5 if v6 not initialized yet
    if (!cached) {
      const v5 = localStorage.getItem('vikrant_suspect_watchlist_v5');
      if (v5) {
        cached = v5;
      }
    }

    let list: SuspectProfile[] = cached ? JSON.parse(cached) : [...DEFAULT_SUSPECTS];
    let needsUpdate = false;

    // Ensure our default trained suspects are always present with fresh multi-scale descriptors
    for (const def of DEFAULT_SUSPECTS) {
      const idx = list.findIndex(s => s.id === def.id);
      if (idx === -1) {
        list.unshift(def);
        needsUpdate = true;
      } else if (!list[idx].descriptor || !list[idx].fullDescriptor || isInvalidDescriptor(list[idx].descriptor) || !cached?.includes('vikrant_suspect_watchlist_v6')) {
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
  threshold = 0.70
): { isMatch: boolean; suspect: SuspectProfile | null; confidence: number } {
  let bestSim = 0;
  let bestSuspect: SuspectProfile | null = null;

  for (const suspect of watchlist) {
    let sim = 0;
    // Primary: compare against tight facial descriptor
    if (suspect.descriptor && suspect.descriptor.length === 128) {
      sim = computeFaceSimilarity(liveFaceDescriptor, suspect.descriptor);
    } else if (suspect.fullDescriptor && suspect.fullDescriptor.length === 128) {
      sim = computeFaceSimilarity(liveFaceDescriptor, suspect.fullDescriptor);
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
