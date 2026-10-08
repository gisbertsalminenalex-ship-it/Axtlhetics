'use client'

/**
 * Laboratorio del escáner corporal (D-023): prototipo de medición.
 *
 * No es la pantalla del escáner. Sirve para comprobar, con fotos reales, qué
 * medidas son estables al repetir la misma pose con el mismo montaje (cierra
 * `P-015`). Las fotos se analizan en el dispositivo y no se guardan ni se envían:
 * se leen, se miden y se descartan. Lo único que se puede copiar son números.
 */

import { useRef, useState } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import {
  measurePose,
  stabilityOf,
  type Measurements,
  type ScanLandmark,
  type ScanPose,
  type Silhouette,
} from '@/lib/domain/scanner/measure'
import { cn } from '@/lib/utils'

const MODEL_PATH = '/mediapipe/pose_landmarker_full.task'
const WASM_PATH = '/mediapipe/wasm'
/** Lado largo máximo al analizar: suficiente para el modelo y rápido en el móvil. */
const MAX_SIDE = 1280

const POSES: { id: ScanPose; name: string; how: string }[] = [
  { id: 'front', name: 'De frente', how: 'De pie, mirando a la cámara, brazos un poco separados del cuerpo. Cuerpo entero en la foto, cámara a la altura del pecho.' },
  { id: 'side', name: 'De perfil', how: 'De pie, de lado a la cámara, mirando al frente y relajado. Cuerpo entero en la foto.' },
  { id: 'squat_side', name: 'Sentadilla de perfil', how: 'De lado a la cámara, en el punto más bajo de la sentadilla. Cuerpo entero en la foto.' },
  { id: 'squat_front', name: 'Sentadilla de frente', how: 'Mirando a la cámara, en el punto más bajo de la sentadilla. Piernas enteras en la foto.' },
  { id: 'arms_up', name: 'Brazos arriba', how: 'De frente, brazos estirados por encima de la cabeza todo lo que puedas sin arquear la espalda.' },
]

const LABELS: Record<string, string> = {
  shoulderTiltDeg: 'Inclinación hombros (°)',
  hipTiltDeg: 'Inclinación caderas (°)',
  armAsymmetryPct: 'Asimetría brazos (%)',
  legAsymmetryPct: 'Asimetría piernas (%)',
  legToTorso: 'Piernas / tronco',
  shoulderToWaist: 'Hombros / cintura (V)',
  headForwardPct: 'Cabeza adelantada (% tronco)',
  headAngleDeg: 'Ángulo cabeza (°)',
  kneeAngleDeg: 'Ángulo rodilla (°)',
  trunkLeanDeg: 'Inclinación tronco (°)',
  leftKneeDeg: 'Rodilla izquierda (°)',
  rightKneeDeg: 'Rodilla derecha (°)',
  leftArmDeg: 'Brazo izquierdo (°)',
  rightArmDeg: 'Brazo derecho (°)',
  armsDiffDeg: 'Diferencia brazos (°)',
}

const REASONS: Record<string, string> = {
  not_visible: 'no se ve',
  out_of_frame: 'fuera de foto',
  no_silhouette: 'sin silueta',
}

type Shot = { name: string; size: { width: number; height: number }; measures: Measurements; preview: string; error?: string }

/** Pares de puntos para dibujar el esqueleto sobre la vista previa. */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [7, 11], [8, 12],
]

async function createLandmarker(): Promise<PoseLandmarker> {
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
}

/** Dibuja la foto reducida en un lienzo, respetando la orientación EXIF. */
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

function drawPreview(source: HTMLCanvasElement, landmarks: ScanLandmark[] | null): string {
  const width = 240
  const height = Math.round((source.height / source.width) * width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, width, height)
  if (landmarks) {
    ctx.strokeStyle = '#0A61F8'
    ctx.lineWidth = 2
    for (const [a, b] of BONES) {
      ctx.beginPath()
      ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height)
      ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height)
      ctx.stroke()
    }
  }
  // Solo una miniatura reducida, en memoria, para revisar el ajuste. No se guarda.
  return canvas.toDataURL('image/jpeg', 0.7)
}

