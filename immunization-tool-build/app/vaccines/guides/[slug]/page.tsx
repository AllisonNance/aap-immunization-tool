import { notFound } from 'next/navigation';
import { GuideScreen } from '@/components/guides/GuideScreen';
import { guideSlugs, isGuideSlug, readGuide } from '@/lib/guides';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

// Screen 7 · Vaccine Guide · /vaccines/guides/[slug]
export default async function Screen_7_Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isGuideSlug(slug)) notFound();
  return <GuideScreen docs={{ en: readGuide(slug, 'en'), es: readGuide(slug, 'es') }} />;
}
