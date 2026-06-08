import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { StationBar } from "../../components/station-bar";
import { Flash } from "../../components/flash";
import { useClock } from "../../lib/use-clock";
import { useQueue } from "../../lib/use-queue";
import { useFlash } from "../../lib/use-flash";
import { formatQueueError } from "../../lib/queue-errors";
import { itemsToCsv, csvToItems } from "../../lib/queue-csv";
import { EASE_OUT_QUINT } from "../../lib/motion";
import { type QueueItem } from "../../../shared/qms.ts";
import "./table.css";

const TILE = { duration: 0.32, ease: EASE_OUT_QUINT };

function byAge(a: QueueItem, b: QueueItem): number {
  return a.since - b.since;
}

function BellIcon({ muted }: { muted?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5v3L3 14h14l-1.5-3V8A5.5 5.5 0 0 0 10 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 14.5a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {muted && (
        <line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
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

function HoldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.5V12l3 2"
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
    <svg className="serving__check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
  const {
    items,
    status,
    canUndo,
    lastError,
    chimeEnabled,
    markReady,
    hold,
    collect,
    unready,
    clear,
    importItems,
    setChime,
    undo,
  } = useQueue();
  const now = useClock(1000);
  const { feedback, show } = useFlash();

  // Tile taps go through the confirm dialog before serving.
  const [confirming, setConfirming] = useState<string | null>(null);
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
  const holding = useMemo(
    () => items.filter((i) => i.status === "holding").sort(byAge),
    [items],
  );

  // Surface server rejections (unknown number, already serving, ...).
  useEffect(() => {
    if (lastError) show("error", lastError.number, formatQueueError(lastError));
  }, [lastError, show]);

  const serve = useCallback(
    (number: string) => {
      markReady(number);
      show("ok", number, "now serving");
    },
    [markReady, show],
  );

  // Clear a served order once the customer collects the whole thing.
  const handleCollect = useCallback(
    (number: string) => {
      collect(number);
      show("ok", number, "picked up");
    },
    [collect, show],
  );

  // Partial pickup: the customer took part of the order and left the rest.
  // Move it to the hold area so the number stays until the remainder is collected.
  const handleHold = useCallback(
    (number: string) => {
      hold(number);
      show("ok", number, "holding remainder");
    },
    [hold, show],
  );

  // Held order's remainder finally collected: clear it off the board.
  const handleCollectRemainder = useCallback(
    (number: string) => {
      collect(number);
      show("ok", number, "remainder picked up");
    },
    [collect, show],
  );

  // Send a served order back to preparing (served too early / by mistake).
  const handleReturn = useCallback(
    (number: string) => {
      unready(number);
      show("ok", number, "back to preparing");
    },
    [unready, show],
  );

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
        show("ok", null, `imported ${parsed.length}`);
      } catch {
        show("error", null, "Could not read file");
      }
    },
    [importItems, show],
  );

  // The chime plays on the customer display; this only flips the shared setting,
  // which the server broadcasts to every screen including the TV.
  const handleChimeToggle = useCallback(() => {
    setChime(!chimeEnabled);
  }, [chimeEnabled, setChime]);

  const nowMs = now.getTime();

  return (
    <div className="table">
      <StationBar
        role="Table service"
        status={status}
        time={now}
        canUndo={canUndo}
        onUndo={undo}
        actions={
          <>
            <button
              type="button"
              className="chime-toggle"
              onClick={handleChimeToggle}
              aria-label={chimeEnabled ? "Mute serve chime" : "Unmute serve chime"}
              aria-pressed={chimeEnabled}
            >
              <BellIcon muted={!chimeEnabled} />
              <span className="chime-toggle__label">
                {chimeEnabled ? "Chime on" : "Chime off"}
              </span>
            </button>
            <div className="tools">
              <button
                type="button"
                className="tools__trigger"
                popoverTarget="table-tools"
                aria-haspopup="menu"
                aria-label="Board tools"
              >
                <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <circle cx="4" cy="10" r="1.6" />
                  <circle cx="10" cy="10" r="1.6" />
                  <circle cx="16" cy="10" r="1.6" />
                </svg>
              </button>
              <div id="table-tools" popover="auto" className="tools__menu" aria-label="Board tools">
                <button
                  type="button"
                  className="tools__item"
                  popoverTarget="table-tools"
                  popoverTargetAction="hide"
                  onClick={handleExport}
                  disabled={items.length === 0}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="tools__item"
                  popoverTarget="table-tools"
                  popoverTargetAction="hide"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import CSV
                </button>
                <button
                  type="button"
                  className="tools__item tools__item--danger"
                  popoverTarget="table-tools"
                  popoverTargetAction="hide"
                  onClick={() => setClearOpen(true)}
                  disabled={items.length === 0}
                >
                  Clear queue
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="tools__file"
                onChange={handleImportFile}
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
          </>
        }
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

        <aside className="status" aria-label="Served and held orders">
          <div className="status__inner">
            {ready.length === 0 && holding.length === 0 && (
              <p className="status__empty">No served or held orders yet</p>
            )}

            {ready.length > 0 && (
              <section className="serving" aria-label="Serving">
                <p className="serving__label">
                  Serving <span className="serving__count tnum">{ready.length}</span>
                </p>
                <ul className="serving__list">
                  {ready.map((i) => (
                    <li key={i.number} className="serving__item">
                      <span className="serving__num tnum">{i.number}</span>
                      <button
                        type="button"
                        className="serving__return"
                        onClick={() => handleReturn(i.number)}
                        aria-label={`Return order ${i.number} to preparing`}
                      >
                        <ReturnIcon />
                        Return
                      </button>
                      <button
                        type="button"
                        className="serving__hold"
                        onClick={() => handleHold(i.number)}
                        aria-label={`Hold remainder of order ${i.number} for later pickup`}
                      >
                        <HoldIcon />
                        Hold
                      </button>
                      <button
                        type="button"
                        className="serving__collect"
                        onClick={() => handleCollect(i.number)}
                        aria-label={`Mark order ${i.number} fully collected`}
                      >
                        <CheckIcon />
                        Collect
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {holding.length > 0 && (
              <section className="holding" aria-label="On hold">
                <p className="holding__label">
                  Orders with back-order  <span className="holding__count tnum">{holding.length}</span>
                </p>
                <p className="holding__hint">Remainder to collect later</p>
                <ul className="holding__list">
                  {holding.map((i) => (
                    <li key={i.number} className="holding__item">
                      <span className="holding__num tnum">{i.number}</span>
                      <span className="holding__wait">{waitLabel(i.since, nowMs)}</span>
                      <button
                        type="button"
                        className="holding__collect"
                        onClick={() => handleCollectRemainder(i.number)}
                        aria-label={`Order ${i.number} remainder picked up`}
                      >
                        <CheckIcon />
                        Collect
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
