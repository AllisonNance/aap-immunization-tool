// Typed functions for every endpoint in SPEC.md §5a. Components use these (via
// the hooks in ./hooks) and never call fetch directly.
import { z } from 'zod';
import type { ReminderMessage } from '@/lib/services';
import { apiRequest } from './client';
import {
  accountSchema,
  childRecordSchema,
  childSchema,
  customVaccineEntrySchema,
  doseRecordSchema,
  exemptionSchema,
  myAccountChildSchema,
  questionSchema,
  reminderPrefsSchema,
  scanSessionSchema,
  type Account,
  type Child,
  type CustomVaccineEntry,
  type DoseRecord,
  type ExtractedDose,
  type NewChild,
  type NewCustomVaccine,
  type NewDose,
  type NewExemption,
  type NewQuestion,
  type Patch,
  type Question,
  type ReminderPrefs,
} from './schemas';

const c = (childId: string) => `/api/children/${encodeURIComponent(childId)}`;

// Session: mock AAP My Account sign-in. The real service is a redirect flow
// that ends with the server setting an HTTP-only cookie.
export const session = {
  /** `accountKey` is mock-only: which sample account to sign in to (default: the one chosen on /start). */
  login: (accountKey?: string) => apiRequest('/api/session', { method: 'POST', body: accountKey ? { accountKey } : {} }),
  logout: () => apiRequest('/api/session', { method: 'DELETE' }),
};

export const account = {
  get: () => apiRequest('/api/account', { schema: accountSchema }),
  patch: (patch: Patch<Account>) => apiRequest('/api/account', { method: 'PATCH', body: patch, schema: accountSchema }),
  myAccountChildren: () => apiRequest('/api/account/my-account-children', { schema: z.array(myAccountChildSchema) }),
};

export const children = {
  list: () => apiRequest('/api/children', { schema: z.array(childSchema) }),
  create: (batch: NewChild[]) => apiRequest('/api/children', { method: 'POST', body: batch, schema: z.array(childSchema) }),
  get: (id: string) => apiRequest(c(id), { schema: childSchema }),
  patch: (id: string, patch: Patch<Child>) => apiRequest(c(id), { method: 'PATCH', body: patch, schema: childSchema }),
  remove: (id: string) => apiRequest(c(id), { method: 'DELETE' }),
  record: (id: string) => apiRequest(`${c(id)}/record`, { schema: childRecordSchema }),
};

export const doses = {
  create: (childId: string, dose: NewDose) =>
    apiRequest(`${c(childId)}/doses`, { method: 'POST', body: dose, schema: doseRecordSchema }),
  patch: (childId: string, id: string, patch: Patch<DoseRecord>) =>
    apiRequest(`${c(childId)}/doses/${id}`, { method: 'PATCH', body: patch, schema: doseRecordSchema }),
  remove: (childId: string, id: string) => apiRequest(`${c(childId)}/doses/${id}`, { method: 'DELETE' }),
};

export const customVaccines = {
  create: (childId: string, entry: NewCustomVaccine) =>
    apiRequest(`${c(childId)}/custom-vaccines`, { method: 'POST', body: entry, schema: customVaccineEntrySchema }),
  patch: (childId: string, id: string, patch: Patch<CustomVaccineEntry>) =>
    apiRequest(`${c(childId)}/custom-vaccines/${id}`, { method: 'PATCH', body: patch, schema: customVaccineEntrySchema }),
  remove: (childId: string, id: string) => apiRequest(`${c(childId)}/custom-vaccines/${id}`, { method: 'DELETE' }),
};

export const exemptions = {
  create: (childId: string, e: NewExemption) =>
    apiRequest(`${c(childId)}/exemptions`, { method: 'POST', body: e, schema: exemptionSchema }),
  remove: (childId: string, id: string) => apiRequest(`${c(childId)}/exemptions/${id}`, { method: 'DELETE' }),
};

export const questions = {
  list: (childId: string) => apiRequest(`${c(childId)}/questions`, { schema: z.array(questionSchema) }),
  create: (childId: string, q: NewQuestion) =>
    apiRequest(`${c(childId)}/questions`, { method: 'POST', body: q, schema: questionSchema }),
  patch: (childId: string, id: string, patch: Patch<Question>) =>
    apiRequest(`${c(childId)}/questions/${id}`, { method: 'PATCH', body: patch, schema: questionSchema }),
};

export const scans = {
  upload: (childId: string, images: Blob[]) => {
    const form = new FormData();
    images.forEach((img, i) => form.append('images', img, `page-${i + 1}`));
    return apiRequest(`${c(childId)}/scans`, { method: 'POST', body: form, schema: scanSessionSchema });
  },
  get: (childId: string, scanId: string) => apiRequest(`${c(childId)}/scans/${scanId}`, { schema: scanSessionSchema }),
  commit: (childId: string, scanId: string, extracted: ExtractedDose[]) =>
    apiRequest(`${c(childId)}/scans/${scanId}/commit`, {
      method: 'POST',
      body: { extracted },
      schema: z.object({ dosesAdded: z.number(), customVaccinesAdded: z.number(), customVaccines: z.array(customVaccineEntrySchema) }),
    }),
  discard: (childId: string, scanId: string) => apiRequest(`${c(childId)}/scans/${scanId}`, { method: 'DELETE' }),
};

export const reminders = {
  get: () => apiRequest('/api/reminders', { schema: reminderPrefsSchema }),
  put: (prefs: ReminderPrefs) => apiRequest('/api/reminders', { method: 'PUT', body: prefs, schema: reminderPrefsSchema }),
};

/** Dev-only prototype controls on the mock API. */
export const dev = {
  getSampleAccount: () => apiRequest('/api/__dev/sample-account', { schema: z.object({ accountKey: z.string() }) }),
  setSampleAccount: (accountKey: string) =>
    apiRequest('/api/__dev/sample-account', { method: 'PUT', body: { accountKey }, schema: z.object({ accountKey: z.string() }) }),
  reset: () => apiRequest('/api/__dev/reset', { method: 'POST' }),
  /** Mock NotificationService: logs reminders to the dev panel instead of sending them. */
  sendReminders: (messages: ReminderMessage[]) =>
    apiRequest('/api/__dev/reminders', { method: 'POST', body: messages, schema: z.object({ sent: z.number() }) }),
  sentReminders: () =>
    apiRequest('/api/__dev/reminders', {
      schema: z.array(
        z.object({ childId: z.string(), channel: z.enum(['sms', 'email']), to: z.string(), body: z.string(), deepLink: z.string(), sentAt: z.string() }),
      ),
    }),
};
