'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { SectionTitle } from '@/components/profile/controls'
import {
  BACKUP_REJECTION_MESSAGES,
  parseBackup,
  type BackupContents,
  type BackupCounts,
} from '@/lib/domain/backup/backup'
import { useAxtlhetics } from '@/lib/state/store'
import { cn } from '@/lib/utils'

/**
 * Copia de seguridad: descargar un archivo y restaurarlo.
 *
 * Por qué existe: los datos viven solo en este dispositivo. Si el navegador
 * desaloja el almacenamiento —iOS lo hace tras unos días sin abrir una PWA— el
 * historial entero desaparece sin que nadie lo haya borrado. Este archivo es la
 * única red que hay, y no necesita cuenta, servidor ni nube.
 *
 * Restaurar **sustituye**: es lo que significa restaurar una copia. Por eso pasa
 * siempre por una confirmación que dice, con números, qué se va a perder.
 */
export function BackupControls() {
  const { exportBackup } = useAxtlhetics()
  const [working, setWorking] = useState(false)

  const download = async () => {
    setWorking(true)
    const file = await exportBackup()
    setWorking(false)
    if (!file) return

    /*
     * La descarga se dispara desde aquí y no desde el estado de aplicación: crear
     * un enlace y pulsarlo es trabajo del DOM, y el store no toca el DOM.
     */
    const url = URL.createObjectURL(new Blob([file.json], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-10 border-t border-border px-6 pt-6">
      <SectionTitle>Copia de seguridad</SectionTitle>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        Tus datos viven solo en este dispositivo. Si el navegador libera espacio o
        cambias de teléfono, se pierden. Descarga una copia de vez en cuando y
        guárdala donde quieras.
      </p>

      <button
        type="button"
        onClick={() => void download()}
        disabled={working}
        className="ax-press mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[14px] font-semibold disabled:opacity-40"
      >
        <Download className="h-[18px] w-[18px]" strokeWidth={2} />
        Descargar una copia
      </button>

      <RestoreFlow className="mt-2" />

      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        El archivo incluye tus entrenamientos, tu recuperación, tus tests de
        evolución, los resultados de tus escaneos (sin fotos) y tus conversaciones
        con AXIS. Es para ti, no para compartir.
      </p>
    </div>
  )
}

/**
 * Restaurar desde el arranque, antes de que exista un perfil.
 *
 * Es el momento en que **más** falta hace: teléfono nuevo, o almacenamiento
 * desalojado. Sin esto habría que completar el onboarding entero para llegar a
 * Perfil y que la restauración lo borrase acto seguido. Discreto a propósito: la
 * primera vez de verdad, que es lo habitual, no debe competir con esto.
 */
export function RestoreFromBackup() {
  return (
    <RestoreFlow
      label="Ya tengo una copia de seguridad"
      className="mt-4 border-0 bg-transparent text-[13.5px] font-semibold text-primary"
    />
  )
}

/**
 * Elegir archivo → validarlo → confirmar → restaurar.
 *
 * Vive aparte de `BackupControls` porque se usa desde dos sitios con la misma
 * semántica y distinto envoltorio. El archivo se interpreta **entero** antes de
 * enseñar nada: no se confirma a ciegas algo que luego resultará ilegible.
 */
function RestoreFlow({ label = 'Restaurar desde una copia', className }: {
  label?: string
  className?: string
}) {
  const { importBackup } = useAxtlhetics()
  const fileInput = useRef<HTMLInputElement | null>(null)

  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    contents: BackupContents
    counts: BackupCounts
    discarded: number
  } | null>(null)

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // El input se vacía siempre: si no, elegir el mismo archivo dos veces seguidas
    // no dispararía el cambio la segunda vez.
    event.target.value = ''
    if (!file) return

    setProblem(null)
    setPending(null)
    setWorking(true)

    const reader = new FileReader()
    reader.onerror = () => {
      setWorking(false)
      setProblem('No se ha podido leer ese archivo.')
    }
    reader.onload = () => {
      setWorking(false)
      let raw: unknown
      try {
        raw = JSON.parse(String(reader.result))
      } catch {
        setProblem(BACKUP_REJECTION_MESSAGES.no_es_json)
        return
      }

      const result = parseBackup(raw)
      if (!result.ok) {
        setProblem(BACKUP_REJECTION_MESSAGES[result.reason])
        return
      }
      setPending({ contents: result.contents, counts: result.counts, discarded: result.discarded })
    }
    reader.readAsText(file)
  }

  if (pending) {
    return (
      <RestoreConfirmation
        counts={pending.counts}
        discarded={pending.discarded}
        busy={working}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          setWorking(true)
          const ok = await importBackup(pending.contents)
          // Si sale bien, la página se recarga y esto desaparece con ella.
          if (!ok) {
            setWorking(false)
            setPending(null)
          }
        }}
      />
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={working}
        className={cn(
          'ax-press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[14px] font-semibold disabled:opacity-40',
          className,
        )}
      >
        <Upload className="h-[18px] w-[18px]" strokeWidth={2} />
        {label}
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        onChange={chooseFile}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {problem && (
        <p role="alert" className="ax-enter mt-3 text-[13px] leading-relaxed text-error">
          {problem}
        </p>
      )}
    </>
  )
}

