import type { Metadata, Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { Providers } from '@/components/providers/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'AAP Immunization Tool',
  description: "Track each child's vaccines, learn why each matters, and prepare for pediatrician visits.",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

// Static shell only. Everything inside Providers renders in the browser,
// because account data comes from the API there (SPEC.md §5a). That boundary
// can't be prerendered, so this layout opts out of instant-UI validation.
export const instant = false;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<div aria-busy="true" style={{ minHeight: '100dvh' }} />}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
