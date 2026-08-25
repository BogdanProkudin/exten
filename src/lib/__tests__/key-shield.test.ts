import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shadowHostOf, activeElementIn, installKeyShield } from '../key-shield';

// Regression tests for a bug found in a real browser: `root instanceof
// ShadowRoot` returned false for a genuine ShadowRoot, because a content script
// runs in an isolated world and does not share DOM interface objects with the
// page. These fakes have the right shape but are not instances of anything —
// which is exactly the condition that broke the original implementation.

function fakeElementInShadow(host: unknown, activeElement: unknown = null) {
  return {
    getRootNode: () => ({ host, activeElement }),
  } as unknown as Element;
}

function fakeElementInDocument(activeElement: unknown = null) {
  return {
    getRootNode: () => ({ activeElement }), // a Document has no `host`
  } as unknown as Element;
}

describe('shadowHostOf', () => {
  it('finds the host without relying on instanceof', () => {
    const host = { tagName: 'VOCABIFY-TOAST' };
    expect(shadowHostOf(fakeElementInShadow(host))).toBe(host);
  });

  it('returns null for an element in the main document', () => {
    expect(shadowHostOf(fakeElementInDocument())).toBeNull();
  });

  it('returns null for a missing element', () => {
    expect(shadowHostOf(null)).toBeNull();
  });
});

describe('activeElementIn', () => {
  it('reads the focused element from inside a shadow tree', () => {
    const input = { tagName: 'INPUT' };
    expect(activeElementIn(fakeElementInShadow({}, input))).toBe(input);
  });

  it('reads the focused element from the document', () => {
    const button = { tagName: 'BUTTON' };
    expect(activeElementIn(fakeElementInDocument(button))).toBe(button);
  });

  it('returns null when nothing is focused', () => {
    expect(activeElementIn(fakeElementInShadow({}, null))).toBeNull();
    expect(activeElementIn(null)).toBeNull();
  });
});

describe('installKeyShield', () => {
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const HOST = { tagName: 'VOCABIFY-TOAST' } as unknown as Element;

  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      },
      removeEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function fire(overrides: Record<string, unknown> = {}) {
    const stopImmediatePropagation = vi.fn();
    const event = {
      type: 'keydown',
      key: 'k',
      isTrusted: true,
      composedPath: () => [HOST],
      stopImmediatePropagation,
      ...overrides,
    };
    for (const fn of listeners.get(event.type as string) ?? []) fn(event);
    return { stopImmediatePropagation };
  }

  it('listens for all three key event types in capture phase', () => {
    installKeyShield({ getHost: () => HOST });
    expect([...listeners.keys()].sort()).toEqual(['keydown', 'keypress', 'keyup']);
  });

  it('blocks the page from seeing keys typed into the overlay', () => {
    installKeyShield({ getHost: () => HOST });
    expect(fire().stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('runs the overlay handler for a real keypress', () => {
    const onKeyDown = vi.fn();
    installKeyShield({ getHost: () => HOST, onKeyDown });
    fire({ key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onKeyDown.mock.calls[0][0].key).toBe('Escape');
  });

  it('ignores synthetic key events a page dispatched at the overlay', () => {
    const onKeyDown = vi.fn();
    installKeyShield({ getHost: () => HOST, onKeyDown });

    const { stopImmediatePropagation } = fire({ isTrusted: false, key: '4' });

    // The forged answer must not reach the review handler...
    expect(onKeyDown).not.toHaveBeenCalled();
    // ...and must not travel on to the page pretending to come from our UI.
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('leaves the page alone for events outside the overlay', () => {
    const onKeyDown = vi.fn();
    installKeyShield({ getHost: () => HOST, onKeyDown });

    const other = { tagName: 'DIV' } as unknown as Element;
    const { stopImmediatePropagation } = fire({ composedPath: () => [other] });

    expect(onKeyDown).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('does nothing before the host exists', () => {
    const onKeyDown = vi.fn();
    installKeyShield({ getHost: () => null, onKeyDown });

    const { stopImmediatePropagation } = fire();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('only invokes the handler on keydown, not keyup or keypress', () => {
    const onKeyDown = vi.fn();
    installKeyShield({ getHost: () => HOST, onKeyDown });

    fire({ type: 'keyup' });
    fire({ type: 'keypress' });
    expect(onKeyDown).not.toHaveBeenCalled();

    fire({ type: 'keydown' });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it('removes every listener on uninstall', () => {
    const uninstall = installKeyShield({ getHost: () => HOST });
    uninstall();
    expect([...listeners.values()].flat()).toHaveLength(0);
  });
});
