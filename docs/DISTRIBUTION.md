# Desktop installer builds

This app distributes as a native Tauri installer per platform, not as one universal executable.

## Runtime assets the app needs

All platforms need these bundled resources:

- `ml/ner/model.onnx`
- `ml/ner/tokenizer.json`
- `ml/ner/config.json`

Each platform also needs the matching ONNX Runtime shared libraries under `ml/ner/site/onnxruntime/capi/`.

The runtime libraries are staged automatically from the official ONNX Runtime GitHub releases by `scripts/stage-ort-runtime.mjs`.

The large NER model is intentionally not committed to git. From a fresh clone, download the default NER model, tokenizer, config, and host ONNX Runtime with:

```bash
npm run setup:ml
```

To download only the default NER model directory (`ml/ner/model.onnx`, `tokenizer.json`, and `config.json`):

```bash
npm run ner:download
```

By default this uses Hugging Face's `dslim/bert-base-NER` ONNX export. To stage a different model, set `TNS_NER_MODEL_SOURCE` to either:

- a local `model.onnx` path, or
- a direct download URL for the model artifact

If `ml/ner/tokenizer.json` or `ml/ner/config.json` is missing, the same script downloads the default artifacts automatically. You can override them with `TNS_NER_TOKENIZER_SOURCE` and `TNS_NER_CONFIG_SOURCE`.

## Automatic runtime staging

Stage runtime files for the current host platform:

```bash
npm run stage:runtime
```

Or stage a specific supported target explicitly:

```bash
npm run stage:runtime:linux
npm run stage:runtime:linux:arm64
npm run stage:runtime:macos
npm run stage:runtime:windows
npm run stage:runtime:windows:arm64
```

The bundle scripts call the appropriate staging step automatically before building installers.

### Linux

Required files:

- `libonnxruntime.so.1.25.1`
- `libonnxruntime_providers_shared.so`

Build command:

```bash
npm run bundle:linux
```

Optional AppImage build:

```bash
npm run bundle:linux:appimage
```

Current outputs are expected under `src-tauri/target/release/bundle/`.

Notes:

- `.deb` and `.rpm` are the reliable default outputs in this repo today.
- `AppImage` is available as an explicit optional build because `linuxdeploy` / `strip` can still fail on some hosts.

## macOS

Supported runtime today:

- Apple Silicon (`arm64`) only via the official ONNX Runtime 1.25.1 release assets

Required file:

- `libonnxruntime.1.25.1.dylib`

Build command on a Mac:

```bash
npm run bundle:macos
```

Expected outputs:

- `.app` bundle
- `.dmg` installer

Distribution notes:

- For real end-user distribution, sign and notarize the app.
- The DMG is the drag-to-Applications installer users expect.
- The official ONNX Runtime release used here does not currently provide a macOS x64 runtime asset. Intel Mac support would require a different runtime source.

## Windows

Required files:

- `onnxruntime.dll`
- `onnxruntime_providers_shared.dll`

Build commands:

```bash
npm run bundle:windows
```

On a Windows machine, also available:

```bash
npm run bundle:windows:msi
```

Expected outputs:

- `nsis` setup executable (`*-setup.exe`)
- optionally `.msi` when built on Windows

Distribution notes:

- `embedBootstrapper` is enabled so the installer can provision WebView2 more reliably.
- Sign installers for normal Windows distribution.

## Cross-compiling Windows from Linux/macOS

Tauri supports NSIS cross-builds with `cargo-xwin`, but Windows-native builds are still the most reliable path.

If you need cross-builds, follow the Tauri Windows installer guide and invoke:

```bash
tauri build --config src-tauri/tauri.windows.conf.json --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc
```

## Recommendation

Use a native CI matrix:

- Linux runner → `npm run bundle:linux`
- macOS runner → `npm run bundle:macos`
- Windows runner → `npm run bundle:windows` and optionally `npm run bundle:windows:msi`

That is the smallest honest way to get installers for all three platforms.
