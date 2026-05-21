// web/src/lib/stores/visible.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { navDataStore } from './navData';
import { uiPrefs } from './uiPrefs';
import {
  searchQuery,
  currentSite,
  visibleSections,
  visibleFavorites,
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
    defaultTheme: 'system',
    layoutMode: 'grouped'
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

  it('visibleFavorites lists user-favorited items only', () => {
    uiPrefs.toggleFavorite(2);
    expect(get(visibleFavorites).map((i) => i.id)).toEqual([2]);
  });
});
