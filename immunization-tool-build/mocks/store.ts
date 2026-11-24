import { todayISO } from '@/lib/dates';
import { seedDb, type MockDb } from './db';
import type { MockStore } from './handlers';

export interface Persistence {
  load(): MockDb | null;
  save(db: MockDb): void;
  clear(): void;
}

export function createMockStore(persistence?: Persistence): MockStore {
  const store: MockStore = {
    db: persistence?.load() ?? seedDb(todayISO()),
    save: () => persistence?.save(store.db),
    reset: () => {
      persistence?.clear();
      store.db = seedDb(todayISO());
      store.save();
    },
  };
  return store;
}
