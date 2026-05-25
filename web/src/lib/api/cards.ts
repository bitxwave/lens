import { apiClient } from './client';
import {
  CardSchema,
  type Card,
  type CardPayload,
  type CardPatch,
  type ReorderEntry,
  type AutoFolderPayload
} from '$lib/types/card';

export function createCard(payload: CardPayload): Promise<Card> {
  return apiClient<Card>({
    method: 'POST',
    path: '/api/cards',
    body: payload,
    responseSchema: CardSchema
  });
}

export function patchCard(id: number, patch: CardPatch): Promise<Card> {
  return apiClient<Card>({
    method: 'PATCH',
    path: `/api/cards/${id}`,
    body: patch,
    responseSchema: CardSchema
  });
}

export function deleteCard(id: number): Promise<void> {
  return apiClient<void>({ method: 'DELETE', path: `/api/cards/${id}` });
}

export function reorderCards(entries: ReorderEntry[]): Promise<void> {
  return apiClient<void>({
    method: 'POST',
    path: '/api/cards/reorder',
    body: entries
  });
}

export function autoFolder(payload: AutoFolderPayload): Promise<Card> {
  return apiClient<Card>({
    method: 'POST',
    path: '/api/cards/auto-folder',
    body: payload,
    responseSchema: CardSchema
  });
}
