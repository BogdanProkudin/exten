import { describe, it, expect } from 'vitest';
import { isLikelyEnglish, classifySelection } from '../language-guard';

describe('isLikelyEnglish', () => {
  it('accepts a plain English word', () => {
    expect(isLikelyEnglish('serendipity')).toBe(true);
  });

  it('accepts an English sentence', () => {
    expect(isLikelyEnglish('The bank raised interest rates again.')).toBe(true);
  });

  it('rejects a Russian phrase', () => {
    expect(isLikelyEnglish('привет как дела')).toBe(false);
  });

  it('rejects a Ukrainian phrase', () => {
    expect(isLikelyEnglish('добрий день як справи')).toBe(false);
  });

  it('rejects Chinese text', () => {
    expect(isLikelyEnglish('这是一个测试')).toBe(false);
  });

  it('rejects Japanese text', () => {
    expect(isLikelyEnglish('これはテストです')).toBe(false);
  });

  it('rejects Greek text', () => {
    expect(isLikelyEnglish('καλημέρα κόσμε')).toBe(false);
  });

  it('rejects Arabic text', () => {
    expect(isLikelyEnglish('مرحبا بالعالم')).toBe(false);
  });

  it('rejects text that is mostly Russian with one English word', () => {
    expect(isLikelyEnglish('привет как дела hello')).toBe(false);
  });

  it('accepts English text containing a single stray non-Latin character', () => {
    expect(isLikelyEnglish('The quick brown fox jumps over the lazy dog ф')).toBe(true);
  });

  it('rejects text with no letters at all', () => {
    expect(isLikelyEnglish('12,345.67')).toBe(false);
    expect(isLikelyEnglish('--- >>> ###')).toBe(false);
  });

  it('accepts English with accented Latin characters', () => {
    expect(isLikelyEnglish('the café was crowded')).toBe(true);
  });
});

describe('classifySelection', () => {
  it('classifies a single English word as a word', () => {
    expect(classifySelection('serendipity')).toBe('word');
  });

  it('classifies a hyphenated English word as a word', () => {
    expect(classifySelection('well-being')).toBe('word');
  });

  it('classifies a word with an apostrophe as a word', () => {
    expect(classifySelection("don't")).toBe('word');
  });

  it('classifies a word with a typographic apostrophe as a word', () => {
    expect(classifySelection('don’t')).toBe('word');
  });

  it('classifies an English sentence as a phrase', () => {
    expect(classifySelection('the bank raised interest rates')).toBe('phrase');
  });

  it('rejects a Russian single word', () => {
    expect(classifySelection('привет')).toBe('reject');
  });

  it('rejects a Russian phrase', () => {
    expect(classifySelection('привет как дела')).toBe('reject');
  });

  it('rejects a single character', () => {
    expect(classifySelection('a')).toBe('reject');
  });

  it('rejects an empty or whitespace-only selection', () => {
    expect(classifySelection('')).toBe('reject');
    expect(classifySelection('   \n  ')).toBe('reject');
  });

  it('rejects a selection longer than 1000 characters', () => {
    expect(classifySelection('word '.repeat(300))).toBe('reject');
  });

  it('rejects a selection with more than 150 words', () => {
    expect(classifySelection('go '.repeat(160).trim())).toBe('reject');
  });

  // The paragraph a user actually selected on learnenglish.britishcouncil.org,
  // which the old 300-char / 40-word limits silently dropped.
  it('accepts an ordinary selected paragraph', () => {
    const paragraph =
      'Get more when you sign up! Create a free LearnEnglish account to receive ' +
      'our monthly newsletter, take a free English level test and access various ' +
      'learning resources. As a member, connect with learners worldwide and ' +
      'practise your English through comments, speech recordings and community events.';
    expect(paragraph.length).toBeGreaterThan(290);
    expect(paragraph.split(' ').length).toBeGreaterThan(40);
    expect(classifySelection(paragraph)).toBe('phrase');
  });

  it('rejects numbers and punctuation', () => {
    expect(classifySelection('12,345.67')).toBe('reject');
  });

  it('treats a token with digits as a phrase, not a word', () => {
    expect(classifySelection('covid19')).toBe('reject');
  });

  it('normalizes surrounding whitespace before classifying', () => {
    expect(classifySelection('  serendipity  ')).toBe('word');
    expect(classifySelection('  the  bank   raised  ')).toBe('phrase');
  });
});

describe('classifySelection — boundaries', () => {
  it('rejects at 1 character, accepts at 2', () => {
    expect(classifySelection('a')).toBe('reject');
    expect(classifySelection('an')).toBe('word');
  });

  it('accepts exactly 1000 characters and rejects 1001', () => {
    expect(classifySelection('a'.repeat(1000))).toBe('word');
    expect(classifySelection('a'.repeat(1001))).toBe('reject');
  });

  it('accepts exactly 150 words and rejects 151', () => {
    const words150 = Array(150).fill('go').join(' '); // 449 chars, under the length cap
    const words151 = Array(151).fill('go').join(' ');
    expect(classifySelection(words150)).toBe('phrase');
    expect(classifySelection(words151)).toBe('reject');
  });

  it('measures length after whitespace collapsing, not before', () => {
    // 35 six-letter words: 244 chars once collapsed, well under both caps,
    // but 346 chars raw.
    const padded = Array(35).fill('sixchr').join('    ');
    expect(padded.length).toBeGreaterThan(300);
    expect(classifySelection(padded)).toBe('phrase');
  });
});

