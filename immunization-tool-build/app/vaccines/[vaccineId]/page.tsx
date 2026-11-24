import { VaccineDetailScreen } from '@/components/vaccines/VaccineDetailScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 6a · Vaccine Detail · /vaccines/[vaccineId]
export default function Screen_6a_Page({ params }: { params: Promise<{ vaccineId: string }> }) {
  return <VaccineDetailScreen params={params} />;
}
