// web/src/lib/stores/visible.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { navDataStore } from './navData';
import { uiPrefs } from './uiPrefs';
import {
  searchQuery,
  currentSite,
  rootCards,
  childrenOf,
  searchHits,
  clearFilters
} from './visible';
import type { NavBundle } from '$lib/types/nav';

function makeBundle(): NavBundle {
  return {
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
      { id: 1, value: 'sh', name: 'SH', sortOrder: 0, isDefault: true },
      { id: 2, value: 'bj', name: 'BJ', sortOrder: 1, isDefault: false }
    ],
    cards: [
      {
        id: 10,
        kind: 'folder',
        parentId: null,
        sortOrder: 0,
        name: 'Tools',
        slug: 'tools',
        links: {},
        createdAt: 0,
        updatedAt: 0
      },
      {
        id: 100,
        kind: 'item',
        parentId: 10,
        sortOrder: 0,
        name: 'Alpha',
        iconKind: 'asset',
        iconValue: 'a.png',
        links: { sh: 'http://a' },
        createdAt: 0,
        updatedAt: 0
      },
      {
        id: 101,
        kind: 'item',
        parentId: 10,
        sortOrder: 1,
        name: 'Beta',
        iconKind: 'asset',
        iconValue: 'b.png',
        links: { bj: 'http://b' },
        createdAt: 0,
        updatedAt: 0
      },
      {
        id: 200,
        kind: 'item',
        parentId: null,
        sortOrder: 1,
        name: 'Gamma',
        iconKind: 'asset',
        iconValue: 'g.png',
        links: { sh: 'http://g' },
        createdAt: 0,
        updatedAt: 0
      }
    ]
  };
}

beforeEach(() => {
  navDataStore.setBundle(makeBundle());
  searchQuery.set('');
  uiPrefs._reset();
  uiPrefs.setSite('sh');
});

describe('rootCards', () => {
  it('shows the root item plus the folder when folder has any visible child', () => {
    const r = get(rootCards);
    expect(r.map((c) => c.id)).toEqual([10, 200]);
  });

  it('hides root item with no link for the active site', () => {
    uiPrefs.setSite('bj');
    const r = get(rootCards);
    // Folder has Beta(bj) so it survives. Gamma is sh-only → hidden.
    expect(r.map((c) => c.id)).toEqual([10]);
  });
});

describe('childrenOf', () => {
  it('returns folder children filtered by site', () => {
    const c = get(childrenOf(10));
    expect(c.map((x) => x.name)).toEqual(['Alpha']);
  });
});

describe('searchHits', () => {
  it('returns flat matches across all folders', () => {
    searchQuery.set('alpha');
    const hits = get(searchHits);
    expect(hits.map((h) => h.name)).toEqual(['Alpha']);
  });

  it('is empty when query is empty', () => {
    expect(get(searchHits)).toEqual([]);
  });
});

describe('currentSite', () => {
  it('falls back to default site when prefs has no value', () => {
    uiPrefs.setSite(null);
    expect(get(currentSite).site?.value).toBe('sh');
  });
});

describe('clearFilters', () => {
  it('resets searchQuery', () => {
    searchQuery.set('beta');
    clearFilters();
    expect(get(searchQuery)).toBe('');
  });
});
