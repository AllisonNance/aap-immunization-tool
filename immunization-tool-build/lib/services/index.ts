// Interfaces for external services (SPEC.md §1 "Out of v1", §6.4b, §6.8).
// The prototype only ships mock implementations (mocks/services/); real ones
// would sit behind the HealthyChildren.org API, not in the browser.
import type { ExtractedDose, MyAccountChild } from '@/lib/api/schemas';

/** AAP My Account: identity and the children on the caregiver's profile. */
export interface MyAccountService {
  getProfileChildren(myAccountId: string): Promise<MyAccountChild[]>;
}

/** Reads a photo of a paper record into candidate doses for review (4c). */
export interface OcrService {
  extract(input: { childDateOfBirth: string; images: string[] }): Promise<ExtractedDose[]>;
}

export interface ReminderMessage {
  accountId: string;
  childId: string;
  channel: 'sms' | 'email';
  to: string;
  /** Already localized text: what's due, the age window, the pediatrician's number. */
  body: string;
  /** Deep link to /child/[childId] (SPEC.md §4). */
  deepLink: string;
}

/** SMS/email delivery. The mock logs to a dev panel instead of sending. */
export interface NotificationService {
  send(message: ReminderMessage): Promise<void>;
}
