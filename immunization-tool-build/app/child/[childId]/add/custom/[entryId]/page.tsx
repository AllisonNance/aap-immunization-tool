import { CustomVaccineScreen } from '@/components/record/CustomVaccineScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 4d · Custom Vaccine (edit) · /child/[childId]/add/custom/[entryId]
export default function Screen_4d_Page({ params }: { params: Promise<{ childId: string; entryId: string }> }) {
  return <CustomVaccineScreen params={params} />;
}
