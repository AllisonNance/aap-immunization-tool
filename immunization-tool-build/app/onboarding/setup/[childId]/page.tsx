import { ChildSetupScreen } from '@/components/onboarding/ChildSetupScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 1c · Child Setup · /onboarding/setup/[childId]
export default function Screen_1c_Page({ params }: { params: Promise<{ childId: string }> }) {
  return <ChildSetupScreen mode="onboarding" params={params} />;
}
