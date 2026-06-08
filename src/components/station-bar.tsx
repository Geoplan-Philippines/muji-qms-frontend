import type { ReactNode } from "react";
import { MujiLogo } from "./muji-logo";
import type { ConnectionStatus } from "../lib/use-queue";
import "./station-bar.css";

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

interface StationBarProps {
  /** Short station role, e.g. "Counter" or "Table service". */
  role: string;
  status: ConnectionStatus;
  time: Date;
  canUndo: boolean;
  onUndo: () => void;
  /** Optional station-specific controls, rendered before the undo button. */
  actions?: ReactNode;
}

/**
 * The shared top bar for every staff station: brand mark, role, live
 * connection status, clock, and one-level undo. Identical chrome across
 * stations keeps the operator's mental model constant screen to screen.
 */
export function StationBar({ role, status, time, canUndo, onUndo, actions }: StationBarProps) {
  return (
    <header className="station-bar">
      <div className="station-bar__brand">
        <MujiLogo />
        <span className="station-bar__role">{role}</span>
      </div>
      <div className="station-bar__right">
        <span className="conn" data-status={status}>
          <span className="conn__dot" aria-hidden="true" />
          <span className="conn__text">
            {status === "online" ? "Connected" : "Reconnecting…"}
          </span>
        </span>
        <time className="station-bar__clock tnum" dateTime={time.toISOString()}>
          {timeFmt.format(time)}
        </time>
        {actions}
        <button
          type="button"
          className="station-bar__undo"
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo last
        </button>
      </div>
    </header>
  );
}
