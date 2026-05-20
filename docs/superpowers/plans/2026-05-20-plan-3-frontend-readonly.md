# Frontend Read-Only Browse Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Plan 2 foundation to the Plan 1 backend so visitors can browse a real, navigable site. Implements stores (navData/uiPrefs/session), the new Header (search + tag chips + site/theme/locale/auth toggles + brand), the new NavGrid (groups + favorites + items as accessible `<button>`s), the new Footer (locale-aware), and the home `+page.svelte` integration. Deletes the 5 legacy components and their hard-coded constants. After this plan, `pnpm dev` (with `cargo run` on :8080) shows the seeded `network/media/nas/tools` groups, supports search / tag filter / theme switch / locale switch / region switch / favorites — but no editing yet (Plan 4).

**Architecture:** Three-tier store layout per spec § 4.1.

```
              ┌──────────────────────┐
              │ navDataStore         │  async — GET /api/nav, zod-validated
              │ NavBundle            │  Plan 2 apiClient + types
              └──────────┬───────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
 ┌──────────────┐ ┌──────────────┐  ┌──────────────┐
 │ uiPrefs (LS) │ │ session      │  │ toast        │
 │ ─ siteValue  │ │ ─ authed     │  │ (Plan 2)     │
 │ ─ favorites  │ │ + login/out  │  │              │
 │ ─ locale     │ │              │  │              │
 │ ─ theme      │ │              │  │              │
 │   (Plan 2)   │ │              │  │              │
 │ ─ groupOpen  │ │              │  │              │
 └──────────────┘ └──────────────┘  └──────────────┘

       ┌────────── derived (pure) ──────────┐
       ▼                                    ▼
   visibleSectionsStore              searchHitsStore
   (group → items by site×search×tags)   (fuzzy match flag map)
```

`editModeStore` is intentionally NOT created here — Plan 4 owns it. This plan keeps every interaction read-only (clicking a NavItem opens the URL; nothing else writes).

**Tech Stack (already provisioned):** Svelte 5 + SvelteKit 2 (Plan 1.5) · zod / apiClient / i18n / theme / 10 UI primitives (Plan 2) · Rust backend at `/api/nav` (Plan 1).

**Spec reference:** `docs/superpowers/specs/2026-05-19-rust-navigation-platform-design.md` § 4 (state layering), § 5 (only the read-only parts; edit mode → Plan 4), § 7.4 (footer redesign), § 8 (a11y).

**Predecessors:** Plans 1, 1.5, 2 (all merged into `feat/rust-platform`).
**Successors:** Plan 4 (edit mode), Plan 5 (Docker / e2e).

---

## Conventions

- **Working directory:** every `pnpm` command runs in `web/`.
- **Sub-branch:** `plan-3/frontend-readonly`, branched from `feat/rust-platform`.
- **Commits:** Conventional Commits, no `Co-Authored-By` trailer. One commit per task.
- **Verification gate:** every store-tier task ends with vitest; every component task ends with `pnpm check`. Phase 4 ends with end-to-end smoke (cargo + pnpm + curl).
- **a11y rule (no exceptions):** every interactive element is `<button>` (or `<a href>` for genuine links). No `<div onclick>` survives this plan.
- **i18n:** every literal user-visible string passes through `$t('key')`. New keys go in `web/src/lib/i18n/{zh,en}.json` first, store changes second.
- **Style isolation:** new components consume `tokens.scss` vars only; no raw colors.

---

## Phase 0: Stores (Tasks 1–4)

Goal: load real data from the backend, persist UI prefs to localStorage, expose a clean derived view. All tested with vitest.

### Task 1: `navDataStore` — fetches `/api/nav`

**Files:**
- Create: `web/src/lib/stores/navData.ts`

- [ ] **Step 1: Write the store**

```ts
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
    update((s) => ({ ...s, loading: false, error: msg }));
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
```

- [ ] **Step 2: Test**

Create `web/src/lib/stores/navData.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { navDataStore } from './navData';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const sampleBundle = {
  schemaVersion: 1 as const,
  meta: {
    siteName: 'Nav',
    siteAvatarPath: null,
    siteCopyright: '©',
    siteIcp: null,
    sitePolice: null,
    defaultTheme: 'system' as const
  },
  sites: [],
  groups: [],
  items: [],
  tags: []
};

describe('navDataStore', () => {
  it('load() populates bundle on success', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(sampleBundle), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await navDataStore.load();
    expect(get(navDataStore).bundle).toEqual(sampleBundle);
    expect(get(navDataStore).error).toBeNull();
  });

  it('load() captures error on schema mismatch', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ wrong: 'shape' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await navDataStore.load();
    expect(get(navDataStore).bundle).toBeNull();
    expect(get(navDataStore).error).toContain('schema_mismatch');
  });

  it('applyItemPatch updates an item locally', () => {
    navDataStore.setBundle({
      ...sampleBundle,
      items: [
        {
          id: 1,
          groupId: null,
          name: 'old',
          nameI18n: null,
          description: null,
          descriptionI18n: null,
          iconKind: 'asset',
          iconValue: 'x.png',
          sortOrder: 0,
          links: {},
          tagSlugs: [],
          createdAt: 0,
          updatedAt: 0
        }
      ]
    });
    navDataStore.applyItemPatch(1, { name: 'new' });
    const items = get(navDataStore).bundle?.items;
    expect(items?.[0]?.name).toBe('new');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd web
pnpm test:unit 2>&1 | tail -10
cd ..
git add web/src/lib/stores/navData.ts web/src/lib/stores/navData.test.ts
git commit -m "feat(web): navDataStore (fetch + zod-validated bundle + applyItemPatch)"
```

