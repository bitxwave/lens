// web/src/lib/stores/session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { sessionStore } from './session';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('sessionStore', () => {
  it('refresh sets authed=true when /me returns true', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await sessionStore.refresh();
    expect(get(sessionStore).authed).toBe(true);
  });

  it('login on 204 sets authed=true', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.login('pw');
    expect(get(sessionStore).authed).toBe(true);
  });

  it('login on 401 throws and leaves authed=false', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    );
    await expect(sessionStore.login('wrong')).rejects.toMatchObject({ status: 401 });
    expect(get(sessionStore).authed).toBe(false);
  });

  it('logout clears authed', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.logout();
    expect(get(sessionStore).authed).toBe(false);
  });
});
