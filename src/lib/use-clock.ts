import { useEffect, useState } from "react";

/**
 * A clock that re-renders on a fixed interval. Default: once per second.
 *
 * `offsetMs` is added to the device clock so the returned time tracks a trusted
 * source (the LAN server) even when the device's own clock is wrong. This is how
 * the TV display mirrors the Mini PC's time without any internet/NTP: the offset
 * is learned over the LAN socket or HTTP (see `useQueue().clockOffset`).
 * Defaults to 0 (raw device clock).
 */
export function useClock(intervalMs = 1000, offsetMs = 0): Date {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return new Date(now + offsetMs);
}
