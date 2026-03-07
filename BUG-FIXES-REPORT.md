# Vocabify Bug Fixes Report

**Date:** 2026-03-07  
**Auditor:** Claudy ☁️

---

## Bugs Found & Fixed

### 🔴 Bug 1: `page-scan.ts` — Crash on detached DOM elements
**Severity:** High (crash)  
**File:** `src/lib/page-scan.ts`

`getComputedStyle(parent)` was called without try-catch. If the parent element is detached from the DOM or in certain states (e.g., inside an iframe), this throws an uncaught exception and crashes the entire page scan. The sister file `page-analyzer.ts` already had this wrapped in try-catch.

**Fix:** Wrapped `getComputedStyle` call in try-catch, matching `page-analyzer.ts` behavior.

---

### 🔴 Bug 2: `lemmatize.ts` — Incorrect `-es` suffix rule
**Severity:** High (data corruption)  
**File:** `src/lib/lemmatize.ts`

The `-es` suffix handler had two identical branches — both returned `lower.slice(0, -2)`. This meant non-sibilant `-es` words were incorrectly lemmatized:
- "oranges" → "orang" ❌ (should be "orange")
- "caves" → "cav" ❌ (should be "cave")
- "plates" → "plat" ❌ (should be "plate")

Only sibilant endings (sh, ch, x, z, s) should strip 2 chars. Others should strip 1.

**Fix:** Non-sibilant `-es` words now strip only the `s`: `lower.slice(0, -1)`.

---

### 🟡 Bug 3: `review-logic.ts` — Inconsistent default intervals
**Severity:** Medium (logic)  
**File:** `src/lib/review-logic.ts`

`getReviewScore()` defaulted `intervalDays` to `1` for all words, while `needsReview()` defaulted to `7` for "known" words and `1` for others. This caused known words to get inflated review scores (appearing more urgent than they should be).

**Fix:** `getReviewScore()` now uses the same default logic as `needsReview()`.

---

### 🔴 Bug 4: `convex/words.ts` — `Math.random()` in Convex query
**Severity:** High (Convex violation)  
**File:** `convex/words.ts` → `getQuizWords`

Convex queries must be deterministic — `Math.random()` violates this contract. This can cause:
- Inconsistent results between reads
- Potential Convex runtime errors in strict mode
- Caching/reactivity bugs

**Fix:** Replaced with deterministic pseudo-shuffle using `_creationTime` and word char codes.

---

### 🟡 Bug 5: `tts.ts` — Voice selection fails silently in Chrome
**Severity:** Medium (UX)  
**File:** `src/lib/tts.ts`

`speechSynthesis.getVoices()` returns an empty array on first call in Chrome (voices load asynchronously). The `speak()` function didn't wait for voices to load, so it always used the browser's default voice instead of finding a matching English voice.

**Fix:** Added async voice loading with `voiceschanged` event listener and 500ms timeout fallback.

---

### 🟡 Bug 6: `pro-gate.ts` — Race condition on AI call limit
**Severity:** Medium (rate limit bypass)  
**File:** `src/lib/pro-gate.ts`

`canMakeAiCall()` and `incrementAiCalls()` were separate async operations. Between the check and the increment, another tab or rapid click could sneak through, exceeding the daily limit (1 free, 10 pro).

**Fix:** Added `tryConsumeAiCall()` — an atomic check-and-increment function. Updated `background.ts` to use it for AI_EXPLAIN and AI_SIMPLIFY handlers.

---

### 🟡 Bug 7: `background.ts` — User review interval setting ignored
**Severity:** Medium (feature broken)  
**File:** `entrypoints/background.ts`

The `reviewIntervalMinutes` setting was fetched from storage during alarm handling but never used for alarm creation. The alarm was always created with `periodInMinutes: 30` regardless of user preference.

**Fix:** Now reads `reviewIntervalMinutes` from storage during `onInstalled` and uses it for alarm creation.

---

## Bugs Found — Not Fixed (Low Priority / Design Decisions)

### ⚪ FloatingPopup: Undo can delete original word
If a user saves a word that already exists (triggering context update), then clicks "Undo", it calls `DELETE_WORD` which removes the *entire original word* — not just the new context. This is a data loss risk but requires a bigger refactor to fix properly (the save mutation would need to return whether it was a new insert or an update).

### ⚪ `analytics.ts`: Queries load all events into memory
`getActivityHeatmap`, `getAccuracyTrend`, etc. load ALL events via `.collect()` and filter in memory. For users with thousands of events, this could be slow. Would need timestamp-based indexes in the schema to fix.

### ⚪ `gamification.ts`: Streak bonus applies to "forgot" reviews
Forgetting a word on a 30-day streak gives `5 + 150 = 155 XP`, which is 10x more than remembering without a streak (`15 XP`). Could be intentional (rewarding effort) but feels unbalanced.

### ⚪ `context-capture.ts`: Regex with `g` flag + `.test()` is fragile
Using `wordRegex` (global flag) with `.test()` advances `lastIndex`. Manual resets are sprinkled throughout but it's error-prone. Would be safer to create a new regex each time or remove the `g` flag for `.test()` calls.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 High | 3 |
| 🟡 Medium | 4 |
| ⚪ Noted | 4 |
| **Total** | **11** |

All high and medium severity bugs have been fixed in-place.
