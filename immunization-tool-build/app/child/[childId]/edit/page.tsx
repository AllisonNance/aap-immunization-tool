import { EditChildScreen } from '@/components/child/EditChildScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 3 · Edit Child · /child/[childId]/edit
export default function Screen_3_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <EditChildScreen params={params} />;
}