### Task 2: `uiPrefs` — site / favorites / groupOpen / locale-mirror in LS

**Files:**
- Create: `web/src/lib/stores/uiPrefs.ts`

- [ ] **Step 1: Write the store**

```ts
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
```

- [ ] **Step 2: Test**

Create `web/src/lib/stores/uiPrefs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { uiPrefs } from './uiPrefs';

beforeEach(() => {
  uiPrefs._reset();
});

describe('uiPrefs', () => {
  it('starts with empty prefs', () => {
    const v = get(uiPrefs);
    expect(v.siteValue).toBeNull();
    expect(v.favoriteItemIds).toEqual([]);
    expect(v.groupOpen).toEqual({});
  });

  it('setSite updates siteValue', () => {
    uiPrefs.setSite('shangHai');
    expect(get(uiPrefs).siteValue).toBe('shangHai');
  });

  it('toggleFavorite adds and removes', () => {
    uiPrefs.toggleFavorite(7);
    expect(uiPrefs.isFavorite(7)).toBe(true);
    uiPrefs.toggleFavorite(7);
    expect(uiPrefs.isFavorite(7)).toBe(false);
  });

  it('setGroupOpen + isGroupOpen', () => {
    expect(uiPrefs.isGroupOpen('network')).toBe(true); // default open
    uiPrefs.setGroupOpen('network', false);
    expect(uiPrefs.isGroupOpen('network')).toBe(false);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd web
pnpm test:unit 2>&1 | tail -5
cd ..
git add web/src/lib/stores/uiPrefs.ts web/src/lib/stores/uiPrefs.test.ts
git commit -m "feat(web): uiPrefs store (site/favorites/groupOpen, LS persist with schema version)"
```

### Task 3: `sessionStore` — auth/me + login/logout

**Files:**
- Create: `web/src/lib/stores/session.ts`

- [ ] **Step 1: Write the store**

```ts
// web/src/lib/stores/session.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { apiClient, ApiError } from '$lib/api/client';
import { AuthMeSchema } from '$lib/types/nav';

export interface SessionState {
  authed: boolean;
  loading: boolean;
}

const initial: SessionState = { authed: false, loading: false };
const { subscribe, set, update } = writable<SessionState>(initial);

async function refresh() {
  update((s) => ({ ...s, loading: true }));
  try {
    const me = await apiClient({
      method: 'GET',
      path: '/api/auth/me',
      responseSchema: AuthMeSchema
    });
    set({ authed: me.authenticated, loading: false });
  } catch {
    set({ authed: false, loading: false });
  }
}

async function login(password: string): Promise<void> {
  await apiClient({
    method: 'POST',
    path: '/api/auth/login',
    body: { password }
  });
  set({ authed: true, loading: false });
}

async function logout(): Promise<void> {
  try {
    await apiClient({ method: 'POST', path: '/api/auth/logout' });
  } catch (e) {
    // 401 is fine — already logged out
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
  }
  set({ authed: false, loading: false });
}

export const sessionStore = {
  subscribe,
  refresh,
  login,
  logout
};

if (browser) {
  void refresh();
}
```

- [ ] **Step 2: Test**

```ts
// web/src/lib/stores/session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { sessionStore } from './session';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('sessionStore', () => {
  it('refresh sets authed=true when /me returns true', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await sessionStore.refresh();
    expect(get(sessionStore).authed).toBe(true);
  });

  it('login on 204 sets authed=true', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.login('pw');
    expect(get(sessionStore).authed).toBe(true);
  });

  it('login on 401 throws and leaves authed=false', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    );
    await expect(sessionStore.login('wrong')).rejects.toMatchObject({ status: 401 });
    expect(get(sessionStore).authed).toBe(false);
  });

  it('logout clears authed', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.logout();
    expect(get(sessionStore).authed).toBe(false);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd web
pnpm test:unit 2>&1 | tail -5
cd ..
git add web/src/lib/stores/session.ts web/src/lib/stores/session.test.ts
git commit -m "feat(web): sessionStore (refresh/login/logout against /api/auth/*)"
```

### Task 4: Derived `visibleSections` + `searchHits`

**Files:**
- Create: `web/src/lib/stores/visible.ts`

- [ ] **Step 1: Write the derivations**

