// web/src/lib/stores/editMode.ts
import { writable, derived, type Readable } from 'svelte/store';
import { sessionStore } from './session';

const _on = writable<boolean>(false);

/** Edit mode can ONLY be on when the user is authed. Logout flips it off. */
sessionStore.subscribe((s) => {
  if (!s.authed) _on.set(false);
});

export const editModeStore: Readable<boolean> & {
  toggle(): void;
  set(v: boolean): void;
} = {
  subscribe: derived([_on, sessionStore], ([$on, $s]) => $on && $s.authed).subscribe,
  toggle: () => _on.update((v) => !v),
  set: (v: boolean) => _on.set(v)
};
