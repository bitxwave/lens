// web/src/lib/stores/editMode.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { editModeStore } from './editMode';
import { sessionStore } from './session';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  editModeStore.set(false);
  // Force authed=false baseline
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
});

describe('editModeStore', () => {
  it('toggle when not authed stays false', () => {
    editModeStore.toggle();
    expect(get(editModeStore)).toBe(false);
  });

  it('toggle when authed flips on', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.login('pw');
    editModeStore.toggle();
    expect(get(editModeStore)).toBe(true);
  });

  it('logout flips edit mode off', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.login('pw');
    editModeStore.set(true);
    expect(get(editModeStore)).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sessionStore.logout();
    expect(get(editModeStore)).toBe(false);
  });
});
