// Thin fetch wrapper for the FastAPI backend. In dev, Vite proxies /api to :8000.
export class ApiError extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export function getOpsKey(): string {
  try {
    return localStorage.getItem('opsKey') ?? '';
  } catch {
    return '';
  }
}
export function setOpsKey(k: string) {
  try {
    localStorage.setItem('opsKey', k);
  } catch {
    /* ignore */
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const key = getOpsKey();
  if (key && path.startsWith('/api/ops')) headers['X-Ops-Key'] = key;
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'http_error', e.message ?? `Request failed (${res.status})`, e);
  }
  return data as T;
}

export const qs = (p: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && s.set(k, String(v)));
  const out = s.toString();
  return out ? `?${out}` : '';
};
