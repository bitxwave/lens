import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemeMode = 'system' | 'light' | 'dark';

const LS_KEY = 'navsite.theme';

function detectStored(): ThemeMode {
  if (!browser) return 'system';
  const v = localStorage.getItem(LS_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function resolveActual(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (browser && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyToDOM(actual: 'light' | 'dark') {
  if (!browser) return;
  document.documentElement.setAttribute('data-theme', actual);
}

export const themeStore = writable<ThemeMode>(detectStored());

if (browser) {
  themeStore.subscribe((mode) => {
    applyToDOM(resolveActual(mode));
    try {
      localStorage.setItem(LS_KEY, mode);
    } catch {
      /* private mode */
    }
  });

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if (get(themeStore) === 'system') applyToDOM(resolveActual('system'));
  };
  mql.addEventListener('change', onSystemChange);
}

export function setTheme(m: ThemeMode) {
  themeStore.set(m);
}

/** Cycle: system → light → dark → system. */
export function cycleTheme() {
  themeStore.update((v) => (v === 'system' ? 'light' : v === 'light' ? 'dark' : 'system'));
}
