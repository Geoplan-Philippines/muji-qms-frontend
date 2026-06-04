  import { useCallback, useEffect, useRef, useState } from "react";
import { StationBar } from "../../components/station-bar";
import { NumericKeypad } from "../../components/numeric-keypad";
import { DigitEntry } from "../../components/digit-entry";
import { Flash } from "../../components/flash";
import { useClock } from "../../lib/use-clock";
import { useQueue } from "../../lib/use-queue";
import { useFlash } from "../../lib/use-flash";
import { formatQueueError } from "../../lib/queue-errors";
import { useScanner } from "../../lib/use-scanner";
import { extractNumber, LAST_DIGITS } from "../../../shared/qms.ts";
import "./staff.css";

type Mode = "scan" | "ready";

export default function StaffScreen() {
  const { items, status, canUndo, lastError, scan, markReady, collect, undo } = useQueue();
  const now = useClock(1000);
  const { feedback, show } = useFlash();

  const [mode, setMode] = useState<Mode>("scan");
  const [entry, setEntry] = useState("");
  const scannerCaptureRef = useRef<HTMLInputElement | null>(null);

  // Surface server rejections (duplicate scan, unknown number, ...).
  useEffect(() => {
    if (lastError) show("error", lastError.number, formatQueueError(lastError));
  }, [lastError, show]);

  // Scan mode: the Zebra wedge drives input directly.
  const onScan = useCallback(
    (raw: string) => {
      const number = extractNumber(raw);
      if (!number) {
        show("error", null, "Could not read a number");
        return;
      }
      scan(raw);
      show("ok", number, "now preparing");
    },
    [scan, show],
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
    show("ok", number, "now serving");
    setEntry("");
  }, [entry, markReady, show]);

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

  // Clear a served order once the customer collects it.
  const handleCollect = useCallback(
    (number: string) => {
      collect(number);
      show("ok", number, "picked up");
    },
    [collect, show],
  );

  const preparing = items.filter((i) => i.status === "preparing");
  const ready = items.filter((i) => i.status === "ready");

  return (
    <div className="staff">
      <StationBar
        role="Counter"
        status={status}
        time={now}
        canUndo={canUndo}
        onUndo={undo}
      />

      <div className="staff__modes" role="tablist" aria-label="Input mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "scan"}
          aria-label="Scan to prepare"
          className="staff__mode"
          data-active={mode === "scan"}
          onClick={() => switchMode("scan")}
        >
          <span className="mode-label--full" aria-hidden="true">Scan to prepare</span>
          <span className="mode-label--short" aria-hidden="true">Prepare</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ready"}
          aria-label="Mark serving"
          className="staff__mode"
          data-active={mode === "ready"}
          onClick={() => switchMode("ready")}
        >
          <span className="mode-label--full" aria-hidden="true">Mark serving</span>
          <span className="mode-label--short" aria-hidden="true">Serve</span>
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
              <DigitEntry value={entry} length={LAST_DIGITS} />
              <NumericKeypad
                onDigit={(d) => setEntry((prev) => (prev + d).slice(-LAST_DIGITS))}
                onBackspace={() => setEntry((prev) => prev.slice(0, -1))}
                onSubmit={submitReady}
                submitLabel="Serve"
                canSubmit={entry.length === LAST_DIGITS}
              />
            </div>
          )}

          <Flash feedback={feedback} />
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
              Serving <span className="queue__count">{ready.length}</span>
            </h2>
            {ready.length > 0 && (
              <p className="queue__hint">Tap a number when the customer collects it</p>
            )}
            <ul className="queue__list">
              {ready.length === 0 && <li className="queue__empty">None</li>}
              {ready.map((i) => (
                <li key={i.number}>
                  <button
                    type="button"
                    className="chip chip--ready chip--pickup"
                    onClick={() => handleCollect(i.number)}
                    aria-label={`Mark order ${i.number} picked up`}
                  >
                    <span className="tnum">{i.number}</span>
                    <svg
                      className="chip__check"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="m3.5 8.5 3 3 6-7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
