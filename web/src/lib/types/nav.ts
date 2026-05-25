import { z } from 'zod';
import { CardSchema, IconKindSchema, type Card, type IconKind } from './card';

// Re-export icon types for back-compat with consumers that import from $lib/types/nav.
export { IconKindSchema };
export type { IconKind };

export const SiteSchema = z.object({
  id: z.number().int(),
  value: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  isDefault: z.boolean()
});
export type Site = z.infer<typeof SiteSchema>;

export const LinkSchema = z.object({
  text: z.string(),
  url: z.string().url()
});
export type Link = z.infer<typeof LinkSchema>;

export const MetaSchema = z.object({
  siteName: z.string(),
  siteAvatarPath: z.string().nullable().optional(),
  siteCopyright: z.string(),
  siteIcp: LinkSchema.nullable(),
  sitePolice: LinkSchema.nullable(),
  defaultTheme: z.enum(['system', 'light', 'dark'])
});
export type Meta = z.infer<typeof MetaSchema>;

export const NavBundleSchema = z.object({
  schemaVersion: z.literal(1),
  meta: MetaSchema,
  sites: z.array(SiteSchema),
  cards: z.array(CardSchema)
});
export type NavBundle = z.infer<typeof NavBundleSchema>;

export type { Card };

// Auth response
export const AuthMeSchema = z.object({ authenticated: z.boolean() });
export type AuthMe = z.infer<typeof AuthMeSchema>;

// Generic error envelope from backend (see server/src/error.rs)
export const ApiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional()
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
