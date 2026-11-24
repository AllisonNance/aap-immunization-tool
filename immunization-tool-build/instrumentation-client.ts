// Runs in the browser only, before hydration. Starts the MSW mock of the
// HealthyChildren.org account API (SPEC.md §5a). Kept here, not in a
// component, because `msw/browser` can't be bundled for the server.
import { apiMockingEnabled } from '@/lib/config';

declare global {
  interface Window {
    __apiMockReady?: Promise<unknown>;
  }
}

if (apiMockingEnabled) {
  window.__apiMockReady = import('./mocks/browser').then((m) => m.startWorker());
}
