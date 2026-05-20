// web/src/lib/stores/session.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { apiClient, ApiError } from '$lib/api/client';
import { AuthMeSchema } from '$lib/types/nav';

export interface SessionState {
  authed: boolean;
  loading: boolean;
}

const initial: SessionState = { authed: false, loading: false };
const { subscribe, set, update } = writable<SessionState>(initial);

async function refresh() {
  update((s) => ({ ...s, loading: true }));
  try {
    const me = await apiClient({
      method: 'GET',
      path: '/api/auth/me',
      responseSchema: AuthMeSchema
    });
    set({ authed: me.authenticated, loading: false });
  } catch {
    set({ authed: false, loading: false });
  }
}

async function login(password: string): Promise<void> {
  try {
    await apiClient({
      method: 'POST',
      path: '/api/auth/login',
      body: { password }
    });
    set({ authed: true, loading: false });
  } catch (e) {
    set({ authed: false, loading: false });
    throw e;
  }
}

async function logout(): Promise<void> {
  try {
    await apiClient({ method: 'POST', path: '/api/auth/logout' });
  } catch (e) {
    // 401 is fine — already logged out
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
  }
  set({ authed: false, loading: false });
}

export const sessionStore = {
  subscribe,
  refresh,
  login,
  logout
};

if (browser) {
  void refresh();
}
