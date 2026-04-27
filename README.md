# Neezy Studio

Tauri desktop app for local content drafting.

## Runtime

- Frontend: React Router + TypeScript.
- Agent orchestration: TypeScript in `app/agents`.
- Local model runtime: Rust + `mistralrs`.
- Model format: GGUF.
- Memory store: SQLite in the app data directory.
- Semantic recall: local embedding model when available, keyword recall as fallback.

## Development

```bash
bun install
bun tauri dev
```

## Build

```bash
bun tauri build
```

## Model Downloads

The settings page provides individual model downloads and model suites. The default Hugging Face endpoint is `https://hf-mirror.com`, and every download keeps the official Hugging Face URL as fallback.

Downloaded models are registered into runtime settings and then selected by current CPU, memory, and load pressure.
