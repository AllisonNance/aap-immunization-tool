// Guide content (SPEC.md §6.7): Markdown per locale in content/guides/[slug].[locale].md.
// Server-only: read from disk at build time and handed to the client as parsed blocks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locale } from '@/lib/api/schemas';
import { parseMarkdown, type MarkdownDoc } from '@/lib/markdown';
import { guideList } from './guideList';

export const guideSlugs = guideList;
export type GuideSlug = (typeof guideSlugs)[number];

export function isGuideSlug(slug: string): slug is GuideSlug {
  return (guideSlugs as readonly string[]).includes(slug);
}

export function readGuide(slug: GuideSlug, locale: Locale): MarkdownDoc {
  return parseMarkdown(readFileSync(join(process.cwd(), 'content', 'guides', `${slug}.${locale}.md`), 'utf8'));
}
