import { access, chmod, cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const ocrDir = path.join(repoRoot, 'ml', 'ocr')
const binDir = path.join(ocrDir, 'bin')
const tessdataDir = path.join(ocrDir, 'tessdata')

const TOOL_SPECS = [
  { name: 'pdftoppm', env: 'TNS_PDFTOPPM_SOURCE', requiredForComplete: true },
  { name: 'ocrs', env: 'TNS_OCRS_SOURCE', requiredForComplete: false },
  { name: 'tesseract', env: 'TNS_TESSERACT_SOURCE', requiredForComplete: false },
]

async function main() {
  const options = parseOptions(process.argv.slice(2))

  await mkdir(binDir, { recursive: true })
  await mkdir(tessdataDir, { recursive: true })

  if (options.clear) {
    await clearStagedOcrRuntime()
  }

  if (!options.checkOnly) {
    await stageTools(options)
    await stageTessdata(options)
  }

  await reportStagedRuntime(options)
}

function parseOptions(argv) {
  const options = {
    binSource: process.env.TNS_OCR_BIN_SOURCE?.trim() || null,
    tessdataSource: process.env.TNS_TESSDATA_SOURCE?.trim() || null,
    fromHost: false,
    checkOnly: false,
    requireComplete: false,
    clear: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--bin-source') {
      options.binSource = readOptionValue(argv, ++index, arg)
      continue
    }
    if (arg === '--tessdata-source') {
      options.tessdataSource = readOptionValue(argv, ++index, arg)
      continue
    }
    if (arg === '--from-host') {
      options.fromHost = true
      continue
    }
    if (arg === '--check-only') {
      options.checkOnly = true
      continue
    }
    if (arg === '--require-complete') {
      options.requireComplete = true
      continue
    }
    if (arg === '--clear') {
      options.clear = true
      continue
    }
    throw new Error(`unknown OCR staging option: ${arg}`)
  }

  return options
}

function readOptionValue(argv, index, flag) {
  const value = argv[index]
  if (!value) {
    throw new Error(`missing value for ${flag}`)
  }
  return value
}

async function stageTools(options) {
  for (const spec of TOOL_SPECS) {
    const source = await resolveToolSource(spec, options)
    if (!source) {
      continue
    }

    await assertFile(source, `${spec.name} source is not a file: ${source}`)
    const destination = path.join(binDir, executableFileName(spec.name))
    await cp(source, destination)
    if (process.platform !== 'win32') {
      await chmod(destination, 0o755)
    }
    console.log(`staged OCR tool ${spec.name}: ${destination}`)
  }
}

async function resolveToolSource(spec, options) {
  const explicit = process.env[spec.env]?.trim()
  if (explicit) {
    return explicit
  }

  if (options.binSource) {
    const candidate = path.join(options.binSource, executableFileName(spec.name))
    if (await exists(candidate)) {
      return candidate
    }
  }

  if (options.fromHost) {
    return which(spec.name)
  }

  return null
}

async function stageTessdata(options) {
  if (!options.tessdataSource) {
    return
  }

  await assertDirectory(
    options.tessdataSource,
    `Tesseract tessdata source is not a directory: ${options.tessdataSource}`
  )
  await rm(tessdataDir, { recursive: true, force: true })
  await cp(options.tessdataSource, tessdataDir, { recursive: true })
  console.log(`staged Tesseract tessdata: ${tessdataDir}`)
}

async function reportStagedRuntime(options) {
  const stagedTools = []
  for (const spec of TOOL_SPECS) {
    const stagedPath = path.join(binDir, executableFileName(spec.name))
    if (await exists(stagedPath)) {
      stagedTools.push(spec.name)
    }
  }

  const hasTessdata = await directoryHasEntries(tessdataDir)
  const hasPdfRasterizer = stagedTools.includes('pdftoppm')
  const hasOcrEngine = stagedTools.includes('ocrs') || stagedTools.includes('tesseract')

  if (stagedTools.length > 0) {
    console.log(`staged OCR tools: ${stagedTools.join(', ')}`)
  } else {
    console.log('no OCR tools are staged yet')
  }

  if (hasTessdata) {
    console.log('staged Tesseract tessdata directory')
  }

  if (stagedTools.includes('tesseract') && !hasTessdata) {
    console.warn('warning: staged tesseract without tessdata; set TNS_TESSDATA_SOURCE or pass --tessdata-source')
  }

  if (options.requireComplete && (!hasPdfRasterizer || !hasOcrEngine)) {
    throw new Error(
      'OCR runtime is incomplete: stage pdftoppm plus either ocrs or tesseract before an OCR-enabled package build'
    )
  }

  if (!hasPdfRasterizer || !hasOcrEngine) {
    console.log(
      'OCR-enabled packages need pdftoppm plus either ocrs or tesseract. Use TNS_OCR_BIN_SOURCE, individual TNS_*_SOURCE variables, or --from-host to stage tools.'
    )
  }
}

async function clearStagedOcrRuntime() {
  await rm(binDir, { recursive: true, force: true })
  await rm(tessdataDir, { recursive: true, force: true })
  await mkdir(binDir, { recursive: true })
  await mkdir(tessdataDir, { recursive: true })
}

function executableFileName(name) {
  return process.platform === 'win32' ? `${name}.exe` : name
}

async function which(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(lookup, [command])
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null
  } catch {
    return null
  }
}

async function assertFile(filePath, message) {
  const info = await stat(filePath).catch(() => null)
  if (!info?.isFile()) {
    throw new Error(message)
  }
}

async function assertDirectory(filePath, message) {
  const info = await stat(filePath).catch(() => null)
  if (!info?.isDirectory()) {
    throw new Error(message)
  }
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function directoryHasEntries(directory) {
  const entries = await readdir(directory).catch(() => [])
  return entries.length > 0
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
