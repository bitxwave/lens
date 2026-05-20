// web/src/lib/api/nav.ts
import { apiClient } from './client';
import { ItemSchema, type Item, type IconKind } from '$lib/types/nav';

export interface ItemPayload {
  groupId: number | null;
  name: string;
  nameI18n?: Record<string, string> | null;
  description?: string | null;
  descriptionI18n?: Record<string, string> | null;
  iconKind: IconKind;
  iconValue: string;
  links: Record<string, string>;
  tagSlugs: string[];
}

export type ItemPatch = Partial<ItemPayload>;

export function createItem(payload: ItemPayload): Promise<Item> {
  return apiClient<Item>({
    method: 'POST',
    path: '/api/items',
    body: payload,
    responseSchema: ItemSchema
  });
}

export function patchItem(id: number, patch: ItemPatch): Promise<Item> {
  return apiClient<Item>({
    method: 'PATCH',
    path: `/api/items/${id}`,
    body: patch,
    responseSchema: ItemSchema
  });
}

export function deleteItem(id: number): Promise<void> {
  return apiClient<void>({ method: 'DELETE', path: `/api/items/${id}` });
}

export function changePassword(current: string, next: string): Promise<void> {
  return apiClient<void>({
    method: 'POST',
    path: '/api/config/password',
    body: { current, next }
  });
}