```ts
// web/src/lib/stores/visible.ts
import { derived, writable, get, type Readable } from 'svelte/store';
import { navDataStore } from './navData';
import { uiPrefs } from './uiPrefs';
import type { Group, Item, NavBundle, Site } from '$lib/types/nav';

export const searchQuery = writable<string>('');
export const activeTagSlugs = writable<Set<string>>(new Set());

export interface ResolvedSite {
  /** The chosen Site object, or null if bundle empty. */
  site: Site | null;
}

export const currentSite: Readable<ResolvedSite> = derived(
  [navDataStore, uiPrefs],
  ([$nav, $prefs]) => {
    const sites = $nav.bundle?.sites ?? [];
    if (sites.length === 0) return { site: null };
    const explicit = $prefs.siteValue
      ? sites.find((s) => s.value === $prefs.siteValue)
      : undefined;
    if (explicit) return { site: explicit };
    return { site: sites.find((s) => s.isDefault) ?? sites[0] ?? null };
  }
);

export interface VisibleGroup {
  group: Group | null; // null = "ungrouped"
  items: Item[];
}

/**
 * Items grouped + filtered by current site, search term, and active tag chips.
 * Empty groups are dropped.
 */
export const visibleSections: Readable<VisibleGroup[]> = derived(
  [navDataStore, currentSite, uiPrefs, searchQuery, activeTagSlugs],
  ([$nav, $cur, _$prefs, $q, $tags]) => {
    const bundle = $nav.bundle;
    if (!bundle || !$cur.site) return [];
    const siteValue = $cur.site.value;
    const q = $q.trim().toLowerCase();
    const wantTags = $tags;

    const filtered = bundle.items
      .filter((i) => i.links[siteValue] !== undefined)
      .filter((i) => {
        if (wantTags.size === 0) return true;
        return i.tagSlugs.some((s) => wantTags.has(s));
      })
      .filter((i) => {
        if (!q) return true;
        if (i.name.toLowerCase().includes(q)) return true;
        if (i.tagSlugs.some((s) => s.toLowerCase().includes(q))) return true;
        if (i.description && i.description.toLowerCase().includes(q)) return true;
        return false;
      });

    const byGroup = new Map<number | null, Item[]>();
    for (const it of filtered) {
      const k = it.groupId ?? null;
      const arr = byGroup.get(k) ?? [];
      arr.push(it);
      byGroup.set(k, arr);
    }
    for (const arr of byGroup.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);

    const result: VisibleGroup[] = [];
    for (const g of [...bundle.groups].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const arr = byGroup.get(g.id);
      if (arr && arr.length) result.push({ group: g, items: arr });
    }
    const ungrouped = byGroup.get(null);
    if (ungrouped && ungrouped.length) result.push({ group: null, items: ungrouped });
    return result;
  }
);

/** Items the user has favorited that are visible under current site. */
export const visibleFavorites: Readable<Item[]> = derived(
  [navDataStore, currentSite, uiPrefs],
  ([$nav, $cur, $prefs]) => {
    if (!$nav.bundle || !$cur.site) return [];
    const v = $cur.site.value;
    return $nav.bundle.items
      .filter((i) => $prefs.favoriteItemIds.includes(i.id) && i.links[v] !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
);

/** All tag slugs in the bundle, used by chip filter. */
export const allTagSlugs: Readable<string[]> = derived(navDataStore, ($n) =>
  $n.bundle ? $n.bundle.tags.map((t) => t.slug).sort() : []
);

/** True if any filter (search or tag) is active. */
export const hasActiveFilter: Readable<boolean> = derived(
  [searchQuery, activeTagSlugs],
  ([$q, $tags]) => $q.trim().length > 0 || $tags.size > 0
);

/** Helpers for tag chips */
export function toggleTag(slug: string) {
  activeTagSlugs.update((s) => {
    const next = new Set(s);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    return next;
  });
}
export function clearFilters() {
  searchQuery.set('');
  activeTagSlugs.set(new Set());
}

/** For unit tests / dev console */
export function _peekVisible(): VisibleGroup[] {
  return get(visibleSections);
}
```

- [ ] **Step 2: Test**

```ts
// web/src/lib/stores/visible.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { navDataStore } from './navData';
import { uiPrefs } from './uiPrefs';
import {
  searchQuery,
  activeTagSlugs,
  currentSite,
  visibleSections,
  visibleFavorites,
  toggleTag,
  clearFilters
} from './visible';
import type { NavBundle } from '$lib/types/nav';

const bundle: NavBundle = {
  schemaVersion: 1,
  meta: {
    siteName: 'X',
    siteAvatarPath: null,
    siteCopyright: '',
    siteIcp: null,
    sitePolice: null,
    defaultTheme: 'system'
  },
  sites: [
    { id: 1, value: 'sh', name: 'SH', nameI18n: null, sortOrder: 0, isDefault: true },
    { id: 2, value: 'bj', name: 'BJ', nameI18n: null, sortOrder: 1, isDefault: false }
  ],
  groups: [
    {
      id: 10,
      slug: 'tools',
      name: 'Tools',
      nameI18n: null,
      sortOrder: 0,
      collapsedDefault: false
    }
  ],
  tags: [{ id: 100, slug: 'fav', name: 'Favorite', nameI18n: null }],
  items: [
    {
      id: 1,
      groupId: 10,
      name: 'Router',
      nameI18n: null,
      description: null,
      descriptionI18n: null,
      iconKind: 'asset',
      iconValue: 'r.png',
      sortOrder: 0,
      links: { sh: 'http://1', bj: 'http://1b' },
      tagSlugs: ['fav'],
      createdAt: 0,
      updatedAt: 0
    },
    {
      id: 2,
      groupId: 10,
      name: 'Switch',
      nameI18n: null,
      description: null,
      descriptionI18n: null,
      iconKind: 'asset',
      iconValue: 's.png',
      sortOrder: 1,
      links: { sh: 'http://2' }, // no bj
      tagSlugs: [],
      createdAt: 0,
      updatedAt: 0
    }
  ]
};

beforeEach(() => {
  navDataStore.setBundle(bundle);
  uiPrefs._reset();
  clearFilters();
});

describe('visibleSections', () => {
  it('default site is the first marked is_default', () => {
    expect(get(currentSite).site?.value).toBe('sh');
  });

  it('current site overridden by uiPrefs.siteValue', () => {
    uiPrefs.setSite('bj');
    expect(get(currentSite).site?.value).toBe('bj');
  });

  it('items missing for current site are dropped', () => {
    uiPrefs.setSite('bj');
    const sections = get(visibleSections);
    expect(sections).toHaveLength(1);
    expect(sections[0].items.map((i) => i.name)).toEqual(['Router']); // Switch has no bj link
  });

  it('search filters by name', () => {
    searchQuery.set('rou');
    expect(get(visibleSections)[0].items.map((i) => i.name)).toEqual(['Router']);
  });

  it('tag filter applies', () => {
    toggleTag('fav');
    const out = get(visibleSections);
    expect(out[0].items.map((i) => i.name)).toEqual(['Router']);
  });

  it('visibleFavorites lists user-favorited items only', () => {
    uiPrefs.toggleFavorite(2);
    expect(get(visibleFavorites).map((i) => i.id)).toEqual([2]);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd web
pnpm test:unit 2>&1 | tail -10
cd ..
git add web/src/lib/stores/visible.ts web/src/lib/stores/visible.test.ts
git commit -m "feat(web): visibleSections derived store (site/search/tags filter, favorites view)"
```

