const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp'])

export function imageOcrSourcePath(preview) {
  if (preview?.review?.extractionProvenance !== 'ocr_text') {
    return null
  }

  const sourcePath = typeof preview?.ocrSourceImagePath === 'string'
    ? preview.ocrSourceImagePath
    : typeof preview?.inputPath === 'string'
      ? preview.inputPath
      : ''
  if (!sourcePath || !IMAGE_EXTENSIONS.has(pathExtension(sourcePath))) {
    return null
  }

  return sourcePath
}

function pathExtension(path) {
  const fileName = path.split(/[\\/]/).pop() ?? ''
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return ''
  }

  return fileName.slice(dotIndex + 1).toLowerCase()
}
