// The one place that calls fetch. Validates every response with Zod and turns
// HTTP errors into ApiError. Session is an HTTP-only cookie (credentials:
// 'same-origin'); the client never touches tokens (SPEC.md §5a).
import type { ZodType } from 'zod';
import { apiErrorBodySchema } from './schemas';

export type ApiErrorKind = 'unauthorized' | 'notFound' | 'conflict' | 'validation' | 'network' | 'server';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** Another device changed this record; reload it and tell the caregiver. */
  get isConflict() {
    return this.kind === 'conflict';
  }
}

function kindFor(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  return 'server';
}

// Absolute base so the same client works in the browser, Vitest and Node.
function baseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.API_BASE_URL ?? 'http://localhost:3000';
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  schema?: ZodType<T>;
}

export async function apiRequest<T = void>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const { method = 'GET', body, schema } = opts;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(new URL(path, baseUrl()), {
      method,
      credentials: 'same-origin',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError('network', 0, e instanceof Error ? e.message : 'Network error');
  }

  if (!res.ok) {
    const parsed = apiErrorBodySchema.safeParse(await res.json().catch(() => null));
    throw new ApiError(kindFor(res.status), res.status, parsed.success ? (parsed.data.message ?? parsed.data.error) : res.statusText);
  }
  if (!schema || res.status === 204) return undefined as T;
  const result = schema.safeParse(await res.json());
  if (!result.success) {
    throw new ApiError('server', res.status, `Unexpected response from ${method} ${path}: ${result.error.message}`);
  }
  return result.data;
}
