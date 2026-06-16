import type { QueueError } from "./use-queue";

export function formatQueueError(e: QueueError): string {
  switch (e.code) {
    case "invalid_scan":
      return "Could not read a number from the barcode";
    case "dup_preparing":
      return e.number ? `${e.number} is already preparing` : "Order is already preparing";
    case "dup_ready":
      return e.number ? `${e.number} is already being served` : "Order is already being served";
    case "dup_holding":
      return e.number ? `${e.number} is already set to serve later` : "Order is already set to serve later";
    case "dup_used":
      return e.number
        ? `${e.number} is already in use but not on the board`
        : "That number is already in use";
    case "already_exists":
      return e.number ? `${e.number} is already in the queue` : "Order is already in the queue";
    case "scan_failed":
      return e.number ? `Could not add ${e.number} — ${e.message}` : e.message;
    case "serve_failed":
      return e.number ? `Could not serve ${e.number}` : "Could not serve order";
    case "hold_failed":
      return e.number ? `Could not save ${e.number} for later` : "Could not save order for later";
    case "collect_failed":
      return e.number ? `Could not collect ${e.number}` : "Could not collect order";
    case "unready_failed":
      return e.number ? `Could not return ${e.number} to preparing` : "Could not return order";
    case "not_supported":
      return e.message;
    default:
      return e.message || "Something went wrong";
  }
}
