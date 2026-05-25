import { z } from 'zod';

export const IconKindSchema = z.enum(['asset', 'url', 'auto-favicon']);
export type IconKind = z.infer<typeof IconKindSchema>;

export const CardKindSchema = z.enum(['folder', 'item']);
export type CardKind = z.infer<typeof CardKindSchema>;

export const CardSchema = z.object({
  id: z.number().int(),
  kind: CardKindSchema,
  parentId: z.number().int().nullable().optional(),
  sortOrder: z.number().int(),
  name: z.string(),
  // folder-only
  slug: z.string().optional(),
  // item-only
  iconKind: IconKindSchema.optional(),
  iconValue: z.string().optional(),
  description: z.string().nullable().optional(),
  links: z.record(z.string(), z.string()).optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});
export type Card = z.infer<typeof CardSchema>;

export interface CardPayload {
  kind: CardKind;
  parentId?: number | null;
  name: string;
  slug?: string;
  iconKind?: IconKind;
  iconValue?: string;
  description?: string | null;
  links?: Record<string, string>;
}

export type CardPatch = Partial<CardPayload>;

export interface ReorderEntry {
  id: number;
  sortOrder: number;
  parentId: number | null;
}

export interface AutoFolderPayload {
  sourceItemId: number;
  targetItemId: number;
  name: string;
  slug?: string;
}
