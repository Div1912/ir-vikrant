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
  descriptorVersion?: number;
}

const STORAGE_KEY = 'vikrant_suspect_watchlist_v7';

// Precomputed 128-d fused spatial luminance & cell gradient embeddings (v7)
const SUSPECT_1_FACE_DESCRIPTOR = [
  0.20966, -0.26607, -0.05467, -0.08475, -0.01666, 0.00139, 0.07438, 0.02817, 0.09383, -0.10963,
  0.03542, 0.00127, 0.13237, 0.16586, 0.11455, 0.01172, 0.04044, 0.05348, 0.06967, -0.08071,
  -0.06642, -0.06529, -0.17777, -0.10076, 0.11572, 0.06894, 0.22348, 0.1831, 0.1572, 0.06637,
  0.08053, 0.01824, 0.13727, 0.01919, 0.07835, 0.02413, -0.03971, -0.03496, 0.1287, 0.01897,
  0.18295, 0.00163, 0.01541, 0.07194, 0.15838, -0.05345, -0.03585, -0.10327, -0.00524, -0.11108,
  -0.09264, 0.08591, 0.02229, -0.00221, -0.08116, -0.21783, -0.09738, -0.05322, -0.09905, -0.17429,
  -0.15656, -0.21246, -0.07657, -0.22123, 0.10335, 0.01934, 0.01679, 0.0341, 0.01266, 0.09046,
  0.06105, 0.02071, 0.00168, 0.06426, 0.09148, 0, 0.06466, 0.04762, 0.02073, 0.07498,
  0.06023, 0.03189, 0, 0.08863, 0.00317, 0.03403, 0.10624, 0.0068, 0.08174, 0.04324,
  0.00823, 0.0623, 0.00931, 0.07578, 0.0794, 0.01914, 0.0401, 0.01533, 0.04418, 0.0933,
  0.06055, 0.0737, 0.05037, 0.02941, 0.00992, 0.05019, 0.07685, 0.06306, 0.09098, 0.04415,
  0.03655, 0.03061, 0.09951, 0.021, 0.02191, 0.04094, 0.00181, 0.00257, 0.099, 0.05185,
  0.01485, 0.10439, 0.03715, 0.00167, 0.09138, 0.05678, 0.00914, 0.02905,
];

const SUSPECT_1_FULL_DESCRIPTOR = [
  0.10541, -0.0002, 0.00502, -0.0499, -0.20225, -0.15479, -0.1627, -0.13977, 0.12986, 0.11068,
  0.0835, -0.10703, -0.1212, -0.13194, -0.01917, -0.05922, 0.07594, 0.04773, -0.00024, -0.01343,
  -0.15117, -0.07637, -0.12344, -0.14013, 0.0003, -0.00893, -0.19758, -0.07483, -0.18855, -0.03197,
  -0.07107, -0.05463, 0.0483, 0.04022, -0.11316, -0.22266, -0.107, 0.04594, 0.06416, 0.07337,
  0.03957, 0.03497, -0.02679, -0.08507, -0.07806, 0.04609, 0.06872, 0.09246, 0.07187, 0.07116,
  -0.01315, 0.01787, -0.07813, 0.09237, 0.15913, 0.21005, 0.15853, 0.16793, 0.21148, 0.23029,
  0.14303, 0.11886, 0.11515, 0.12454, 0.03362, 0.09534, 0.02848, 0.03834, 0.02297, 0.09154,
  0.03713, 0.04706, 0.02401, 0.07806, 0.05309, 0.05487, 0.04368, 0.06273, 0.07746, 0.02564,
  0.00647, 0.09182, 0.06334, 0.00388, 0.03017, 0.07292, 0.04455, 0.06548, 0.07049, 0.06931,
  0.03796, 0.03587, 0.02634, 0.08085, 0.05992, 0.04097, 0.01075, 0.02988, 0.07841, 0.0731,
  0.07923, 0.03426, 0.06104, 0.03638, 0.02429, 0.08545, 0.04014, 0.05475, 0.03872, 0.08357,
  0.05321, 0.03442, 0.00416, 0.09826, 0.05315, 0.00141, 0.01978, 0.08928, 0.06427, 0.00277,
  0.02193, 0.03753, 0.0936, 0.043, 0.00866, 0.03563, 0.10561, 0.00169,
];

