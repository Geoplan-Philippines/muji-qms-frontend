import { useEffect, useState } from "react";

/**
 * A clock that re-renders on a fixed interval. Default: once per second.
 *
 * `offsetMs` is added to the device clock so the returned time tracks a trusted
 * source (the LAN server) even when the device's own clock is wrong. This is how
 * the TV display mirrors the Mini PC's time without any internet/NTP: the offset
 * is learned from the server over the socket (see `useQueue().clockOffset`).
 * Defaults to 0 (raw device clock).
 */
export function useClock(intervalMs = 1000, offsetMs = 0): Date {
  const [now, setNow] = useState(() => new Date(Date.now() + offsetMs));
  useEffect(() => {
    setNow(new Date(Date.now() + offsetMs)); // re-sync immediately when offset changes
    const id = setInterval(() => setNow(new Date(Date.now() + offsetMs)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, offsetMs]);
  return now;
}
