#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

bold() {
  printf '\033[1m%s\033[0m\n' "$1"
}

note() {
  printf '• %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  local help_text="$2"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "Missing required command: ${command_name}. ${help_text}"
  fi
}

check_macos() {
  [[ "$(uname -s)" == "Darwin" ]] || fail "This script must be run on macOS."
}

check_xcode_tools() {
  if ! xcode-select -p >/dev/null 2>&1; then
    fail "Xcode Command Line Tools are not installed. Run 'xcode-select --install' first."
  fi
}

check_apple_silicon() {
  local arch
  arch="$(uname -m)"
  [[ "$arch" == "arm64" ]] || fail "This repo currently bundles macOS runtime assets only for Apple Silicon (arm64). Current arch: ${arch}."
}

ensure_node_modules() {
  bold "Installing JavaScript dependencies"
  npm install
}

ensure_model_hint() {
  local model_path="${REPO_ROOT}/ml/ner/model.onnx"
  if [[ -f "$model_path" ]]; then
    note "Using existing model at ml/ner/model.onnx"
    return
  fi

  if [[ -n "${TNS_NER_MODEL_SOURCE:-}" ]]; then
    note "Using TNS_NER_MODEL_SOURCE=${TNS_NER_MODEL_SOURCE}"
    return
  fi

  fail "Missing ml/ner/model.onnx and TNS_NER_MODEL_SOURCE is not set. Provide a local model file or set TNS_NER_MODEL_SOURCE to a local path or download URL before bundling."
}

run_checks() {
  bold "Running validation"
  npm test
  npm run build
  cargo test --manifest-path "${REPO_ROOT}/src-tauri/Cargo.toml"
}

bundle_app() {
  bold "Bundling macOS app"
  npm run bundle:macos
}

show_outputs() {
  local bundle_dir="${REPO_ROOT}/src-tauri/target/release/bundle"
  bold "Bundle output"
  if [[ -d "$bundle_dir" ]]; then
    note "$bundle_dir"
    /bin/ls -1 "$bundle_dir"
  else
    note "Bundle directory not found yet: $bundle_dir"
  fi
}

main() {
  check_macos
  check_apple_silicon
  require_command node "Install Node.js first."
  require_command npm "Install npm first."
  require_command cargo "Install Rust via rustup first."
  require_command rustc "Install Rust via rustup first."
  require_command xcode-select "Install Xcode Command Line Tools first."
  check_xcode_tools

  cd "$REPO_ROOT"

  ensure_model_hint
  ensure_node_modules
  run_checks
  bundle_app
  show_outputs
}

main "$@"
