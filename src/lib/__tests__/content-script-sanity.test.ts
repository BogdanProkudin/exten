import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The content script's logic lives inside defineContentScript's main(), so it
// cannot be imported or unit tested. A self-recursive close helper shipped once
// because of that: it threw "Maximum call stack size exceeded" on every
// selection, no popup ever opened, and typecheck and the build both passed
// because self-recursion is valid TypeScript.
//
// These are static checks over the source. Crude, but they cover the exact gap.

const SRC = resolve(__dirname, '../../../entrypoints/content/index.tsx');
const source = readFileSync(SRC, 'utf8');

describe('content script sanity', () => {
  it('has no function whose first statement calls itself', () => {
    const offenders: string[] = [];
    // function name(...) { <optional comments/blank lines> name(
    const re = /function\s+(\w+)\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*\n\s*)*(\w+)\s*\(/g;

    for (const m of source.matchAll(re)) {
      if (m[1] === m[2]) offenders.push(m[1]);
    }
    expect(offenders).toEqual([]);
  });

  it('closes both popups and clears the tracked text in one place', () => {
    const body = source.match(/function closeSelectionPopups\(\)\s*\{([\s\S]*?)\n    \}/);
    expect(body).not.toBeNull();

    const inner = body![1];
    expect(inner).toContain('popupUi');
    expect(inner).toContain('sentenceUi');
    expect(inner).toContain('openPopupText = null');
    expect(inner).not.toMatch(/\bcloseSelectionPopups\s*\(/);
  });

  it('clears the tracked popup text on every path that closes a popup', () => {
    // Every "popupUi = null" / "sentenceUi = null" site must also clear
    // openPopupText, or the same selection can never be reopened afterwards.
    const closers = source.split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /\b(popupUi|sentenceUi)\s*=\s*null/.test(line));

    expect(closers.length).toBeGreaterThan(0);

    const lines = source.split('\n');
    const missing = closers.filter(({ i }) => {
      const window = lines.slice(Math.max(0, i - 4), i + 5).join('\n');
      return !window.includes('openPopupText');
    });

    expect(missing.map(({ i }) => `line ${i + 1}: ${lines[i].trim()}`)).toEqual([]);
  });
});
