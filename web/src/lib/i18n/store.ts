import { writable, derived, get, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import zh from './zh.json';
import en from './en.json';

export type Locale = 'zh' | 'en';

const DICTIONARIES: Record<Locale, Record<string, string>> = { zh, en };

const LS_KEY = 'navsite.locale';

function detectInitial(): Locale {
  if (!browser) return 'zh';
  const stored = localStorage.getItem(LS_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  const navLang = navigator.language?.toLowerCase() ?? '';
  return navLang.startsWith('zh') ? 'zh' : 'en';
}

export const localeStore = writable<Locale>(detectInitial());

if (browser) {
  localeStore.subscribe((v) => {
    try {
      localStorage.setItem(LS_KEY, v);
    } catch {
      /* private mode etc. */
    }
  });
}

/**
 * Reactive translator.
 * Usage: <button>{$t('common.save')}</button>
 *        <p>{$t('editor.item.deleteConfirm', { name: 'RouterOS' })}</p>
 */
export const t: Readable<(key: string, params?: Record<string, string | number>) => string> =
  derived(localeStore, ($loc) => {
    const dict = DICTIONARIES[$loc];
    return (key: string, params?: Record<string, string | number>) => {
      const raw = dict[key] ?? key;
      if (!params) return raw;
      return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) =>
        String(params[name] ?? `{{${name}}}`)
      );
    };
  });

/** Imperative form for non-Svelte contexts. */
export function tNow(key: string, params?: Record<string, string | number>): string {
  return get(t)(key, params);
}

export function setLocale(loc: Locale) {
  localeStore.set(loc);
}

export function toggleLocale() {
  localeStore.update((v) => (v === 'zh' ? 'en' : 'zh'));
}