export function ScannerLab() {
  const [pose, setPose] = useState<ScanPose>('front')
  const [shots, setShots] = useState<Record<ScanPose, Shot[]>>({ front: [], side: [], squat_side: [], squat_front: [], arms_up: [] })
  const [status, setStatus] = useState<'idle' | 'loading' | 'working'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const landmarker = useRef<Promise<PoseLandmarker> | null>(null)

  const analyze = async (files: File[]) => {
    if (files.length === 0) return
    setError(null)
    setStatus(landmarker.current ? 'working' : 'loading')
    try {
      landmarker.current ??= createLandmarker()
      const model = await landmarker.current
      setStatus('working')
      const results: Shot[] = []
      for (const file of files) {
        try {
          const canvas = await loadImage(file)
          const result = model.detect(canvas)
          const landmarks = (result.landmarks[0] ?? null) as ScanLandmark[] | null
          let silhouette: Silhouette | undefined
          const mask = result.segmentationMasks?.[0]
          if (mask) {
            const data = mask.getAsFloat32Array()
            const { width, height } = mask
            silhouette = { width, height, isBody: (x, y) => data[y * width + x] > 0.5 }
          }
          const size = { width: canvas.width, height: canvas.height }
          const measures = landmarks ? measurePose(pose, landmarks, size, silhouette) : {}
          results.push({ name: file.name, size, measures, preview: drawPreview(canvas, landmarks), error: landmarks ? undefined : 'No se detecta a ninguna persona.' })
          mask?.close()
        } catch {
          results.push({ name: file.name, size: { width: 0, height: 0 }, measures: {}, preview: '', error: 'No se pudo leer la foto.' })
        }
      }
      setShots((current) => ({ ...current, [pose]: [...current[pose], ...results] }))
    } catch {
      setError('No se pudo cargar el modelo de pose en este navegador.')
      landmarker.current = null
    } finally {
      setStatus('idle')
    }
  }

  const current = shots[pose]
  const keys = Array.from(new Set(current.flatMap((shot) => Object.keys(shot.measures))))
  const info = POSES.find((item) => item.id === pose)!

  const copy = async () => {
    // Solo números: ni fotos ni miniaturas ni nombres de archivo.
    const report = {
      model: 'pose_landmarker_full float16 v1',
      poses: Object.fromEntries(
        POSES.map(({ id }) => {
          const list = shots[id]
          const metricKeys = Array.from(new Set(list.flatMap((shot) => Object.keys(shot.measures))))
          return [
            id,
            {
              photos: list.length,
              perPhoto: list.map((shot) => Object.fromEntries(metricKeys.map((key) => [key, shot.measures[key]?.value ?? null]))),
              stability: Object.fromEntries(metricKeys.map((key) => [key, stabilityOf(list.map((shot) => shot.measures[key]?.value ?? null))])),
            },
          ]
        }),
      ),
    }
    await navigator.clipboard.writeText(JSON.stringify(report))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[480px] px-6 pb-16 pt-8">
      <p className="text-[12px] font-semibold tracking-[0.14em] text-primary uppercase">Laboratorio · D-023</p>
      <h1 className="mt-1.5 text-[28px] font-bold leading-[1.1] tracking-[-0.03em]">Escáner: prueba de medición</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground text-pretty">
        Sube varias fotos de la misma pose, hechas con el mismo montaje. Se analizan en este dispositivo: las fotos no se
        guardan ni salen del móvil. Solo se comparan los números entre fotos.
      </p>

      <div role="radiogroup" aria-label="Pose" className="mt-6 flex flex-wrap gap-2">
        {POSES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={pose === item.id}
            onClick={() => setPose(item.id)}
            className={cn(
              'ax-press min-h-11 rounded-full px-4 text-[13.5px] font-semibold',
              pose === item.id ? 'bg-primary text-primary-foreground' : 'border border-border bg-background',
            )}
          >
            {item.name}
            {shots[item.id].length > 0 ? ` · ${shots[item.id].length}` : ''}
          </button>
        ))}
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-pretty">{info.how}</p>

      <label className="ax-press mt-5 flex h-[52px] w-full cursor-pointer items-center justify-center rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground">
        {status === 'loading' ? 'Cargando el modelo…' : status === 'working' ? 'Analizando…' : 'Añadir fotos (galería o cámara)'}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={status !== 'idle'}
          onChange={(event) => {
            // `files` es una lista viva: se copia antes de vaciar el selector, o
            // al terminar de cargar el modelo ya no quedaría ninguna foto.
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            void analyze(files)
          }}
        />
      </label>

      {error && <p role="alert" className="mt-3 text-[13.5px] text-error">{error}</p>}

      {current.length > 0 && (
        <>
          <h2 className="mt-8 text-[15px] font-semibold">Estabilidad · {current.length} fotos</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Medida</th>
                  <th className="py-1.5 pr-2 font-medium">Media</th>
                  <th className="py-1.5 pr-2 font-medium">± DT</th>
                  <th className="py-1.5 font-medium">Rango</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((key) => {
                  const s = stabilityOf(current.map((shot) => shot.measures[key]?.value ?? null))
                  return (
                    <tr key={key}>
                      <td className="py-1.5 pr-2">{LABELS[key] ?? key}</td>
                      <td className="py-1.5 pr-2">{s ? s.mean : '—'}</td>
                      <td className="py-1.5 pr-2">{s ? s.sd : '—'}</td>
                      <td className="py-1.5">{s ? `${s.min} – ${s.max}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 text-[15px] font-semibold">Cada foto</h2>
          <ul className="mt-2 space-y-4">
            {current.map((shot, index) => (
              <li key={`${shot.name}-${index}`} className="flex gap-3">
                {shot.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shot.preview} alt={`Foto ${index + 1} con los puntos detectados`} className="w-24 shrink-0 rounded-xl" />
                ) : (
                  <div className="h-24 w-24 shrink-0 rounded-xl bg-surface" />
                )}
                <div className="text-[12.5px] leading-relaxed">
                  <p className="font-semibold">Foto {index + 1}</p>
                  {shot.error ? (
                    <p className="text-error">{shot.error}</p>
                  ) : (
                    Object.entries(shot.measures).map(([key, m]) => (
                      <p key={key}>
                        <span className="text-muted-foreground">{LABELS[key] ?? key}:</span>{' '}
                        {m.value === null ? REASONS[m.reason] : m.value}
                      </p>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setShots((s) => ({ ...s, [pose]: [] }))}
            className="ax-press mt-6 min-h-11 w-full text-[14px] font-semibold text-muted-foreground"
          >
            Borrar las fotos de esta pose
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => void copy()}
        className="ax-press mt-6 h-[52px] w-full rounded-2xl border border-border bg-background text-[15px] font-semibold"
      >
        {copied ? 'Copiado' : 'Copiar resultados (solo números)'}
      </button>
    </main>
  )
}
