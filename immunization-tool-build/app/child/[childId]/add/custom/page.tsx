import { CustomVaccineScreen } from '@/components/record/CustomVaccineScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 4d · Custom Vaccine · /child/[childId]/add/custom (?name= from 4a's search)
export default function Screen_4d_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <CustomVaccineScreen params={params} />;
}
