// Hand-curated source of truth for server/bootstrap.json.
// Maintainers edit this file then run `node scripts/dump-bootstrap.mjs`.

export interface BootstrapItem {
  name: string;
  name_i18n?: Record<string, string>;
  groupSlug: string | null;
  iconKind: 'asset' | 'url' | 'auto-favicon';
  iconValue: string;
  links: Record<string, string>;
}

export interface BootstrapSite {
  value: string;
  name: string;
  name_i18n?: Record<string, string>;
  is_default: boolean;
  sort_order: number;
}

export interface BootstrapGroup {
  slug: string;
  name: string;
  name_i18n?: Record<string, string>;
  sort_order: number;
}

export interface BootstrapDoc {
  schemaVersion: 1;
  meta: {
    siteName: string;
    siteAvatarPath: string | null;
    siteCopyright: string;
    siteIcp: { text: string; url: string } | null;
    sitePolice: { text: string; url: string } | null;
    defaultTheme: 'system' | 'light' | 'dark';
  };
  sites: BootstrapSite[];
  groups: BootstrapGroup[];
  items: BootstrapItem[];
}

export const BOOTSTRAP: BootstrapDoc = {
  schemaVersion: 1,
  meta: {
    siteName: 'Lens',
    siteAvatarPath: '/avatar.png',
    siteCopyright: '',
    siteIcp: null,
    sitePolice: null,
    defaultTheme: 'system'
  },
  sites: [
    { value: 'shangHai', name: '上海', name_i18n: { en: 'Shanghai' }, is_default: true, sort_order: 0 },
    { value: 'beiJing', name: '北京', name_i18n: { en: 'Beijing' }, is_default: false, sort_order: 1 },
    { value: 'guangZhou', name: '广州', name_i18n: { en: 'Guangzhou' }, is_default: false, sort_order: 2 },
    { value: 'shenZhen', name: '深圳', name_i18n: { en: 'Shenzhen' }, is_default: false, sort_order: 3 }
  ],
  groups: [
    { slug: 'network', name: '网络', name_i18n: { en: 'Network' }, sort_order: 0 },
    { slug: 'media', name: '媒体', name_i18n: { en: 'Media' }, sort_order: 1 },
    { slug: 'nas', name: 'NAS', name_i18n: { en: 'NAS' }, sort_order: 2 },
    { slug: 'tools', name: '工具', name_i18n: { en: 'Tools' }, sort_order: 3 }
  ],
  items: [
    // (omitted here; same as bootstrap.json items section from Task 1)
  ]
};
