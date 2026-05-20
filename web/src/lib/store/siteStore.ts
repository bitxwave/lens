import { writable, derived, type Readable } from 'svelte/store';
import { siteList, defaultSiteIndex, type INavItem, navList, type ISite } from '$lib/constants/nav';

export const siteStore = writable<ISite>(siteList[defaultSiteIndex]);

export const availableNavListStore: Readable<INavItem[]> = derived(siteStore, ($site: ISite) =>
  navList.filter((nav) => nav?.link?.[$site.value])
);
