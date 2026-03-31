# Vocabify

Turn browsing into passive vocabulary learning. A Chrome extension that helps you learn English vocabulary by translating words in context, scheduling spaced-repetition reviews, and tracking your progress.

## Features

- **Instant translation** — Select any word on a webpage to see its translation
- **Spaced repetition** — FSRS-5 algorithm schedules reviews at optimal intervals
- **Context capture** — Saves the sentence where you found each word
- **Review toasts** — Non-intrusive popups quiz you while you browse
- **Quiz mode** — Multiple-choice and fill-in-the-blank quizzes
- **Word Map** — Force-directed graph visualization of your vocabulary
- **Insights dashboard** — Activity heatmap, accuracy trends, CEFR estimate
- **Phrase & sentence support** — Learn collocations and full sentences, not just words
- **AI features** — Word explanations, text simplification, sentence analysis (OpenAI)
- **Import/Export** — CSV and JSON backup of your vocabulary

## Tech Stack

- **WXT 0.20** — Web Extension Toolkit (Manifest V3)
- **React 19** + **Tailwind CSS 4**
- **Convex** — Backend (database, queries, mutations, actions)
- **OpenAI GPT-4o-mini** — AI features (explanations, simplification)
- **Vitest** — Testing

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- A Convex project (free tier works)

### Setup

```bash
# Install dependencies
pnpm install

# Set up Convex (follow prompts to create/link a project)
npx convex dev

# Create .env.local with your Convex URL
echo "VITE_CONVEX_URL=<your-convex-url>" > .env.local

# Start development
pnpm dev
```

### Development

```bash
pnpm dev          # Start WXT dev server with hot reload
pnpm build        # Production build
pnpm zip          # Package for Chrome Web Store
pnpm test         # Run tests
pnpm typecheck    # TypeScript type checking
```

### Loading in Chrome

1. Run `pnpm dev`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `.output/chrome-mv3-dev`

## Project Structure

```
entrypoints/
  background.ts          # Service worker (message handling, context menus)
  content/index.tsx       # Content script (word selection, popups)
  content/FloatingPopup.tsx  # Translation popup component
  newtab/App.tsx          # Dashboard (review, vocabulary, stats)
  popup/App.tsx           # Extension popup
convex/
  schema.ts              # Database schema
  words.ts               # Word CRUD + SRS logic
  ai.ts                  # OpenAI actions (rate-limited)
  analytics.ts           # Insights queries
src/lib/
  fsrs.ts                # FSRS-5 spaced repetition algorithm
  translate.ts           # Translation service cascade
  memory-strength.ts     # Strength calculation
```

## Environment Variables

### Convex Dashboard

Set these in your Convex project dashboard under Settings > Environment Variables:

- `OPENAI_API_KEY` — Required for AI features (explain, simplify, analyze)

### Local `.env.local`

- `VITE_CONVEX_URL` — Your Convex deployment URL (from `npx convex dev`)
