// web/src/lib/components/ui/toast.ts
import { writable } from 'svelte/store';

export type ToastIntent = 'info' | 'success' | 'warn' | 'error';

export interface ToastEntry {
  id: number;
  intent: ToastIntent;
  message: string;
  durationMs: number;
}

let nextId = 1;
const _toasts = writable<ToastEntry[]>([]);

export const toasts = { subscribe: _toasts.subscribe };

function push(intent: ToastIntent, message: string, durationMs = 4000): number {
  const id = nextId++;
  _toasts.update((list) => [...list, { id, intent, message, durationMs }]);
  if (durationMs > 0) setTimeout(() => dismiss(id), durationMs);
  return id;
}

export function dismiss(id: number) {
  _toasts.update((list) => list.filter((t) => t.id !== id));
}

export const toast = {
  info: (msg: string, ms?: number) => push('info', msg, ms),
  success: (msg: string, ms?: number) => push('success', msg, ms),
  warn: (msg: string, ms?: number) => push('warn', msg, ms),
  error: (msg: string, ms?: number) => push('error', msg, ms ?? 6000)
};
