# Vocabify — Project Context for AI Agents

> Chrome extension for vocabulary learning via immersive web browsing. Select words on any page to translate, save, and review with spaced repetition.

## Tech Stack

- **Framework**: WXT 0.20 (Web Extension Toolkit) — Chrome MV3
- **UI**: React 19 + Tailwind CSS 4
- **Backend**: Convex (real-time BaaS) — queries, mutations, actions
- **AI**: OpenAI `gpt-4o-mini` via Convex actions (explain, simplify, sentence analysis)
- **SRS**: FSRS-5 (Free Spaced Repetition Scheduler) — 19-parameter memory model
- **Language**: TypeScript (strict mode, bundler resolution)

## Architecture

```
[Content Script]  ←chrome.runtime.onMessage→  [Background SW]  ←HTTP→  [Convex Backend]
   Shadow DOM UIs                                   ↕                        ↕
   (7 components)                              chrome.storage          OpenAI API
                                               chrome.alarms
[Popup]  ←→  [Background SW]                   chrome.idle
[New Tab Dashboard]  ←→  [Convex directly]     IndexedDB
```

- **Data isolation**: `deviceId` (UUID in chrome.storage) — no user accounts, all Convex queries filter by it
- **Content scripts**: Shadow DOM via `createShadowRootUi` — CSS/DOM isolation from host page
- **Translation chain**: MyMemory → LibreTranslate → Google Translate (6s timeout each)

## File Map

### Entrypoints (22 files, ~10.4K lines)

| File | Lines | Purpose |
|------|-------|---------|
| `entrypoints/background.ts` | 720 | Service worker: message handler, context menus, alarms, scheduler |
| `entrypoints/content/index.tsx` | 873 | Content script entry: selection detection, page analysis, UI mounting |
| `entrypoints/content/FloatingPopup.tsx` | 1599 | Word translation popup with undo, enrichment, context capture |
| `entrypoints/content/SentencePopup.tsx` | 630 | Sentence grammar analysis with phrase/vocab breakdown |
| `entrypoints/content/ReviewToast.tsx` | 306 | SRS review toast with speech recognition |
| `entrypoints/content/AchievementToast.tsx` | 208 | Achievement notification with confetti |
| `entrypoints/content/ReadingBadge.tsx` | 151 | Page CEFR difficulty badge |
| `entrypoints/content/ReadingPanel.tsx` | 417 | Side panel: unknown words, frequency bands, AI explain/simplify |
| `entrypoints/content/SimplifyPanel.tsx` | 186 | Simplified text display |
| `entrypoints/content/YouTubeOverlay.tsx` | 160 | Makes native YouTube captions clickable for translation |
| `entrypoints/newtab/App.tsx` | 1565 | Dashboard: tabs (review/vocabulary/hard/stats/insights), hash routing |
| `entrypoints/newtab/QuizMode.tsx` | 355 | Multiple-choice quiz with SRS integration |
| `entrypoints/newtab/WritingPractice.tsx` | 386 | Translation/word/speech practice modes |
| `entrypoints/newtab/WritingPrompts.tsx` | 305 | Sentence completion with AI feedback |
| `entrypoints/newtab/InsightsDashboard.tsx` | 771 | Analytics: heatmap, accuracy trends, strength donut, CEFR estimate |
| `entrypoints/newtab/WordMap.tsx` | 425 | Force-directed graph of word relationships |
| `entrypoints/newtab/WordOfTheDay.tsx` | 115 | Random daily word with translation |
| `entrypoints/newtab/ImportExport.tsx` | 332 | JSON import/export with skip counts |
| `entrypoints/popup/App.tsx` | 715 | Quick stats, onboarding checks, word count badge |
| `entrypoints/popup/Onboarding.tsx` | 192 | Language/proficiency/goal setup flow |
| `entrypoints/newtab/main.tsx` | 10 | Newtab React entry with Convex provider |
| `entrypoints/popup/main.tsx` | 10 | Popup React entry with Convex provider |

