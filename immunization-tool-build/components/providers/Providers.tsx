'use client';
// Browser-only app root. Data comes from the caregiver's account through the
// mock API (MSW in the browser), so nothing below renders on the server.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { use, useState, type ReactNode } from 'react';
import { browser } from 'react-dom';
import { LocaleProvider } from './LocaleProvider';

const noMock = Promise.resolve();

export function Providers({ children }: { children: ReactNode }) {
  use(browser('Account data is loaded from the API in the browser.'));
  // Started in instrumentation-client.ts; wait so no request beats the worker.
  use(window.__apiMockReady ?? noMock);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>{children}</LocaleProvider>
    </QueryClientProvider>
  );
}