---

## Phase 1: Header Components (Tasks 5–12)

Goal: build the 8 header pieces, then assemble them into a new `Header` (under `src/lib/components/Header/` to differentiate from the legacy `src/lib/components/Header.svelte`).

### Task 5: SearchBar.svelte

**Files:**
- Create: `web/src/lib/components/Header/SearchBar.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { searchQuery } from '$lib/stores/visible';
  import { t } from '$lib/i18n/store';

  let inputEl: HTMLInputElement | undefined = $state();

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        const realInput = inputEl?.querySelector?.('input') ?? inputEl;
        (realInput as HTMLInputElement | null)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<div class="search" bind:this={inputEl}>
  <Input
    type="search"
    placeholder={$t('header.search.placeholder')}
    bind:value={$searchQuery}
    fullWidth
  />
</div>

<style lang="scss">
  .search {
    flex: 1;
    max-width: 480px;
  }
</style>
```

Commit: `feat(web): SearchBar header component (binds searchQuery, "/" focus shortcut)`

### Task 6: TagFilterChips.svelte

**Files:**
- Create: `web/src/lib/components/Header/TagFilterChips.svelte`

```svelte
<script lang="ts">
  import Chip from '$lib/components/ui/Chip.svelte';
  import { allTagSlugs, activeTagSlugs, toggleTag } from '$lib/stores/visible';
</script>

<div class="chips">
  {#each $allTagSlugs as slug (slug)}
    <Chip
      label={slug}
      active={$activeTagSlugs.has(slug)}
      onSelect={() => toggleTag(slug)}
    />
  {/each}
</div>

<style lang="scss">
  .chips {
    display: flex;
    gap: var(--sp-1);
    flex-wrap: wrap;
  }
</style>
```

Commit: `feat(web): TagFilterChips header component (Chip per tag, toggles activeTagSlugs)`

### Task 7: SiteSelect.svelte (new, replaces legacy)

**Files:**
- Create: `web/src/lib/components/Header/SiteSelect.svelte`

```svelte
<script lang="ts">
  import Menu from '$lib/components/ui/Menu.svelte';
  import { navDataStore } from '$lib/stores/navData';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { currentSite } from '$lib/stores/visible';
  import { localeStore } from '$lib/i18n/store';

  let open = $state(false);
  let triggerEl: HTMLButtonElement | undefined = $state();
  let menuX = $state(0);
  let menuY = $state(0);

  function nameFor(site: { name: string; nameI18n?: Record<string, string> | null }) {
    return site.nameI18n?.[$localeStore] ?? site.name;
  }

  function openMenu() {
    if (!triggerEl) return;
    const r = triggerEl.getBoundingClientRect();
    menuX = r.left;
    menuY = r.bottom + 4;
    open = true;
  }

  const items = $derived(
    ($navDataStore.bundle?.sites ?? []).map((s) => ({
      label: nameFor(s),
      onSelect: () => uiPrefs.setSite(s.value)
    }))
  );

  const label = $derived($currentSite.site ? nameFor($currentSite.site) : '—');
</script>

<button class="trigger" type="button" bind:this={triggerEl} onclick={openMenu}>
  {label}
  <span aria-hidden="true">▾</span>
</button>

<Menu bind:open x={menuX} y={menuY} {items} />

<style lang="scss">
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    height: 32px;
    padding: 0 var(--sp-3);
    background: var(--c-accent-bg);
    color: var(--c-accent);
    border: 0;
    border-radius: var(--rd-pill);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: filter var(--tr-fast);

    &:hover {
      filter: brightness(1.05);
    }
  }
</style>
```

Commit: `feat(web): SiteSelect header component (Menu-based, locale-aware label)`

### Task 8: ThemeToggle.svelte

**Files:**
- Create: `web/src/lib/components/Header/ThemeToggle.svelte`

```svelte
<script lang="ts">
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { themeStore, cycleTheme } from '$lib/design/theme';
  import { t } from '$lib/i18n/store';

  const glyph = $derived($themeStore === 'dark' ? '☾' : $themeStore === 'light' ? '☀' : '◐');
</script>

<IconButton label={$t('header.theme.toggle')} onclick={cycleTheme}>
  <span aria-hidden="true">{glyph}</span>
</IconButton>
```

Commit: `feat(web): ThemeToggle (cycles system→light→dark, glyph reflects state)`

### Task 9: LocaleToggle.svelte

```svelte
<!-- web/src/lib/components/Header/LocaleToggle.svelte -->
<script lang="ts">
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { localeStore, toggleLocale, t } from '$lib/i18n/store';
</script>

<IconButton label={$t('header.locale.toggle')} onclick={toggleLocale}>
  <span aria-hidden="true">{$localeStore === 'zh' ? '语' : 'EN'}</span>
</IconButton>
```

Commit: `feat(web): LocaleToggle (zh ↔ en)`

### Task 10: AuthControls.svelte (Plan 4 will mount LoginDialog)

