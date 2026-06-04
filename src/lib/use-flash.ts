import { useCallback, useEffect, useRef, useState } from "react";

export interface Feedback {
  id: number;
  tone: "ok" | "error";
  number: string | null;
  message: string;
}

/** How long a confirmation/error flash stays on screen before auto-clearing. */
const DISMISS_MS = 1700;

/**
 * Transient confirmation/error feedback shared by the staff stations. `show`
 * raises a flash; it auto-dismisses, and a newer flash supersedes an older one.
 */
export function useFlash() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const idRef = useRef(0);

  const show = useCallback(
    (tone: Feedback["tone"], number: string | null, message: string) => {
      idRef.current += 1;
      setFeedback({ id: idRef.current, tone, number, message });
    },
    [],
  );

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(
      () => setFeedback((f) => (f?.id === feedback.id ? null : f)),
      DISMISS_MS,
    );
    return () => clearTimeout(timer);
  }, [feedback]);

  return { feedback, show };
}
