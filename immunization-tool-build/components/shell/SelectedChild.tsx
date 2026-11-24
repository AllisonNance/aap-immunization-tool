'use client';
// Which child the current screen is about. Child context always carries across
// links (SPEC.md §4): the URL wins, then the last child picked, then the first.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useChildren } from '@/lib/api/hooks';
import { isSetUp, type SetUpChild } from '@/lib/api/schemas';
import { childIdFromLocation, hrefForChild, routeMeta } from '@/lib/routes';

interface SelectedChildValue {
  /** Set-up children only; drafts from 1b aren't selectable yet. */
  children: SetUpChild[];
  selected: SetUpChild | undefined;
  /** The URL names a child that isn't on this account. */
  urlChildMissing: boolean;
  select(childId: string): void;
  /** Vaccines tab only: "No child" hides the child module (SPEC.md §13 default). */
  noChildAllowed: boolean;
  noChild: boolean;
  selectNoChild(): void;
  isLoading: boolean;
}

const Ctx = createContext<SelectedChildValue | null>(null);

export function useSelectedChild() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSelectedChild outside SelectedChildProvider');
  return v;
}

export function SelectedChildProvider({ enabled, children: content }: { enabled: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const { data: all = [], isLoading } = useChildren(enabled);
  const children = all.filter(isSetUp);
  const [lastPicked, setLastPicked] = useState<string>();
  const [noChildPicked, setNoChildPicked] = useState(false);
  const noChildAllowed = routeMeta(pathname)?.tab === 'vaccines';

  const urlChildId = childIdFromLocation(pathname, new URLSearchParams(search));
  const fromUrl = urlChildId ? children.find((c) => c.id === urlChildId) : undefined;
  const fromLast = lastPicked ? children.find((c) => c.id === lastPicked) : undefined;
  const noChild = noChildAllowed && noChildPicked && !fromUrl;
  const selected = noChild ? undefined : (fromUrl ?? (urlChildId ? undefined : (fromLast ?? children[0])));

  // Remember the URL's child so Vaccines/Settings keep showing it.
  // (Adjusting state during render, not in an effect, avoids an extra pass.)
  if (fromUrl && lastPicked !== fromUrl.id) setLastPicked(fromUrl.id);

  const value: SelectedChildValue = {
    children,
    selected,
    isLoading,
    urlChildMissing: !!urlChildId && !isLoading && enabled && !all.some((c) => c.id === urlChildId),
    noChildAllowed,
    noChild,
    selectNoChild() {
      setNoChildPicked(true);
    },
    select(childId) {
      setLastPicked(childId);
      setNoChildPicked(false);
      const href = hrefForChild(pathname, new URLSearchParams(search), childId);
      if (href) router.replace(href, { scroll: false });
    },
  };

  return <Ctx value={value}>{content}</Ctx>;
}
