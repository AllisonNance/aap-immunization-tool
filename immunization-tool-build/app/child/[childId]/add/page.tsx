import { AddToRecordScreen } from '@/components/record/AddToRecordScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 4a · Add to Record · /child/[childId]/add (?vaccine= from 6a)
export default function Screen_4a_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <AddToRecordScreen params={params} />;
}
