import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT_QUINT } from "../lib/motion";
import type { Feedback } from "../lib/use-flash";
import "./flash.css";

/**
 * The one transient overlay in the staff stations: a confirmation (ink) or
 * error (red) pill that lifts off the page, then fades. Anchors to the nearest
 * positioned ancestor, so wrap it in a `position: relative` region.
 */
export function Flash({ feedback }: { feedback: Feedback | null }) {
  return (
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
  );
}
