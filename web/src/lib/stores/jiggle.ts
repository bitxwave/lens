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

// Session → jiggle-mode invariant: entering jiggle requires an
// authenticated session; losing that session (logout, expired cookie
// refresh) MUST also exit jiggle. Without this, a logged-out user
// could still see wobbling cards and the add-card affordance,
// then get 401s on any edit action. Mirrors the `enter()` auth check
// below — same rule, symmetric direction.
if (browser) {
  sessionStore.subscribe((s) => {
    if (!s.authed && get({ subscribe })) set(false);
  });
}

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