const SUSPECT_2_FACE_DESCRIPTOR = [
  -0.14738, -0.0911, -0.05597, 0.10398, 0.12323, 0.03911, -0.04963, -0.14344, -0.04014, -0.03756,
  -0.06711, 0.07502, -0.04412, -0.14151, -0.1551, -0.12809, 0.15033, 0.1712, 0.14232, 0.18959,
  0.08916, 0.03275, -0.05738, -0.05656, 0.13916, 0.15136, 0.14732, 0.18885, 0.13514, 0.19025,
  0.19263, -0.01336, 0.01925, -0.03239, -0.04419, -0.06064, -0.09765, 0.05691, 0.06902, -0.08179,
  0.05705, 0.05203, 0.0527, 0.13656, -0.02278, -0.07518, -0.02513, -0.0995, 0.13946, -0.06918,
  0.036, -0.05127, -0.00438, -0.05157, -0.16553, -0.18826, 0.18769, -0.15411, -0.15759, -0.14316,
  -0.12272, -0.19255, -0.01006, 0.00998, 0.04873, 0.0902, 0.03767, 0.02387, 0.02552, 0.02286,
  0.1017, 0.03136, 0.02779, 0.10539, 0.02276, 0.01019, 0.00975, 0.04111, 0.04488, 0.09328,
  0.04502, 0.06145, 0.07652, 0.02903, 0.08572, 0.04911, 0.02105, 0.04794, 0.02604, 0.01425,
  0.09184, 0.05643, 0.06248, 0.05462, 0.06329, 0.0401, 0.01688, 0.02106, 0.06656, 0.08568,
  0.04218, 0.07007, 0.07477, 0.01484, 0.04783, 0.06983, 0.05344, 0.0498, 0.10715, 0.03143,
  0.00456, 0.00305, 0.03785, 0.0004, 0.02202, 0.10287, 0.00863, 0.03313, 0.10251, 0.02864,
  0.06782, 0.07472, 0.04783, 0.00552, 0.01804, 0.07526, 0.08054, 0.00481,
];

const SUSPECT_2_FULL_DESCRIPTOR = [
  -0.02405, -0.02171, -0.02067, -0.03284, -0.09623, -0.08118, -0.02071, -0.04389, -0.03251, -0.0257,
  -0.02239, -0.11158, -0.08081, -0.22737, -0.04906, -0.07445, -0.06893, -0.04895, -0.01013, 0.00031,
  0.00657, -0.07311, -0.08937, -0.12578, -0.09812, -0.13667, 0.2398, 0.11605, -0.10522, 0.00185,
  -0.07168, -0.04636, -0.2002, -0.10057, 0.25705, 0.15703, -0.00241, 0.17703, 0.19546, 0.04689,
  -0.16723, -0.06214, 0.14851, 0.07499, 0.02547, -0.03716, 0.22805, 0.15684, -0.17446, -0.0992,
  0.12645, 0.05913, 0.01531, -0.07294, 0.1977, 0.22147, -0.0724, 0.03873, 0.14099, 0.05553,
  0.06169, 0.02435, 0.07448, -0.01952, 0.00594, 0.01548, 0.08859, 0.06616, 0.09243, 0.03761,
  0.02129, 0.0457, 0.00273, 0.03744, 0.10482, 0.01022, 0.10701, 0.0052, 0.00454, 0.03164,
  0.05404, 0.06451, 0.06839, 0.02721, 0.04236, 0.05732, 0.07042, 0.04961, 0.03317, 0.05935,
  0.08519, 0.02488, 0.06954, 0.08213, 0.02509, 0.01705, 0.06869, 0.05622, 0.00678, 0.06764,
  0.03589, 0.02953, 0.07789, 0.06537, 0.06872, 0.07438, 0.04457, 0.0161, 0.0164, 0.00375,
  0.04217, 0.10217, 0.09098, 0.0482, 0.02762, 0.03372, 0.04425, 0.0146, 0.02792, 0.09772,
  0.07956, 0.02338, 0.05925, 0.04597, 0.0217, 0.10094, 0.02643, 0.0338,
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
    descriptorVersion: 7,
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
    descriptorVersion: 7,
  },
];

function isInvalidDescriptor(desc?: number[], version?: number): boolean {
  if (version !== 7) return true;
  if (!desc || desc.length !== 128) return true;
  if (desc.every(v => v === 0)) return true;
  return false;
}