### Libraries (28 files, ~4.1K lines)

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/translate.ts` | 148 | Translation fallback chain (MyMemory/Libre/Google) |
| `src/lib/ai-translator.ts` | 494 | Context-aware AI translation with pronunciation, etymology |
| `src/lib/fsrs.ts` | 243 | FSRS-5 algorithm (stability, difficulty, scheduling) |
| `src/lib/memory-strength.ts` | 65 | Word strength score 0–100 from FSRS or legacy metrics |
| `src/lib/review-logic.ts` | 77 | Review priority sorting, FSRS/legacy path |
| `src/lib/smart-scheduler.ts` | 69 | Idle-based review timing (activity, video, typing, DND) |
| `src/lib/phrase-detector.ts` | 335 | 100+ phrasal verbs, 55+ collocations detection |
| `src/lib/collocation-engine.ts` | 126 | Collocation discovery (static list + Datamuse API) |
| `src/lib/word-enrichment.ts` | 202 | Synonyms/antonyms/definitions (Datamuse + DictionaryAPI, 7d cache) |
| `src/lib/word-graph.ts` | 152 | Graph builder for word relationships |
| `src/lib/force-layout.ts` | 100 | Spring-electric force layout (no deps) |
| `src/lib/frequency-list.ts` | 535 | NGSL top 2K/5K/10K word frequency bands |
| `src/lib/page-analyzer.ts` | 202 | Page CEFR difficulty (A2–C1), unknown word detection |
| `src/lib/page-scan.ts` | 47 | DOM word extraction (4+ char, stop-word filtered) |
| `src/lib/context-capture.ts` | 240 | Extract sentences around selected words |
| `src/lib/lemmatize.ts` | 130 | Basic English lemmatization (irregular verbs + suffix strip) |
| `src/lib/speech-recognition.ts` | 175 | Web Speech API with Levenshtein scoring |
| `src/lib/tts.ts` | 84 | Text-to-speech (0.9x rate for learners) |
| `src/lib/indexed-db.ts` | 128 | IndexedDB manager (5 stores) |
| `src/lib/local-dictionary.ts` | 62 | 10K word offline dictionary from bundled JSON |
| `src/lib/device-id.ts` | 15 | UUID generation/persistence |
| `src/lib/pro-gate.ts` | 77 | Free/Pro tier (1 vs 10 AI calls/day) |
| `src/lib/youtube.ts` | 135 | YouTube detection, video ID extraction, caption tokenization |
| `src/lib/tips.ts` | 136 | Contextual onboarding tips (24h cooldown) |
| `src/lib/motion.ts` | 78 | Animation hooks and easing constants |
| `src/lib/text-utils.ts` | 58 | Sentence extraction with word highlighting |
| `src/lib/sentence-split.ts` | 33 | Sentence splitting preserving abbreviations |
| `src/lib/convex-provider.tsx` | 64 | React Convex client wrapper |

### Convex Backend (7 files, ~2K lines)

| File | Lines | Purpose |
|------|-------|---------|
| `convex/schema.ts` | 151 | 7 tables: words, aiCache, events, userStats, achievements, collocations, readingSessions |
| `convex/words.ts` | 754 | Word CRUD, SRS review (FSRS update), quiz/writing selection, batch ops, import/export |
| `convex/analytics.ts` | 514 | Heatmap, accuracy trends, strength distribution, CEFR estimation |
| `convex/ai.ts` | 310 | OpenAI actions (explain, simplify, sentence analysis) with djb2 hash caching |
| `convex/collocations.ts` | 96 | Collocation save/query with deduplication |
| `convex/gamification.ts` | 84 | 20+ achievements, XP/level/streak tracking |
| `convex/events.ts` | 43 | Event logging (lookup, save, review, practice) |

## Data Model

### Convex Tables
- **words** — vocabulary entries with FSRS fields (stability, difficulty, state, reps, lapses), contexts, lemma, type (word/phrase/sentence). Indexes: `by_device`, `by_device_word`, `by_device_status`, `by_device_lemma`
- **aiCache** — cached AI responses keyed by djb2 hash + type (explain/simplify/sentence_analyze)
- **events** — analytics events (word_lookup, word_saved, review_remembered/forgot, toast_shown, writing_practice)
- **userStats** — streak, XP, level, daily counters, desiredRetention (FSRS target, default 0.9)
- **achievements** — unlocked achievements with notification state
- **collocations** — saved word pairs with category, mastery, practice count
- **readingSessions** — reading stats (wpm, comprehension, content type)

### Chrome Storage
- **local**: `vocabify_device_id`, `vocabifyPro` (tier + daily AI counter), toast counters, `openaiApiKey`
- **sync**: `targetLang` (default "ru"), `reviewIntervalMinutes` (30), `maxToastsPerDay` (15), `userLevel`
- **session**: `vocabifySchedulerState` (volatile scheduler state)

### IndexedDB (`vocabify-store`)
5 stores: `dictionary` (10K words), `enrichment` (7d TTL), `collocations` (30d TTL), `radar` (seen lemmas), `settings`

## Message Passing (content ↔ background)

Key message types sent via `chrome.runtime.sendMessage`:
- `TRANSLATE_WORD` → translation via fallback chain
- `SAVE_WORD` → persist to Convex with enrichment
- `REVIEW_RESULT` → FSRS review update (remembered/forgot)
- `SCAN_PAGE` → find unsaved words on current page
- `GET_VOCAB_CACHE` → cached lemmas for instant lookup
- `AI_EXPLAIN` / `AI_SIMPLIFY` / `AI_ANALYZE_SENTENCE` → OpenAI via Convex (pro-gated)
- `CONTEXT_MENU_TRANSLATE` / `KEYBOARD_TRANSLATE` → triggered by context menu / Ctrl+Shift+T
- `SHOW_REVIEW` → smart scheduler pushes review toast to content script
- `GET_DEVICE_ID`, `CHECK_PRO`, `TOGGLE_HARD`, `ADD_CONTEXT`, `DELETE_WORD`, `DICT_LOOKUP`

## External APIs

| API | Usage | Timeout |
|-----|-------|---------|
| MyMemory (`api.mymemory.translated.net`) | Primary translation | 6s |
| LibreTranslate (`libretranslate.com`) | Fallback translation | 6s |
| Google Translate (`translate.googleapis.com`) | Last resort translation | 6s |
| Datamuse (`api.datamuse.com`) | Synonyms, antonyms, collocations | — |
| Free Dictionary (`api.dictionaryapi.dev`) | Definitions, phonetics | — |
| OpenAI (`api.openai.com`) | AI explain/simplify/analyze (via Convex) | — |

## Key Patterns & Conventions

- **`handleMessage(message, convex, updateBadge)`** in background.ts — central switch on `message.type`
- **Shadow DOM**: all 7 content UI components use `createShadowRootUi` with z-index 2147483645–47
- **FSRS fields** on words table: `fsrsStability`, `fsrsDifficulty`, `fsrsElapsedDays`, `fsrsScheduledDays`, `fsrsReps`, `fsrsLapses`, `fsrsState`, `fsrsLastReview`
- **Legacy SRS path**: `intervalDays`, `consecutiveCorrect`, `reviewCount` — still supported alongside FSRS
- **Convex validators**: use `v` from `"convex/values"`, queries use `.withIndex().collect()`
- **Pro gating**: `pro-gate.ts` checks `chrome.storage.local["vocabifyPro"]`, resets daily
- **Smart scheduler**: review toasts only when user is active, not typing, no video playing, session ≥5min, under daily limit

## Gotchas & Constraints

1. **No user accounts** — all data keyed by `deviceId` UUID; losing chrome.storage = losing identity
2. **Content script isolation** — Shadow DOM means global CSS won't affect UI, but also can't use page fonts
3. **AI rate limits** — free tier = 1 AI call/day, pro = 10/day, tracked client-side (spoofable)
4. **Translation fallback** — 3 free APIs in sequence; all may fail or rate-limit simultaneously
5. **FSRS + legacy** — two SRS systems coexist; new words use FSRS, old words may have legacy fields only
6. **Convex deployment** — backend requires `npx convex dev` running; env var `OPENAI_API_KEY` needed for AI features
7. **Chrome-only** — MV3 APIs (storage.session, chrome.idle) not portable to Firefox without polyfills
8. **Dictionary asset** — `public/data/dictionary-10k.json` must be pre-generated via `scripts/generate-dictionary.ts`
9. **IndexedDB caches** — enrichment (7d) and collocations (30d) expire silently; no manual invalidation UI

## Scripts

- `pnpm dev` — WXT dev mode with hot reload
- `pnpm build` — production build to `.output/chrome-mv3/`
- `npx convex dev` — Convex backend dev server
- `scripts/generate-dictionary.ts` — one-time OpenAI batch to create dictionary-10k.json
