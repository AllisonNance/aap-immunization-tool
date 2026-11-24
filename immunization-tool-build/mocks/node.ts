// MSW for Vitest. In-memory only; reset between tests with mockStore.reset().
import { setupServer } from 'msw/node';
import { createHandlers } from './handlers';
import { createMockStore } from './store';

export const mockStore = createMockStore();
export const server = setupServer(...createHandlers(mockStore));
