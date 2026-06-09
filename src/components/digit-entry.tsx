import type { CSSProperties } from "react";
import "./digit-entry.css";

interface DigitEntryProps {
  /** The digits entered so far (shorter than `length` while typing). */
  value: string;
  /** Total number of slots, e.g. the queue's fixed digit width. */
  length: number;
}

const PLACEHOLDER = "·";

/**
 * A fixed-width row of digit slots that fills as the operator keys a number.
 * Empty slots read as hollow dashed wells; filled slots are solid and tabular.
 */
export function DigitEntry({ value, length }: DigitEntryProps) {
  const slots = value.padStart(length, PLACEHOLDER).split("");
  return (
    <div
      className="digit-entry"
      style={{ "--slots": length } as CSSProperties}
      aria-label={`Entry ${value || "empty"}`}
    >
      {slots.map((d, i) => (
        <span key={i} className="digit-entry__slot" data-empty={d === PLACEHOLDER}>
          {d === PLACEHOLDER ? "" : d}
        </span>
      ))}
    </div>
  );
}
