// Plan 6: long-press jiggle mode.
// `editModeStore` is gone — long-press supersedes the explicit toggle.
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { sessionStore } from './session';

const { subscribe, set } = writable<boolean>(false);

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
    return true;
  },
  exit() {
    set(false);
  },
  /** Test-only: read sync. */
  _peek: () => get({ subscribe })
};
