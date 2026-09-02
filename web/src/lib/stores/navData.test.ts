import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { navDataStore } from './navData';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const sampleBundle = {
  schemaVersion: 1 as const,
  meta: {
    siteName: 'Nav',
    siteAvatarPath: null,
    siteCopyright: '©',
    siteIcp: null,
    sitePolice: null,
    defaultTheme: 'system' as const
  },
  sites: [],
  cards: []
};

describe('navDataStore', () => {
  it('load() populates bundle on success', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(sampleBundle), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await navDataStore.load();
    expect(get(navDataStore).bundle).toEqual(sampleBundle);
    expect(get(navDataStore).error).toBeNull();
  });

  it('load() captures error on schema mismatch', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ wrong: 'shape' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await navDataStore.load();
    expect(get(navDataStore).bundle).toBeNull();
    expect(get(navDataStore).error).toContain('schema_mismatch');
  });

  it('applyCardPatch updates a card locally', () => {
    navDataStore.setBundle({
      ...sampleBundle,
      cards: [
        {
          id: 1,
          kind: 'item',
          parentId: null,
          name: 'old',
          description: null,
          iconKind: 'asset',
          iconValue: 'x.png',
          sortOrder: 0,
          links: {},
          createdAt: 0,
          updatedAt: 0
        }
      ]
    });
    navDataStore.applyCardPatch(1, { name: 'new' });
    const cards = get(navDataStore).bundle?.cards;
    expect(cards?.[0]?.name).toBe('new');
  });
});
