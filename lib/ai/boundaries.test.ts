import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import test from 'node:test'

/**
 * Los límites que separan la IA del resto del sistema.
 *
 * Estos tests no comprueban comportamiento, comprueban que nadie ha cruzado una
 * línea: la credencial fuera del cliente, el SDK fuera del navegador, el dominio
 * sin saber quién es el proveedor. Son las reglas que se rompen sin querer seis
 * meses después, cuando ya nadie recuerda por qué estaban.
 */

const ROOT = new URL('../../', import.meta.url)

/** Todos los archivos de código del proyecto, sin dependencias ni artefactos. */
function sourceFiles(dir = ROOT, acc: string[] = []): string[] {
  const IGNORED = new Set(['node_modules', '.next', 'out', '.git', '.vercel', '.netlify', 'docs'])

  for (const entry of readdirSync(dir)) {
    if (IGNORED.has(entry)) continue

    const url = new URL(entry + '/', dir)
    const path = url.pathname
    const isDirectory = statSync(new URL(entry, dir)).isDirectory()

    if (isDirectory) {
      sourceFiles(url, acc)
    } else if (/\.(ts|tsx|mts|js|mjs|css)$/.test(entry)) {
      acc.push(path.replace(/\/$/, ''))
    }
  }
  return acc
}

function read(path: string): string {
  return readFileSync(new URL('file://' + path), 'utf8')
}

const ALL = sourceFiles()

/**
 * Depender del proveedor es importarlo o llamarlo.
 *
 * No es nombrarlo en un comentario: explicar por qué una decisión está tomada es
 * justo lo contrario de acoplarse a ella.
 */
/** Rastro del proveedor actual (Groq) y del anterior (Gemini): ninguno puede salir de la función. */
const PROVIDER_DEPENDENCY = /api\.groq\.com|groq-sdk|from 'groq|@google\/genai|GoogleGenAI|generativelanguage\.googleapis\.com/

/**
 * Herramientas que se ejecutan a mano en desarrollo (`scripts/`). No se
 * despliegan ni entran en el bundle; una de ellas lee la credencial a propósito
 * para probar el proveedor en vivo.
 */
const DEV_TOOLS = (path: string) => path.includes('/scripts/')

/** Lo que acaba en el navegador: la app de Next, sin la ruta de servidor. */
const CLIENT = ALL.filter(
  (path) =>
    !path.includes('/app/api/') &&
    !path.includes('/lib/ai/') &&
    !DEV_TOOLS(path) &&
    !path.endsWith('.test.ts'),
)

// ---------------------------------------------------------------------------
// La credencial
// ---------------------------------------------------------------------------

test('el proyecto tiene archivos que revisar', () => {
  assert.ok(ALL.length > 30, `solo se han encontrado ${ALL.length} archivos`)
  assert.ok(CLIENT.length > 20)
})

test('ningún archivo del cliente menciona la clave del proveedor', () => {
  for (const path of CLIENT) {
    assert.doesNotMatch(
      read(path),
      /GROQ_API_KEY|GEMINI_API_KEY/,
      `${path} menciona la credencial y acaba en el navegador`,
    )
  }
})

test('no existe ninguna variable pública con la clave', () => {
  for (const path of ALL) {
    assert.doesNotMatch(
      read(path),
      /NEXT_PUBLIC_[A-Z_]*(GROQ|GEMINI|API_KEY|GENAI)/,
      `${path}: NEXT_PUBLIC_* acaba dentro del bundle, a la vista de cualquiera`,
    )
  }
})

test('no hay ninguna clave escrita a mano en el repositorio', () => {
  // Las claves de Groq empiezan por gsk_; las de Google por AIza y tienen 39 caracteres.
  for (const path of ALL) {
    assert.doesNotMatch(read(path), /gsk_[0-9A-Za-z]{20,}|AIza[0-9A-Za-z_-]{35}/, `${path} parece contener una API key`)
  }
})

