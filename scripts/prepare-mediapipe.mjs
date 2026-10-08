/**
 * Recursos del modelo de pose (D-023), servidos desde la propia app.
 *
 * El escáner analiza las fotos en el dispositivo: ni la imagen ni nada derivado
 * de ella sale hacia un servidor. Para eso el navegador necesita el motor wasm
 * de MediaPipe y el modelo, y los dos se sirven desde `public/mediapipe/`, el
 * mismo origen de la app (y así funcionan sin conexión).
 *
 * - El wasm se copia del paquete instalado: siempre coincide con su versión.
 * - El modelo se descarga una vez, de una URL con versión fija, y se comprueba
 *   su SHA-256. Si no coincide, el build falla: nunca se sirve un modelo que no
 *   sea exactamente el validado.
 *
 * Los dos están en `.gitignore`: pesan decenas de MB y se regeneran en cada build.
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'public', 'mediapipe')

const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

const MODEL = {
  file: 'pose_landmarker_full.task',
  url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

mkdirSync(join(target, 'wasm'), { recursive: true })

const wasmSource = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
for (const file of WASM_FILES) copyFileSync(join(wasmSource, file), join(target, 'wasm', file))

const modelPath = join(target, MODEL.file)
if (!existsSync(modelPath) || sha256(readFileSync(modelPath)) !== MODEL.sha256) {
  const response = await fetch(MODEL.url)
  if (!response.ok) throw new Error(`No se pudo descargar el modelo de pose (${response.status}).`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const actual = sha256(buffer)
  if (actual !== MODEL.sha256) throw new Error(`El modelo de pose no es el validado (sha256 ${actual}).`)
  writeFileSync(modelPath, buffer)
}

console.log('[mediapipe] wasm y modelo de pose listos en public/mediapipe')
