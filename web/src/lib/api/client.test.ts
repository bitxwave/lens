import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { apiClient, ApiError } from './client';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const SampleSchema = z.object({ ok: z.literal(true), n: z.number() });

describe('apiClient', () => {
  it('parses JSON success against schema', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, n: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    const out = await apiClient({
      method: 'GET',
      path: '/api/sample',
      responseSchema: SampleSchema
    });
    expect(out).toEqual({ ok: true, n: 42 });
  });

  it('throws ApiError on schema mismatch', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await expect(
      apiClient({ method: 'GET', path: '/api/sample', responseSchema: SampleSchema })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError on non-2xx with backend error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    );
    await expect(apiClient({ method: 'GET', path: '/api/sample' })).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated'
    });
  });

  it('returns undefined on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const out = await apiClient({ method: 'POST', path: '/api/logout' });
    expect(out).toBeUndefined();
  });
});