export async function getWatchlist(): Promise<SuspectProfile[]> {
  if (typeof window === 'undefined') return DEFAULT_SUSPECTS;

  try {
    let cached = localStorage.getItem(STORAGE_KEY);
    // Backward compatibility: load from v6 or v5 if v7 not initialized yet
    if (!cached) {
      const prevCached =
        localStorage.getItem('vikrant_suspect_watchlist_v6') ||
        localStorage.getItem('vikrant_suspect_watchlist_v5');
      if (prevCached) {
        cached = prevCached;
      }
    }

    let list: SuspectProfile[] = cached ? JSON.parse(cached) : [...DEFAULT_SUSPECTS];
    let needsUpdate = false;

    // Ensure our default trained suspects are always present with fresh v7 descriptors
    for (const def of DEFAULT_SUSPECTS) {
      const idx = list.findIndex(s => s.id === def.id);
      if (idx === -1) {
        list.unshift(def);
        needsUpdate = true;
      } else if (
        !list[idx].descriptor ||
        !list[idx].fullDescriptor ||
        isInvalidDescriptor(list[idx].descriptor, list[idx].descriptorVersion) ||
        list[idx].descriptorVersion !== 7
      ) {
        list[idx] = { ...def };
        needsUpdate = true;
      }
    }

    // Ensure descriptors are properly computed and migrated to v7 for all custom enrolled suspects
    for (const suspect of list) {
      if (
        isInvalidDescriptor(suspect.descriptor, suspect.descriptorVersion) ||
        isInvalidDescriptor(suspect.fullDescriptor, suspect.descriptorVersion)
      ) {
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

          // 2. High-precision face crop vector
          const w = img.naturalWidth || 100;
          const h = img.naturalHeight || 100;
          let crop = {
            x: Math.round(w * 0.15),
            y: Math.round(h * 0.05),
            width: Math.round(w * 0.70),
            height: Math.round(h * 0.60),
          };

          // Try detecting face using BlazeFace if available in window/global
          try {
            const tf = await import('@tensorflow/tfjs');
            const blazeface = await import('@tensorflow-models/blazeface');
            const bModel = await blazeface.load();
            const preds = await bModel.estimateFaces(img, false);
            if (preds && preds.length > 0) {
              const bf = preds[0];
              const x1 = Array.isArray(bf.topLeft) ? bf.topLeft[0] : (bf.topLeft as any)[0];
              const y1 = Array.isArray(bf.topLeft) ? bf.topLeft[1] : (bf.topLeft as any)[1];
              const x2 = Array.isArray(bf.bottomRight) ? bf.bottomRight[0] : (bf.bottomRight as any)[0];
              const y2 = Array.isArray(bf.bottomRight) ? bf.bottomRight[1] : (bf.bottomRight as any)[1];
              const fw = Math.max(30, x2 - x1);
              const fh = Math.max(30, y2 - y1);
              crop = {
                x: Math.max(0, x1 - fw * 0.05),
                y: Math.max(0, y1 - fh * 0.05),
                width: Math.min(w - x1, fw * 1.10),
                height: Math.min(h - y1, fh * 1.10),
              };
            }
          } catch {}

          suspect.descriptor = await extractFaceDescriptor(img, crop);
          suspect.descriptorVersion = 7;
          needsUpdate = true;
        } catch {
          // If image fails, keep existing
        }
      }
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

export async function enrollSuspect(
  suspectData: Omit<SuspectProfile, 'id' | 'enrolledAt'>,
  customFaceCrop?: { x: number; y: number; width: number; height: number }
): Promise<SuspectProfile> {
  const list = await getWatchlist();
  const id = `wl-${Date.now().toString(36)}`;
  const enrolledAt = new Date().toISOString();

  let descriptor = suspectData.descriptor;
  let fullDescriptor = suspectData.fullDescriptor;

  if (
    isInvalidDescriptor(descriptor, suspectData.descriptorVersion) ||
    isInvalidDescriptor(fullDescriptor, suspectData.descriptorVersion)
  ) {
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
      let crop = customFaceCrop;

      if (!crop) {
        try {
          const tf = await import('@tensorflow/tfjs');
          const blazeface = await import('@tensorflow-models/blazeface');
          const bModel = await blazeface.load();
          const preds = await bModel.estimateFaces(img, false);
          if (preds && preds.length > 0) {
            const bf = preds[0];
            const x1 = Array.isArray(bf.topLeft) ? bf.topLeft[0] : (bf.topLeft as any)[0];
            const y1 = Array.isArray(bf.topLeft) ? bf.topLeft[1] : (bf.topLeft as any)[1];
            const x2 = Array.isArray(bf.bottomRight) ? bf.bottomRight[0] : (bf.bottomRight as any)[0];
            const y2 = Array.isArray(bf.bottomRight) ? bf.bottomRight[1] : (bf.bottomRight as any)[1];
            const fw = Math.max(30, x2 - x1);
            const fh = Math.max(30, y2 - y1);
            crop = {
              x: Math.max(0, x1 - fw * 0.05),
              y: Math.max(0, y1 - fh * 0.05),
              width: Math.min(w - x1, fw * 1.10),
              height: Math.min(h - y1, fh * 1.10),
            };
          }
        } catch {}
      }

      if (!crop) {
        crop = {
          x: Math.round(w * 0.15),
          y: Math.round(h * 0.05),
          width: Math.round(w * 0.70),
          height: Math.round(h * 0.60),
        };
      }

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
    descriptorVersion: 7,
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
  threshold = 0.65
): {
  isMatch: boolean;
  suspect: SuspectProfile | null;
  confidence: number;
  matchedType: 'face' | 'full_photo';
} {
  let bestSim = 0;
  let bestSuspect: SuspectProfile | null = null;
  let bestType: 'face' | 'full_photo' = 'face';

  for (const suspect of watchlist) {
    let sim = 0;
    let currentType: 'face' | 'full_photo' = 'face';

    // 1. Compare against tight facial descriptor
    if (suspect.descriptor && suspect.descriptor.length === 128) {
      const faceSim = computeFaceSimilarity(liveFaceDescriptor, suspect.descriptor);
      if (faceSim > sim) {
        sim = faceSim;
        currentType = 'face';
      }
    }

    // 2. Also check against full photo descriptor
    if (suspect.fullDescriptor && suspect.fullDescriptor.length === 128) {
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
