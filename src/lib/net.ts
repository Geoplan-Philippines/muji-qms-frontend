/**
 * HTTP helpers hardened for the kiosk deployment.
 *
 * Every request crosses the shop LAN to the mini PC from Android devices whose
 * WebView will leave a `fetch` hanging indefinitely after a Wi-Fi roam, and
 * which will happily serve a stale 200 out of the HTTP cache. So every call
 * here gets a hard timeout and `no-store`, and failures carry enough shape for
 * callers to decide whether retrying is safe.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export interface RequestFailure extends Error {
  /** HTTP status, or 0 when no response was ever received. */
  status: number;
  /** True when the request timed out or never reached the server at all. */
  transport: boolean;
}

export function isRequestFailure(err: unknown): err is RequestFailure {
  return err instanceof Error && typeof (err as RequestFailure).status === "number";
}

/**
 * Retrying is safe when the request either never reached the server or the
 * server itself failed to handle it. A 4xx is the server saying "no" — repeating
 * it just wastes a round trip.
 */
export function isRetryable(err: unknown): boolean {
  if (!isRequestFailure(err)) return false;
  return err.transport || err.status >= 500 || err.status === 429;
}

function fail(message: string, status: number, transport: boolean): RequestFailure {
  return Object.assign(new Error(message), { status, transport });
}

async function describe(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { message?: string | string[] };
    const message = body?.message;
    if (Array.isArray(message) && message.length > 0) return message.join(", ");
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    /* not JSON — fall through to the bare status */
  }
  return `HTTP ${res.status}`;
}

/**
 * Core request. The timeout covers reading the body too, not just the headers —
 * a half-delivered response is exactly the shape a dying Wi-Fi link produces.
 */
async function send<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parse: (res: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", ...init, signal: controller.signal });
    if (!res.ok) throw fail(await describe(res), res.status, false);
    return await parse(res);
  } catch (err) {
    if (isRequestFailure(err)) throw err;
    const timedOut = controller.signal.aborted;
    throw fail(
      timedOut ? `No response after ${Math.round(timeoutMs / 1000)}s` : "Network unreachable",
      0,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function requestJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return send(url, init, timeoutMs, (res) => res.json() as Promise<T>);
}

export function requestVoid(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  return send(url, init, timeoutMs, async (res) => {
    // Drain the body so the connection can be reused rather than left dangling.
    await res.text().catch(() => "");
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `attempt`, retrying only failures that are safe to repeat, with an
 * exponential backoff. Callers that aren't idempotent must not use this.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  tries = 3,
  baseDelayMs = 400,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      if (i === tries - 1 || !isRetryable(err)) throw err;
      await sleep(baseDelayMs * 2 ** i);
    }
  }
  throw lastError;
}
