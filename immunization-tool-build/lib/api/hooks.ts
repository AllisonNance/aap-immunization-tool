'use client';
// TanStack Query hooks over ./endpoints. The in-memory query cache is the only
// place child data lives in the browser; logout clears it (SPEC.md §5a, §10).
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from './client';
import * as api from './endpoints';
import { AGREEMENT_VERSION } from '@/lib/config';
import type { Account, Child, Locale, NewQuestion, Patch, Question, ReminderPrefs } from './schemas';

export const queryKeys = {
  account: ['account'] as const,
  children: ['children'] as const,
  child: (id: string) => ['children', id] as const,
  record: (id: string) => ['children', id, 'record'] as const,
  questions: (id: string) => ['children', id, 'questions'] as const,
  myAccountChildren: ['account', 'my-account-children'] as const,
  reminders: ['reminders'] as const,
};

/** The signed-in account, or null when there is no session (401). */
export function useAccount() {
  return useQuery({
    queryKey: queryKeys.account,
    queryFn: async (): Promise<Account | null> => {
      try {
        return await api.account.get();
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'unauthorized') return null;
        throw e;
      }
    },
  });
}

export function useChildren(enabled = true) {
  return useQuery({ queryKey: queryKeys.children, queryFn: api.children.list, enabled });
}

export function useChildRecord(childId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.record(childId ?? ''),
    queryFn: () => api.children.record(childId!),
    enabled: !!childId,
  });
}

/** Records for several children at once (Home). Results line up with `childIds`. */
export function useChildRecords(childIds: string[]) {
  return useQueries({
    queries: childIds.map((id) => ({ queryKey: queryKeys.record(id), queryFn: () => api.children.record(id) })),
  });
}

export function useQuestions(childId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.questions(childId ?? ''),
    queryFn: () => api.questions.list(childId!),
    enabled: !!childId,
  });
}

/** Questions for several children at once (Home's open-questions count). */
export function useQuestionsFor(childIds: string[]) {
  return useQueries({
    queries: childIds.map((id) => ({ queryKey: queryKeys.questions(id), queryFn: () => api.questions.list(id) })),
  });
}

/** Add a question (Visit Prep, Vaccine detail). */
export function useCreateQuestion(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (q: NewQuestion) => api.questions.create(childId, q),
    onSuccess: (q) => qc.setQueryData<Question[]>(queryKeys.questions(childId), (old = []) => [...old, q]),
  });
}

/** Edit or resolve a question. Optimistic (a low-risk toggle, SPEC.md §5a); rolled back on failure. */
export function useUpdateQuestion(childId: string) {
  const qc = useQueryClient();
  const key = queryKeys.questions(childId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch<Question> }) => api.questions.patch(childId, id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Question[]>(key);
      qc.setQueryData<Question[]>(key, (old = []) => old.map((q) => (q.id === id ? { ...q, ...patch, updatedAt: q.updatedAt } : q)));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (q) => qc.setQueryData<Question[]>(key, (old = []) => old.map((x) => (x.id === q.id ? q : x))),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.session.login,
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.session.logout,
    // Drop every cached record, not just mark it stale.
    onSettled: () => qc.clear(),
  });
}

export function useMyAccountChildren() {
  return useQuery({ queryKey: queryKeys.myAccountChildren, queryFn: api.account.myAccountChildren });
}

/** PATCH the account from the latest cached copy (sends its updatedAt for 409 checks). */
function usePatchAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Omit<Patch<Account>, 'updatedAt'>) => {
      const current = qc.getQueryData<Account | null>(queryKeys.account);
      if (!current) throw new Error('Not signed in');
      return api.account.patch({ ...patch, updatedAt: current.updatedAt });
    },
    onSuccess: (account) => qc.setQueryData(queryKeys.account, account),
    onError: (e) => {
      if (e instanceof ApiError && e.isConflict) qc.invalidateQueries({ queryKey: queryKeys.account });
    },
  });
}

/** 1a: record acceptance of the current agreement version. */
export function useAcceptAgreement() {
  const patch = usePatchAccount();
  return {
    ...patch,
    accept: () => patch.mutateAsync({ agreementVersionAccepted: AGREEMENT_VERSION, agreementAcceptedAt: new Date().toISOString() }),
  };
}

/** 1c Finish on the last child. */
export function useCompleteOnboarding() {
  const patch = usePatchAccount();
  return { ...patch, complete: () => patch.mutateAsync({ onboardingComplete: true }) };
}

/** 1b Continue: create every selected/added child in one batch. */
export function useCreateChildren() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.children.create,
    onSuccess: (created) => qc.setQueryData<Child[]>(queryKeys.children, (old = []) => [...old, ...created]),
  });
}

/** Save one child (1c Next/Finish, 3 Save). Refetches on 409 so the form can show the latest. */
export function useUpdateChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch<Child> }) => api.children.patch(id, patch),
    onSuccess: (child) =>
      qc.setQueryData<Child[]>(queryKeys.children, (old = []) => old.map((c) => (c.id === child.id ? child : c))),
    onError: (e) => {
      if (e instanceof ApiError && e.isConflict) qc.invalidateQueries({ queryKey: queryKeys.children });
    },
  });
}

export function useReminders(enabled = true) {
  return useQuery({ queryKey: queryKeys.reminders, queryFn: api.reminders.get, enabled });
}

/** Turn reminders for one child on or off (1c, Settings). Keeps the rest of the prefs. */
export function useSetChildReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ childId, on }: { childId: string; on: boolean }) => {
      const prefs: ReminderPrefs =
        qc.getQueryData<ReminderPrefs>(queryKeys.reminders) ??
        (await qc.fetchQuery({ queryKey: queryKeys.reminders, queryFn: api.reminders.get }));
      if (!!prefs.perChild[childId] === on) return prefs; // nothing to change
      return api.reminders.put({ ...prefs, perChild: { ...prefs.perChild, [childId]: on } });
    },
    onSuccess: (prefs) => qc.setQueryData(queryKeys.reminders, prefs),
    onError: (e) => {
      if (e instanceof ApiError && e.isConflict) qc.invalidateQueries({ queryKey: queryKeys.reminders });
    },
  });
}

export function useSetLocale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locale: Locale) => {
      const current = qc.getQueryData<Account | null>(queryKeys.account);
      if (!current) throw new Error('Not signed in');
      return api.account.patch({ locale, updatedAt: current.updatedAt });
    },
    // Optimistic: the whole UI switches language on tap; rolled back on failure.
    onMutate: async (locale) => {
      await qc.cancelQueries({ queryKey: queryKeys.account });
      const previous = qc.getQueryData<Account | null>(queryKeys.account);
      if (previous) qc.setQueryData(queryKeys.account, { ...previous, locale });
      return { previous };
    },
    onSuccess: (account) => qc.setQueryData(queryKeys.account, account),
    onError: (e, _locale, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.account, ctx.previous);
      if (e instanceof ApiError && e.isConflict) qc.invalidateQueries({ queryKey: queryKeys.account });
    },
  });
}
