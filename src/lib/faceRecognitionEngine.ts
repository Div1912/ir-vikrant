'use client';

// IR VIKRANT - High-Precision Neural Biometric Face Recognition Engine
// Powered by @vladmandic/human with 1024-dimensional ArcFace/FaceRes embeddings.
// Accurately recognizes enrolled suspects in real-time across arbitrary camera angles,
// head rotation, movement, and varying lighting conditions.

export interface FaceDescriptor {
  vector: number[];
  timestamp: number;
  version: number;
}

export interface ScanResult<T = any> {
  isMatch: boolean;
  suspect: T | null;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  targetType?: 'face' | 'full_photo' | 'person' | 'none';
  detectedFaceCount?: number;
}

let _humanInstance: any = null;
let _humanLoadingPromise: Promise<any> | null = null;
let _sharedExtractCanvas: HTMLCanvasElement | null = null;
let _sharedExtractCtx: CanvasRenderingContext2D | null = null;

function getSharedExtractContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_sharedExtractCanvas) {
    _sharedExtractCanvas = document.createElement('canvas');
    _sharedExtractCanvas.width = width;
    _sharedExtractCanvas.height = height;
    _sharedExtractCtx = _sharedExtractCanvas.getContext('2d', { willReadFrequently: true });
  } else if (_sharedExtractCanvas.width !== width || _sharedExtractCanvas.height !== height) {
    _sharedExtractCanvas.width = width;
    _sharedExtractCanvas.height = height;
    _sharedExtractCtx = _sharedExtractCanvas.getContext('2d', { willReadFrequently: true });
  }
  return _sharedExtractCtx;
}

/**
 * Initializes and returns the singleton @vladmandic/human engine instance.
 * Client-side only with WebGL acceleration and CPU fallback.
 */
export async function getHuman(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (_humanInstance) return _humanInstance;
  if (_humanLoadingPromise) return _humanLoadingPromise;

  _humanLoadingPromise = (async () => {
    try {
      const { Human } = await import('@vladmandic/human');
      const human = new Human({
        backend: 'webgl',
        modelBasePath: '/models/human/',
        cacheSensitivity: 0,
        skipAllowed: false,
        filter: { enabled: false },
        face: {
          enabled: true,
          detector: { enabled: true, rotation: true, maxDetected: 6, minConfidence: 0.15, skipFrames: 0, skipTime: 0, scale: 1.4 },
          mesh: { enabled: true, skipFrames: 0, skipTime: 0 },
          description: { enabled: true, minConfidence: 0.10, skipFrames: 0, skipTime: 0 },
          iris: { enabled: false },
          emotion: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false },
          gear: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
      });

      await human.load();
      _humanInstance = human;
      console.log('[FaceEngine] Neural Face Recognition Engine loaded successfully (WebGL, zero-skip real-time)');
      return human;
    } catch (err) {
      console.warn('[FaceEngine] WebGL init failed, attempting CPU fallback:', err);
      try {
        const { Human } = await import('@vladmandic/human');
        const human = new Human({
          backend: 'cpu',
          modelBasePath: '/models/human/',
          cacheSensitivity: 0,
          skipAllowed: false,
          face: {
            enabled: true,
            detector: { enabled: true, rotation: true, maxDetected: 4, minConfidence: 0.15, skipFrames: 0, skipTime: 0 },
            mesh: { enabled: true, skipFrames: 0, skipTime: 0 },
            description: { enabled: true, minConfidence: 0.10, skipFrames: 0, skipTime: 0 },
            iris: { enabled: false },
            emotion: { enabled: false },
            antispoof: { enabled: false },
            liveness: { enabled: false },
            gear: { enabled: false },
          },
          body: { enabled: false },
          hand: { enabled: false },
          object: { enabled: false },
          gesture: { enabled: false },
        });

        await human.load();
        _humanInstance = human;
        console.log('[FaceEngine] Neural Face Recognition Engine loaded (CPU fallback, zero-skip real-time)');
        return human;
      } catch (err2) {
        console.error('[FaceEngine] Failed to initialize Human engine:', err2);
        return null;
      }
    }
  })();

  return _humanLoadingPromise;
}

