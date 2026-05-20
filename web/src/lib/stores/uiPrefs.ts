// web/src/lib/stores/uiPrefs.ts
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface UiPrefs {
  /** Active site `value` (e.g. "shangHai"). null = use bundle default. */
  siteValue: string | null;
  /** Item ids the user has favorited. */
  favoriteItemIds: number[];
  /** Group slug -> open/closed; missing keys default to "open". */
  groupOpen: Record<string, boolean>;
}

const LS_KEY = 'navsite.uiPrefs';
const SCHEMA_KEY = 'navsite.uiPrefs.v';
const SCHEMA_VERSION = '1';

const initial: UiPrefs = {
  siteValue: null,
  favoriteItemIds: [],
  groupOpen: {}
};

function loadFromLs(): UiPrefs {
  if (!browser) return initial;
  try {
    const v = localStorage.getItem(SCHEMA_KEY);
    if (v !== SCHEMA_VERSION) return initial; // schema drift → reset
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      siteValue: typeof parsed.siteValue === 'string' ? parsed.siteValue : null,
      favoriteItemIds: Array.isArray(parsed.favoriteItemIds)
        ? parsed.favoriteItemIds.filter((n): n is number => Number.isInteger(n))
        : [],
      groupOpen:
        parsed.groupOpen && typeof parsed.groupOpen === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.groupOpen).filter(([, v]) => typeof v === 'boolean')
            )
          : {}
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
  toggleFavorite(itemId: number) {
    update((s) => {
      const has = s.favoriteItemIds.includes(itemId);
      return {
        ...s,
        favoriteItemIds: has
          ? s.favoriteItemIds.filter((i) => i !== itemId)
          : [...s.favoriteItemIds, itemId]
      };
    });
  },
  isFavorite(itemId: number): boolean {
    return get({ subscribe }).favoriteItemIds.includes(itemId);
  },
  setGroupOpen(slug: string, open: boolean) {
    update((s) => ({ ...s, groupOpen: { ...s.groupOpen, [slug]: open } }));
  },
  isGroupOpen(slug: string): boolean {
    const v = get({ subscribe }).groupOpen[slug];
    return v === undefined ? true : v;
  },
  /** Test reset */
  _reset() {
    set(initial);
  }
};
