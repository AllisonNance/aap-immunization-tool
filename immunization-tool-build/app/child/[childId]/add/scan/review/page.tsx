import { ReviewScanScreen } from '@/components/scan/ReviewScanScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 4c · Review Scan · /child/[childId]/add/scan/review?scan=<scanId>
export default function Screen_4c_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <ReviewScanScreen params={params} />;
}
