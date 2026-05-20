import { z } from 'zod';

// Discriminator for icon source
export const IconKindSchema = z.enum(['asset', 'url', 'auto-favicon']);
export type IconKind = z.infer<typeof IconKindSchema>;

// Optional i18n map: { en?: string, ... }; preserved as raw JSON since locale set is open.
const I18nMap = z.record(z.string(), z.string()).nullable().optional();

export const SiteSchema = z.object({
  id: z.number().int(),
  value: z.string(),
  name: z.string(),
  nameI18n: I18nMap,
  sortOrder: z.number().int(),
  isDefault: z.boolean()
});
export type Site = z.infer<typeof SiteSchema>;

export const GroupSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  nameI18n: I18nMap,
  sortOrder: z.number().int(),
  collapsedDefault: z.boolean()
});
export type Group = z.infer<typeof GroupSchema>;

export const TagSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  nameI18n: I18nMap
});
export type Tag = z.infer<typeof TagSchema>;

export const ItemSchema = z.object({
  id: z.number().int(),
  groupId: z.number().int().nullable(),
  name: z.string(),
  nameI18n: I18nMap,
  description: z.string().nullable().optional(),
  descriptionI18n: I18nMap,
  iconKind: IconKindSchema,
  iconValue: z.string(),
  sortOrder: z.number().int(),
  links: z.record(z.string(), z.string()),
  tagSlugs: z.array(z.string()),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});
export type Item = z.infer<typeof ItemSchema>;

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
  defaultTheme: z.enum(['system', 'light', 'dark']),
  /** "grouped" = render group sections; "flat" = single grid (legacy) */
  layoutMode: z.enum(['grouped', 'flat']).catch('grouped')
});
export type Meta = z.infer<typeof MetaSchema>;

export const NavBundleSchema = z.object({
  schemaVersion: z.literal(1),
  meta: MetaSchema,
  sites: z.array(SiteSchema),
  groups: z.array(GroupSchema),
  items: z.array(ItemSchema),
  tags: z.array(TagSchema)
});
export type NavBundle = z.infer<typeof NavBundleSchema>;

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
