// web/src/lib/api/nav.ts — non-card endpoints. Card CRUD lives in api/cards.ts.
import { apiClient } from './client';

export function changePassword(current: string, next: string): Promise<void> {
  return apiClient<void>({
    method: 'POST',
    path: '/api/config/password',
    body: { current, next }
  });
}

/** PATCH /api/config — body is array of { key, value }. Admin auth required. */
export function patchConfig(pairs: { key: string; value: string }[]): Promise<void> {
  return apiClient<void>({
    method: 'PATCH',
    path: '/api/config',
    body: pairs
  });
}
