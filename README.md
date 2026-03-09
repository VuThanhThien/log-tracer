# Grafana Log Tracer

A Chrome extension (Manifest V3) that auto-extracts logs from a Grafana Explore page, analyzes them with OpenAI, and streams the results directly into the popup — including reasoning steps and session history.

## Features

- **One-click analysis** — click **Explain** and the extension extracts all visible log lines from the active Grafana Explore tab
- **AI-powered** — sends logs to OpenAI GPT-4o, which identifies errors, root causes, patterns, and suggests fixes
- **Streaming output** — results stream token-by-token with a live cursor and pulsing indicator
- **Session history** — past analyses are saved locally; expand, copy, or delete any session
- **Copy to clipboard** — copy the full analysis text from any session or the current result
- **Tab guard** — the Explain button is disabled unless you're on the configured Grafana Explore page

## Stack

- **Build**: Vite, TypeScript, React
- **UI**: Tailwind CSS, shadcn-style components (Button, Card), Framer Motion, Lucide icons
- **AI**: OpenAI SDK (`openai`) with streaming, `gpt-4o` model
- **Storage**: `chrome.storage.local` for session persistence

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
VITE_OPENAI_API_KEY=sk-proj-...
VITE_GRAFANA_HOST=grafana.your-org.com
```

| Variable | Description |
| --- | --- |
| `VITE_OPENAI_API_KEY` | Your OpenAI API key |
| `VITE_GRAFANA_HOST` | Hostname of your Grafana instance (without `https://`) |

> `VITE_GRAFANA_HOST` is injected into `manifest.json` at build time — the hostname never appears in source files.

### 3. Build

```bash
pnpm run build
```

Output is written to `dist/`.

### 4. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

After updating `.env` or changing any source file, rebuild and click **Update** (↺) on the extension card.

## Usage

1. Navigate to your Grafana Explore page (e.g. `https://grafana.your-org.com/explore`).
2. Click the **Grafana Log Tracer** extension icon.
3. Click **Explain**.
4. The extension extracts all log lines, sends them to OpenAI, and streams the analysis back.
5. Completed analyses are saved as sessions and listed below the button for future reference.

## Development

```bash
pnpm run dev       # Watch mode — rebuilds on file change
pnpm run lint      # ESLint check
pnpm run lint:fix  # Auto-fix ESLint issues
```

## Project layout

```text
src/
  popup/          # React popup UI (App.tsx, main.tsx)
  content/        # Content script — extracts Grafana log rows from the page
  background/     # Service worker stub
  components/     # UI primitives (Button, Card, BorderBeam)
  lib/            # Tailwind utility (cn)
public/
  manifest.json   # MV3 manifest (uses __GRAFANA_HOST__ placeholder)
  icons/          # Extension icons
```
