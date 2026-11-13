import { createContext, useContext, useSyncExternalStore } from 'react';
import { defaultLocale, strings, type Locale } from './i18n';
import type { Services, SyncStatus } from './services';

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('Services not ready');
  return s;
}

/** Re-renders the caller whenever the local replica changes. */
export function useRepo() {
  const { repo } = useServices();
  useSyncExternalStore(repo.subscribe, repo.getRevision);
  return repo;
}

export function useSyncStatus(): SyncStatus {
  const { sync } = useServices();
  return useSyncExternalStore(sync.subscribe, sync.getStatus);
}

export function useLocale(): { locale: Locale; t: (typeof strings)['en'] } {
  const repo = useRepo();
  const locale = repo.setting<Locale>('locale', defaultLocale());
  return { locale, t: strings[locale] ?? strings.en };
}

const noSubscribe = () => () => {};
const zero = () => 0;

/** The group manager (null when Drive is not configured); re-renders on group changes. */
export function useGroups() {
  const { sync } = useServices();
  useRepo();
  useSyncExternalStore(sync.groups?.subscribe ?? noSubscribe, sync.groups?.getRevision ?? zero);
  return sync.groups;
}
