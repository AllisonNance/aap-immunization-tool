import { RecordExportScreen } from '@/components/child/RecordExportScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 2 · Export (print / PDF) · /child/[childId]/record
export default function Screen_2_Export_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <RecordExportScreen params={params} />;
}
