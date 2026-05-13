import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat, copyFile, rename } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import AdmZip from 'adm-zip'
import * as tar from 'tar'

const execFileAsync = promisify(execFile)

const ORT_VERSION = '1.25.1'
const GITHUB_BASE = `https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}`
const DEFAULT_NER_BASE = 'https://huggingface.co/dslim/bert-base-NER/resolve/main/onnx'
const DEFAULT_MODEL_URL = `${DEFAULT_NER_BASE}/model.onnx`
const DEFAULT_TOKENIZER_URL = `${DEFAULT_NER_BASE}/tokenizer.json`
const DEFAULT_CONFIG_URL = `${DEFAULT_NER_BASE}/config.json`

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const modelDir = path.join(repoRoot, 'ml', 'ner')
const modelPath = path.join(modelDir, 'model.onnx')
const tokenizerPath = path.join(modelDir, 'tokenizer.json')
const configPath = path.join(modelDir, 'config.json')
const capiDir = path.join(repoRoot, 'ml', 'ner', 'site', 'onnxruntime', 'capi')

const TARGETS = {
  'linux-x64': {
    assetName: `onnxruntime-linux-x64-${ORT_VERSION}.tgz`,
    archiveType: 'tgz',
    files: {
      [`onnxruntime-linux-x64-${ORT_VERSION}/lib/libonnxruntime.so.1.25.1`]: 'libonnxruntime.so.1.25.1',
      [`onnxruntime-linux-x64-${ORT_VERSION}/lib/libonnxruntime_providers_shared.so`]: 'libonnxruntime_providers_shared.so',
    },
  },
  'linux-aarch64': {
    assetName: `onnxruntime-linux-aarch64-${ORT_VERSION}.tgz`,
    archiveType: 'tgz',
    files: {
      [`onnxruntime-linux-aarch64-${ORT_VERSION}/lib/libonnxruntime.so.1.25.1`]: 'libonnxruntime.so.1.25.1',
      [`onnxruntime-linux-aarch64-${ORT_VERSION}/lib/libonnxruntime_providers_shared.so`]: 'libonnxruntime_providers_shared.so',
    },
  },
  'macos-arm64': {
    assetName: `onnxruntime-osx-arm64-${ORT_VERSION}.tgz`,
    archiveType: 'tgz',
    files: {
      [`onnxruntime-osx-arm64-${ORT_VERSION}/lib/libonnxruntime.1.25.1.dylib`]: 'libonnxruntime.1.25.1.dylib',
    },
  },
  'windows-x64': {
    assetName: `onnxruntime-win-x64-${ORT_VERSION}.zip`,
    archiveType: 'zip',
    files: {
      [`onnxruntime-win-x64-${ORT_VERSION}/lib/onnxruntime.dll`]: 'onnxruntime.dll',
      [`onnxruntime-win-x64-${ORT_VERSION}/lib/onnxruntime_providers_shared.dll`]: 'onnxruntime_providers_shared.dll',
    },
  },
  'windows-arm64': {
    assetName: `onnxruntime-win-arm64-${ORT_VERSION}.zip`,
    archiveType: 'zip',
    files: {
      [`onnxruntime-win-arm64-${ORT_VERSION}/lib/onnxruntime.dll`]: 'onnxruntime.dll',
      [`onnxruntime-win-arm64-${ORT_VERSION}/lib/onnxruntime_providers_shared.dll`]: 'onnxruntime_providers_shared.dll',
    },
  },
}

const DEFAULT_BUILD_TARGETS = ['linux-x64', 'macos-arm64', 'windows-x64']

const STAGED_RUNTIME_FILES = [
  'libonnxruntime.so.1.25.1',
  'libonnxruntime_providers_shared.so',
  'libonnxruntime.1.25.1.dylib',
  'libonnxruntime_providers_shared.dylib',
  'onnxruntime.dll',
  'onnxruntime_providers_shared.dll',
]

async function main() {
  const argv = process.argv.slice(2)

  if (argv.includes('--model-only')) {
    await mkdir(modelDir, { recursive: true })
    await stageModelArtifacts()
    return
  }

  const targets = parseTargets(argv)
  await mkdir(modelDir, { recursive: true })
  await stageModelArtifacts()
  await mkdir(capiDir, { recursive: true })
  await clearStagedRuntimeFiles()

  for (const target of targets) {
    await stageRuntimeTarget(target)
  }
}