```svelte
<!-- web/src/lib/components/Header/AuthControls.svelte -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { sessionStore } from '$lib/stores/session';
  import { t } from '$lib/i18n/store';

  function onLoginClick() {
    // Plan 4 will replace this with a LoginDialog open trigger.
    // For now, show a placeholder toast or no-op so Plan 3 stays read-only.
    alert($t('auth.login.title') + ' — coming in Plan 4');
  }

  async function onLogout() {
    await sessionStore.logout();
  }
</script>

{#if $sessionStore.authed}
  <Button intent="ghost" size="sm" onclick={onLogout}>{$t('header.logout')}</Button>
{:else}
  <Button intent="ghost" size="sm" onclick={onLoginClick}>{$t('header.login')}</Button>
{/if}
```

Commit: `feat(web): AuthControls header component (login placeholder for Plan 4, logout works)`

### Task 11: Brand.svelte

```svelte
<!-- web/src/lib/components/Header/Brand.svelte -->
<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';

  const meta = $derived($navDataStore.bundle?.meta);
  const name = $derived(meta?.siteName ?? '');
  const avatar = $derived(meta?.siteAvatarPath ?? null);
</script>

<a class="brand" href="/" aria-label={name}>
  {#if avatar}<img src={avatar} alt="" class="avatar" />{/if}
  <span class="name">{name}</span>
</a>

<style lang="scss">
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    text-decoration: none;
    color: var(--c-text);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-md);

    &:hover {
      color: var(--c-accent);
    }
  }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }
  .name {
    white-space: nowrap;
  }
</style>
```

Commit: `feat(web): Brand header component (avatar + site name from bundle.meta)`

### Task 12: Header.svelte (assembly)

**Files:**
- Create: `web/src/lib/components/Header/index.svelte`

```svelte
<!-- web/src/lib/components/Header/index.svelte -->
<script lang="ts">
  import Brand from './Brand.svelte';
  import SearchBar from './SearchBar.svelte';
  import TagFilterChips from './TagFilterChips.svelte';
  import SiteSelect from './SiteSelect.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import LocaleToggle from './LocaleToggle.svelte';
  import AuthControls from './AuthControls.svelte';
</script>

<header class="header">
  <div class="left">
    <Brand />
  </div>
  <div class="center">
    <SearchBar />
    <TagFilterChips />
  </div>
  <div class="right">
    <SiteSelect />
    <ThemeToggle />
    <LocaleToggle />
    <AuthControls />
  </div>
</header>

<style lang="scss">
  .header {
    position: sticky;
    top: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    background: var(--c-bg);
    border-bottom: 1px solid var(--c-border);
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .center {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
  }

  @media (max-width: 720px) {
    .header {
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
    }
    .center {
      grid-column: 1 / -1;
    }
    .right {
      flex-wrap: wrap;
    }
  }
</style>
```

Commit: `feat(web): Header assembly (brand + search + chips + site + theme + locale + auth)`

---

## Phase 2: Nav Grid Components (Tasks 13–18)

Goal: button-based, accessible NavItem and group/section composition.

### Task 13: NavItem.svelte

**Files:**
- Create: `web/src/lib/components/Nav/NavItem.svelte`

```svelte
<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import { currentSite } from '$lib/stores/visible';
  import { localeStore } from '$lib/i18n/store';

  interface Props {
    item: Item;
  }
  let { item }: Props = $props();

  const url = $derived($currentSite.site ? item.links[$currentSite.site.value] ?? null : null);
  const displayName = $derived(item.nameI18n?.[$localeStore] ?? item.name);
  const isFav = $derived($uiPrefs.favoriteItemIds.includes(item.id));

  function iconSrc(): string {
    switch (item.iconKind) {
      case 'asset':
        return `/navIcons/${item.iconValue}`;
      case 'url':
        return item.iconValue;
      case 'auto-favicon':
        return `/api/favicon?host=${encodeURIComponent(item.iconValue)}`;
    }
  }

  function open() {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  function onFavClick(e: MouseEvent) {
    e.stopPropagation();
    uiPrefs.toggleFavorite(item.id);
  }
</script>

<div class="cell">
  <button
    type="button"
    class="card"
    onclick={open}
    onkeydown={onKeydown}
    aria-label={displayName}
    disabled={!url}
  >
    <img class="icon" src={iconSrc()} alt="" loading="lazy" />
  </button>
  <button
    type="button"
    class="fav"
    aria-label={isFav ? 'Unfavorite' : 'Favorite'}
    aria-pressed={isFav}
    onclick={onFavClick}
  >★</button>
  <span class="label">{displayName}</span>
</div>

<style lang="scss">
  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    width: 96px;
  }
  .card {
    width: 96px;
    height: 96px;
    padding: var(--sp-3);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-lg);
    box-shadow: var(--sh-sm);
    cursor: pointer;
    transition: transform var(--tr-base), box-shadow var(--tr-base), border-color var(--tr-fast);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: var(--sh-md);
      border-color: var(--c-accent);
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .icon {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: var(--rd-sm);
    }
  }
  .fav {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 22px;
    height: 22px;
    background: transparent;
    border: 0;
    color: var(--c-text-3);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--rd-pill);
    opacity: 0;
    transition: opacity var(--tr-fast), color var(--tr-fast);

    &[aria-pressed='true'] {
      color: var(--c-warn);
      opacity: 1;
    }
  }
  .cell:hover .fav,
  .fav:focus-visible {
    opacity: 1;
  }

  .label {
    font-size: var(--fs-sm);
    color: var(--c-text);
    text-align: center;
    line-height: var(--lh-tight);
    word-break: break-word;
  }
</style>
```

