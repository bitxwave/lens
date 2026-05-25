import { apiClient } from './client';
import { SiteSchema, type Site } from '$lib/types/nav';

// ----- Sites -----

export interface SitePayload {
  value: string;
  name: string;
  isDefault?: boolean;
}
export type SitePatch = Partial<SitePayload>;

export function createSite(payload: SitePayload): Promise<Site> {
  return apiClient<Site>({
    method: 'POST',
    path: '/api/sites',
    body: payload,
    responseSchema: SiteSchema
  });
}

export function patchSite(id: number, patch: SitePatch): Promise<Site> {
  return apiClient<Site>({
    method: 'PATCH',
    path: `/api/sites/${id}`,
    body: patch,
    responseSchema: SiteSchema
  });
}

export function deleteSite(id: number): Promise<void> {
  return apiClient<void>({ method: 'DELETE', path: `/api/sites/${id}` });
}

export interface SiteReorderEntry {
  id: number;
  sortOrder: number;
}

export function reorderSites(entries: SiteReorderEntry[]): Promise<void> {
  return apiClient<void>({
    method: 'POST',
    path: '/api/sites/reorder',
    body: entries
  });
}
