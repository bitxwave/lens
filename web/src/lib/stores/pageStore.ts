// Tracks current page index of the root LaunchPad pager.
// Page count and pageSize are computed in the consumer (+page.svelte)
// from rootCards length and viewport breakpoints.
import { writable, get } from 'svelte/store';

const { subscribe, set, update } = writable<number>(0);

export const currentPage = {
  subscribe,
  setPage(n: number) {
    if (!Number.isFinite(n) || n < 0) return;
    set(Math.floor(n));
  },
  next(maxIndex: number) {
    update((p) => Math.min(p + 1, Math.max(0, maxIndex)));
  },
  prev() {
    update((p) => Math.max(p - 1, 0));
  },
  reset() {
    set(0);
  },
  /** Test-only / dev-console */
  _peek: () => get({ subscribe })
};
