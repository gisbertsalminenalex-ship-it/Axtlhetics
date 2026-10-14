/**
 * Protocolo del escáner corporal (D-023): qué fotos se piden, en qué orden y
 * cómo se hacen. Un único sitio para el flujo, el historial y AXIS.
 */

import type { ScanPose } from './measure'

export type ScanPoseGuide = { pose: ScanPose; name: string; how: string }

export const SCAN_POSE_GUIDE: readonly ScanPoseGuide[] = [
  { pose: 'front', name: 'De frente', how: 'De pie, mirando a la cámara, con los brazos y las piernas un poco separados, sin que se toquen. Ropa ajustada, cuerpo entero en la foto y el móvil apoyado a la altura del pecho.' },
  { pose: 'side', name: 'De perfil', how: 'De pie, de lado a la cámara, mirando al frente y relajado, con los brazos caídos a los costados. Respira normal, sin meter ni sacar tripa. Cuerpo entero en la foto.' },
  { pose: 'squat_side', name: 'Sentadilla de perfil', how: 'De lado a la cámara, en el punto más bajo de tu sentadilla. Cuerpo entero en la foto.' },
  { pose: 'squat_front', name: 'Sentadilla de frente', how: 'Mirando a la cámara, en el punto más bajo de tu sentadilla. Piernas enteras en la foto.' },
  { pose: 'arms_up', name: 'Brazos arriba', how: 'De frente, con los brazos estirados por encima de la cabeza todo lo que puedas sin arquear la espalda.' },
  { pose: 'flex', name: 'Bíceps flexionado', how: 'Opcional. De frente, brazos en cruz a la altura de los hombros, codos doblados y puños hacia arriba, apretando el bíceps. Así se ve el pico del brazo.' },
]

/** Consejos que valen para todas las fotos: lo que más afecta a la medida. */
export const SCAN_PHOTO_TIPS: readonly string[] = [
  'Ropa ajustada, para que se vea la forma del cuerpo.',
  'El móvil apoyado y a la misma altura en todas las fotos.',
  'Buena luz y un fondo despejado.',
  'Dos o tres fotos de cada pose: así compruebo que la medida es estable.',
]
