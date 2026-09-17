/**
 * Conocimiento de AXIS: deportes y actividades.
 *
 * Cómo nombra el usuario lo que hace fuera de la app, y qué carga cada cosa.
 * Nadie escribe el nombre exacto que puso en el onboarding: si registró
 * «Baloncesto», dirá «básquet». Todo lo que hay aquí es vocabulario y tablas;
 * qué hacer con ello lo deciden `negotiation.ts` e `intents.ts`.
 *
 * Una sola lista por concepto. Si un deporte falta, se añade aquí y lo ven la
 * detección de intención y la negociación a la vez.
 */

/** Deportes y sus variantes habituales. */
export const SPORT_TERMS: readonly string[] = [
  'baloncesto', 'basquet', 'básquet', 'basket',
  'futbol', 'fútbol',
  'natacion', 'natación', 'piscina',
  'tenis', 'padel', 'pádel',
  'balonmano', 'voley', 'vóley',
  'atletismo', 'gimnasia',
]

/** Palabras genéricas con las que se nombra una actividad del calendario. */
export const ACTIVITY_TERMS: readonly string[] = [
  'entreno', 'entrenamiento', 'partido', 'clase', 'sesion', 'sesión',
  'competicion', 'competición',
]

/** Cualquier mención a una actividad, con nombre o sin él. */
export const ACTIVITY_MENTION_TERMS: readonly string[] = [...ACTIVITY_TERMS, ...SPORT_TERMS]

/**
 * Actividades que el usuario puede contar haber hecho, y qué grupos cargan.
 *
 * Es lo que permite que «ayer hice 20 km de bici» cuente como carga de piernas
 * aunque no haya ningún registro.
 */
export const REPORTED_ACTIVITY_LOADS: readonly {
  terms: readonly string[]
  muscleGroups: readonly string[]
}[] = [
  { terms: ['bici', 'bicicleta', 'ciclismo', 'spinning'], muscleGroups: ['piernas', 'gluteos'] },
  { terms: ['corr', 'running', 'trote', 'maraton', 'maratón'], muscleGroups: ['piernas', 'gluteos'] },
  { terms: ['andar', 'caminar', 'senderismo', 'montaña', 'montana'], muscleGroups: ['piernas'] },
  { terms: ['partido', 'baloncesto', 'futbol', 'fútbol', 'basket', 'tenis', 'padel', 'pádel'], muscleGroups: ['piernas', 'gluteos'] },
  { terms: ['natacion', 'natación', 'nadar', 'piscina'], muscleGroups: ['espalda', 'hombros'] },
  { terms: ['escalada', 'escalar'], muscleGroups: ['espalda', 'brazos'] },
]

/** Señales de que lo contado fue exigente. */
export const EFFORT_TERMS: readonly string[] = [
  'km', 'kilometro', 'kilómetro', 'montaña', 'montana', 'intenso', 'duro', 'fuerte',
  'largo', 'competicion', 'competición', 'partido',
]