/**
 * Extracts a 1024-dimensional normalized deep biometric face embedding from an image or video crop.
 */
export async function extractFaceDescriptor(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  cropArea?: { x: number; y: number; width: number; height: number }
): Promise<number[]> {
  const src = source as any;
  const w = src.naturalWidth || src.videoWidth || src.width || 0;
  const h = src.naturalHeight || src.videoHeight || src.height || 0;
  if (w <= 0 || h <= 0) {
    return new Array(1024).fill(0);
  }

  // Ensure image is fully loaded if HTMLImageElement
  if (src.tagName === 'IMG' && (!src.complete || src.naturalWidth === 0)) {
    try {
      await src.decode();
    } catch {}
  }

  const human = await getHuman();
  if (human) {
    try {
      let input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement = source;

      if (cropArea && cropArea.width > 20 && cropArea.height > 20) {
        const cw = Math.max(64, Math.round(cropArea.width));
        const ch = Math.max(64, Math.round(cropArea.height));
        const ctx = getSharedExtractContext(cw, ch);
        if (ctx) {
          const sx = Math.max(0, Math.min(w - 10, cropArea.x));
          const sy = Math.max(0, Math.min(h - 10, cropArea.y));
          const sw = Math.max(10, Math.min(w - sx, cropArea.width));
          const sh = Math.max(10, Math.min(h - sy, cropArea.height));
          ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cw, ch);
          input = _sharedExtractCanvas!;
        }
      }

      let res = await human.detect(input);

      // Multi-scale fallback: if full image detection missed in tall portrait photo, scan upper 45%
      if ((!res || !res.face || res.face.length === 0) && !cropArea && h > w * 1.1) {
        const topH = Math.round(h * 0.45);
        const topCanvas = document.createElement('canvas');
        topCanvas.width = Math.min(640, w);
        topCanvas.height = Math.round(topH * (topCanvas.width / w));
        const topCtx = topCanvas.getContext('2d');
        if (topCtx) {
          topCtx.drawImage(source, 0, 0, w, topH, 0, 0, topCanvas.width, topCanvas.height);
          res = await human.detect(topCanvas);
        }
      }

      if (res && res.face && res.face.length > 0) {
        let bestFace = res.face[0];
        for (let i = 1; i < res.face.length; i++) {
          if ((res.face[i].score || 0) > (bestFace.score || 0)) {
            bestFace = res.face[i];
          }
        }
        if (bestFace.embedding && bestFace.embedding.length > 0) {
          return Array.from(bestFace.embedding);
        }
      }
    } catch (err) {
      console.warn('[FaceEngine] Human descriptor extraction error:', err);
    }
  }

  // Return zero vector if no face detected by neural engine
  return new Array(1024).fill(0);
}

/**
 * High-Precision Biometric Face Similarity:
 * Computes Cosine Similarity between 1024-d face embedding vectors.
 * STRICT: Only compares vectors of the EXACT same dimension (1024-d).
 * 
 * Calibrated Score Curve for 1024-d ArcFace / FaceRes:
 * - cosSim <= 0.40: Clear Non-Suspect -> returns 0% - 20%
 * - 0.40 < cosSim < 0.62: Different person / demographic similarity -> returns 20% - 48% (safely below 68% threshold)
 * - 0.62 <= cosSim < 0.68: Ambiguous boundary zone -> returns 48% - 65% (NEVER triggers false match)
 * - cosSim >= 0.68: GENUINE SUSPECT MATCH -> returns 70% - 98.8% (Triggers Confirmed Intercept)
 */
