/**
 * Browser-side fetch wrapper for the citizen write routes.
 *
 * Two things the forms need and `fetch` does not give by default:
 *
 *  - a TIMEOUT, so a slow or wedged network cannot leave a button spinning
 *    forever; and
 *  - a single RETRY on network/timeout failures only, so a flaky connection
 *    does not force the user to redo the work.
 *
 * HTTP responses (4xx/5xx) are NEVER retried: the server answered, and a retry
 * would only repeat a rejected write. Report creation is not deduplicated, so a
 * retry after a lost response could occasionally create a second row — an
 * acceptable trade for not losing a submission, and still a valid report.
 */

export interface ApiIssue {
  path: string;
  message: string;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  message?: string;
  issues?: ApiIssue[];
  /** True when no response arrived (offline, DNS, timeout). */
  network: boolean;
}

interface RequestOptions {
  timeoutMs?: number;
  /** Extra attempts AFTER the first on network failure (default 1). */
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = (await response.json().catch(() => null)) as
      | (Record<string, unknown> & { message?: string; error?: string; issues?: ApiIssue[] })
      | null;

    return {
      ok: response.ok,
      status: response.status,
      data: payload as T | null,
      error: typeof payload?.error === "string" ? payload.error : undefined,
      message: typeof payload?.message === "string" ? payload.message : undefined,
      issues: Array.isArray(payload?.issues) ? payload.issues : undefined,
      network: false,
    };
  } catch {
    return { ok: false, status: 0, data: null, network: true };
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(
  url: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? 1;

  let result = await attempt<T>(url, init, timeoutMs);
  for (let i = 0; i < retries && result.network; i += 1) {
    await sleep(400 * (i + 1));
    result = await attempt<T>(url, init, timeoutMs);
  }
  return result;
}

export function postJson<T>(
  url: string,
  body: unknown,
  options?: RequestOptions,
): Promise<ApiResult<T>> {
  return request<T>(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
}

export function postForm<T>(
  url: string,
  form: FormData,
  options?: RequestOptions,
): Promise<ApiResult<T>> {
  // No content-type header: the browser must set the multipart boundary.
  return request<T>(url, { method: "POST", body: form }, options);
}

/** First message for a field, for mapping server issues back onto a form. */
export function issueMap(
  issues: readonly ApiIssue[] | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of issues ?? []) {
    if (!map[issue.path]) map[issue.path] = issue.message;
  }
  return map;
}

/** A single friendly line for a failed request, network or HTTP. */
export function friendlyError<T>(result: ApiResult<T>): string {
  if (result.network) {
    return "Could not reach the server — check your connection and try again.";
  }
  return result.message ?? "Something went wrong. Please try again.";
}
