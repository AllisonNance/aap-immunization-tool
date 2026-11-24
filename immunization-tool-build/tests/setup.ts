import { afterAll, afterEach, beforeAll } from 'vitest';
import { mockStore, server } from '@/mocks/node';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  mockStore.reset();
});
afterAll(() => server.close());
