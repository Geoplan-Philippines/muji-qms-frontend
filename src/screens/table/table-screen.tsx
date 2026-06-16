import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, BellOff, Check, Clock, MoreHorizontal, Undo2 } from "lucide-react";
import { StationBar } from "../../components/station-bar";
import { Flash } from "../../components/flash";
import { useClock } from "../../lib/use-clock";
import { useQueue } from "../../lib/use-queue";
import { useFlash } from "../../lib/use-flash";
import { formatQueueError } from "../../lib/queue-errors";
import { itemsToCsv } from "../../lib/queue-csv";
import { EASE_OUT_QUINT } from "../../lib/motion";
import { type QueueItem } from "../../../shared/qms.ts";
import "./table.css";

const TILE = { duration: 0.32, ease: EASE_OUT_QUINT };

function byAge(a: QueueItem, b: QueueItem): number {
  return a.since - b.since;
}

function waitLabel(since: number, now: number): string {
  const mins = Math.floor((now - since) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
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
    setChime,
    undo,
  } = useQueue();
  const now = useClock(1000);
  const { feedback, show } = useFlash();

  const [confirming, setConfirming] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const clearDialogRef = useRef<HTMLDialogElement>(null);
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

  const handleCollect = useCallback(
    (number: string) => {
      collect(number);
      show("ok", number, "picked up");
    },
    [collect, show],
  );

  const handleHold = useCallback(
    (number: string) => {
      hold(number);
      show("ok", number, "serving later");
    },
    [hold, show],
  );

  const handleCollectRemainder = useCallback(
    (number: string) => {
      collect(number);
      show("ok", number, "picked up");
    },
    [collect, show],
  );

  const handleReturn = useCallback(
    (number: string) => {
      unready(number);
      show("ok", number, "back to preparing");
    },
    [unready, show],
  );

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

  useEffect(() => {
    const dialog = clearDialogRef.current;
    if (dialog && clearOpen && !dialog.open) dialog.showModal();
  }, [clearOpen]);

  const confirmClear = useCallback(() => {
    clear();
    show("ok", null, "queue cleared");
    clearDialogRef.current?.close();
  }, [clear, show]);

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
              title={chimeEnabled ? "Serve chime on" : "Serve chime off"}
              aria-label={chimeEnabled ? "Mute serve chime" : "Unmute serve chime"}
              aria-pressed={chimeEnabled}
            >
              {chimeEnabled ? (
                <Bell size={18} aria-hidden="true" />
              ) : (
                <BellOff size={18} aria-hidden="true" />
              )}
            </button>
            <div className="tools">
              <button
                type="button"
                className="tools__trigger"
                popoverTarget="table-tools"
                aria-haspopup="menu"
                aria-label="Board tools"
              >
                <MoreHorizontal size={18} aria-hidden="true" />
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
                  className="tools__item tools__item--danger"
                  popoverTarget="table-tools"
                  popoverTargetAction="hide"
                  onClick={() => setClearOpen(true)}
                  disabled={items.length === 0}
                >
                  Clear queue
                </button>
              </div>
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
                      {/* <span className="pool__wait">{waitLabel(item.since, nowMs)}</span> */}
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
                        <Undo2 size={15} aria-hidden="true" />
                        Return
                      </button>
                      <button
                        type="button"
                        className="serving__hold"
                        onClick={() => handleHold(i.number)}
                        aria-label={`Serve order ${i.number} later`}
                      >
                        <Clock size={15} aria-hidden="true" />
                        Serve for later
                      </button>
                      <button
                        type="button"
                        className="serving__collect"
                        onClick={() => handleCollect(i.number)}
                        aria-label={`Mark order ${i.number} fully collected`}
                      >
                        <Check size={15} className="serving__check" aria-hidden="true" />
                        Collect
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {holding.length > 0 && (
              <section className="holding" aria-label="Serve later">
                <p className="holding__label">
                  Serve Later <span className="holding__count tnum">{holding.length}</span>
                </p>
                <p className="holding__hint">Kept to collect later</p>
                <ul className="holding__list">
                  {holding.map((i) => (
                    <li key={i.number} className="holding__item">
                      <span className="holding__num tnum">{i.number}</span>
                      <span className="holding__wait">{waitLabel(i.since, nowMs)}</span>
                      <button
                        type="button"
                        className="holding__serve"
                        onClick={() => serve(i.number)}
                        aria-label={`Move order ${i.number} back to serving`}
                      >
                        <Undo2 size={15} aria-hidden="true" />
                        Serve
                      </button>
                      <button
                        type="button"
                        className="holding__collect"
                        onClick={() => handleCollectRemainder(i.number)}
                        aria-label={`Order ${i.number} picked up`}
                      >
                        <Check size={15} className="serving__check" aria-hidden="true" />
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
              Removes every order from the board. This cannot be undone.
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