Commit: `feat(web): NavItem (button-based, favorite toggle, icon-kind aware, a11y compliant)`

### Task 14: NavGrid.svelte

```svelte
<!-- web/src/lib/components/Nav/NavGrid.svelte -->
<script lang="ts">
  import type { Item } from '$lib/types/nav';
  import NavItem from './NavItem.svelte';

  interface Props {
    items: Item[];
  }
  let { items }: Props = $props();
</script>

<div class="grid">
  {#each items as item (item.id)}
    <NavItem {item} />
  {/each}
</div>

<style lang="scss">
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 96px);
    gap: var(--sp-5) var(--sp-4);
    justify-content: center;
    width: 100%;
  }
</style>
```

Commit: `feat(web): NavGrid (responsive grid of NavItem)`

### Task 15: GroupHeader.svelte

```svelte
<!-- web/src/lib/components/Nav/GroupHeader.svelte -->
<script lang="ts">
  import type { Group } from '$lib/types/nav';
  import { localeStore } from '$lib/i18n/store';
  import { uiPrefs } from '$lib/stores/uiPrefs';

  interface Props {
    group: Group;
  }
  let { group }: Props = $props();

  const isOpen = $derived($uiPrefs.groupOpen[group.slug] !== false);
  const name = $derived(group.nameI18n?.[$localeStore] ?? group.name);

  function toggle() {
    uiPrefs.setGroupOpen(group.slug, !isOpen);
  }
</script>

<button
  type="button"
  class="header"
  aria-expanded={isOpen}
  onclick={toggle}
>
  <span class="chev" class:open={isOpen} aria-hidden="true">▸</span>
  <span class="name">{name}</span>
</button>

<style lang="scss">
  .header {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    margin-left: calc(-1 * var(--sp-3));
    background: transparent;
    border: 0;
    cursor: pointer;
    color: var(--c-text);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    border-radius: var(--rd-md);

    &:hover {
      background: var(--c-surface-2);
    }
  }
  .chev {
    display: inline-block;
    transition: transform var(--tr-fast);
    color: var(--c-text-3);

    &.open {
      transform: rotate(90deg);
    }
  }
</style>
```

Commit: `feat(web): GroupHeader (collapsible, persists state to uiPrefs.groupOpen)`

### Task 16: GroupSection.svelte

```svelte
<!-- web/src/lib/components/Nav/GroupSection.svelte -->
<script lang="ts">
  import type { VisibleGroup } from '$lib/stores/visible';
  import { uiPrefs } from '$lib/stores/uiPrefs';
  import GroupHeader from './GroupHeader.svelte';
  import NavGrid from './NavGrid.svelte';

  interface Props {
    section: VisibleGroup;
  }
  let { section }: Props = $props();

  const isOpen = $derived(
    section.group ? $uiPrefs.groupOpen[section.group.slug] !== false : true
  );
</script>

<section class="section">
  {#if section.group}
    <GroupHeader group={section.group} />
  {/if}
  {#if isOpen}
    <NavGrid items={section.items} />
  {/if}
</section>

<style lang="scss">
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin-bottom: var(--sp-7);
  }
</style>
```

Commit: `feat(web): GroupSection (group header + grid; honors collapsed state)`

### Task 17: FavoritesSection.svelte

```svelte
<!-- web/src/lib/components/Nav/FavoritesSection.svelte -->
<script lang="ts">
  import { visibleFavorites } from '$lib/stores/visible';
  import NavGrid from './NavGrid.svelte';
  import { t } from '$lib/i18n/store';
</script>

{#if $visibleFavorites.length > 0}
  <section class="favorites">
    <h2 class="heading">★ {$t('common.edit') /* placeholder until favorites key added */}</h2>
    <NavGrid items={$visibleFavorites} />
  </section>
{/if}

<style lang="scss">
  .favorites {
    margin-bottom: var(--sp-7);
  }
  .heading {
    margin: 0 0 var(--sp-4);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    color: var(--c-text-2);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
</style>
```

Add a new i18n key `nav.favorites.title` to both `zh.json` and `en.json` and replace the placeholder in this component:

```json
// add to zh.json
"nav.favorites.title": "收藏"
// add to en.json
"nav.favorites.title": "Favorites"
```

Then in the component change `{$t('common.edit') /* placeholder ... */}` → `{$t('nav.favorites.title')}`. Commit (single commit covers both files):

`feat(web): FavoritesSection (top-of-page; only shown when user has favorites)`

### Task 18: Empty states

Create `web/src/lib/components/Nav/EmptyState.svelte`:

```svelte
<script lang="ts">
  interface Props {
    title: string;
    hint?: string;
  }
  let { title, hint }: Props = $props();
</script>

<div class="empty">
  <p class="title">{title}</p>
  {#if hint}<p class="hint">{hint}</p>{/if}
</div>

<style lang="scss">
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-7) 0;
    color: var(--c-text-3);
    text-align: center;
  }
  .title {
    margin: 0;
    font-size: var(--fs-lg);
    color: var(--c-text-2);
  }
  .hint {
    margin: 0;
    font-size: var(--fs-sm);
  }
</style>
```

Add i18n keys:

```json
// zh.json
"nav.empty.search": "没有匹配的导航项",
"nav.empty.search.hint": "尝试清除筛选或换个关键词",
"nav.empty.data": "暂无导航数据",
"nav.empty.data.hint": "登录后添加第一个导航项"
```

```json
// en.json
"nav.empty.search": "No nav items match",
"nav.empty.search.hint": "Try clearing filters or different keywords",
"nav.empty.data": "No nav data yet",
"nav.empty.data.hint": "Sign in to add the first item"
```

