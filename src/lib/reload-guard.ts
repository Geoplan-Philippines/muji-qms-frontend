import { hasPendingMutations } from "./net";

/** Entry or confirmation state must survive an idle period without input. */
export function isReloadBlocked(): boolean {
  return hasPendingMutations() ||
    !!document.querySelector('[data-reload-blocked="true"], dialog[open]');
}

