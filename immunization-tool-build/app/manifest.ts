import type { MetadataRoute } from 'next';

// PWA manifest (SPEC.md §2). No child data is kept offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AAP Immunization Tool',
    short_name: 'Immunizations',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [{ src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' }],
  };
}