export function computeFaceSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || !Array.isArray(vecA) || !Array.isArray(vecB)) return 0;
  if (vecA.length < 32 || vecB.length < 32) return 0;

  // STRICT DIMENSION CHECK: Never compare vectors of mismatched length!
  if (vecA.length !== vecB.length) {
    return 0;
  }

  const len = vecA.length;
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 1e-6 || normB <= 1e-6) return 0;

  const cosSim = dot / (Math.sqrt(normA) * Math.sqrt(normB));

  // Deep 1024-d ArcFace / FaceRes embeddings
  if (len >= 256) {
    if (cosSim <= 0.40) {
      // Non-suspect commuter: return safe low score (0% - 20%)
      return Math.max(0, Number((cosSim * 0.50).toFixed(4)));
    } else if (cosSim < 0.62) {
      // Different person with demographic resemblance: returns 20% - 48% (safely below 68% threshold)
      const t = (cosSim - 0.40) / (0.62 - 0.40);
      return Number((0.20 + t * 0.28).toFixed(4));
    } else if (cosSim < 0.68) {
      // Ambiguous transition zone: returns 48% - 65% (never triggers alert threshold)
      const t = (cosSim - 0.62) / (0.68 - 0.62);
      return Number((0.48 + t * 0.17).toFixed(4));
    } else {
      // Genuine suspect match (cosSim >= 0.68):
      // Smoothly maps to 70% - 98.8%
      const t = Math.min(1.0, (cosSim - 0.68) / (0.88 - 0.68));
      const score = 0.70 + t * 0.288;
      return Math.min(0.988, Number(score.toFixed(4)));
    }
  }

  // Fallback for identical-dimension legacy vectors (128-d vs 128-d only)
  if (cosSim <= 0.40) {
    return Math.max(0, Number((cosSim * 0.60).toFixed(4)));
  } else if (cosSim < 0.60) {
    return Number((0.24 + (cosSim - 0.40) * 1.2).toFixed(4));
  } else {
    return Math.min(0.988, Number((0.68 + (cosSim - 0.60) * 0.77).toFixed(4)));
  }
}

/**
 * Real-time Full-Frame Face Scanner:
 * Scans video or camera frames for all moving or stationary persons,
 * extracts their deep facial embeddings, and compares each person with
 * every active suspect in the watchlist.
 */
export async function scanFrameForSuspects<
  T extends { descriptor?: number[]; fullDescriptor?: number[]; [k: string]: any }