test('solo la función de servidor lee la credencial', () => {
  // Los tests quedan fuera: la regla es sobre el código que se despliega, y su
  // propio test necesita manipular la variable para comprobar que falta.
  const lectores = ALL.filter(
    (path) =>
      !path.endsWith('.test.ts') &&
      !DEV_TOOLS(path) &&
      /process\.env\.(GROQ|GEMINI)_API_KEY/.test(read(path)),
  )

  assert.deepEqual(
    lectores.map((path) => path.split('/').slice(-3).join('/')),
    ['api/axis-ai/route.ts'],
  )
})

// ---------------------------------------------------------------------------
// El SDK
// ---------------------------------------------------------------------------

test('el proveedor no se toca desde el cliente', () => {
  for (const path of CLIENT) {
    assert.doesNotMatch(
      read(path),
      /@google\/genai/,
      `${path} importa el SDK y acaba en el navegador`,
    )
  }
})

test('solo el proxy de servidor —contrato y función— conoce al proveedor', () => {
  const emisores = ALL.filter(
    (path) => !path.endsWith('.test.ts') && PROVIDER_DEPENDENCY.test(read(path)),
  )

  // El contrato es el único sitio donde está escrita la URL del proveedor; la
  // función la usa a través de él y es la única que llama. Nadie más.
  assert.deepEqual(
    emisores.map((path) => path.split('/').slice(-2).join('/')),
    ['ai/provider-contract.ts'],
  )

  const funcion = read(ALL.find((path) => path.endsWith('api/axis-ai/route.ts'))!)
  assert.match(funcion, /PROVIDER_ENDPOINT/)
  assert.match(funcion, /fetch\(PROVIDER_ENDPOINT/)

  const otrosConFetch = ALL.filter(
    (path) =>
      !path.endsWith('.test.ts') &&
      !path.endsWith('api/axis-ai/route.ts') &&
      /fetch\(PROVIDER_ENDPOINT|api\.groq\.com\/openai/.test(read(path)) &&
      !path.endsWith('ai/provider-contract.ts'),
  )
  assert.deepEqual(otrosConFetch, [], 'nadie más llama al proveedor')
})

test('la ruta de servidor no arrastra dependencias que haya que empaquetar', () => {
  /*
   * Se llama a la API REST con fetch a propósito: sin SDK del proveedor ni
   * paquetes en la función. Este test evita que vuelvan a entrar sin darse
   * cuenta.
   */
  const source = read(ALL.find((path) => path.endsWith('api/axis-ai/route.ts'))!)
  const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1])

  assert.ok(imports.length > 0, 'algo importará')

  for (const imported of imports) {
    assert.ok(
      imported.startsWith('.') || imported.startsWith('node:'),
      `la función importa un paquete externo: ${imported}`,
    )
  }
})

test('la credencial y el proveedor no aparecen en el bundle del navegador', () => {
  // Si el build existe, se comprueba que los chunks del cliente no lo llevan dentro.
  let chunks: string[]
  try {
    chunks = sourceFiles(new URL('.next/static/chunks/', ROOT))
  } catch {
    return // Sin build todavía: nada que comprobar.
  }

  for (const chunk of chunks) {
    assert.doesNotMatch(read(chunk), /GROQ_API_KEY|GEMINI_API_KEY|api\.groq\.com/, `${chunk} lleva la credencial o el proveedor`)
  }
})

// ---------------------------------------------------------------------------
// El dominio no sabe quién es el proveedor
// ---------------------------------------------------------------------------

test('la conversación de AXIS no conoce al proveedor, ni al hosting, ni a React', () => {
  const conversacion = ALL.filter(
    (path) => path.includes('/domain/axis/conversation/') && !path.endsWith('.test.ts'),
  )

  assert.ok(conversacion.length >= 4, 'deben existir los módulos de conversación')

  for (const path of conversacion) {
    const source = read(path)
    // Lo que importa es que no DEPENDA del proveedor ni del hosting. Nombrarlos
    // en un comentario para explicar por qué algo está así no es acoplamiento:
    // es justo lo contrario.
    assert.doesNotMatch(source, PROVIDER_DEPENDENCY, `${path} depende del proveedor`)
    assert.doesNotMatch(source, /from '[^']*(netlify|vercel|app\/api)/i, `${path} importa algo del hosting`)
    assert.doesNotMatch(source, /from 'react'|useState|useEffect/, `${path} toca React`)
    assert.doesNotMatch(source, /indexedDB|getRepositories/, `${path} toca la persistencia`)
  }
})

