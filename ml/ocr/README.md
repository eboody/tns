Staged OCR runtime resources live here.

This directory is bundled into Tauri packages as `ocr/`. Do not commit OCR
binaries or trained-data files here; use `npm run stage:ocr` to copy runtime
artifacts into this ignored workspace directory before an OCR-enabled package
build.

Expected staged layout:

- `bin/pdftoppm` or `bin/pdftoppm.exe` for PDF page rasterization.
- `bin/ocrs` or `bin/ocrs.exe` for an OCR command that accepts an image path
  and writes recognized text to stdout.
- `models/ocrs/text-detection.rten` and `models/ocrs/text-recognition.rten`
  when using `ocrs`, so packaged builds do not need first-run network model
  downloads.
- `bin/tesseract` or `bin/tesseract.exe` plus `tessdata/` when using
  Tesseract.
