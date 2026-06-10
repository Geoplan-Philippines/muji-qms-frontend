import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT_QUINT } from "../lib/motion";
import "./pickup-choice.css";

interface PickupChoiceProps {
  /** The order number being collected, or null when the dialog is closed. */
  number: string | null;
  /** Customer collected the whole order — clear the number off the board. */
  onPickedUpAll: () => void;
  /** Partial pickup — keep the number on the board to serve the rest later. */
  onHoldRemainder: () => void;
  onCancel: () => void;
}

/**
 * Asked when staff tap a serving number: did the customer take everything, or
 * just part of it? "Serve rest later" moves the order to the Serve Later area so
 * the number stays on the board until the rest is picked up later.
 */
export function PickupChoice({
  number,
  onPickedUpAll,
  onHoldRemainder,
  onCancel,
}: PickupChoiceProps) {
  const firstActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!number) return;
    firstActionRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [number, onCancel]);

  return (
    <AnimatePresence>
      {number && (
        <motion.div
          className="pickup__backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onCancel}
        >
          <motion.div
            className="pickup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pickup-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE_OUT_QUINT }}
            onClick={(event) => event.stopPropagation()}
          >
            <p id="pickup-title" className="pickup__title">
              Order <span className="tnum">{number}</span>
            </p>
            <p className="pickup__lead">What did the customer take?</p>

            <div className="pickup__actions">
              <button
                type="button"
                ref={firstActionRef}
                className="pickup__action pickup__action--all"
                onClick={onPickedUpAll}
              >
                <span className="pickup__action-title">Picked up everything</span>
                <span className="pickup__action-sub">Clear the number</span>
              </button>
              <button
                type="button"
                className="pickup__action pickup__action--partial"
                onClick={onHoldRemainder}
              >
                <span className="pickup__action-title">Serve rest later</span>
                <span className="pickup__action-sub">Keep the number for a later pickup</span>
              </button>
            </div>

            <button type="button" className="pickup__cancel" onClick={onCancel}>
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
