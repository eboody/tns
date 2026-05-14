import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const iconDir = path.join(repoRoot, 'src-tauri', 'icons')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ICO_SIZES = [16, 32, 64, 256]
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]
const ICNS_TYPES = new Map([
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
  [1024, 'ic10'],
])

async function main() {
  await mkdir(iconDir, { recursive: true })

  const pngs = new Map(ICNS_SIZES.map((size) => [size, createPng(size)]))

  await writeFile(path.join(iconDir, 'icon.png'), pngs.get(1024))
  await writeFile(path.join(iconDir, 'icon.icns'), createIcns(pngs))
  await writeFile(path.join(iconDir, 'icon.ico'), createIco(pngs))

  console.log(`staged Tauri icons in ${iconDir}`)
}

function createPng(size) {
  const stride = size * 4
  const rows = []

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + stride)
    row[0] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(size, x, y)
      const offset = 1 + x * 4
      row[offset] = r
      row[offset + 1] = g
      row[offset + 2] = b
      row[offset + 3] = a
    }
    rows.push(row)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pixel(size, x, y) {
  const edge = size * 0.08
  const radius = size * 0.2
  const inRoundedSquare = insideRoundedRect(x, y, edge, edge, size - edge * 2, size - edge * 2, radius)
  if (!inRoundedSquare) {
    return [0, 0, 0, 0]
  }

  const shade = Math.round(28 + 34 * (x / Math.max(1, size - 1)) + 28 * (y / Math.max(1, size - 1)))
  const base = [19, 44 + shade, 73 + shade]
  const white = [244, 250, 252]
  const mark = isMarkPixel(size, x, y)
  const ring = isRingPixel(size, x, y)

  if (mark) {
    return [...white, 255]
  }
  if (ring) {
    return [76, 184, 196, 255]
  }
  return [...base, 255]
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width
  const bottom = top + height
  if (x < left || x >= right || y < top || y >= bottom) {
    return false
  }

  const cx = x < left + radius ? left + radius : x >= right - radius ? right - radius - 1 : x
  const cy = y < top + radius ? top + radius : y >= bottom - radius ? bottom - radius - 1 : y
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

function isMarkPixel(size, x, y) {
  const barTop = size * 0.29
  const barBottom = size * 0.41
  const barLeft = size * 0.25
  const barRight = size * 0.75
  const stemLeft = size * 0.44
  const stemRight = size * 0.56
  const stemBottom = size * 0.74

  return (
    (x >= barLeft && x <= barRight && y >= barTop && y <= barBottom)
    || (x >= stemLeft && x <= stemRight && y >= barTop && y <= stemBottom)
  )
}

function isRingPixel(size, x, y) {
  const center = size / 2
  const dx = x - center
  const dy = y - center
  const distance = Math.sqrt(dx * dx + dy * dy)
  return distance >= size * 0.34 && distance <= size * 0.38 && y > size * 0.42
}

function createIcns(pngs) {
  const entries = ICNS_SIZES.map((size) => {
    const type = ICNS_TYPES.get(size)
    const png = pngs.get(size)
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([header, png])
  })
  const body = Buffer.concat(entries)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

function createIco(pngs) {
  const images = ICO_SIZES.map((size) => ({ size, data: pngs.get(size) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = []
  const data = []
  let offset = header.length + images.length * 16
  for (const image of images) {
    const entry = Buffer.alloc(16)
    entry[0] = image.size >= 256 ? 0 : image.size
    entry[1] = image.size >= 256 ? 0 : image.size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(image.data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    data.push(image.data)
    offset += image.data.length
  }

  return Buffer.concat([header, ...entries, ...data])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([length, typeBuffer, data, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
