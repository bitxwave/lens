import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// The jiggle store attaches subscribers to sessionStore at import time
// (browser guard). Make sure `$app/environment` reports browser=true so
// the subscription installs in the test environment.
vi.mock('$app/environment', () => ({ browser: true }));

// Vitest runs in Node by default — jiggle.ts's Esc handler touches
// `window.addEventListener`. Provide a minimal shim before import.
if (typeof globalThis.window === 'undefined') {
  // @ts-expect-error — Node test-env polyfill
  globalThis.window = { addEventListener: () => {} };
}

describe('jiggleMode session invariant', () => {
  beforeEach(() => {
    // Reset modules so each test re-installs the browser-time
    // subscription against a fresh sessionStore mock state.
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('./session');
  });

  it('exits jiggle when session becomes unauthenticated', async () => {
    // Preload a session mock that starts authed. jiggle.ts's
    // browser-time subscription captures this store.
    vi.doMock('./session', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writable } = require('svelte/store');
      const s = writable({ authed: true, loading: false });
      return { sessionStore: s };
    });

    const { jiggleMode } = await import('./jiggle');
    const { sessionStore } = await import('./session');

    // Enter jiggle (session is authed → allowed).
    expect(jiggleMode.enter()).toBe(true);
    expect(get(jiggleMode)).toBe(true);

    // Simulate logout: session flips to unauthed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sessionStore as any).set({ authed: false, loading: false });

    // Invariant: jiggle mode must have exited.
    expect(get(jiggleMode)).toBe(false);
  });

  it('does not toggle when session change keeps authed=true', async () => {
    vi.doMock('./session', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writable } = require('svelte/store');
      const s = writable({ authed: true, loading: false });
      return { sessionStore: s };
    });

    const { jiggleMode } = await import('./jiggle');
    const { sessionStore } = await import('./session');

    expect(jiggleMode.enter()).toBe(true);
    // Re-publish authed=true (e.g. after a session refresh).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sessionStore as any).set({ authed: true, loading: true });
    expect(get(jiggleMode)).toBe(true);
  });

  it('enter() is a no-op when unauthed', async () => {
    vi.doMock('./session', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writable } = require('svelte/store');
      const s = writable({ authed: false, loading: false });
      return { sessionStore: s };
    });

    const { jiggleMode } = await import('./jiggle');
    expect(jiggleMode.enter()).toBe(false);
    expect(get(jiggleMode)).toBe(false);
  });
});
