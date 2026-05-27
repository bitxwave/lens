// web/src/lib/stores/uiPrefs.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface UiPrefs {
  /** Active site `value` (e.g. "shangHai"). null = use bundle default. */
  siteValue: string | null;
}

const LS_KEY = 'lens.uiPrefs';
const SCHEMA_KEY = 'lens.uiPrefs.v';
// Bumped to 2 when we dropped favorites and group-open state — old
// payloads are silently discarded on first load.
const SCHEMA_VERSION = '2';

const initial: UiPrefs = {
  siteValue: null
};

function loadFromLs(): UiPrefs {
  if (!browser) return initial;
  try {
    const v = localStorage.getItem(SCHEMA_KEY);
    if (v !== SCHEMA_VERSION) return initial;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      siteValue: typeof parsed.siteValue === 'string' ? parsed.siteValue : null
    };
  } catch {
    return initial;
  }
}

const { subscribe, set, update } = writable<UiPrefs>(loadFromLs());

if (browser) {
  subscribe((v) => {
    try {
      localStorage.setItem(SCHEMA_KEY, SCHEMA_VERSION);
      localStorage.setItem(LS_KEY, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  });
}

export const uiPrefs = {
  subscribe,
  setSite(value: string | null) {
    update((s) => ({ ...s, siteValue: value }));
  },
  /** Test reset */
  _reset() {
    set(initial);
  }
};