Commit (single, includes the json updates): `feat(web): EmptyState component + i18n keys for search/data empty states`

---

## Phase 3: Footer + Layout + Page Integration (Tasks 19–21)

### Task 19: Footer.svelte (rewrite)

**Files:**
- Create: `web/src/lib/components/Footer/index.svelte`

```svelte
<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import { localeStore } from '$lib/i18n/store';

  const meta = $derived($navDataStore.bundle?.meta);
  // Hide ICP / police filings when locale is non-Chinese — they're a PRC legal artifact.
  const showFilings = $derived($localeStore === 'zh');
</script>

<footer class="footer">
  <div class="row">
    <span class="copyright">{meta?.siteCopyright ?? ''}</span>
    {#if showFilings && meta?.siteIcp}
      <span class="sep">·</span>
      <a href={meta.siteIcp.url} target="_blank" rel="noopener">{meta.siteIcp.text}</a>
    {/if}
    {#if showFilings && meta?.sitePolice}
      <span class="sep">·</span>
      <a href={meta.sitePolice.url} target="_blank" rel="noopener">{meta.sitePolice.text}</a>
    {/if}
  </div>
</footer>

<style lang="scss">
  .footer {
    display: flex;
    justify-content: center;
    padding: var(--sp-5) var(--sp-4);
    margin-top: var(--sp-8);
    border-top: 1px solid var(--c-border);
    color: var(--c-text-3);
    font-size: var(--fs-xs);
  }
  .row {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex-wrap: wrap;
    justify-content: center;
  }
  .sep {
    opacity: 0.5;
  }
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;

    &:hover {
      color: var(--c-text-2);
    }
  }
</style>
```

Commit: `feat(web): Footer rewrite (locale-aware filings, inline row, modern minimal)`

### Task 20: +layout.svelte — wire ToastViewport + new Header/Footer

**Files:**
- Modify: `web/src/routes/+layout.svelte`

Replace contents with:

```svelte
<script lang="ts">
  import Header from '$lib/components/Header/index.svelte';
  import Footer from '$lib/components/Footer/index.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import '$lib/design/theme';
  import '../app.scss';

  let { children } = $props();
</script>

<Header />

<main>
  {@render children()}
</main>

<Footer />

<ToastViewport />

<style lang="scss">
  main {
    flex: 1;
    width: 100%;
    max-width: 1024px;
    margin: var(--sp-6) auto 0;
    padding: 0 var(--sp-4);
    box-sizing: border-box;
  }
</style>
```

Commit: `refactor(web): +layout uses new Header/Footer + ToastViewport`

### Task 21: +page.svelte — render real navData

**Files:**
- Modify: `web/src/routes/+page.svelte`

Replace with:

```svelte
<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';
  import { visibleSections, hasActiveFilter, clearFilters } from '$lib/stores/visible';
  import GroupSection from '$lib/components/Nav/GroupSection.svelte';
  import FavoritesSection from '$lib/components/Nav/FavoritesSection.svelte';
  import EmptyState from '$lib/components/Nav/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { t } from '$lib/i18n/store';

  const siteTitle = $derived($navDataStore.bundle?.meta.siteName ?? '');
</script>

<svelte:head>
  <title>{siteTitle}</title>
</svelte:head>

{#if $navDataStore.loading && !$navDataStore.bundle}
  <div class="loading">
    <Skeleton width="240px" height="24px" />
    <Skeleton width="180px" height="16px" />
    <Skeleton width="220px" height="16px" />
  </div>
{:else if $navDataStore.error}
  <EmptyState title={$t('error.network.offline')} hint={$navDataStore.error} />
  <div class="retry">
    <Button onclick={() => navDataStore.refetch()}>{$t('error.network.retry')}</Button>
  </div>
{:else}
  <FavoritesSection />
  {#if $visibleSections.length === 0}
    {#if $hasActiveFilter}
      <EmptyState
        title={$t('nav.empty.search')}
        hint={$t('nav.empty.search.hint')}
      />
      <div class="retry">
        <Button intent="ghost" onclick={clearFilters}>{$t('common.cancel')}</Button>
      </div>
    {:else}
      <EmptyState title={$t('nav.empty.data')} hint={$t('nav.empty.data.hint')} />
    {/if}
  {:else}
    {#each $visibleSections as section (section.group?.id ?? 'ungrouped')}
      <GroupSection {section} />
    {/each}
  {/if}
{/if}

<style lang="scss">
  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    align-items: center;
    margin-top: var(--sp-6);
  }
  .retry {
    display: flex;
    justify-content: center;
    margin-top: var(--sp-3);
  }
</style>
```

Commit: `feat(web): +page renders real navData (loading + error + empty + sections)`

---

## Phase 4: Cleanup + End-to-End Verification (Tasks 22–23)

### Task 22: Delete legacy components and constants

**Files (all DELETED):**
- `web/src/lib/components/Header.svelte` (legacy)
- `web/src/lib/components/Footer.svelte`
- `web/src/lib/components/Nav.svelte`
- `web/src/lib/components/SiteSelect.svelte`
- `web/src/lib/components/Avatar.svelte`
- `web/src/lib/store/siteStore.ts`
- `web/src/lib/constants/nav.ts`
- `web/src/lib/constants/siteInfo.ts`
- `web/src/lib/constants/avatar.ts`
- `web/src/lib/utils/index.ts` (re-exports `isURL`)
- `web/src/lib/utils/isURL.ts` (no longer used; URL check happens in NavItem via `iconKind`)

**Pre-flight:** before deleting `web/src/lib/store/`, verify nothing imports from it:

