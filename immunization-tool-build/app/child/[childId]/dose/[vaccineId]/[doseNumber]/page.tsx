import { DoseEditScreen } from '@/components/record/DoseEditScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 4 · Dose Edit · /child/[childId]/dose/[vaccineId]/[doseNumber]
export default function Screen_4_Page({ params }: { params: Promise<{ childId: string; vaccineId: string; doseNumber: string }> }) {
  return <DoseEditScreen params={params} />;
}