>(
  video: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  watchlist: T[],
  threshold = 0.68,
  detectedObjects?: Array<{ class: string; bbox: [number, number, number, number]; score: number }>
): Promise<ScanResult<T>> {
  const source = video as any;
  const vw = source.naturalWidth || source.videoWidth || source.width || 640;
  const vh = source.naturalHeight || source.videoHeight || source.height || 480;

  if (vw <= 0 || vh <= 0 || !watchlist || watchlist.length === 0) {
    return {
      isMatch: false,
      suspect: null,
      confidence: 0,
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      targetType: 'none',
      detectedFaceCount: 0,
    };
  }

  const human = await getHuman();

  // 1. Primary Neural Biometric Scan via Human
  if (human) {
    try {
      const res = await human.detect(video);
      const faces = res?.face || [];

      if (faces.length > 0) {
        let bestSim = 0;
        let secondSim = 0;
        let bestSuspect: T | null = null;
        let bestBbox = { x: 0, y: 0, width: 100, height: 100 };
        let bestTargetType: 'face' | 'full_photo' = 'face';

        for (const face of faces) {
          const [bx, by, bw, bh] = face.box;
          const liveEmb = face.embedding ? Array.from(face.embedding as number[]) : null;
          if (!liveEmb || liveEmb.length === 0) continue;

          for (const suspect of watchlist) {
            let sim = 0;
            let matchedType: 'face' | 'full_photo' = 'face';

            // Primary: compare against clean cropped face descriptor
            if (suspect.descriptor && suspect.descriptor.length === liveEmb.length) {
              const sSim = computeFaceSimilarity(liveEmb, suspect.descriptor);
              if (sSim > sim) {
                sim = sSim;
                matchedType = 'face';
              }
            } else if (suspect.fullDescriptor && suspect.fullDescriptor.length === liveEmb.length) {
              // Fallback only if no primary face descriptor
              const fSim = computeFaceSimilarity(liveEmb, suspect.fullDescriptor);
              if (fSim > sim) {
                sim = fSim;
                matchedType = 'full_photo';
              }
            }

            if (sim > bestSim) {
              secondSim = bestSim;
              bestSim = sim;
              bestSuspect = suspect;
              bestBbox = {
                x: Math.max(0, Math.round(bx)),
                y: Math.max(0, Math.round(by)),
                width: Math.min(vw - bx, Math.round(bw)),
                height: Math.min(vh - by, Math.round(bh)),
              };
              bestTargetType = matchedType;
            } else if (sim > secondSim) {
              secondSim = sim;
            }
          }
        }

        // If no suspect matched above threshold, return the best non-matching face bbox for tracking
        if (!bestSuspect && faces[0]) {
          const [fx, fy, fw, fh] = faces[0].box;
          bestBbox = {
            x: Math.max(0, Math.round(fx)),
            y: Math.max(0, Math.round(fy)),
            width: Math.min(vw - fx, Math.round(fw)),
            height: Math.min(vh - fy, Math.round(fh)),
          };
        }

        // Margin separation check:
        // A match is confirmed if bestSim >= threshold AND has clear margin over runner-up (or high confidence >= 0.76)
        const hasClearMargin = secondSim < threshold || (bestSim - secondSim) >= 0.035 || bestSim >= 0.76;
        const isMatch = bestSim >= threshold && bestSuspect !== null && hasClearMargin;

        return {
          isMatch,
          suspect: bestSuspect,
          confidence: Number(bestSim.toFixed(3)),
          bbox: bestBbox,
          targetType: bestTargetType,
          detectedFaceCount: faces.length,
        };
      }
    } catch (err) {
      console.warn('[FaceEngine] scanFrameForSuspects Human error:', err);
    }
  }

  // 2. Secondary fallback: check detected cell phones or candidate regions
  const candidateRegions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'face' | 'full_photo';
  }> = [];

  if (detectedObjects && detectedObjects.length > 0) {
    for (const obj of detectedObjects) {
      const cName = obj.class.toLowerCase();
      const [px, py, pw, ph] = obj.bbox;
      if (cName === 'cell phone' && obj.score >= 0.28) {
        candidateRegions.push({
          x: Math.max(0, px),
          y: Math.max(0, py),
          width: Math.min(vw - px, pw),
          height: Math.min(vh - py, ph),
          type: 'full_photo',
        });
      } else if (cName === 'person' && obj.score >= 0.35) {
        candidateRegions.push({
          x: Math.max(0, px + pw * 0.12),
          y: Math.max(0, py),
          width: Math.min(vw - px, Math.max(25, pw * 0.76)),
          height: Math.min(vh - py, Math.max(25, ph * 0.38)),
          type: 'face',
        });
      }
    }
  }

  if (candidateRegions.length === 0) {
    candidateRegions.push({
      x: Math.max(0, vw * 0.25),
      y: Math.max(0, vh * 0.10),
      width: Math.max(40, vw * 0.50),
      height: Math.max(40, vh * 0.65),
      type: 'face',
    });
  }

  let fallbackBestSim = 0;
  let fallbackBestSuspect: T | null = null;
  let fallbackBbox = candidateRegions[0];
  let fallbackTargetType: 'face' | 'full_photo' = 'face';

  for (const region of candidateRegions) {
    if (region.width < 20 || region.height < 20) continue;
    try {
      const descriptor = await extractFaceDescriptor(video, region);
      for (const suspect of watchlist) {
        let sim = 0;
        let matchedType: 'face' | 'full_photo' = 'face';

        if (suspect.descriptor && suspect.descriptor.length === descriptor.length) {
          const faceSim = computeFaceSimilarity(descriptor, suspect.descriptor);
          if (faceSim > sim) {
            sim = faceSim;
            matchedType = 'face';
          }
        } else if (suspect.fullDescriptor && suspect.fullDescriptor.length === descriptor.length) {
          const fullSim = computeFaceSimilarity(descriptor, suspect.fullDescriptor);
          if (fullSim > sim) {
            sim = fullSim;
            matchedType = 'full_photo';
          }
        }

        if (sim > fallbackBestSim) {
          fallbackBestSim = sim;
          fallbackBestSuspect = suspect;
          fallbackBbox = region;
          fallbackTargetType = matchedType;
        }
      }
    } catch {}
  }

  return {
    isMatch: fallbackBestSim >= threshold && fallbackBestSuspect !== null,
    suspect: fallbackBestSuspect,
    confidence: Number(fallbackBestSim.toFixed(3)),
    bbox: fallbackBbox,
    targetType: fallbackTargetType,
    detectedFaceCount: candidateRegions.length,
  };
}
