# Neezy Studio

Electron desktop app with **pi-coding-agent** as the main chat runtime.

## Development

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

## Model Downloads

The settings page provides individual model downloads and model suites. The default Hugging Face endpoint is `https://hf-mirror.com`, and every download keeps the official Hugging Face URL as fallback.

Downloaded models are registered into runtime settings and then selected by current CPU, memory, and load pressure.
