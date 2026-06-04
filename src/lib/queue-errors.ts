import type { QueueError } from "./use-queue";

/**
 * Human-readable copy for a rejected queue action. Shared by every staff
 * station so the same failure always reads the same way.
 */
export function formatQueueError(e: QueueError): string {
  const n = e.number ?? "That number";
  switch (e.error) {
    case "already_preparing":
      return `${n} is already preparing`;
    case "already_ready":
      return `${n} is already serving`;
    case "not_found":
      return `${n} is not in the queue`;
    case "not_ready":
      return `${n} is still preparing`;
    case "invalid_scan":
    case "invalid_number":
      return "Could not read a number";
    case "nothing_to_undo":
      return "Nothing to undo";
    default:
      return "Something went wrong";
  }
}
