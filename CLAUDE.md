# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run build        # TypeScript check + Vite build (outputs to dist/)
pnpm run lint         # Run ESLint
pnpm run lint:fix     # Auto-fix ESLint issues
```

To load the extension in Chrome: enable Developer mode at `chrome://extensions`, click "Load unpacked", select the `dist/` folder.

## Architecture

This is a **Chrome Extension (Manifest V3)** with three separate entry points, each compiled independently by Vite:

- **Popup** (`src/popup/`) — React UI rendered in the extension popup. Manages state machine (idle → picking → saving → done/error). Communicates with content script via `chrome.tabs.sendMessage` and receives results from background via `chrome.runtime.onMessage`.

- **Content Script** (`src/content/index.ts`) — Injected into the active tab. Implements a visual element picker (highlight overlay + click handler). On element selection, walks the DOM tree to extract text (skipping `<script>`/`<style>` tags), then sends extracted text to the background worker via `chrome.runtime.sendMessage`.

- **Background Service Worker** (`src/background/index.ts`) — Receives `LOGS_EXTRACTED` messages, creates a Blob from the text, triggers a browser download with filename `grafana-logs-<timestamp>.txt`, and notifies the popup of completion.

Message flow: **Popup → Content Script** (START_PICK/STOP_PICK) → **Content Script → Background** (LOGS_EXTRACTED) → **Background → Popup** (download confirmation).

## Build Configuration

Vite builds all three entry points with separate output names (`content.js`, `background.js`, `popup.js`). Minification is disabled to aid extension debugging. Path alias `@/*` maps to `src/*`.

## UI Components

Components in `src/components/` follow a shadcn-style pattern using CVA (class-variance-authority) for variants and `@radix-ui/react-slot` for composition. The `cn()` utility in `src/lib/utils.ts` merges Tailwind classes. Dark theme with cyan accent colors throughout.
