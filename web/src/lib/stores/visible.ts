// web/src/lib/stores/visible.ts
import { derived, writable, get, type Readable } from 'svelte/store';
import { navDataStore } from './navData';
import { uiPrefs } from './uiPrefs';
import type { Site } from '$lib/types/nav';
import type { Card } from '$lib/types/card';

export const searchQuery = writable<string>('');

export interface ResolvedSite {
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

/** True if a search filter is active. */
export const hasActiveFilter: Readable<boolean> = derived(
  searchQuery,
  ($q) => $q.trim().length > 0
);

function cardMatchesSite(c: Card, siteValue: string): boolean {
  if (c.kind !== 'item') return true;
  return Boolean(c.links && c.links[siteValue] !== undefined);
}

function cardMatchesQuery(c: Card, q: string): boolean {
  if (!q) return true;
  if (c.name.toLowerCase().includes(q)) return true;
  if (c.description && c.description.toLowerCase().includes(q)) return true;
  return false;
}

/**
 * Top-level cards visible under the current site, in sort order.
 * Folders survive even when their inner items don't match the active
 * site (the folder header is always shown if it has children visible —
 * the folder itself doesn't carry a per-site link).
 */
export const rootCards: Readable<Card[]> = derived([navDataStore, currentSite], ([$nav, $cur]) => {
  const bundle = $nav.bundle;
  if (!bundle || !$cur.site) return [];
  const siteValue = $cur.site.value;

  const all = bundle.cards;
  // Items inside a folder filtered by site → fold up to "is this folder
  // visible at all?" check.
  const folderHasVisibleChild = new Map<number, boolean>();
  for (const c of all) {
    if (c.kind === 'item' && c.parentId != null && cardMatchesSite(c, siteValue)) {
      folderHasVisibleChild.set(c.parentId, true);
    }
  }

  return all
    .filter((c) => c.parentId == null)
    .filter((c) => {
      if (c.kind === 'folder') {
        return folderHasVisibleChild.get(c.id) === true;
      }
      return cardMatchesSite(c, siteValue);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
});

/**
 * Children of a given folder, filtered by current site, sort order ascending.
 */
export function childrenOf(folderId: number): Readable<Card[]> {
  return derived([navDataStore, currentSite], ([$nav, $cur]) => {
    const bundle = $nav.bundle;
    if (!bundle || !$cur.site) return [];
    const siteValue = $cur.site.value;
    return bundle.cards
      .filter((c) => c.parentId === folderId)
      .filter((c) => cardMatchesSite(c, siteValue))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });
}

/**
 * Search-mode flat hits: every card that matches the query AND the site.
 * Folders are excluded — search should jump straight to items.
 */
export const searchHits: Readable<Card[]> = derived(
  [navDataStore, currentSite, searchQuery],
  ([$nav, $cur, $q]) => {
    const bundle = $nav.bundle;
    if (!bundle || !$cur.site) return [];
    const q = $q.trim().toLowerCase();
    if (!q) return [];
    const siteValue = $cur.site.value;
    return bundle.cards
      .filter((c) => c.kind === 'item')
      .filter((c) => cardMatchesSite(c, siteValue))
      .filter((c) => cardMatchesQuery(c, q))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
);

export function clearFilters() {
  searchQuery.set('');
}

/** For unit tests / dev console */
export function _peekRootCards(): Card[] {
  return get(rootCards);
}
