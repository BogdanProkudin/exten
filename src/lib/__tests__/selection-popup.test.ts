import { describe, it, expect } from 'vitest';
import { decideSelectionPopup } from '../selection-popup';

// Regression: selecting a word opened the popup, then extending the selection to
// the whole sentence did nothing — the word popup stayed and kept showing the
// word translation. The handler bailed whenever any popup was open.

describe('decideSelectionPopup', () => {
  it('opens a word popup when nothing is showing', () => {
    expect(decideSelectionPopup('serendipity', null)).toEqual({
      action: 'show', kind: 'word', text: 'serendipity',
    });
  });

  it('opens a sentence popup for a phrase when nothing is showing', () => {
    expect(decideSelectionPopup('the bank raised rates', null)).toEqual({
      action: 'show', kind: 'phrase', text: 'the bank raised rates',
    });
  });

  it('replaces a word popup when the selection grows into a sentence', () => {
    const decision = decideSelectionPopup('the bank raised rates', 'bank');
    expect(decision.action).toBe('show');
    expect(decision.kind).toBe('phrase');
  });

  it('replaces a sentence popup when the selection shrinks to a word', () => {
    const decision = decideSelectionPopup('bank', 'the bank raised rates');
    expect(decision.action).toBe('show');
    expect(decision.kind).toBe('word');
  });

  it('replaces the popup when a different word is selected', () => {
    expect(decideSelectionPopup('serendipity', 'bank').action).toBe('show');
  });

  it('keeps the open popup when the same text is reselected', () => {
    // Avoids a flicker and a second paid API call for a selection already shown.
    expect(decideSelectionPopup('bank', 'bank')).toEqual({
      action: 'keep', kind: 'word', text: 'bank',
    });
  });

  it('keeps the popup when the reselection differs only in whitespace', () => {
    expect(decideSelectionPopup('  the   bank raised  ', 'the bank raised').action).toBe('keep');
  });

  it('does nothing for a rejected selection, leaving any popup alone', () => {
    expect(decideSelectionPopup('привет как дела', null)).toEqual({
      action: 'none', kind: null, text: 'привет как дела',
    });
    expect(decideSelectionPopup('привет', 'bank').action).toBe('none');
  });

  it('does nothing for an empty selection', () => {
    expect(decideSelectionPopup('', 'bank').action).toBe('none');
    expect(decideSelectionPopup('   ', null).action).toBe('none');
  });

  it('reopens the same word after the popup was closed', () => {
    // Closing clears the tracked text, so the same word must open again rather
    // than being treated as already showing.
    expect(decideSelectionPopup('bank', null).action).toBe('show');
  });

  it('normalizes the text it reports so the caller stores one canonical form', () => {
    expect(decideSelectionPopup('  the  bank   raised  ', null).text).toBe('the bank raised');
  });
});
