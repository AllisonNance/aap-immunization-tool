import { AddChildrenScreen } from '@/components/onboarding/AddChildrenScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Screen 1b · Add Children (from Home/Settings) · /children/add?from=<origin>
export default function Screen_1b_Page() {
  return <AddChildrenScreen mode="later" />;
}
