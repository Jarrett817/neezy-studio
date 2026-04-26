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
import { Button } from "@/components/ui/button"
```

## llama.cpp install flow (desktop)

Neezy Studio **does not implement its own LLM runtime**. It calls llama.cpp local HTTP API at `127.0.0.1:8080`.

When llama.cpp is not available, the Settings page shows an **Install llama.cpp** button.
Clicking it opens llama.cpp release downloads:

- All platforms: `https://github.com/ggerganov/llama.cpp/releases/latest`

### Model files

The app downloads GGUF models via **huggingface-hub CLI** into app data `models` directory.

Install CLI:

```bash
pip install -U "huggingface_hub[cli]"
```

If model repo is gated, run `huggingface-cli login` first.
