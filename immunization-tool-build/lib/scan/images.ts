'use client';
// Photos taken in Scan a Record (4b), kept so Review Scan (4c) can show them.
// In-memory object URLs only — never browser storage (SPEC.md §5a, §10). The
// real service would return image URLs from the caregiver's account.
const byScan = new Map<string, string[]>();

export function rememberScanImages(scanId: string, urls: string[]) {
  byScan.set(scanId, urls);
}

export function scanImages(scanId: string): string[] {
  return byScan.get(scanId) ?? [];
}

export function forgetScanImages(scanId: string) {
  for (const url of byScan.get(scanId) ?? []) URL.revokeObjectURL(url);
  byScan.delete(scanId);
}
