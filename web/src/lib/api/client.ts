import type { ZodSchema } from 'zod';
import { ApiErrorBodySchema, type ApiErrorBody } from '$lib/types/nav';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error;
    this.fields = body.fields;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiCallOptions<TRes> {
  method: Method;
  path: string;
  body?: unknown;
  responseSchema?: ZodSchema<TRes>;
  signal?: AbortSignal;
}

export async function apiClient<TRes = void>(opts: ApiCallOptions<TRes>): Promise<TRes> {
  const { method, path, body, responseSchema, signal } = opts;
  const headers: Record<string, string> = {};
  let serializedBody: BodyInit | undefined;

  if (body !== undefined) {
    if (body instanceof FormData) {
      serializedBody = body; // multipart upload
    } else {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(body);
    }
  }

  const res = await fetch(path, {
    method,
    headers,
    body: serializedBody,
    credentials: 'same-origin',
    signal
  });

  if (!res.ok) {
    let errBody: ApiErrorBody = { error: 'unknown', message: res.statusText };
    try {
      const json = await res.json();
      const parsed = ApiErrorBodySchema.safeParse(json);
      if (parsed.success) errBody = parsed.data;
    } catch {
      // body wasn't JSON — keep statusText fallback
    }
    throw new ApiError(res.status, errBody);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as TRes;
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json: unknown = await res.json();
    if (responseSchema) {
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) {
        throw new ApiError(res.status, {
          error: 'schema_mismatch',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        });
      }
      return parsed.data;
    }
    return json as TRes;
  }

  // Non-JSON success (e.g. /api/favicon returning image/*) — return raw response
  return res as unknown as TRes;
}
