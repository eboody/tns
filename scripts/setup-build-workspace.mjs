import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

async function main() {
  const options = parseOptions(process.argv.slice(2))

  await assertFileExists(path.join(repoRoot, 'package-lock.json'))
  await run('npm', ['ci'])

  const stageArgs = ['./scripts/stage-ort-runtime.mjs']
  if (options.allTargets) {
    stageArgs.push('--all-targets')
  }
  await run('node', stageArgs)

  if (!options.skipCargoFetch) {
    await run('cargo', ['fetch', '--manifest-path', 'src-tauri/Cargo.toml'])
  }

  console.log('workspace is staged for Tauri builds')
  if (options.allTargets) {
    console.log('staged ONNX Runtime assets for linux-x64, macos-arm64, and windows-x64')
    console.log('use npm run stage:runtime:linux:arm64 or npm run stage:runtime:windows:arm64 immediately before an arm64 package build')
  } else {
    console.log('staged ONNX Runtime assets for the host platform')
  }
  console.log('build examples: npm run bundle:linux | npm run bundle:macos | npm run bundle:windows')
  console.log('OCR packaging: stage pdftoppm plus ocrs/tesseract with npm run stage:ocr, then use bundle:*:ocr')
}

function parseOptions(argv) {
  const options = {
    allTargets: true,
    skipCargoFetch: false,
  }

  for (const arg of argv) {
    if (arg === '--host-target') {
      options.allTargets = false
      continue
    }
    if (arg === '--all-targets') {
      options.allTargets = true
      continue
    }
    if (arg === '--skip-cargo-fetch') {
      options.skipCargoFetch = true
      continue
    }
    throw new Error(`unknown setup option: ${arg}`)
  }

  return options
}

async function run(command, args) {
  console.log(`$ ${[command, ...args].join(' ')}`)
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', (error) => {
      reject(new Error(`failed to start ${command}: ${error.message}`))
    })
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? `exit code ${code}`}`))
    })
  })
}

async function assertFileExists(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`expected file does not exist: ${filePath}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
