// web/src/lib/stores/visible.ts
import { derived, writable, get, type Readable } from 'svelte/store';
import { navDataStore } from './navData';
import { uiPrefs } from './uiPrefs';
import type { Group, Item, Site } from '$lib/types/nav';

export const searchQuery = writable<string>('');

export interface ResolvedSite {
  /** The chosen Site object, or null if bundle empty. */
  site: Site | null;
}

export const currentSite: Readable<ResolvedSite> = derived(
  [navDataStore, uiPrefs],
  ([$nav, $prefs]) => {
    const sites = $nav.bundle?.sites ?? [];
    if (sites.length === 0) return { site: null };
    const explicit = $prefs.siteValue ? sites.find((s) => s.value === $prefs.siteValue) : undefined;
    if (explicit) return { site: explicit };
    return { site: sites.find((s) => s.isDefault) ?? sites[0] ?? null };
  }
);

export interface VisibleGroup {
  group: Group | null; // null = "ungrouped"
  items: Item[];
}

/**
 * Items grouped + filtered by current site and search term. Empty groups are dropped.
 */
export const visibleSections: Readable<VisibleGroup[]> = derived(
  [navDataStore, currentSite, searchQuery],
  ([$nav, $cur, $q]) => {
    const bundle = $nav.bundle;
    if (!bundle || !$cur.site) return [];
    const siteValue = $cur.site.value;
    const q = $q.trim().toLowerCase();

    const filtered = bundle.items
      .filter((i) => i.links[siteValue] !== undefined)
      .filter((i) => {
        if (!q) return true;
        if (i.name.toLowerCase().includes(q)) return true;
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

/** Flat layout: all visible items in one list (no grouping). */
export const visibleFlatItems: Readable<Item[]> = derived(visibleSections, ($sections) =>
  $sections.flatMap((s) => s.items)
);

/** Backend-controlled layout mode (read from bundle.meta). */
export const layoutMode: Readable<'grouped' | 'flat'> = derived(navDataStore, ($n) =>
  $n.bundle?.meta.layoutMode === 'flat' ? 'flat' : 'grouped'
);

/** True if a search filter is active. */
export const hasActiveFilter: Readable<boolean> = derived(
  searchQuery,
  ($q) => $q.trim().length > 0
);

export function clearFilters() {
  searchQuery.set('');
}

/** For unit tests / dev console */
export function _peekVisible(): VisibleGroup[] {
  return get(visibleSections);
}
