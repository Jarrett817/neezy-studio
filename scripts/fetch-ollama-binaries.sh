#!/usr/bin/env bash
set -euo pipefail

# Download Ollama release artifacts and place executable binaries into
# src-tauri/resources/bin for Tauri bundling.
#
# Usage:
#   scripts/fetch-ollama-binaries.sh
#   scripts/fetch-ollama-binaries.sh --version 0.21.0
#   scripts/fetch-ollama-binaries.sh --platform windows
#   scripts/fetch-ollama-binaries.sh --platform macos-apple
#   scripts/fetch-ollama-binaries.sh --platform macos-intel

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${REPO_ROOT}/src-tauri/resources/bin"
TMP_DIR="$(mktemp -d)"

VERSION="${OLLAMA_VERSION:-0.21.0}"
PLATFORM=""

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--version <version>] [--platform <platform>]

Options:
  --version   Ollama release version without leading v. Default: ${VERSION}
  --platform  One of: windows | macos-apple | macos-intel
              Default: auto-detect from host OS/CPU.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${PLATFORM}" ]]; then
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  case "${OS}:${ARCH}" in
    Darwin:arm64)
      PLATFORM="macos-apple"
      ;;
    Darwin:x86_64)
      PLATFORM="macos-intel"
      ;;
    MINGW*:x86_64|MSYS*:x86_64|CYGWIN*:x86_64)
      PLATFORM="windows"
      ;;
    Linux:*)
      echo "Linux host detected. Please pass --platform windows|macos-apple|macos-intel explicitly." >&2
      exit 1
      ;;
    *)
      echo "Unsupported host for auto-detect: ${OS} ${ARCH}" >&2
      exit 1
      ;;
  esac
fi

mkdir -p "${OUT_DIR}"

fetch_asset() {
  local asset="$1"
  local output="$2"
  local url="https://github.com/ollama/ollama/releases/download/v${VERSION}/${asset}"

  echo "Downloading ${url}"
  curl -fL "${url}" -o "${output}"
}

case "${PLATFORM}" in
  windows)
    ZIP_PATH="${TMP_DIR}/ollama-windows-amd64.zip"
    fetch_asset "ollama-windows-amd64.zip" "${ZIP_PATH}"
    unzip -o "${ZIP_PATH}" -d "${TMP_DIR}/unzip" >/dev/null
    BIN_PATH="$(find "${TMP_DIR}/unzip" -type f -name 'ollama.exe' | head -n 1)"
    if [[ -z "${BIN_PATH}" ]]; then
      echo "Could not find ollama.exe in downloaded archive." >&2
      exit 1
    fi
    cp "${BIN_PATH}" "${OUT_DIR}/ollama.exe"
    echo "Saved: ${OUT_DIR}/ollama.exe"
    ;;

  macos-apple)
    TGZ_PATH="${TMP_DIR}/ollama-darwin.tgz"
    fetch_asset "ollama-darwin.tgz" "${TGZ_PATH}"
    tar -xzf "${TGZ_PATH}" -C "${TMP_DIR}"
    BIN_PATH="$(find "${TMP_DIR}" -type f -name 'ollama' | head -n 1)"
    if [[ -z "${BIN_PATH}" ]]; then
      echo "Could not find ollama binary in tarball." >&2
      exit 1
    fi
    cp "${BIN_PATH}" "${OUT_DIR}/ollama"
    chmod +x "${OUT_DIR}/ollama"
    echo "Saved: ${OUT_DIR}/ollama"
    ;;

  macos-intel)
    ZIP_PATH="${TMP_DIR}/Ollama-darwin.zip"
    fetch_asset "Ollama-darwin.zip" "${ZIP_PATH}"
    unzip -o "${ZIP_PATH}" -d "${TMP_DIR}/unzip" >/dev/null
    BIN_PATH="$(find "${TMP_DIR}/unzip" -type f -path '*/Ollama.app/Contents/Resources/ollama' | head -n 1)"
    if [[ -z "${BIN_PATH}" ]]; then
      echo "Could not find Ollama.app/Contents/Resources/ollama in zip archive." >&2
      exit 1
    fi
    cp "${BIN_PATH}" "${OUT_DIR}/ollama"
    chmod +x "${OUT_DIR}/ollama"
    echo "Saved: ${OUT_DIR}/ollama"
    ;;

  *)
    echo "Unsupported platform: ${PLATFORM}" >&2
    usage
    exit 1
    ;;
esac

echo "Done. Bundled Ollama binaries are ready in ${OUT_DIR}."
