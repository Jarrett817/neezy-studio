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

## Ollama install flow (desktop)

Neezy Studio **does not implement its own LLM runtime**. It calls Ollama’s local API at `127.0.0.1:11434`.

When Ollama is not available, the Settings page now shows an **Install Ollama** button.
Clicking it opens the platform-specific installer URL:

- Windows: `https://ollama.com/download/OllamaSetup.exe`
- macOS: `https://ollama.com/download/Ollama-darwin.zip`
- Other: `https://ollama.com/download`