async function stageRuntimeTarget(target) {
  const spec = TARGETS[target]
  if (!spec) {
    throw new Error(`unsupported target: ${target}`)
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tns-ort-'))
  const archivePath = path.join(tempDir, spec.assetName)
  const extractDir = path.join(tempDir, 'extract')
  const assetUrl = `${GITHUB_BASE}/${spec.assetName}`

  console.log(`staging ONNX Runtime ${ORT_VERSION} for ${target}`)
  console.log(`download: ${assetUrl}`)

  await download(assetUrl, archivePath)
  await mkdir(extractDir, { recursive: true })
  await extractArchive(spec.archiveType, archivePath, extractDir)

  for (const [sourceRelativePath, destName] of Object.entries(spec.files)) {
    const sourcePath = path.join(extractDir, sourceRelativePath)
    await assertExists(sourcePath)
    const destPath = path.join(capiDir, destName)
    await copyFile(sourcePath, destPath)
    console.log(`staged ${destName}`)
  }

  await rm(tempDir, { recursive: true, force: true })
}

async function stageModelArtifacts() {
  const modelSource = process.env.TNS_NER_MODEL_SOURCE?.trim()
  const tokenizerSource = process.env.TNS_NER_TOKENIZER_SOURCE?.trim()
  const configSource = process.env.TNS_NER_CONFIG_SOURCE?.trim()

  if (modelSource) {
    await stageArtifact(modelSource, modelPath)
    console.log(`staged model.onnx from ${describeSource(modelSource)}`)
  } else {
    await stageDefaultArtifact(modelPath, DEFAULT_MODEL_URL, 'model.onnx')
  }

  if (tokenizerSource) {
    await stageArtifact(tokenizerSource, tokenizerPath)
    console.log(`staged tokenizer.json from ${describeSource(tokenizerSource)}`)
  } else {
    await stageDefaultArtifact(tokenizerPath, DEFAULT_TOKENIZER_URL, 'tokenizer.json')
  }

  if (configSource) {
    await stageArtifact(configSource, configPath)
    console.log(`staged config.json from ${describeSource(configSource)}`)
  } else {
    await stageDefaultArtifact(configPath, DEFAULT_CONFIG_URL, 'config.json')
  }
}

async function stageDefaultArtifact(destination, url, name) {
  try {
    await stat(destination)
    console.log(`using existing ${name}`)
    return
  } catch {
    // Missing artifact: fall through to download.
  }

  const tempPath = `${destination}.download`
  await rm(tempPath, { force: true })
  await download(url, tempPath)
  await rename(tempPath, destination)
  console.log(`downloaded ${name} from ${url}`)
}

function parseTarget(argv) {
  const argIndex = argv.findIndex((arg) => arg === '--target')
  if (argIndex !== -1) {
    const value = argv[argIndex + 1]
    if (!value) {
      throw new Error('missing value for --target')
    }
    return value
  }

  return detectHostTarget()
}

function parseTargets(argv) {
  if (argv.includes('--all-targets')) {
    return DEFAULT_BUILD_TARGETS
  }

  const explicitTarget = parseTarget(argv)
  if (explicitTarget === 'all') {
    return DEFAULT_BUILD_TARGETS
  }

  return [explicitTarget]
}

function detectHostTarget() {
  if (process.platform === 'linux') {
    if (process.arch === 'x64') return 'linux-x64'
    if (process.arch === 'arm64') return 'linux-aarch64'
  }

  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') return 'macos-arm64'
    throw new Error(
      'ONNX Runtime 1.25.1 release assets do not include macOS x64 binaries. Use Apple Silicon or supply a different runtime source.'
    )
  }

  if (process.platform === 'win32') {
    if (process.arch === 'x64') return 'windows-x64'
    if (process.arch === 'arm64') return 'windows-arm64'
  }

  throw new Error(`unsupported host platform/arch: ${process.platform}/${process.arch}`)
}

async function download(url, destination) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`failed to download ${url}: ${response.status} ${response.statusText}`)
  }
  await pipeline(response.body, createWriteStream(destination))
}

async function extractArchive(type, archivePath, extractDir) {
  if (type === 'tgz') {
    await tar.x({ file: archivePath, cwd: extractDir })
    return
  }

  if (type === 'zip') {
    const zip = new AdmZip(archivePath)
    zip.extractAllTo(extractDir, true)
    return
  }

  throw new Error(`unsupported archive type: ${type}`)
}

async function stageArtifact(source, destination) {
  if (isHttpUrl(source)) {
    await download(source, destination)
    return
  }

  await assertExistsWithHint(source, `artifact source does not exist: ${source}`)
  await copyFile(source, destination)
}

function isHttpUrl(value) {
  return value.startsWith('http://') || value.startsWith('https://')
}

function describeSource(source) {
  return isHttpUrl(source) ? `URL ${source}` : `path ${source}`
}

async function assertExists(filePath) {
  try {
    await stat(filePath)
  } catch {
    throw new Error(`expected runtime file missing from archive: ${filePath}`)
  }
}

async function assertExistsWithHint(filePath, message) {
  try {
    await stat(filePath)
  } catch {
    throw new Error(message)
  }
}

async function clearStagedRuntimeFiles() {
  const existing = await readdir(capiDir).catch(() => [])
  for (const fileName of existing) {
    if (STAGED_RUNTIME_FILES.includes(fileName)) {
      await rm(path.join(capiDir, fileName), { force: true })
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