test('todo AXIS —motor, conocimiento, personalidad y seguridad— es puro: sin React ni persistencia', () => {
  const axis = ALL.filter((path) => path.includes('/domain/axis/') && !path.endsWith('.test.ts'))

  assert.ok(axis.length >= 15, 'deben existir los módulos de AXIS')

  for (const path of axis) {
    const source = read(path)
    assert.doesNotMatch(source, /from 'react'|useState|useEffect|useRef/, `${path} toca React`)
    assert.doesNotMatch(source, /indexedDB|getRepositories|from '[^']*\/data\//, `${path} toca la persistencia`)
    assert.doesNotMatch(source, /from '[^']*\/state\//, `${path} toca el estado de la aplicación`)
    assert.doesNotMatch(source, /from '[^']*(netlify|vercel|app\/api)/i, `${path} importa algo del hosting`)
  }
})

test('el dominio entero es independiente del proveedor de IA', () => {
  const dominio = ALL.filter((path) => path.includes('/lib/domain/') && !path.endsWith('.test.ts'))

  for (const path of dominio) {
    assert.doesNotMatch(read(path), PROVIDER_DEPENDENCY, `${path} depende del proveedor`)
  }
})

test('la ruta de servidor no importa React ni el estado de la aplicación', () => {
  const source = read(ALL.find((path) => path.endsWith('api/axis-ai/route.ts'))!)

  assert.doesNotMatch(source, /from 'react'/)
  assert.doesNotMatch(source, /lib\/state/)
  assert.doesNotMatch(source, /indexedDB/)
})

// ---------------------------------------------------------------------------
// El proxy no guarda nada
// ---------------------------------------------------------------------------

test('la ruta no persiste conversaciones ni añade analítica', () => {
  const source = read(ALL.find((path) => path.endsWith('api/axis-ai/route.ts'))!)

  for (const prohibido of [/supabase/i, /createClient/, /analytics/i, /\btrack\(/, /writeFile/]) {
    assert.doesNotMatch(source, prohibido, 'el proxy no debe guardar nada')
  }
})

test('el ejemplo de entorno no contiene una clave real', () => {
  const ejemplo = readFileSync(new URL('.env.example', ROOT), 'utf8')

  assert.match(ejemplo, /GROQ_API_KEY=\s*$/m, 'debe quedar vacía')
  assert.doesNotMatch(ejemplo, /gsk_|AIza/)
})

test('.env.local está ignorado por git', () => {
  const ignore = readFileSync(new URL('.gitignore', ROOT), 'utf8')
  assert.match(ignore, /\.env\*?\.local|\.env\.local/)
})

// ---------------------------------------------------------------------------
// El proveedor es Groq, y solo lo sabe la función
// ---------------------------------------------------------------------------

test('el proveedor anterior ya no se utiliza en ningún sitio', () => {
  for (const path of ALL) {
    if (path.endsWith('.test.ts')) continue
    assert.doesNotMatch(read(path), /gemini|GoogleGenAI|generativelanguage/i, `${path} sigue nombrando al proveedor anterior`)
  }
  const envExample = readFileSync(new URL('.env.example', ROOT), 'utf8')
  assert.doesNotMatch(envExample, /GEMINI/)
  assert.match(envExample, /GROQ_API_KEY=/)
})

test('lib/domain/axis no importa nada del proveedor', () => {
  const dominioAxis = ALL.filter((path) => path.includes('/lib/domain/axis/') && !path.endsWith('.test.ts'))
  assert.ok(dominioAxis.length >= 15)
  for (const path of dominioAxis) {
    const imports = read(path).match(/^import .*$/gm)?.join('\n') ?? ''
    assert.doesNotMatch(imports, /groq|lib\/ai\/|provider-contract|netlify|vercel|app\/api/i, `${path} importa al proveedor`)
    assert.doesNotMatch(read(path), /api\.groq\.com|GROQ_API_KEY|gpt-oss/i, `${path} conoce al proveedor`)
  }
})
