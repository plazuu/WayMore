import { defaultApiBaseUrl } from '@/config';

let apiBaseUrl = defaultApiBaseUrl();

/** Called by SettingsProvider when the server URL is edited in Settings. */
export function setApiBaseUrl(url: string) {
  apiBaseUrl = url.trim().replace(/\/$/, '');
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

/** Turns a server-relative path (`photoUrl`, `audioUrl`) into a loadable URL. */
export function resolveServerUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${apiBaseUrl}${path}`;
}

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

/** JSON request to our server. Throws `ApiError` with a user-presentable message. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs = 30_000 } = options;
  const url = `${apiBaseUrl}${path}${toQueryString(query)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? 'The server took too long to respond.'
        : `Can't reach the server at ${apiBaseUrl}. Is it running?`,
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Every server error uses { error: string }.
    throw new ApiError(data?.error ?? `Request failed (${response.status})`, response.status);
  }
  return data as T;
}

function toQueryString(query?: RequestOptions['query']): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
