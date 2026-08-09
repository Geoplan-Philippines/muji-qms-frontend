/// <reference types="vite/client" />

/**
 * Build stamp injected by vite.config.ts. It versions the service worker's
 * script URL and cache name so a redeployed bundle actually replaces the one a
 * kiosk is already running.
 */
declare const __BUILD_ID__: string;
