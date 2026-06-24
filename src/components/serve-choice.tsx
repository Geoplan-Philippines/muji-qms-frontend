import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT_QUINT } from "../lib/motion";
import "./pickup-choice.css";

interface ServeChoiceProps {
  /** The preparing order being acted on, or null when the sheet is closed. */
  number: string | null;
  /** Advance the order to Serving (the prominent, common choice). */
  onServe: () => void;
  /** Drop the order from the queue — it will never be collected. */
  onCancelOrder: () => void;
  onDismiss: () => void;
}

/**
 * Asked when staff tap a preparing number: serve it now, or cancel it. Serve is
 * the prominent action; cancel is the subordinate, destructive one. Cancel can't
 * be undone, so this sheet is the only confirmation guarding it. Shares the
 * PickupChoice sheet styling so the two staff sheets read as one family.
 */
export function ServeChoice({ number, onServe, onCancelOrder, onDismiss }: ServeChoiceProps) {
  const serveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!number) return;
    serveRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [number, onDismiss]);

  return (
    <AnimatePresence>
      {number && (
        <motion.div
          className="pickup__backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onDismiss}
        >
          <motion.div
            className="pickup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="serve-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE_OUT_QUINT }}
            onClick={(event) => event.stopPropagation()}
          >
            <p id="serve-title" className="pickup__title">
              Order <span className="tnum">{number}</span>
            </p>

            <div className="pickup__actions">
              <button
                type="button"
                ref={serveRef}
                className="pickup__action pickup__action--serve"
                onClick={onServe}
              >
                <span className="pickup__action-title">Serve now</span>
                <span className="pickup__action-sub">Move it to Serving</span>
              </button>
              <button
                type="button"
                className="pickup__action pickup__action--danger"
                onClick={onCancelOrder}
              >
                <span className="pickup__action-title">Cancel order</span>
                <span className="pickup__action-sub">Remove it from the queue</span>
              </button>
            </div>

            <button type="button" className="pickup__cancel" onClick={onDismiss}>
              Keep
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
