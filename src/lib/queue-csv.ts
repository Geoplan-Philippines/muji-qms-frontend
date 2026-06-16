/**
 * CSV serialization for the queue board, used by the table station's
 * export/import. Pure string <-> items transforms so the component only deals
 * with files; sanitization of the queue model itself happens server-side in
 * the reducer's `import` case.
 */
import { extractNumber, type QueueItem, type QueueStatus } from "../../shared/qms.ts";

const HEADER = "number,status,since";

/** Serialize the board to CSV with a header row and ISO timestamps. */
export function itemsToCsv(items: QueueItem[]): string {
  const rows = items.map(
    (i) => `${i.number},${i.status},${new Date(i.since).toISOString()}`,
  );
  return [HEADER, ...rows].join("\r\n");
}

/**
 * Parse CSV text back into queue items. Tolerant by design: skips the header,
 * blank lines, malformed rows, and duplicate numbers so a hand-edited file
 * still imports cleanly. `since` accepts an ISO string or epoch milliseconds.
 */
export function csvToItems(text: string): QueueItem[] {
  const out: QueueItem[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const [numberCell, statusCell, sinceCell] = trimmed.split(",").map((c) => c.trim());
    const number = extractNumber(numberCell ?? "");
    if (!number || seen.has(number)) continue;

    seen.add(number);
    const status: QueueStatus = statusCell === "ready" ? "ready" : "preparing";
    out.push({ number, status, since: parseSince(sinceCell) });
  }

  return out;
}

/** Accept epoch milliseconds or an ISO date; fall back to now when unreadable. */
function parseSince(cell: string | undefined): number {
  if (cell) {
    const asNumber = Number(cell);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const asDate = Date.parse(cell);
    if (Number.isFinite(asDate)) return asDate;
  }
  return Date.now();
}
