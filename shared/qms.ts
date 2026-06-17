/** A queue number is the last N digits of a scanned/typed receipt barcode. */
export const LAST_DIGITS = 4;

export type QueueStatus = "preparing" | "ready" | "holding";

export interface QueueItem {
  id?: string;     // backend UUID — present when connected to the real backend
  number: string;  // zero-padded LAST_DIGITS-wide display number, e.g. "0042"
  status: QueueStatus;
  since: number;   // epoch ms
}

/** Zero-pad a raw value's last LAST_DIGITS digits, or null if it has none. */
export function extractNumber(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 1) return null;
  return digits.slice(-LAST_DIGITS).padStart(LAST_DIGITS, "0");
}

/**
 * Parse a backend timestamp into epoch milliseconds.
 *
 * The backend stores instants in UTC, but depending on the DB column type and
 * serializer it may send them either WITH a zone designator ("...Z" or
 * "+08:00") or as a NAIVE string ("2026-06-17 10:00:00" / "2026-06-17T10:00:00").
 * `new Date()` interprets a naive date-time as *local* time, which silently
 * shifts every order's age by the device's UTC offset — that's what produces
 * the bogus "17h" ages on orders that were just created. We normalise naive
 * strings to UTC so the age is measured against a real instant.
 *
 * Also accepts epoch numbers (seconds or milliseconds). Returns NaN when the
 * value cannot be parsed, so callers can render a placeholder instead of "NaN".
 */
export function parseServerTime(value: string | number | null | undefined): number {
  if (value == null) return NaN;
  if (typeof value === "number") {
    // 10-digit values are epoch seconds; 13-digit are milliseconds.
    return value < 1e12 ? value * 1000 : value;
  }
  const s = value.trim();
  if (!s) return NaN;
  // Epoch delivered as a string ("1718600000" = seconds, "1718600000000" = ms).
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? n * 1000 : n;
  }
  const normalized = s.replace(" ", "T");
  const hasTime = normalized.includes("T");
  const hasZone = /([zZ])$|([+-]\d{2}:?\d{2})$/.test(normalized);
  // Naive date-time (has a time, no zone) → treat as UTC by appending "Z".
  const iso = hasTime && !hasZone ? `${normalized}Z` : normalized;
  return new Date(iso).getTime();
}

/**
 * Human label for how long an order has been waiting.
 * Guards against un-parseable (`NaN`) and future timestamps so a clock skew or
 * bad payload renders "—"/"just now" rather than "NaNh" or a negative age.
 */
export function waitLabel(since: number, now: number): string {
  if (!Number.isFinite(since)) return "—";
  const mins = Math.floor(Math.max(0, now - since) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}
