import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "muji.display.logoVisible";

function read(): boolean {
  try {
    // Default to visible when nothing has been stored yet.
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * Whether the display screen's brand logo is shown, persisted in localStorage.
 * The table screen toggles it; the display screen reads it and reacts to
 * changes from other tabs/windows via the `storage` event.
 */
export function useLogoVisible(): [boolean, (next: boolean) => void] {
  const [visible, setVisible] = useState(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setVisible(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const set = useCallback((next: boolean) => {
    setVisible(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  return [visible, set];
}
