/**
 * Genera el par de claves VAPID de los avisos (D-044).
 *
 *   node scripts/generate-vapid.mjs
 *
 * Imprime VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en base64url. Van en las
 * variables de entorno de Vercel; la privada nunca en el repositorio. Cambiar
 * las claves invalida todas las suscripciones: cada móvil tiene que volver a
 * activar los avisos.
 */
import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' })
const priv = privateKey.export({ format: 'jwk' })
const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')])

console.log(`VAPID_PUBLIC_KEY=${point.toString('base64url')}`)
console.log(`VAPID_PRIVATE_KEY=${priv.d}`)
