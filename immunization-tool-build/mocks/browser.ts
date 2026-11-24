// Dev-only MSW worker. The mock "server" database persists to localStorage so
// it survives a page reload. This is the one, mock-only exception to the
// no-browser-storage rule (SPEC.md §5a); the real app never stores child data
// in the browser.
import { setupWorker } from 'msw/browser';
import { fixturesHash, type MockDb } from './db';
import { createHandlers } from './handlers';
import { createMockStore } from './store';

const KEY = 'aap-imm-mock-api-db';

const store = createMockStore({
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      const db = raw ? (JSON.parse(raw) as MockDb) : null;
      // Reseed if the fixtures changed since this copy was saved.
      return db?.version === 1 && db.fixturesHash === fixturesHash ? db : null;
    } catch {
      return null;
    }
  },
  save(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      // Storage full or blocked: the mock keeps working in memory.
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  },
});

// Injected failures (PUT /api/__dev/fail) survive a reload so e2e tests can
// navigate; sessionStorage, mock config only (no child data).
const FAULTS = 'aap-imm-mock-api-faults';
store.faults = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem(FAULTS) ?? '[]') as string[];
    } catch {
      return [];
    }
  },
  set(paths) {
    try {
      if (paths.length) sessionStorage.setItem(FAULTS, JSON.stringify(paths));
      else sessionStorage.removeItem(FAULTS);
    } catch {}
  },
};

export const worker = setupWorker(...createHandlers(store));

export function startWorker() {
  return worker.start({
    quiet: true,
    // Let Next.js assets and HMR through; warn on unmocked /api calls.
    onUnhandledFrame({ frame, defaults }) {
      const request = (frame as { request?: unknown }).request;
      if (request instanceof Request && new URL(request.url).pathname.startsWith('/api/')) defaults.warn();
    },
  });
}