/**
 * Confirmación de la restauración.
 *
 * Mismo criterio que el borrado de datos: la confirmación es parte de la
 * pantalla y dice con números qué se va a perder. Restaurar no es menos
 * destructivo que borrar, solo lo parece porque llega algo a cambio.
 */
function RestoreConfirmation({
  counts,
  discarded,
  busy,
  onCancel,
  onConfirm,
}: {
  counts: BackupCounts
  discarded: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { sessions, profile, assessments, scans } = useAxtlhetics()
  // Importar reemplaza (D-015): los tests de evolución de este dispositivo se
  // pierden aunque la copia sea de schema 1 y no traiga ninguno.
  const current = {
    sessions: sessions.length,
    assessments: assessments.assessments.length,
    scans: scans.scans.length,
    profile: profile !== null,
  }
  const hasSomethingToLose = current.sessions > 0 || current.assessments > 0 || current.scans > 0 || current.profile

  return (
    <div className="ax-enter mt-4 rounded-2xl border border-border bg-surface p-4">
      <p className="text-[14px] font-semibold">Restaurar esta copia</p>

      <p className="mt-2 text-[13.5px] leading-relaxed">La copia trae {describe(counts)}.</p>

      {hasSomethingToLose ? (
        <p className="mt-2 text-[13.5px] leading-relaxed">
          {/* El sujeto es «restaurarla»: concuerda igual con uno o con varios. */}
          Restaurarla sustituirá{' '}
          <span className="font-semibold">
            {describeCurrent(current)}
          </span>
          . <span className="font-semibold">No se puede deshacer.</span>
        </p>
      ) : (
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Ahora mismo no hay nada guardado en este dispositivo, así que no se pierde nada.
        </p>
      )}

      {discarded > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          {discarded === 1
            ? 'Un registro del archivo no se ha entendido y no se restaurará.'
            : `${discarded} registros del archivo no se han entendido y no se restaurarán.`}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="ax-press h-12 flex-1 rounded-2xl border border-border bg-background text-[14px] font-semibold disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="ax-press h-12 flex-1 rounded-2xl bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? 'Restaurando…' : 'Restaurar'}
        </button>
      </div>
    </div>
  )
}

/** «12 entrenamientos, 30 días de recuperación y tu perfil». */
function describe(counts: BackupCounts): string {
  const parts: string[] = []

  if (counts.sessions > 0) {
    parts.push(counts.sessions === 1 ? '1 entrenamiento' : `${counts.sessions} entrenamientos`)
  }
  if (counts.recovery > 0) {
    parts.push(
      counts.recovery === 1 ? '1 día de recuperación' : `${counts.recovery} días de recuperación`,
    )
  }
  if (counts.activities > 0) {
    parts.push(counts.activities === 1 ? '1 actividad' : `${counts.activities} actividades`)
  }
  // Tests de evolución (D-021). Las copias de schema 1 no traen ninguno.
  if (counts.assessments > 0) {
    parts.push(
      counts.assessments === 1 ? '1 test de evolución' : `${counts.assessments} tests de evolución`,
    )
  }
  // Escaneos corporales (D-023). Las copias anteriores a schema 3 no traen ninguno.
  if (counts.scans > 0) {
    parts.push(counts.scans === 1 ? '1 escaneo corporal' : `${counts.scans} escaneos corporales`)
  }
  if (counts.profile) parts.push('tu perfil')

  if (parts.length === 0) return 'nada'
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/**
 * Lo que hay ahora mismo y se va a perder: «tus 3 entrenamientos guardados, tus
 * 2 tests de evolución y tu perfil».
 */
function describeCurrent(current: { sessions: number; assessments: number; scans: number; profile: boolean }): string {
  const parts: string[] = []

  if (current.sessions > 0) {
    parts.push(
      current.sessions === 1
        ? 'tu entrenamiento guardado'
        : `tus ${current.sessions} entrenamientos guardados`,
    )
  }
  if (current.assessments > 0) {
    parts.push(
      current.assessments === 1
        ? 'tu test de evolución'
        : `tus ${current.assessments} tests de evolución`,
    )
  }
  if (current.scans > 0) {
    // Con sus fotos: las miniaturas no viajan en la copia, así que se pierden.
    parts.push(current.scans === 1 ? 'tu escaneo corporal y sus fotos' : `tus ${current.scans} escaneos corporales y sus fotos`)
  }
  if (current.profile) parts.push('tu perfil')

  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}