describe('isLikelyEnglish — adversarial and unicode edge cases', () => {
  it('rejects Cyrillic homoglyph text that looks Latin', () => {
    // "раураl" spelled with Cyrillic а/р/у — visually Latin, actually not.
    expect(isLikelyEnglish('раураl')).toBe(false);
  });

  it('accepts English despite zero-width characters', () => {
    expect(isLikelyEnglish('ser​endip‍ity')).toBe(true);
  });

  it('rejects RTL marks with no Latin letters', () => {
    expect(isLikelyEnglish('‏‮')).toBe(false);
  });

  it('rejects emoji-only selections', () => {
    expect(isLikelyEnglish('👋🎉🚀')).toBe(false);
    expect(classifySelection('👋🎉🚀')).toBe('reject');
  });

  it('rejects mathematical and currency symbols alone', () => {
    expect(isLikelyEnglish('∑ ∫ ≈ € £ ¥')).toBe(false);
  });

  it('accepts Turkish dotless i as Latin script', () => {
    expect(isLikelyEnglish('ırmak')).toBe(true);
  });

  it('rejects Greek even though some letters resemble Latin', () => {
    expect(isLikelyEnglish('ρaραλληλο')).toBe(false);
  });

  it('rejects Hebrew, Thai, Devanagari and Korean', () => {
    expect(isLikelyEnglish('שלום עולם')).toBe(false);
    expect(isLikelyEnglish('สวัสดีชาวโลก')).toBe(false);
    expect(isLikelyEnglish('नमस्ते दुनिया')).toBe(false);
    expect(isLikelyEnglish('안녕하세요 세계')).toBe(false);
  });

  it('sits the tolerance boundary where documented', () => {
    // 18 Latin + 2 Cyrillic = 10% non-Latin, under the 15% tolerance.
    expect(isLikelyEnglish('a'.repeat(18) + 'фы')).toBe(true);
    // 8 Latin + 2 Cyrillic = 20% non-Latin, over it.
    expect(isLikelyEnglish('a'.repeat(8) + 'фы')).toBe(false);
  });

  it('treats a non-breaking space as a word separator', () => {
    expect(classifySelection('the bank')).toBe('phrase');
  });

  it('treats newlines and tabs as separators', () => {
    expect(classifySelection('the\nbank\traised')).toBe('phrase');
  });

  it('handles a lone surrogate without throwing', () => {
    expect(() => classifySelection('\uD800')).not.toThrow();
    expect(classifySelection('\uD800')).toBe('reject');
  });

  it('does not treat digits as letters', () => {
    expect(isLikelyEnglish('123456789')).toBe(false);
    expect(isLikelyEnglish('2024-01-15')).toBe(false);
  });

  it('accepts a word wrapped in punctuation', () => {
    expect(classifySelection('"serendipity"')).toBe('reject'); // quotes are not word chars
    expect(classifySelection('serendipity.')).toBe('reject');
  });

  // isLikelyEnglish accepts accented Latin, so the single-word rule must too —
  // otherwise these words pass the language check and are then rejected as
  // "not a word", and the user simply cannot look them up.
  it.each(['café', 'naïve', 'résumé', 'façade', 'jalapeño', 'fiancée'])(
    'accepts the accented English word %s',
    (word) => {
      expect(isLikelyEnglish(word)).toBe(true);
      expect(classifySelection(word)).toBe('word');
    },
  );

  it('still rejects a single non-Latin word', () => {
    expect(classifySelection('привет')).toBe('reject');
    expect(classifySelection('世界')).toBe('reject');
  });

  it('still rejects digits inside a word', () => {
    expect(classifySelection('covid19')).toBe('reject');
    expect(classifySelection('h1b')).toBe('reject');
  });
});

describe('classifySelection — stress', () => {
  it('rejects a 1MB selection quickly', () => {
    const huge = 'lorem ipsum dolor sit amet '.repeat(40_000); // ~1.08MB
    const start = performance.now();
    const result = classifySelection(huge);
    const elapsed = performance.now() - start;

    expect(result).toBe('reject');
    // The length guard must fire before any per-character script counting.
    expect(elapsed).toBeLessThan(250);
  });

  it('rejects a 1MB non-Latin selection quickly', () => {
    const huge = 'привет мир '.repeat(100_000);
    const start = performance.now();
    expect(classifySelection(huge)).toBe('reject');
    expect(performance.now() - start).toBeLessThan(250);
  });

  it('stays correct and fast across 10k mixed inputs', () => {
    const samples = [
      'serendipity', 'привет', 'the bank raised rates', '这是测试',
      '12345', 'well-being', 'καλημέρα', 'hello world', '👋', 'don’t',
    ];
    const expected = [
      'word', 'reject', 'phrase', 'reject',
      'reject', 'word', 'reject', 'phrase', 'reject', 'word',
    ];

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      for (let j = 0; j < samples.length; j++) {
        expect(classifySelection(samples[j])).toBe(expected[j]);
      }
    }
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('handles a single 100k-character token without hanging', () => {
    const start = performance.now();
    expect(classifySelection('a'.repeat(100_000))).toBe('reject');
    expect(performance.now() - start).toBeLessThan(100);
  });
});
