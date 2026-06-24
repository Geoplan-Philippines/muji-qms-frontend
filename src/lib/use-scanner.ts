import { useEffect, useRef } from "react";

const IDLE_FINALIZE_MS = 70; // Zebra wedge bursts keystrokes; this groups one scan
const FAST_KEY_MS = 50; // a real scan's keys arrive faster than this between chars
const MIN_SCAN_LEN = 3; // ignore 1-2 stray chars so slow human keys never misfire

function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable),
  );
}

function isScannerCaptureTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("[data-scanner-capture='true']"));
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  return isTextEntryTarget(target) && !isScannerCaptureTarget(target);
}

/**
 * Treats the Zebra handheld as a keyboard wedge. Buffers the rapid keystroke
 * burst of a scan and finalizes it on Enter (if the wedge appends one) or
 * after a short idle gap (if it doesn't). Keystrokes typed into a real input
 * are ignored so manual entry keeps working.
 *
 * The burst is identified by *speed*: scanner keys arrive within FAST_KEY_MS of
 * each other, while a person types far slower. A slow gap restarts the buffer
 * and finalize ignores anything shorter than MIN_SCAN_LEN, so the hook can stay
 * armed in every mode without a stray human keypress ever being read as a scan.
 */
export function useScanner(enabled: boolean, onScan: (raw: string) => void): void {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let idle: ReturnType<typeof setTimeout> | undefined;
    let lastKeyTime = 0;

    const finalize = () => {
      const value = buffer;
      buffer = "";
      // Only a full burst is a scan; 1-2 chars are stray human keys, not a code.
      if (value.length >= MIN_SCAN_LEN) onScanRef.current(value);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const isCapture = isScannerCaptureTarget(event.target);

      if (event.key === "Enter") {
        if (isCapture) event.preventDefault();
        if (idle) clearTimeout(idle);
        finalize();
        return;
      }
      if (event.key.length === 1 && /[0-9A-Za-z]/.test(event.key)) {
        if (isCapture) event.preventDefault();
        const now = performance.now();
        // A gap wider than a machine burst means the prior keys weren't part of
        // this scan (human typing, or a stale buffer): start fresh from here.
        if (buffer && now - lastKeyTime > FAST_KEY_MS) buffer = "";
        lastKeyTime = now;
        buffer += event.key;
        if (idle) clearTimeout(idle);
        idle = setTimeout(finalize, IDLE_FINALIZE_MS);
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      if (shouldIgnoreTarget(event.target)) return;
      const value = event.clipboardData?.getData("text") ?? "";
      if (!value) return;
      event.preventDefault();
      if (idle) clearTimeout(idle);
      buffer = "";
      onScanRef.current(value);
    };

    const onInput = (event: Event) => {
      if (!isScannerCaptureTarget(event.target)) return;
      const input = event.target as HTMLInputElement;
      const value = input.value;
      if (!value) return;
      input.value = "";
      if (idle) clearTimeout(idle);
      buffer = "";
      onScanRef.current(value);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    window.addEventListener("input", onInput);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("input", onInput);
      if (idle) clearTimeout(idle);
    };
  }, [enabled]);
}
