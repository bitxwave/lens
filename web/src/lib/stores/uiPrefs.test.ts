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
