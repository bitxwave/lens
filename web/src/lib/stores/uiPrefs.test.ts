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
  });

  it('setSite updates siteValue', () => {
    uiPrefs.setSite('shangHai');
    expect(get(uiPrefs).siteValue).toBe('shangHai');
  });

  it('setSite(null) clears siteValue', () => {
    uiPrefs.setSite('beiJing');
    uiPrefs.setSite(null);
    expect(get(uiPrefs).siteValue).toBeNull();
  });
});
