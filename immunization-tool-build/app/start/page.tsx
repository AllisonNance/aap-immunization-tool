import { SampleDataScreen } from './SampleDataScreen';

// Rendered in the browser under the root layout's data boundary.
export const instant = false;

// Prototype entry · Choose sample data · /start (dev only; not an IA screen)
export default function StartPage() {
  return <SampleDataScreen />;
}
