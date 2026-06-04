import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { MujiLogo } from "../../components/muji-logo";
import { useClock } from "../../lib/use-clock";
import { useQueue } from "../../lib/use-queue";
import { EASE_OUT_QUINT } from "../../lib/motion";
import type { QueueItem, QueueStatus } from "../../../shared/qms.ts";
import "./display.css";

const MOVE = { duration: 0.5, ease: EASE_OUT_QUINT };
const ENTER = { duration: 0.4, ease: EASE_OUT_QUINT };
const CHIME_KEY = "qms-chime";

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function byAge(a: QueueItem, b: QueueItem): number {
  return a.since - b.since;
}

function preparingDensity(count: number): "xl" | "lg" | "md" {
  if (count <= 4) return "xl";
  if (count <= 8) return "lg";
  return "md";
}

function readyDensity(count: number): "xl" | "lg" | "md" {
  if (count <= 3) return "xl";
  if (count <= 6) return "lg";
  return "md";
}

function playChime(ctx: AudioContext): void {
  const t = ctx.currentTime;
  (
    [
      [880, 0, 0.28],
      [1174.66, 0.22, 0.22],
    ] as [number, number, number][]
  ).forEach(([freq, delay, vol]) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env);
    env.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t + delay);
    env.gain.linearRampToValueAtTime(vol, t + delay + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + delay + 1.6);
    osc.start(t + delay);
    osc.stop(t + delay + 1.6);
  });
}

function BellIcon({ muted }: { muted?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
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
        <line
          x1="3"
          y1="17"
          x2="17"
          y2="3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function Column(props: {
  title: string;
  tone: QueueStatus;
  items: QueueItem[];
  empty: string;
  densityFn: (count: number) => "xl" | "lg" | "md";
}) {
  const { title, tone, items, empty, densityFn } = props;
  return (
    <section className="col" data-tone={tone} aria-label={title}>
      <header className="col__head">
        <h2 className="col__title">{title}</h2>
      </header>
      <div className="col__grid" data-density={densityFn(items.length)}>
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.number}
              layout
              layoutId={`q-${item.number}`}
              className="qnum"
              data-tone={tone}
              initial={{ opacity: 0, scale: 0.9, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ layout: MOVE, default: ENTER }}
            >
              <span className="tnum">{item.number}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {items.length === 0 && <p className="col__empty">{empty}</p>}
    </section>
  );
}

export default function DisplayScreen() {
  const { items, status } = useQueue();
  const now = useClock(1000);

  const preparing = useMemo(
    () => items.filter((i) => i.status === "preparing").sort(byAge),
    [items],
  );
  const ready = useMemo(
    () => items.filter((i) => i.status === "ready").sort(byAge),
    [items],
  );

  const [chimeEnabled, setChimeEnabled] = useState(() => {
    try {
      return localStorage.getItem(CHIME_KEY) !== "off";
    } catch {
      return true;
    }
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevReadyRef = useRef<Set<string> | null>(null);

  const triggerChime = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume().then(() => playChime(ctx));
      } else {
        playChime(ctx);
      }
    } catch {
      /* AudioContext unavailable */
    }
  }, []);

  const handleChimeToggle = useCallback(() => {
    const next = !chimeEnabled;
    setChimeEnabled(next);
    try {
      localStorage.setItem(CHIME_KEY, next ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
    if (next) {
      // Unlock AudioContext on user gesture and preview the chime
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          void ctx.resume().then(() => playChime(ctx));
        } else {
          playChime(ctx);
        }
      } catch {
        /* AudioContext unavailable */
      }
    }
  }, [chimeEnabled]);

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

  return (
    <div className="display">
      <header className="display__head">
        <div className="display__brand">
          <MujiLogo />
          <span className="display__sub">Order status</span>
        </div>
        <div className="display__actions">
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
          <div className="display__clock">
            <time className="tnum" dateTime={now.toISOString()}>
              {timeFmt.format(now)}
            </time>
            <span className="display__date">{dateFmt.format(now)}</span>
          </div>
        </div>
      </header>

      <main className="board">
        <LayoutGroup>
          <Column
            title="Preparing"
            tone="preparing"
            items={preparing}
            empty="No orders yet"
            densityFn={preparingDensity}
          />
          <div className="board__divide" aria-hidden="true" />
          <Column
            title="Now Serving"
            tone="ready"
            items={ready}
            empty="Nothing ready yet"
            densityFn={readyDensity}
          />
        </LayoutGroup>
      </main>

      <footer className="promo">
        <div className="promo__text">
          <p className="promo__lead">Brewed to order, one cup at a time.</p>
          <p className="promo__note">Single-origin drip and seasonal blends at the counter.</p>
        </div>
        <div className="promo__media">
          <img
            src="/marketing/campaign.jpg"
            alt=""
            width={1600}
            height={1067}
            loading="eager"
            decoding="async"
          />
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
