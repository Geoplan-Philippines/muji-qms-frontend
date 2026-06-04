import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { MujiLogo } from "../../components/muji-logo";
import { useClock } from "../../lib/use-clock";
import { useQueue } from "../../lib/use-queue";
import { EASE_OUT_QUINT } from "../../lib/motion";
import type { QueueItem, QueueStatus } from "../../../shared/qms.ts";
import "./display.css";

const MOVE = { duration: 0.5, ease: EASE_OUT_QUINT };
const ENTER = { duration: 0.4, ease: EASE_OUT_QUINT };

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function byAge(a: QueueItem, b: QueueItem): number {
  return a.since - b.since;
}

function density(count: number): "xl" | "lg" | "md" {
  if (count <= 4) return "xl";
  if (count <= 8) return "lg";
  return "md";
}

function Column(props: {
  title: string;
  tone: QueueStatus;
  items: QueueItem[];
  empty: string;
}) {
  const { title, tone, items, empty } = props;
  return (
    <section className="col" data-tone={tone} aria-label={title}>
      <header className="col__head">
        <span className="col__dot" aria-hidden="true" />
        <h2 className="col__title">{title}</h2>
        <span className="col__count" aria-label={`${items.length} orders`}>
          {items.length}
        </span>
      </header>
      <div className="col__grid" data-density={density(items.length)}>
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

  const preparing = items.filter((i) => i.status === "preparing").sort(byAge);
  const ready = items.filter((i) => i.status === "ready").sort(byAge);

  return (
    <div className="display">
      <header className="display__head">
        <div className="display__brand">
          <MujiLogo />
          <span className="display__sub">Order status</span>
        </div>
        <div className="display__clock">
          <time className="tnum" dateTime={now.toISOString()}>
            {timeFmt.format(now)}
          </time>
          <span className="display__date">{dateFmt.format(now)}</span>
        </div>
      </header>

      <main className="board">
        <LayoutGroup>
          <Column
            title="Preparing"
            tone="preparing"
            items={preparing}
            empty="No orders yet"
          />
          <div className="board__divide" aria-hidden="true" />
          <Column
            title="Ready to pick up"
            tone="ready"
            items={ready}
            empty="Nothing ready yet"
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
