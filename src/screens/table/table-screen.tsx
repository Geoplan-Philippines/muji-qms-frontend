import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { StationBar } from "../../components/station-bar";
import { NumericKeypad } from "../../components/numeric-keypad";
import { DigitEntry } from "../../components/digit-entry";
import { Flash } from "../../components/flash";
import { useClock } from "../../lib/use-clock";
import { useQueue } from "../../lib/use-queue";
import { useFlash } from "../../lib/use-flash";
import { formatQueueError } from "../../lib/queue-errors";
import { itemsToCsv, csvToItems } from "../../lib/queue-csv";
import { EASE_OUT_QUINT } from "../../lib/motion";
import { LAST_DIGITS, type QueueItem } from "../../../shared/qms.ts";
import "./table.css";

const TILE = { duration: 0.32, ease: EASE_OUT_QUINT };

function byAge(a: QueueItem, b: QueueItem): number {
  return a.since - b.since;
}

/** Compact "how long has this been preparing" label for service priority. */
function waitLabel(since: number, now: number): string {
  const mins = Math.floor((now - since) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function ReturnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 14 4 9l5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 9h11a5 5 0 0 1 0 10h-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="chip__check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TableScreen() {
  const { items, status, canUndo, lastError, markReady, collect, clear, importItems, undo } =
    useQueue();
  const now = useClock(1000);
  const { feedback, show } = useFlash();

  // Keypad entry. Tile taps go through the confirm dialog instead, so the two
  // input paths stay independent: keypad commits with Serve, tiles with the
  // dialog's confirm.
  const [entry, setEntry] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [lastServed, setLastServed] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const clearDialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openedAtRef = useRef(0);

  const preparing = useMemo(
    () => items.filter((i) => i.status === "preparing").sort(byAge),
    [items],
  );
  const ready = useMemo(
    () => items.filter((i) => i.status === "ready").sort(byAge),
    [items],
  );

  // Surface server rejections (unknown number, already serving, ...).
  useEffect(() => {
    if (lastError) show("error", lastError.number, formatQueueError(lastError));
  }, [lastError, show]);

  const pending = entry.length === LAST_DIGITS ? entry.padStart(LAST_DIGITS, "0") : null;

  const serve = useCallback(
    (number: string) => {
      markReady(number);
      show("ok", number, "now serving");
      setLastServed(number);
    },
    [markReady, show],
  );

  // Keypad path: the Serve button (or Enter) commits the typed number.
  const commitEntry = useCallback(() => {
    if (!pending) return;
    serve(pending);
    setEntry("");
  }, [pending, serve]);

  // Clear a served order once the customer collects it.
  const handleCollect = useCallback(
    (number: string) => {
      collect(number);
      show("ok", number, "picked up");
    },
    [collect, show],
  );

  const handleReturn = useCallback(() => {
    if (!canUndo || !lastServed) return;
    undo();
    show("ok", lastServed, "returned to preparing");
    setLastServed(null);
  }, [canUndo, lastServed, undo, show]);

  // Drive the native dialog from the `confirming` number.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && confirming && !dialog.open) {
      dialog.showModal();
      openedAtRef.current = Date.now();
    }
  }, [confirming]);

  const confirmServe = useCallback(() => {
    if (confirming) serve(confirming);
    dialogRef.current?.close();
  }, [confirming, serve]);

  // Drive the clear-confirmation dialog from `clearOpen`.
  useEffect(() => {
    const dialog = clearDialogRef.current;
    if (dialog && clearOpen && !dialog.open) dialog.showModal();
  }, [clearOpen]);

  const confirmClear = useCallback(() => {
    clear();
    show("ok", null, "queue cleared");
    setLastServed(null);
    clearDialogRef.current?.close();
  }, [clear, show]);

  // Download the current board as a CSV the operator can re-import later.
  const handleExport = useCallback(() => {
    const blob = new Blob([itemsToCsv(items)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, "");
    const link = document.createElement("a");
    link.href = url;
    link.download = `muji-queue-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    show("ok", null, `exported ${items.length}`);
  }, [items, show]);

  // Restore a board from a CSV file (replaces the current queue; undoable).
  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // let the same file be picked again later
      if (!file) return;
      try {
        const parsed = csvToItems(await file.text());
        if (parsed.length === 0) {
          show("error", null, "No valid rows in file");
          return;
        }
        importItems(parsed);
        setLastServed(null);
        show("ok", null, `imported ${parsed.length}`);
      } catch {
        show("error", null, "Could not read file");
      }
    },
    [importItems, show],
  );

  // Physical numeric keyboards drive the keypad entry.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (confirming || clearOpen) return; // a dialog owns the keyboard while open
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) return;
      if (/^[0-9]$/.test(event.key)) {
        setEntry((prev) => (prev + event.key).slice(-LAST_DIGITS));
      } else if (event.key === "Backspace") {
        setEntry((prev) => prev.slice(0, -1));
      } else if (event.key === "Enter") {
        commitEntry();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commitEntry, confirming, clearOpen]);

  const nowMs = now.getTime();

  return (
    <div className="table">
      <StationBar
        role="Table service"
        status={status}
        time={now}
        canUndo={canUndo}
        onUndo={undo}
      />

      <main className="table__main">
        <section className="pool" aria-label="Orders preparing">
          <header className="pool__head">
            <h2 className="pool__title">Preparing</h2>
            <span className="pool__count tnum" aria-label={`${preparing.length} orders`}>
              {preparing.length}
            </span>
            <p className="pool__hint">Tap an order to serve it</p>
          </header>

          {preparing.length === 0 ? (
            <p className="pool__empty">No orders preparing</p>
          ) : (
            <ul className="pool__grid">
              <AnimatePresence mode="popLayout" initial={false}>
                {preparing.map((item) => (
                  <motion.li
                    key={item.number}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={TILE}
                  >
                    <button
                      type="button"
                      className="pool__tile"
                      data-selected={item.number === confirming}
                      aria-haspopup="dialog"
                      onClick={() => setConfirming(item.number)}
                      aria-label={`Serve order ${item.number}, preparing ${waitLabel(item.since, nowMs)}`}
                    >
                      <span className="pool__num tnum">{item.number}</span>
                      <span className="pool__wait">{waitLabel(item.since, nowMs)}</span>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          <Flash feedback={feedback} />
        </section>

        <aside className="manual" aria-label="Enter a number">
          <div className="manual__body">
            <div className="manual__inner">
              <p className="manual__label" data-pending={pending !== null} aria-live="polite">
                {pending ? `Serve order ${pending}?` : "Or enter a number"}
              </p>
              <DigitEntry value={entry} length={LAST_DIGITS} />
              <NumericKeypad
                onDigit={(d) => setEntry((prev) => (prev + d).slice(-LAST_DIGITS))}
                onBackspace={() => setEntry((prev) => prev.slice(0, -1))}
                onSubmit={commitEntry}
                submitLabel="Serve"
                canSubmit={pending !== null}
              />

              {ready.length > 0 && (
                <section className="collect" aria-label="Serving">
                  <p className="collect__label">
                    Serving <span className="collect__count tnum">{ready.length}</span>
                    <span className="collect__hint">Tap to collect</span>
                  </p>
                  <ul className="collect__list">
                    {ready.map((i) => (
                      <li key={i.number}>
                        <button
                          type="button"
                          className="chip chip--ready chip--pickup"
                          onClick={() => handleCollect(i.number)}
                          aria-label={`Mark order ${i.number} collected`}
                        >
                          <span className="tnum">{i.number}</span>
                          <CheckIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>

          {lastServed && (
            <div className="manual__last">
              <span className="manual__last-text">
                Served <span className="manual__last-num tnum">{lastServed}</span>
              </span>
              <button
                type="button"
                className="manual__return"
                onClick={handleReturn}
                disabled={!canUndo}
              >
                <ReturnIcon />
                Return
              </button>
            </div>
          )}

          <div className="manual__tools">
            <button
              type="button"
              className="manual__tool"
              onClick={handleExport}
              disabled={items.length === 0}
            >
              Export
            </button>
            <button
              type="button"
              className="manual__tool"
              onClick={() => fileInputRef.current?.click()}
            >
              Import
            </button>
            <button
              type="button"
              className="manual__tool manual__tool--danger"
              onClick={() => setClearOpen(true)}
              disabled={items.length === 0}
            >
              Clear
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="manual__file"
              onChange={handleImportFile}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        </aside>
      </main>

      <dialog
        ref={dialogRef}
        className="confirm"
        aria-labelledby="confirm-title"
        onClose={() => setConfirming(null)}
        onClick={(e) => {
          // Tap outside (on the backdrop) dismisses, but ignore the synthetic
          // click some touch devices fire right after the opening tap, which
          // would otherwise close the dialog before it's seen.
          if (e.target !== dialogRef.current) return;
          if (Date.now() - openedAtRef.current < 400) return;
          dialogRef.current.close();
        }}
      >
        {confirming && (
          <div className="confirm__inner">
            <p id="confirm-title" className="confirm__q">
              Serve this order?
            </p>
            <p className="confirm__num tnum">{confirming}</p>
            <div className="confirm__actions">
              <button
                type="button"
                className="confirm__cancel"
                onClick={() => dialogRef.current?.close()}
                autoFocus
              >
                Cancel
              </button>
              <button type="button" className="confirm__serve" onClick={confirmServe}>
                Serve
              </button>
            </div>
          </div>
        )}
      </dialog>

      <dialog
        ref={clearDialogRef}
        className="confirm"
        aria-labelledby="clear-title"
        onClose={() => setClearOpen(false)}
        onClick={(e) => {
          if (e.target !== clearDialogRef.current) return;
          clearDialogRef.current.close();
        }}
      >
        {clearOpen && (
          <div className="confirm__inner">
            <p id="clear-title" className="confirm__q">
              Clear the whole queue?
            </p>
            <p className="confirm__num tnum">{items.length}</p>
            <p className="confirm__note">
              Removes every order. You can undo this from the top bar.
            </p>
            <div className="confirm__actions">
              <button
                type="button"
                className="confirm__cancel"
                onClick={() => clearDialogRef.current?.close()}
                autoFocus
              >
                Cancel
              </button>
              <button type="button" className="confirm__serve" onClick={confirmClear}>
                Clear all
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
