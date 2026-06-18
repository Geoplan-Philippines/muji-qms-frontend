import { useCallback, useEffect, useRef } from "react";

// The 2-note "now serving" confirmation: a soft, short chime — never an alarm.
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

/**
 * Provides a `triggerChime` callback that plays the shared serve chime through
 * the Web Audio API. The first user gesture unlocks playback (browsers suspend
 * an AudioContext created without interaction), so both the auto-chime on the
 * display and a manual replay button on the tablet stay reliable.
 */
export function useChime(): () => void {
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        void audioCtxRef.current.resume();
      } catch {
        /* AudioContext unavailable */
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return triggerChime;
}
