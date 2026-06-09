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
