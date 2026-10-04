/**
 * Un descanso guardado como dos instantes (D-019).
 *
 * Se guarda cuándo empezó y cuándo acaba, no una cuenta atrás: así, al recargar,
 * sigue donde iba. Lo comparten el entrenamiento y el test de evolución (D-021),
 * que descansan igual.
 */

export type RestWindow = { startedAt: string; endsAt: string }

export type RestState = {
  /** Segundos que quedan, redondeados hacia arriba: «0:01» hasta que acaba. */
  remainingSeconds: number
  /** Duración total del descanso, incluidas las ampliaciones. */
  totalSeconds: number
}

/** Un descanso que empieza ahora y dura `seconds`. */
export function startRestWindow(seconds: number, now: Date = new Date()): RestWindow {
  return {
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + seconds * 1000).toISOString(),
  }
}

/** Lo que queda de descanso. `null` si no hay o ya terminó. */
export function restRemaining(rest: RestWindow | null | undefined, now: Date = new Date()): RestState | null {
  if (!rest) return null
  const endsAt = new Date(rest.endsAt).getTime()
  const startedAt = new Date(rest.startedAt).getTime()
  const remainingMs = endsAt - now.getTime()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null
  return {
    remainingSeconds: Math.ceil(remainingMs / 1000),
    totalSeconds: Math.max(1, Math.round((endsAt - startedAt) / 1000)),
  }
}

/** Alarga un descanso que sigue en curso. Uno terminado no se resucita. */
export function extendRestWindow(rest: RestWindow, seconds: number, now: Date = new Date()): RestWindow | null {
  if (!restRemaining(rest, now)) return null
  const endsAt = new Date(new Date(rest.endsAt).getTime() + seconds * 1000)
  return { ...rest, endsAt: endsAt.toISOString() }
}

/** Segundos que añade «+15 s» al descanso. */
export const REST_EXTENSION_SECONDS = 15
