# React Router + shadcn/ui

This is a template for a new React Router project with React, TypeScript, and shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Bundled Ollama packaging (Windows + macOS)

Neezy Studio **does not implement its own LLM runtime**. It calls Ollama’s local API at `127.0.0.1:11434`.

The Tauri backend will try to auto-start a bundled Ollama binary from:

- `src-tauri/resources/bin/ollama` (macOS/Linux)
- `src-tauri/resources/bin/ollama.exe` (Windows)

### Which Ollama package to download

> As of **2026-04-26**, Ollama latest release is **v0.21.0**.  
> Prefer pinning a specific version in your build pipeline (avoid “latest” floating tags).

Recommended artifacts:

- **Windows desktop app**: `ollama-windows-amd64.zip` (extract `ollama.exe` to `src-tauri/resources/bin/ollama.exe`)
- **macOS Apple Silicon (M1/M2/M3/M4)**: `ollama-darwin.tgz` (extract CLI binary `ollama` to `src-tauri/resources/bin/ollama`)
- **macOS Intel**: use the macOS app/zip distribution (`Ollama-darwin.zip`) and export the CLI binary from `Ollama.app/Contents/Resources/ollama` into `src-tauri/resources/bin/ollama`

### Release checklist

1. Download pinned Ollama release assets from `ollama/ollama` GitHub Releases.
2. Place binaries in `src-tauri/resources/bin/`.
3. Ensure executable bit on macOS binary: `chmod +x src-tauri/resources/bin/ollama`.
4. Build Tauri bundle; `tauri.conf.json` already includes `resources/bin/**`.
5. On first app start, app will spawn `ollama serve` automatically when needed.
<<<<<<< Updated upstream
=======
<<<<<<< ours
=======
>>>>>>> Stashed changes

### Helper script

You can automate step 1-3 with:

```bash
scripts/fetch-ollama-binaries.sh --platform windows
scripts/fetch-ollama-binaries.sh --platform macos-apple
scripts/fetch-ollama-binaries.sh --platform macos-intel
```
<<<<<<< Updated upstream
=======
>>>>>>> theirs
>>>>>>> Stashed changes
