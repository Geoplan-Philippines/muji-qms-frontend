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
 * connection status, clock, and one-level undo.
 */
export function StationBar({ role, status, time, canUndo, onUndo, actions }: StationBarProps) {
  const hasControls = actions != null || canUndo;
  return (
    <header className="station-bar">
      <div className="station-bar__brand">
        <MujiLogo />
        <span className="station-bar__role">{role}</span>
      </div>
      <div className="station-bar__right">
        <div className="station-bar__readout">
          <span className="conn" data-status={status}>
            <span className="conn__dot" aria-hidden="true" />
            <span className="conn__text">
              {status === "online" ? "Connected" : "Reconnecting…"}
            </span>
          </span>
          <time className="station-bar__clock tnum" dateTime={time.toISOString()}>
            {timeFmt.format(time)}
          </time>
        </div>
        {hasControls && (
          <>
            <span className="station-bar__divider" aria-hidden="true" />
            <div className="station-bar__controls">
              {actions}
              {canUndo && (
                <button type="button" className="station-bar__undo" onClick={onUndo}>
                  Undo last
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
