import { ScanScreen } from '@/components/scan/ScanScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 4b · Scan a Record · /child/[childId]/add/scan
export default function Screen_4b_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <ScanScreen params={params} />;
}
