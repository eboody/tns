import { spawn } from 'node:child_process'
import path from 'node:path'

const cargoBin = path.join(process.env.HOME ?? '', '.cargo', 'bin')
const env = {
  ...process.env,
  PATH: cargoBin ? `${cargoBin}:${process.env.PATH ?? ''}` : process.env.PATH,
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error(
      'bundle:macos must run on macOS so it can package macOS-native OCR binaries. Use a Mac or the GitHub macOS workflow.'
    )
  }

  if (process.arch !== 'arm64') {
    throw new Error(
      `bundle:macos requires Apple Silicon because the packaged ONNX Runtime asset is macos-arm64; current arch is ${process.arch}`
    )
  }

  await ensureHomebrew()
  await ensurePdftoppm()
  await ensureCargo()
  await ensureOcrs()
}

async function ensureHomebrew() {
  if (await commandExists('brew')) {
    return
  }

  throw new Error(
    'Homebrew is required to install Poppler for OCR PDF rasterization. Install Homebrew, then rerun npm run bundle:macos.'
  )
}

async function ensurePdftoppm() {
  if (await commandExists('pdftoppm')) {
    console.log('found pdftoppm')
    return
  }

  console.log('pdftoppm is missing; installing Poppler with Homebrew')
  await run('brew', ['install', 'poppler'])
}

async function ensureCargo() {
  if (await commandExists('cargo')) {
    return
  }

  console.log('cargo is missing; installing Rust with Homebrew')
  await run('brew', ['install', 'rust'])
}

async function ensureOcrs() {
  if (await commandExists('ocrs')) {
    console.log('found ocrs')
    return
  }

  console.log('ocrs is missing; installing ocrs-cli with Cargo')
  await run('cargo', ['install', 'ocrs-cli', '--locked'])

  if (!(await commandExists('ocrs'))) {
    throw new Error(
      `installed ocrs-cli, but ocrs is still not on PATH. Expected it under ${cargoBin}. Add that directory to PATH and rerun npm run bundle:macos.`
    )
  }
}

async function commandExists(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'command'
  const args = process.platform === 'win32' ? [command] : ['-v', command]

  return new Promise((resolve) => {
    const child = spawn(lookup, args, {
      env,
      stdio: 'ignore',
      shell: process.platform !== 'win32',
    })

    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

async function run(command, args) {
  console.log(`$ ${[command, ...args].join(' ')}`)

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
