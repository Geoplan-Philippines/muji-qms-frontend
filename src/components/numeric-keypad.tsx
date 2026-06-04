import "./numeric-keypad.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface NumericKeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  submitLabel: string;
  canSubmit: boolean;
}

/** Large touch keypad for kitchen staff marking orders ready. */
export function NumericKeypad({
  onDigit,
  onBackspace,
  onSubmit,
  submitLabel,
  canSubmit,
}: NumericKeypadProps) {
  return (
    <div className="keypad" role="group" aria-label="Number entry">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="keypad__key"
          onClick={() => onDigit(key)}
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        className="keypad__key keypad__key--util"
        onClick={onBackspace}
        aria-label="Delete last digit"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9.5 5.5H20a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9.5L3 12l6.5-6.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="m12.5 9.5 4 5m0-5-4 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="keypad__key"
        onClick={() => onDigit("0")}
      >
        0
      </button>
      <button
        type="button"
        className="keypad__key keypad__key--submit"
        onClick={onSubmit}
        disabled={!canSubmit}
      >
        {submitLabel}
      </button>
    </div>
  );
}
