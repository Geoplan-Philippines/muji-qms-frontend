import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { StationBar } from "../../components/station-bar";
import { NumericKeypad } from "../../components/numeric-keypad";
import { DigitEntry } from "../../components/digit-entry";
import { Flash } from "../../components/flash";
import { PickupChoice } from "../../components/pickup-choice";
import { useClock } from "../../lib/use-clock";
import { useQueue } from "../../lib/use-queue";
import { useFlash } from "../../lib/use-flash";
import { formatQueueError } from "../../lib/queue-errors";
import { useScanner } from "../../lib/use-scanner";
import { extractNumber, LAST_DIGITS } from "../../../shared/qms.ts";
import "./staff.css";

type Mode = "scan" | "manual" | "ready";

export default function StaffScreen() {
  const { items, status, canUndo, lastError, scan, markReady, hold, collect, undo } =
    useQueue();
  const now = useClock(1000);
  const { feedback, show } = useFlash();

  const [mode, setMode] = useState<Mode>("scan");
  const [entry, setEntry] = useState("");
  const [choosing, setChoosing] = useState<string | null>(null);
  const scannerCaptureRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (lastError) show("error", lastError.number, formatQueueError(lastError));
  }, [lastError, show]);

  const onScan = useCallback(
    async (raw: string) => {
      const number = extractNumber(raw);
      if (!number) {
        show("error", null, "Could not read a number");
        return;
      }
      // Only confirm once the backend accepts the create. On failure the
      // lastError effect raises the error flash, so no success is shown.
      if (await scan(raw)) show("ok", number, "now preparing");
    },
    [scan, show],
  );
  useScanner(mode === "scan", onScan);

  useEffect(() => {
    if (mode !== "scan") return;

    const focusScannerCapture = () => {
      window.setTimeout(() => {
        scannerCaptureRef.current?.focus({ preventScroll: true });
      }, 0);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") focusScannerCapture();
    };

    const onCaptureBlur = (event: FocusEvent) => {
      const next = event.relatedTarget as HTMLElement | null;
      if (next?.closest("button, a, input, [tabindex]")) return;
      focusScannerCapture();
    };

    const input = scannerCaptureRef.current;
    focusScannerCapture();
    window.addEventListener("focus", focusScannerCapture);
    window.addEventListener("pointerup", focusScannerCapture);
    document.addEventListener("visibilitychange", onVisible);
    input?.addEventListener("blur", onCaptureBlur);
    return () => {
      window.removeEventListener("focus", focusScannerCapture);
      window.removeEventListener("pointerup", focusScannerCapture);
      document.removeEventListener("visibilitychange", onVisible);
      input?.removeEventListener("blur", onCaptureBlur);
    };
  }, [mode]);

  const submitReady = useCallback(() => {
    if (entry.length !== LAST_DIGITS) return;
    const number = entry.padStart(LAST_DIGITS, "0");
    markReady(number);
    show("ok", number, "now serving");
    setEntry("");
  }, [entry, markReady, show]);

  const submitManual = useCallback(async () => {
    if (entry.length !== LAST_DIGITS) return;
    const number = entry.padStart(LAST_DIGITS, "0");
    setEntry(""); // clear up front so a slow round-trip can't be double-submitted
    if (await scan(number)) show("ok", number, "now preparing");
  }, [entry, scan, show]);

  // Both keypad modes ("manual" and "ready") accept hardware-keyboard typing;
  // only the submit action differs.
  const keypadMode = mode === "manual" || mode === "ready";
  useEffect(() => {
    if (!keypadMode) return;
    const submit = mode === "manual" ? submitManual : submitReady;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) return;
      if (/^[0-9]$/.test(event.key)) {
        setEntry((prev) => (prev + event.key).slice(-LAST_DIGITS));
      } else if (event.key === "Backspace") {
        setEntry((prev) => prev.slice(0, -1));
      } else if (event.key === "Enter") {
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, keypadMode, submitReady, submitManual]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setEntry("");
  };

  const confirmPickedUpAll = useCallback(
    (number: string) => {
      collect(number);
      show("ok", number, "picked up");
      setChoosing(null);
    },
    [collect, show],
  );

  const confirmHoldRemainder = useCallback(
    (number: string) => {
      hold(number);
      show("ok", number, "serving later");
      setChoosing(null);
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

  const preparing = items.filter((i) => i.status === "preparing");
  const ready = items.filter((i) => i.status === "ready");
  const holding = items.filter((i) => i.status === "holding");

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
          <span className="mode-label--short" aria-hidden="true">Scan</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          aria-label="Manual Add Order"
          className="staff__mode"
          data-active={mode === "manual"}
          onClick={() => switchMode("manual")}
        >
          <span className="mode-label--full" aria-hidden="true">Type to prepare</span>
          <span className="mode-label--short" aria-hidden="true">Type</span>
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
                autoFocus
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
              {mode === "manual" && (
                <p className="ready__hint">Adds the number to Preparing, the same as a scan.</p>
              )}
              <DigitEntry value={entry} length={LAST_DIGITS} />
              <NumericKeypad
                onDigit={(d) => setEntry((prev) => (prev + d).slice(-LAST_DIGITS))}
                onBackspace={() => setEntry((prev) => prev.slice(0, -1))}
                onSubmit={mode === "manual" ? submitManual : submitReady}
                submitLabel={mode === "manual" ? "Prepare" : "Serve"}
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
                    onClick={() => setChoosing(i.number)}
                    aria-label={`Collect order ${i.number}`}
                  >
                    <span className="tnum">{i.number}</span>
                    <Check className="chip__check" size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="queue__group">
            <h2 className="queue__title">
              Serve Later <span className="queue__count">{holding.length}</span>
            </h2>
            {holding.length > 0 && (
              <p className="queue__hint">Kept for later — tap when the customer collects it</p>
            )}
            <ul className="queue__list">
              {holding.length === 0 && <li className="queue__empty">None</li>}
              {holding.map((i) => (
                <li key={i.number}>
                  <button
                    type="button"
                    className="chip chip--hold chip--pickup"
                    onClick={() => handleCollectRemainder(i.number)}
                    aria-label={`Order ${i.number} picked up`}
                  >
                    <span className="tnum">{i.number}</span>
                    <Check className="chip__check" size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>

      <PickupChoice
        number={choosing}
        onPickedUpAll={() => choosing && confirmPickedUpAll(choosing)}
        onHoldRemainder={() => choosing && confirmHoldRemainder(choosing)}
        onCancel={() => setChoosing(null)}
      />
    </div>
  );
}
