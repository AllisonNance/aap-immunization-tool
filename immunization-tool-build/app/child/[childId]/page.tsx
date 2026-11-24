import { ChildScreen } from '@/components/child/ChildScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 2 · Single Child Page · /child/[childId]
export default function Screen_2_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <ChildScreen params={params} />;
}
