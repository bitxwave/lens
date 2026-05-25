// Plan 6: long-press jiggle mode.
// `editModeStore` is gone — long-press supersedes the explicit toggle.
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { sessionStore } from './session';

const { subscribe, set } = writable<boolean>(false);

// Wall-clock timestamp of the most recent enter(). Cards read this to
// distinguish "long-press release on the same card" (no-op) from a
// genuine click while already in jiggle (edit dialog) — see Card.svelte.
const enteredAtStore = writable<number>(0);

let escAttached = false;

function attachEscOnce() {
  if (!browser || escAttached) return;
  escAttached = true;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && get({ subscribe })) {
      set(false);
    }
  });
}

attachEscOnce();

export const jiggleEnteredAt = { subscribe: enteredAtStore.subscribe };

export const jiggleMode = {
  subscribe,
  /**
   * Enter jiggle mode. Requires an authenticated session — long-press
   * by an unauthenticated user is a no-op (returns false so callers can
   * surface a "sign in to edit" hint).
   */
  enter(): boolean {
    const session = get(sessionStore);
    if (!session.authed) return false;
    set(true);
    enteredAtStore.set(Date.now());
    return true;
  },
  exit() {
    set(false);
    enteredAtStore.set(0);
  },
  /** Test-only: read sync. */
  _peek: () => get({ subscribe })
};
