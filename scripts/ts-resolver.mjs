/**
 * Resolución de imports para el runner de tests de Node.
 *
 * El dominio usa imports sin extensión, que es lo idiomático en Next. Node exige la
 * extensión explícita en ESM, así que este hook la añade solo cuando hace falta.
 * Es un fichero de 20 líneas para no meter una dependencia de test runner.
 */
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CANDIDATES = ['.ts', '.tsx', '/index.ts']

registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith('.')) return next(specifier, context)
    try {
      return next(specifier, context)
    } catch (error) {
      for (const suffix of CANDIDATES) {
        const candidate = new URL(specifier + suffix, context.parentURL)
        if (existsSync(fileURLToPath(candidate))) {
          return next(specifier + suffix, context)
        }
      }
      throw error
    }
  },
})
