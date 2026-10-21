'use client'

/**
 * El escáner corporal (D-023): un flujo dentro de Entrenamiento, como el test de
 * evolución. Introducción → cómo te ves (una pregunta por paso, como el
 * onboarding) → una pose por paso → resumen → guardar.
 *
 * Las fotos se analizan en el dispositivo y solo se guardan miniaturas, en el
 * dispositivo. Nada se guarda hasta pulsar «Guardar escaneo».
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { analyzePhoto, preloadPoseModel, type AnalyzedPhoto } from '@/components/scanner/pose-analyzer'
import { ScanSummaryView } from '@/components/scanner/scan-summary-view'
import type { Measurements, ScanPose } from '@/lib/domain/scanner/measure'
import { SCAN_PHOTO_TIPS, SCAN_POSE_GUIDE } from '@/lib/domain/scanner/protocol'
import {
  SCAN_PRIORITY_LABELS,
  SCAN_ZONE_LABELS,
  SCAN_ZONES,
  summarizeScan,
  type ScanBuild,
  type ScanPriority,
  type ScanSelfReport,
  type ScanZone,
} from '@/lib/domain/scanner/summary'
import type { ScanSex } from '@/lib/domain/scanner/body-fat'
import { compareScans } from '@/lib/domain/scanner/compare'
import { createScanRecord } from '@/lib/domain/scanner/types'
import { createId } from '@/lib/domain/shared/ids'
import { formatDayInSentence, todayKey } from '@/lib/domain/shared/dates'
import { useAxtlhetics } from '@/lib/state/store'
import { physiquePlan } from '@/lib/domain/scanner/physique'
import { cn } from '@/lib/utils'

type Step = 'intro' | 'build' | 'sex' | 'strong' | 'weak' | 'priority' | ScanPose | 'summary'
const STEPS: readonly Step[] = ['intro', 'build', 'sex', 'strong', 'weak', 'priority', ...SCAN_POSE_GUIDE.map((g) => g.pose), 'summary']

type Photo = { id: string; result: AnalyzedPhoto }

const BUILDS: { id: ScanBuild; label: string }[] = [
  { id: 'delgada', label: 'Más bien delgada' },
  { id: 'media', label: 'Media' },
  { id: 'ancha', label: 'Más bien ancha' },
]

const SEXES: { id: ScanSex; label: string }[] = [
  { id: 'hombre', label: 'Hombre' },
  { id: 'mujer', label: 'Mujer' },
]

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function EscanerScreen({ onClose }: { onClose: () => void }) {
  const { scans, assessments, sessions, profile } = useAxtlhetics()
  const [stepIndex, setStepIndex] = useState(0)
  // El sexo del perfil sale marcado; se puede cambiar en cada escaneo (D-051).
  const [selfReport, setSelfReport] = useState<ScanSelfReport>({
    build: null,
    strongZones: [],
    weakZones: [],
    priority: null,
    ...(profile?.sex ? { sex: profile.sex } : {}),
  })
  const [photos, setPhotos] = useState<Partial<Record<ScanPose, Photo[]>>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [modelError, setModelError] = useState(false)
  const [saving, setSaving] = useState(false)

  const step = STEPS[stepIndex]
  const isPose = SCAN_POSE_GUIDE.some((g) => g.pose === step)
  const next = () => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))
  const back = () => (stepIndex === 0 ? onClose() : setStepIndex((i) => i - 1))

  // El modelo pesa unos megas: se empieza a cargar mientras se responden las preguntas.
  useEffect(() => {
    if (step === 'build') preloadPoseModel()
  }, [step])

  // Cada paso empieza arriba: el contenedor de scroll es compartido.
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [stepIndex])

  const measurements = useMemo(() => {
    const out: Partial<Record<ScanPose, Measurements[]>> = {}
    for (const { pose } of SCAN_POSE_GUIDE) {
      const ok = (photos[pose] ?? []).flatMap((p) => (p.result.ok ? [p.result.measures] : []))
      if (ok.length) out[pose] = ok
    }
    return out
  }, [photos])

  const summary = useMemo(
    () =>
      summarizeScan({
        shots: measurements,
        assessments: assessments.assessments,
        sessions,
        experience: profile?.experience ?? null,
        selfReport,
        body: profile ? { heightCm: profile.heightCm, age: profile.age, weightKg: profile.weightKg } : null,
        // Frente al último escaneo guardado: cómo han cambiado las zonas.
        previous: scans.scans[0] ?? null,
        today: todayKey(),
      }),
    [measurements, assessments.assessments, sessions, profile, selfReport, scans.scans],
  )

  // Frente a tu último escaneo guardado, si lo hay.
  const comparison = useMemo(() => {
    const last = scans.scans[0]
    if (!last || Object.keys(measurements).length === 0) return null
    return compareScans(
      {
        shots: measurements,
        index: summary.index,
        scores: Object.fromEntries(summary.categories.map((c) => [c.key, c.score])),
        bodyFatPct: summary.bodyFat?.pct ?? null,
      },
      last,
    )
  }, [scans.scans, measurements, summary])

  const addPhotos = async (pose: ScanPose, files: File[]) => {
    if (files.length === 0) return
    setAnalyzing(true)
    setModelError(false)
    try {
      for (const file of files) {
        const result = await analyzePhoto(file, pose)
        setPhotos((current) => ({ ...current, [pose]: [...(current[pose] ?? []), { id: createId(), result }] }))
      }
    } catch {
      setModelError(true)
    } finally {
      setAnalyzing(false)
    }
  }

  const save = async () => {
    setSaving(true)
    const thumbnails: Partial<Record<ScanPose, string>> = {}
    for (const { pose } of SCAN_POSE_GUIDE) {
      const first = (photos[pose] ?? []).find((p) => p.result.ok)
      if (first?.result.thumbnail) thumbnails[pose] = first.result.thumbnail
    }
    const record = createScanRecord({ id: createId(), dayKey: todayKey(), now: new Date(), selfReport, measurements, summary, thumbnails })
    const saved = await scans.save(record)
    setSaving(false)
    if (saved) onClose()
  }

  return (
    <div className="flex min-h-full flex-col px-6 pb-8">
      <header className="flex items-center justify-between pt-2 pb-1">
        <button type="button" onClick={back} aria-label="Volver" className="ax-press -ml-2 flex h-11 w-11 items-center justify-center">
          <ArrowLeft className="h-6 w-6 text-foreground" strokeWidth={2} />
        </button>
        {step !== 'intro' && step !== 'summary' && (
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">
            {stepIndex} de {STEPS.length - 2}
          </span>
        )}
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      {step === 'intro' && <Intro onStart={next} lastScanDay={scans.scans[0]?.dayKey ?? null} />}

      {step === 'build' && (
        <Question title="¿Cómo describirías tu complexión?" hint="Lo que la foto no puede medir, me lo cuentas tú." onNext={next}>
          {BUILDS.map((b) => (
            <Chip key={b.id} selected={selfReport.build === b.id} onClick={() => setSelfReport((s) => ({ ...s, build: s.build === b.id ? null : b.id }))}>
              {b.label}
            </Chip>
          ))}
        </Question>
      )}

      {step === 'sex' && (
        <Question
          title="¿Qué fórmula uso para estimar tu grasa?"
          hint="La estimación del % de grasa es distinta para hombres y para mujeres. Solo se guarda con el escaneo, en tu móvil."
          onNext={next}
        >
          {SEXES.map((option) => (
            <Chip key={option.id} selected={selfReport.sex === option.id} onClick={() => setSelfReport((s) => ({ ...s, sex: s.sex === option.id ? null : option.id }))}>
              {option.label}
            </Chip>
          ))}
        </Question>
      )}

      {(step === 'strong' || step === 'weak') && (
        <Question
          title={step === 'strong' ? '¿Dónde te ves con más músculo?' : '¿Dónde te ves con menos?'}
          hint="Puedes marcar varias, o ninguna."
          onNext={next}
        >
          {SCAN_ZONES.map((zone) => {
            const key = step === 'strong' ? 'strongZones' : 'weakZones'
            const other = step === 'strong' ? 'weakZones' : 'strongZones'
            const selected = selfReport[key].includes(zone)
            const disabled = selfReport[other].includes(zone)
            return (
              <Chip
                key={zone}
                selected={selected}
                disabled={disabled}
                onClick={() =>
                  setSelfReport((s) => ({ ...s, [key]: selected ? s[key].filter((z: ScanZone) => z !== zone) : [...s[key], zone] }))
                }
              >
                {capital(SCAN_ZONE_LABELS[zone])}
              </Chip>
            )
          })}
        </Question>
      )}

      {step === 'priority' && (
        <Question title="¿Qué quieres priorizar?" hint="AXIS lo tendrá en cuenta al explicarte tu resultado y tus opciones." onNext={next}>
          {(Object.keys(SCAN_PRIORITY_LABELS) as ScanPriority[]).map((p) => (
            <Chip key={p} selected={selfReport.priority === p} onClick={() => setSelfReport((s) => ({ ...s, priority: s.priority === p ? null : p }))}>
              {capital(SCAN_PRIORITY_LABELS[p])}
            </Chip>
          ))}
        </Question>
      )}

      {isPose && (
        <PoseStep
          guide={SCAN_POSE_GUIDE.find((g) => g.pose === step)!}
          photos={photos[step as ScanPose] ?? []}
          analyzing={analyzing}
          modelError={modelError}
          onAdd={(files) => void addPhotos(step as ScanPose, files)}
          onRemove={(id) => setPhotos((current) => ({ ...current, [step]: (current[step as ScanPose] ?? []).filter((p) => p.id !== id) }))}
          onNext={next}
        />
      )}

      {step === 'summary' && (
        <>
          <h1 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-[-0.03em]">Tu escaneo</h1>
          <div className="mt-5">
            <ScanSummaryView
              summary={summary}
              comparison={comparison}
              plan={physiquePlan({ dayKey: todayKey(), measurements, selfReport }).findings}
            />
          </div>
          <div className="mt-auto pt-8">
            <button
              type="button"
              disabled={saving || Object.keys(measurements).length === 0}
              onClick={() => void save()}
              className="ax-press h-[52px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar escaneo'}
            </button>
            <button type="button" onClick={onClose} className="ax-press mt-2 min-h-11 w-full text-[14px] font-semibold text-muted-foreground">
              Salir sin guardar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Intro({ onStart, lastScanDay }: { onStart: () => void; lastScanDay: string | null }) {
  return (
    <>
      <h1 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-[-0.03em]">Escáner corporal</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">5 preguntas y 5 fotos, más 1 opcional · 5–10 min</p>
      <p className="mt-4 text-[15px] leading-relaxed text-pretty">
        Mido tu simetría, tus proporciones, tu postura y tu movilidad, y lo combino con tu fuerza y tu entrenamiento.
        Te digo tus puntos fuertes, qué te hará avanzar más y qué opciones tienes.
      </p>
      <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
        Las fotos se analizan en tu móvil y no salen de él. Solo se guarda una miniatura de cada pose, también en tu móvil,
        para que compares mes a mes.
      </p>
      <ul className="mt-5 divide-y divide-border border-y border-border text-[14px]">
        {SCAN_PHOTO_TIPS.map((tip) => (
          <li key={tip} className="py-2.5 leading-snug">{tip}</li>
        ))}
      </ul>
      {lastScanDay && <p className="mt-3 text-[13px] text-muted-foreground">Último escaneo: {formatDayInSentence(lastScanDay)}</p>}
      <div className="mt-auto pt-8">
        <button type="button" onClick={onStart} className="ax-press h-[52px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground">
          Empezar
        </button>
      </div>
    </>
  )
}

function Question({ title, hint, onNext, children }: { title: string; hint: string; onNext: () => void; children: React.ReactNode }) {
  return (
    <>
      <h1 className="mt-3 text-[28px] font-bold leading-[1.15] tracking-[-0.03em] text-balance">{title}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">{hint}</p>
      <div className="mt-6 flex flex-wrap gap-2">{children}</div>
      <div className="mt-auto pt-8">
        <button type="button" onClick={onNext} className="ax-press h-[52px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground">
          Continuar
        </button>
      </div>
    </>
  )
}

function Chip({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'ax-press min-h-11 rounded-full px-4 text-[13.5px] font-semibold disabled:opacity-40',
        selected ? 'bg-primary text-primary-foreground' : 'border border-border bg-background',
      )}
    >
      {children}
    </button>
  )
}

const PHOTO_PROBLEM: Record<'no_person' | 'unreadable' | 'dark' | 'side_light', string> = {
  no_person: 'No veo a ninguna persona',
  unreadable: 'No se pudo leer la foto',
  dark: 'Poca luz: repítela con más luz',
  side_light: 'Luz de un lado: repítela con la luz de frente',
}

function PoseStep({
  guide,
  photos,
  analyzing,
  modelError,
  onAdd,
  onRemove,
  onNext,
}: {
  guide: (typeof SCAN_POSE_GUIDE)[number]
  photos: Photo[]
  analyzing: boolean
  modelError: boolean
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
  onNext: () => void
}) {
  const valid = photos.filter((p) => p.result.ok).length
  return (
    <>
      <h1 className="mt-3 text-[28px] font-bold leading-[1.15] tracking-[-0.03em]">{guide.name}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-pretty">{guide.how}</p>

      <label
        className={cn(
          'ax-press mt-6 flex h-[52px] w-full cursor-pointer items-center justify-center rounded-2xl border border-border bg-background text-[15px] font-semibold',
          analyzing && 'pointer-events-none opacity-60',
        )}
      >
        {analyzing ? 'Analizando…' : photos.length ? 'Añadir más fotos' : 'Añadir fotos (galería o cámara)'}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={analyzing}
          onChange={(event) => {
            // `files` es una lista viva: se copia antes de vaciar el selector.
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            onAdd(files)
          }}
        />
      </label>

      {modelError && (
        <p role="alert" className="mt-3 text-[13.5px] leading-relaxed text-error">
          No se pudo cargar el analizador en este navegador. Comprueba la conexión la primera vez e inténtalo de nuevo.
        </p>
      )}

      {photos.length > 0 && (
        <ul className="mt-5 grid grid-cols-3 gap-3">
          {photos.map((photo) => (
            <li key={photo.id} className="relative">
              {photo.result.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.result.thumbnail} alt={photo.result.ok ? 'Foto con los puntos detectados' : `Foto no válida: ${PHOTO_PROBLEM[photo.result.reason].toLowerCase()}`} className="w-full rounded-xl" />
              ) : (
                <div className="aspect-[3/4] w-full rounded-xl bg-surface" />
              )}
              {!photo.result.ok && <p className="mt-1 text-[11.5px] leading-snug text-error">{PHOTO_PROBLEM[photo.result.reason]}</p>}
              <button
                type="button"
                onClick={() => onRemove(photo.id)}
                className="ax-press mt-0.5 min-h-11 w-full text-[12.5px] font-semibold text-muted-foreground"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={onNext}
          disabled={analyzing}
          className="ax-press h-[52px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {valid > 0 ? 'Continuar' : 'Saltar esta pose'}
        </button>
        {valid === 1 && <p className="mt-2 text-center text-[12.5px] text-muted-foreground">Con 2 o 3 fotos la medida es más fiable.</p>}
      </div>
    </>
  )
}
