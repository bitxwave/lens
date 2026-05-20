import { writable, derived } from 'svelte/store';
import { siteList, defaultSiteIndex, type INavItem, navList, type ISite } from '$lib/constants/nav'

export const siteStore = writable<ISite>(siteList[defaultSiteIndex]);

export const availableNavListStore = derived<INavItem[]>(siteStore, (site: ISite) => {
  return navList.filter(nav => nav?.link?.[site.value]);
})