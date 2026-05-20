// web/src/lib/stores/navData.ts
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { apiClient, ApiError } from '$lib/api/client';
import { NavBundleSchema, type NavBundle } from '$lib/types/nav';

export interface NavDataState {
  bundle: NavBundle | null;
  loading: boolean;
  error: string | null;
}

const initial: NavDataState = { bundle: null, loading: false, error: null };

const { subscribe, update, set } = writable<NavDataState>(initial);

async function load(): Promise<void> {
  update((s) => ({ ...s, loading: true, error: null }));
  try {
    const bundle = await apiClient<NavBundle>({
      method: 'GET',
      path: '/api/nav',
      responseSchema: NavBundleSchema
    });
    set({ bundle, loading: false, error: null });
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code}${e.message ? `: ${e.message}` : ''}` : String(e);
    set({ bundle: null, loading: false, error: msg });
  }
}

function applyItemPatch(itemId: number, patch: Partial<NavBundle['items'][number]>) {
  update((s) => {
    if (!s.bundle) return s;
    const items = s.bundle.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
    return { ...s, bundle: { ...s.bundle, items } };
  });
}

function setBundle(bundle: NavBundle) {
  set({ bundle, loading: false, error: null });
}

export const navDataStore = {
  subscribe,
  load,
  refetch: load,
  applyItemPatch,
  setBundle,
  /** Test-only: read sync */
  _peek: () => get({ subscribe })
};

// Auto-load on browser boot
if (browser) {
  void load();
}
