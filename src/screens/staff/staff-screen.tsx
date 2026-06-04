import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MujiLogo } from "../../components/muji-logo";
import { NumericKeypad } from "../../components/numeric-keypad";
import { useClock } from "../../lib/use-clock";
import { useQueue, type QueueError } from "../../lib/use-queue";
import { useScanner } from "../../lib/use-scanner";
import { EASE_OUT_QUINT } from "../../lib/motion";
import { extractNumber, LAST_DIGITS } from "../../../shared/qms.ts";
import "./staff.css";

type Mode = "scan" | "ready";

interface Feedback {
  id: number;
  tone: "ok" | "error";
  number: string | null;
  message: string;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function errorMessage(e: QueueError): string {
  const n = e.number ?? "That number";
  switch (e.error) {
    case "already_preparing":
      return `${n} is already preparing`;
    case "already_ready":
      return `${n} is already ready`;
    case "not_found":
      return `${n} is not in the queue`;
    case "invalid_scan":
    case "invalid_number":
      return "Could not read a number";
    case "nothing_to_undo":
      return "Nothing to undo";
    default:
      return "Something went wrong";
  }
}

export default function StaffScreen() {
  const { items, status, canUndo, lastError, scan, markReady, undo } = useQueue();
  const now = useClock(1000);

  const [mode, setMode] = useState<Mode>("scan");
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackId = useRef(0);
  const scannerCaptureRef = useRef<HTMLInputElement | null>(null);

  const flash = useCallback((tone: Feedback["tone"], number: string | null, message: string) => {
    feedbackId.current += 1;
    setFeedback({ id: feedbackId.current, tone, number, message });
  }, []);

  // Confirmation/error flashes auto-dismiss.
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback((f) => (f?.id === feedback.id ? null : f)), 1700);
    return () => clearTimeout(id);
  }, [feedback]);

  // Surface server rejections (duplicate scan, unknown number, ...).
  useEffect(() => {
    if (lastError) flash("error", lastError.number, errorMessage(lastError));
  }, [lastError, flash]);

  // Scan mode: the Zebra wedge drives input directly.
  const onScan = useCallback(
    (raw: string) => {
      const number = extractNumber(raw);
      if (!number) {
        flash("error", null, "Could not read a number");
        return;
      }
      scan(raw);
      flash("ok", number, "now preparing");
    },
    [scan, flash],
  );
  useScanner(mode === "scan", onScan);

  // Zebra paste profiles need a focused text target before the browser emits
  // the barcode payload.
  useEffect(() => {
    if (mode !== "scan") return;

    const focusScannerCapture = () => {
      window.setTimeout(() => {
        scannerCaptureRef.current?.focus({ preventScroll: true });
      }, 0);
    };

    focusScannerCapture();
    window.addEventListener("focus", focusScannerCapture);
    window.addEventListener("pointerup", focusScannerCapture);
    return () => {
      window.removeEventListener("focus", focusScannerCapture);
      window.removeEventListener("pointerup", focusScannerCapture);
    };
  }, [mode]);

  const submitReady = useCallback(() => {
    if (entry.length !== LAST_DIGITS) return;
    const number = entry.padStart(LAST_DIGITS, "0");
    markReady(number);
    flash("ok", number, "ready to pick up");
    setEntry("");
  }, [entry, markReady, flash]);

  // Ready mode: accept physical typing alongside the on-screen keypad.
  useEffect(() => {
    if (mode !== "ready") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) return;
      if (/^[0-9]$/.test(event.key)) {
        setEntry((prev) => (prev + event.key).slice(-LAST_DIGITS));
      } else if (event.key === "Backspace") {
        setEntry((prev) => prev.slice(0, -1));
      } else if (event.key === "Enter") {
        submitReady();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, submitReady]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setEntry("");
  };

  const preparing = items.filter((i) => i.status === "preparing");
  const ready = items.filter((i) => i.status === "ready");
  const digits = entry.padStart(LAST_DIGITS, "·").split("");

  return (
    <div className="staff">
      <header className="staff__bar">
        <div className="staff__brand">
          <MujiLogo />
          <span className="staff__role">Counter</span>
        </div>
        <div className="staff__bar-right">
          <span className="conn" data-status={status}>
            <span className="conn__dot" aria-hidden="true" />
            {status === "online" ? "Connected" : "Reconnecting…"}
          </span>
          <time className="staff__clock tnum" dateTime={now.toISOString()}>
            {timeFmt.format(now)}
          </time>
          <button
            type="button"
            className="staff__undo"
            onClick={() => undo()}
            disabled={!canUndo}
          >
            Undo last
          </button>
        </div>
      </header>

      <div className="staff__modes" role="tablist" aria-label="Input mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "scan"}
          className="staff__mode"
          data-active={mode === "scan"}
          onClick={() => switchMode("scan")}
        >
          Scan to prepare
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ready"}
          className="staff__mode"
          data-active={mode === "ready"}
          onClick={() => switchMode("ready")}
        >
          Mark ready
        </button>
      </div>

      <main className="staff__main">
        <section className="staff__stage" aria-live="polite">
          {mode === "scan" ? (
            <div className="scan">
              <input
                ref={scannerCaptureRef}
                className="scan__capture"
                data-scanner-capture="true"
                type="text"
                inputMode="none"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                aria-label="Scanner capture"
              />
              <svg className="scan__icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <path d="M6 14V9a3 3 0 0 1 3-3h5M34 6h5a3 3 0 0 1 3 3v5M42 34v5a3 3 0 0 1-3 3h-5M14 42H9a3 3 0 0 1-3-3v-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <path d="M12 24h24" stroke="var(--muji-red)" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <p className="scan__lead">Scan a receipt barcode</p>
              <p className="scan__hint">
                The last {LAST_DIGITS} digits become the queue number, marked preparing.
              </p>
            </div>
          ) : (
            <div className="ready">
              <p className="ready__label">Enter the order number</p>
              <div className="ready__entry" aria-label={`Entry ${entry || "empty"}`}>
                {digits.map((d, i) => (
                  <span key={i} className="ready__digit" data-empty={d === "·"}>
                    {d === "·" ? "" : d}
                  </span>
                ))}
              </div>
              <NumericKeypad
                onDigit={(d) => setEntry((prev) => (prev + d).slice(-LAST_DIGITS))}
                onBackspace={() => setEntry((prev) => prev.slice(0, -1))}
                onSubmit={submitReady}
                submitLabel="Mark ready"
                canSubmit={entry.length === LAST_DIGITS}
              />
            </div>
          )}

          <AnimatePresence>
            {feedback && (
              <motion.div
                key={feedback.id}
                className="flash"
                data-tone={feedback.tone}
                role="status"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.28, ease: EASE_OUT_QUINT }}
              >
                {feedback.number && <span className="flash__num tnum">{feedback.number}</span>}
                <span className="flash__msg">{feedback.message}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="queue" aria-label="Live queue">
          <div className="queue__group">
            <h2 className="queue__title">
              Preparing <span className="queue__count">{preparing.length}</span>
            </h2>
            <ul className="queue__list">
              {preparing.length === 0 && <li className="queue__empty">None</li>}
              {preparing.map((i) => (
                <li key={i.number} className="chip tnum">
                  {i.number}
                </li>
              ))}
            </ul>
          </div>
          <div className="queue__group">
            <h2 className="queue__title">
              Ready <span className="queue__count">{ready.length}</span>
            </h2>
            <ul className="queue__list">
              {ready.length === 0 && <li className="queue__empty">None</li>}
              {ready.map((i) => (
                <li key={i.number} className="chip chip--ready tnum">
                  {i.number}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
