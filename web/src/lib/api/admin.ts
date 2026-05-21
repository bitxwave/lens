import { apiClient } from './client';
import { GroupSchema, SiteSchema, type Group, type Site } from '$lib/types/nav';

// ----- Groups -----

export interface GroupPayload {
  slug: string;
  name: string;
  nameI18n?: Record<string, string> | null;
  collapsedDefault?: boolean;
}
export type GroupPatch = Partial<GroupPayload>;

export function createGroup(payload: GroupPayload): Promise<Group> {
  return apiClient<Group>({
    method: 'POST',
    path: '/api/groups',
    body: payload,
    responseSchema: GroupSchema
  });
}

export function patchGroup(id: number, patch: GroupPatch): Promise<Group> {
  return apiClient<Group>({
    method: 'PATCH',
    path: `/api/groups/${id}`,
    body: patch,
    responseSchema: GroupSchema
  });
}

export function deleteGroup(id: number): Promise<void> {
  return apiClient<void>({ method: 'DELETE', path: `/api/groups/${id}` });
}

export interface ReorderEntry {
  id: number;
  sortOrder: number;
}

export function reorderGroups(entries: ReorderEntry[]): Promise<void> {
  return apiClient<void>({
    method: 'POST',
    path: '/api/groups/reorder',
    body: entries
  });
}

// ----- Sites -----

export interface SitePayload {
  value: string;
  name: string;
  nameI18n?: Record<string, string> | null;
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

export function reorderSites(entries: ReorderEntry[]): Promise<void> {
  return apiClient<void>({
    method: 'POST',
    path: '/api/sites/reorder',
    body: entries
  });
}
