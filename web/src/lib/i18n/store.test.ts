import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { localeStore, t, setLocale, toggleLocale, tNow } from './store';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('zh');
  });

  it('translates a known key', () => {
    expect(get(t)('common.save')).toBe('保存');
  });

  it('falls back to the key when missing', () => {
    expect(get(t)('does.not.exist')).toBe('does.not.exist');
  });

  it('switches locale', () => {
    setLocale('en');
    expect(get(t)('common.save')).toBe('Save');
  });

  it('toggles between zh and en', () => {
    expect(get(localeStore)).toBe('zh');
    toggleLocale();
    expect(get(localeStore)).toBe('en');
    toggleLocale();
    expect(get(localeStore)).toBe('zh');
  });

  it('interpolates {{name}} placeholders', () => {
    setLocale('en');
    expect(get(t)('editor.item.deleteConfirm', { name: 'RouterOS' })).toBe('Delete "RouterOS"?');
  });

  it('leaves unknown placeholders intact', () => {
    setLocale('en');
    const out = get(t)('editor.item.deleteConfirm', {} as Record<string, string>);
    expect(out).toContain('{{name}}');
  });

  it('tNow imperative form works', () => {
    expect(tNow('common.save')).toBe('保存');
  });
});
