import { ChildSetupScreen } from '@/components/onboarding/ChildSetupScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 1c · Child Setup (adding later) · /children/add/setup/[childId]?start=&from=
export default function Screen_1c_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <ChildSetupScreen mode="later" params={params} />;
}