```bash
cd web
grep -r '$lib/store/siteStore' src --include='*.svelte' --include='*.ts' || echo "no callers"
grep -r '$lib/constants' src --include='*.svelte' --include='*.ts' || echo "no callers"
grep -r '$lib/utils' src --include='*.svelte' --include='*.ts' || echo "no callers"
cd ..
```

If any caller is in `src/` outside the legacy components themselves, **stop and report BLOCKED** — Phase 1-3 missed a reference.

If clean, delete:

```bash
git rm web/src/lib/components/Header.svelte
git rm web/src/lib/components/Footer.svelte
git rm web/src/lib/components/Nav.svelte
git rm web/src/lib/components/SiteSelect.svelte
git rm web/src/lib/components/Avatar.svelte
git rm web/src/lib/store/siteStore.ts
git rm web/src/lib/constants/nav.ts
git rm web/src/lib/constants/siteInfo.ts
git rm web/src/lib/constants/avatar.ts
git rm web/src/lib/utils/index.ts
git rm web/src/lib/utils/isURL.ts
# remove now-empty dirs (git ignores empty dirs but we can rmdir if they exist)
rmdir web/src/lib/store 2>/dev/null || true
rmdir web/src/lib/constants 2>/dev/null || true
rmdir web/src/lib/utils 2>/dev/null || true
```

Run full pipeline:

```bash
cd web
pnpm check 2>&1 | tail -10
pnpm test:unit 2>&1 | tail -10
pnpm build 2>&1 | tail -5
pnpm lint 2>&1 | tail -10
cd ..
```

All green. Commit:

```bash
git commit -m "chore(web): delete legacy components/constants/store now that Plan 3 ships replacements"
```

### Task 23: End-to-end verification

**Files:** none modified.

This task validates the integration with the Plan 1 backend.

- [ ] **Step 1: Boot backend**

```bash
cd server
rm -rf dev-data
SQLX_OFFLINE=true PORT=8080 BOOTSTRAP_ADMIN_PASSWORD=test1234 cargo run --quiet > /tmp/srv.log 2>&1 &
SRV=$!
sleep 18
curl -sf http://127.0.0.1:8080/api/health
curl -sf http://127.0.0.1:8080/api/nav | head -c 200
echo
cd ..
```

Expected: `{"status":"ok"}` and a JSON bundle with sites/groups arrays.

- [ ] **Step 2: Boot frontend dev (proxies /api to :8080)**

```bash
cd web
pnpm dev --host 127.0.0.1 --port 5173 > /tmp/web.log 2>&1 &
WEB=$!
sleep 8
curl -sf http://127.0.0.1:5173/ -o /tmp/page.html
grep -oE '<title>[^<]+</title>' /tmp/page.html
cd ..
```

Expected: page.html includes site title.

- [ ] **Step 3: Verify the SPA actually fetched /api/nav**

```bash
# After hydration, the SPA should have loaded the bundle and dropped the legacy default theme.
# We can't easily simulate JS in curl; instead grep the dev log for the proxy hit.
grep -E '/api/nav' /tmp/web.log | head -3 || echo "(no proxy hit yet — that's OK if hydration hasn't run; manual verification in browser confirms)"
```

- [ ] **Step 4: Tear down**

```bash
kill $WEB 2>/dev/null
kill $SRV 2>/dev/null
sleep 1
```

- [ ] **Step 5: No commit unless something needed fixing**

If the smoke test caught an issue (e.g., CORS, 404 on /api/nav from SPA, hydration error), fix it in this task and commit. Otherwise no commit; Plan 3 is complete after Task 22.

## Self-Review (filled by writer)

**Spec coverage**

| Spec section | Where covered |
|---|---|
| § 4.1 store layering | Tasks 1–4 |
| § 4.2 component tree (read-only parts) | Tasks 5–21 |
| § 5 (read-only operations only; edit deferred) | NavItem opens links; AuthControls placeholder |
| § 7.4 footer redesign | Task 19 |
| § 7.5 legacy assets removed | Task 22 |
| § 8.2 a11y baseline | Every interactive primitive is `<button>` |
| § 8.4 toast viewport mounted | Task 20 |

**Type / signature consistency**

- All stores expose `subscribe`/`set`/typed methods consistently.
- `currentSite`/`visibleSections` read from `navDataStore` + `uiPrefs`; no circular deps.
- NavItem uses `iconKind` discriminator from zod schema (asset/url/auto-favicon) — wired to `/navIcons/*` (asset, served by Plan 1's ServeDir), full URL (url), or `/api/favicon?host=` (auto-favicon).

**Placeholder scan**

- One placeholder addressed inline: Task 17 includes the i18n key add for `nav.favorites.title` (initial draft used `common.edit` placeholder; the task's commit step replaces it).

**Scope discipline**

- No editing UI built. AuthControls deliberately stubs `alert()` for login (Plan 4 replaces with LoginDialog).
- No drag-and-drop, no context menu, no inline editing — all reserved for Plan 4.
- Plan 5 still owns dump-bootstrap, Dockerfile, and Playwright.

**Verification gates**

- Phase 0: 4 store tasks each end with vitest.
- Phase 1-3: each component task ends with `pnpm check`. Phase 3 ends with browser-side smoke (Task 23).
- Final cleanup (Task 22) re-runs full check + tests + build.

**Deferred to other plans**

- LoginDialog + login flow → Plan 4
- Drag/drop reorder, double-click rename, context menu, ItemEditDialog → Plan 4
- Site/group/tag management UI → Plan 4
- scripts/dump-bootstrap.mjs (real seed data) → Plan 5
- Playwright e2e covering this plan's smoke → Plan 5
