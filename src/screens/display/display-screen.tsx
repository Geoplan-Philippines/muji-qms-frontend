import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useChime } from "../../lib/use-chime";
import { useClock } from "../../lib/use-clock";
import { useQueue } from "../../lib/use-queue";
import { useLogoVisible } from "../../lib/use-logo-visible";
import { EASE_OUT_QUINT } from "../../lib/motion";
import type { QueueItem } from "../../../shared/qms.ts";
import { MujiLogo } from "../../components/muji-logo";
import "./display.css";

const MOVE = { duration: 0.5, ease: EASE_OUT_QUINT };
const ENTER = { duration: 0.4, ease: EASE_OUT_QUINT };

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function byAge(a: QueueItem, b: QueueItem): number {
  return a.since - b.since;
}

// Each tier maps to a column count + paired number size in the CSS, so a
// growing queue breaks into more readable columns instead of just shrinking.
// Both columns share these breakpoints so they lay out identically.
function preparingDensity(count: number): "xl" | "lg" | "md" | "sm" {
  if (count <= 4) return "xl"; // 1 column
  if (count <= 8) return "lg"; // 2 columns
  if (count <= 15) return "md"; // 3 columns
  return "sm"; // 4 columns
}

export default function DisplayScreen() {
  const { items, status, chimeEnabled, chimeSignal, clockOffset } = useQueue();
  const now = useClock(1000, clockOffset);
  const [logoVisible] = useLogoVisible();

  const preparing = useMemo(
    () => items.filter((i) => i.status === "preparing").sort(byAge),
    [items],
  );
  const ready = useMemo(
    () => items.filter((i) => i.status === "ready").sort(byAge),
    [items],
  );

  const prevReadyRef = useRef<Set<string> | null>(null);
  const triggerChime = useChime();

  useEffect(() => {
    const currentIds = new Set(ready.map((i) => i.number));
    if (prevReadyRef.current === null) {
      prevReadyRef.current = currentIds;
      return;
    }
    const hasNew = ready.some((i) => !prevReadyRef.current!.has(i.number));
    prevReadyRef.current = currentIds;
    if (hasNew && chimeEnabled) triggerChime();
  }, [ready, chimeEnabled, triggerChime]);

  // Remote replay: a tablet pressed the "notify customers" button. This is a
  // deliberate staff action, so it sounds even when the auto serve-chime is
  // muted. chimeSignal starts at 0; skip that initial render.
  const firstSignalRef = useRef(true);
  useEffect(() => {
    if (firstSignalRef.current) {
      firstSignalRef.current = false;
      return;
    }
    triggerChime();
  }, [chimeSignal, triggerChime]);

  return (
    <div className="display">
      <main className="board">
        <LayoutGroup>
          <section className="prep" aria-label="Preparing">
            <header className="col__head">
              <h2 className="col__label">Preparing</h2>
              <span className="col__rule" aria-hidden="true" />
            </header>
            <div className="prep__list" data-density={preparingDensity(preparing.length)}>
              {preparing.length === 0 ? (
                <p className="prep__empty">No orders yet</p>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {preparing.map((item) => (
                    <motion.div
                      key={item.number}
                      layout
                      layoutId={`q-${item.number}`}
                      className="prep__item"
                      initial={{ opacity: 0, scale: 0.9, y: 14 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ layout: MOVE, default: ENTER }}
                    >
                      <span className="prep__num tnum">{item.number}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </section>

          <section className="serve" aria-label="Now Serving">
            <header className="col__head">
              <h2 className="col__label">Now Serving</h2>
              <span className="col__rule" aria-hidden="true" />
            </header>
            <div className="serve__body">
              {ready.length === 0 ? (
                <p className="serve__empty">Nothing ready yet</p>
              ) : (
                <div className="serve__list" data-density={preparingDensity(ready.length)}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {ready.map((item) => (
                      <motion.div
                        key={item.number}
                        layout
                        layoutId={`q-${item.number}`}
                        className="serve__item"
                        initial={{ opacity: 0, scale: 0.9, y: 14 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ layout: MOVE, default: ENTER }}
                      >
                        <span className="serve__num tnum">{item.number}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>
        </LayoutGroup>
      </main>

      {/* Bottom bar — brand mark, left; safety notice, center; date + time, right. */}
      <footer className="display__bar">
        {logoVisible && <MujiLogo />}
        {/* Safety notice — quiet ink, never red. One copy scrolls across. */}
        <div className="display__notice">
          <span className="display__notice-text">
            Do not leave your things unattended
          </span>
        </div>
        <div className="display__bar-meta">
          <span className="display__date">{dateFmt.format(now)}</span>
          <time className="display__time tnum" dateTime={now.toISOString()}>
            {timeFmt.format(now)}
          </time>
        </div>
      </footer>

      <AnimatePresence>
        {status !== "online" && (
          <motion.div
            className="display__offline"
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={ENTER}
          >
            Reconnecting to the counter…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


