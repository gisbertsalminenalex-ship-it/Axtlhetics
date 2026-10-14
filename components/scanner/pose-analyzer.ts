'use client'

/**
 * Análisis de una foto en el dispositivo (D-023): carga perezosa del modelo de
 * pose, lectura de la foto y medida con el dominio del escáner.
 *
 * La foto se lee, se mide y se descarta. Lo único que sale de aquí son números
 * y una miniatura reducida con el esqueleto dibujado, que se queda en el
 * dispositivo (`P-016`). Nada se envía: el modelo y el motor se sirven desde la
 * propia app (`scripts/prepare-mediapipe.mjs`).
 */

import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { lightingProblem, luma, type LightingProblem, type LightingStats } from '@/lib/domain/scanner/lighting'
import { measurePose, type Measurements, type ScanLandmark, type ScanPose, type Silhouette } from '@/lib/domain/scanner/measure'

const MODEL_PATH = '/mediapipe/pose_landmarker_full.task'
const WASM_PATH = '/mediapipe/wasm'
/** Lado largo máximo al analizar: suficiente para el modelo y rápido en el móvil. */
const MAX_SIDE = 1280
/** Anchura de la miniatura que se guarda: pequeña a propósito. */
const THUMB_WIDTH = 240

/** Pares de puntos para dibujar el esqueleto sobre la miniatura. */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [7, 11], [8, 12],
]

export type AnalyzedPhoto =
  | { ok: true; measures: Measurements; thumbnail: string }
  | { ok: false; reason: 'no_person' | 'unreadable' | LightingProblem; thumbnail: string | null }

let landmarker: Promise<PoseLandmarker> | null = null

/** El modelo se carga una vez, la primera vez que hace falta. */
function getLandmarker(): Promise<PoseLandmarker> {
  landmarker ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'IMAGE' as const,
      numPoses: 1,
      outputSegmentationMasks: true,
    })
    try {
      return await PoseLandmarker.createFromOptions(fileset, options('GPU'))
    } catch {
      // Algunos móviles no tienen WebGL utilizable: el procesador va más lento pero funciona.
      return PoseLandmarker.createFromOptions(fileset, options('CPU'))
    }
  })().catch((error: unknown) => {
    landmarker = null
    throw error
  })
  return landmarker
}

/** Precarga el modelo para que el primer análisis no espere. Los fallos se verán al analizar. */
export function preloadPoseModel(): void {
  void getLandmarker().catch(() => {})
}

async function loadImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const factor = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * factor)
  canvas.height = Math.round(bitmap.height * factor)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

function thumbnailOf(source: HTMLCanvasElement, landmarks: ScanLandmark[] | null): string {
  const width = THUMB_WIDTH
  const height = Math.round((source.height / source.width) * width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, width, height)
  if (landmarks) {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#0A61F8'
    ctx.lineWidth = 2
    for (const [a, b] of BONES) {
      ctx.beginPath()
      ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height)
      ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height)
      ctx.stroke()
    }
  }
  return canvas.toDataURL('image/jpeg', 0.7)
}

/**
 * Brillo medio del cuerpo, y de su mitad izquierda y derecha en la imagen. Se
 * muestrea uno de cada 4 píxeles en cada eje: sobra para una media.
 */
function lightingOf(canvas: HTMLCanvasElement, mask: Silhouette): LightingStats {
  const { width, height } = canvas
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data
  const sx = mask.width / width
  const sy = mask.height / height
  let sum = 0
  let count = 0
  let sumX = 0
  const samples: { x: number; l: number }[] = []
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      if (!mask.isBody(Math.min(mask.width - 1, Math.floor(x * sx)), Math.min(mask.height - 1, Math.floor(y * sy)))) continue
      const i = (y * width + x) * 4
      const l = luma(pixels[i], pixels[i + 1], pixels[i + 2])
      samples.push({ x, l })
      sum += l
      sumX += x
      count++
    }
  }
  if (count === 0) return { meanLuma: 0, leftLuma: 0, rightLuma: 0 }
  const centre = sumX / count
  const side = (left: boolean) => {
    const part = samples.filter((s) => (s.x < centre) === left)
    return part.length ? part.reduce((acc, s) => acc + s.l, 0) / part.length : 0
  }
  return { meanLuma: sum / count, leftLuma: side(true), rightLuma: side(false) }
}

/** Lanza si el modelo no se puede cargar; una foto ilegible o sin persona se devuelve como resultado. */
export async function analyzePhoto(file: File, pose: ScanPose): Promise<AnalyzedPhoto> {
  const model = await getLandmarker()
  let canvas: HTMLCanvasElement
  try {
    canvas = await loadImage(file)
  } catch {
    return { ok: false, reason: 'unreadable', thumbnail: null }
  }
  const result = model.detect(canvas)
  const landmarks = (result.landmarks[0] ?? null) as ScanLandmark[] | null
  const mask = result.segmentationMasks?.[0]
  try {
    if (!landmarks) return { ok: false, reason: 'no_person', thumbnail: thumbnailOf(canvas, null) }
    let silhouette: Silhouette | undefined
    if (mask) {
      const data = mask.getAsFloat32Array()
      const { width, height } = mask
      silhouette = { width, height, isBody: (x, y) => data[y * width + x] > 0.5 }
      // Con poca luz o luz lateral fuerte, la silueta engaña: se avisa en vez de medir.
      const problem = lightingProblem(lightingOf(canvas, silhouette))
      if (problem) return { ok: false, reason: problem, thumbnail: thumbnailOf(canvas, landmarks) }
    }
    const measures = measurePose(pose, landmarks, { width: canvas.width, height: canvas.height }, silhouette)
    return { ok: true, measures, thumbnail: thumbnailOf(canvas, landmarks) }
  } finally {
    mask?.close()
  }
}
