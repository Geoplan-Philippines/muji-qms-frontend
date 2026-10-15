# Offline LAN audit — 15 October 2026

Target: shop devices at `http://192.168.0.57:5173/staff`, `/table`, and `/` (TV).
This audit changes both frontend and backend. No packages or database schema
changes are required. Keep the mini PC's existing environment files.

## Corrections

- The clock no longer rewinds to the latest order timestamp. Staff, table and TV
  clocks all use the mini PC's time. HTTP health supplies current time when the
  socket is unavailable; the last calibration continues ticking during outages.
- Malformed HTTP success responses preserve the last board rather than clearing
  it. Storage restrictions no longer crash the chime preference or initial render.
- A poll during an unfinished collect/cancel request cannot put the locally
  removed order back on screen while the write is pending.
- Recovery reloads require a reachable frontend. Automatic reloads wait for
  unfinished entries, open dialogs and active HTTP mutations.
- Production updates are detected through a LAN-only `version.json` check,
  independent of service workers. The worker's actual content is now stamped per
  build, so its own update checks also detect a new release.
- The backend HTTP response interceptor now leaves socket messages alone. Real
  `time:request` and `join-store` acknowledgements retain the correct shape.
- Repeating a completed status action succeeds without resetting its timestamp.
  Atomic status checks prevent a concurrent update from resurrecting a collected
  or cancelled order. Broadcast failure does not fail a committed write.
- Backend production entry path corrected to `dist/src/main.js`. Both
  `deploy.ps1` files are unchanged; audit edits to them were reverted.
- Vite validates the effective production API URL and store UUID, including
  environment-file overrides, even when building without `deploy.ps1`.

## Validation

- Production TypeScript/build checks for both projects; frontend ESLint.
- All 30 backend unit tests pass. Full backend ESLint still reports 11 existing
  auth/user typing and unused-variable issues in unchanged files; backend-wide
  lint is not clean. Modified queue/interceptor code passes its targeted lint.
- Frontend virtual-clock tests execute the actual hooks through idle orders,
  disconnected operation, HTTP time fallback, malformed responses, prolonged
  network loss, recovery and empty queues.
- Update tests execute the actual entry module without a service-worker API:
  version detection, entry/idle protection, loss of network before reload, and
  navigation to the new build.
- Backend unit tests include socket room handling, current-time responses,
  response interception, repeated status actions and concurrent status conflicts.
  Existing scaffold tests now supply their missing dependency substitutes.
- Local integration starts the real Nest app with a database substitute and uses
  real HTTP and Socket.IO clients. Both polling-only and websocket-only transports
  pass time sync, uppercase store join, live order creation, REST reconciliation,
  duplicate rejection, status retries, completed-order exclusion, and LAN CORS.

Commands (use installed dependencies; no installation required):

```powershell
# In muji-qms-server
bun run build
bun run test --runInBand --silent

# In muji-qms-frontend
bun run build
bun run lint
bun run test
# Optional integration check after building the sibling backend:
node tests/lan-integration.cjs
```

In this restricted audit workspace, Vite's default config loader encountered a
Windows process-spawn restriction. `bun run build --configLoader native` passed
using Node 25. This is an environment-specific fallback, not a new requirement
for the mini PC.

## Rebuild and verify on site

1. Back up both existing `dist/` folders before building. Use installed
   dependencies; avoid `install` on the disconnected machine. If using the
   scripts, run backend `deploy.ps1 -SkipInstall -SkipMigrate` and frontend
   `deploy.ps1 -SkipInstall`. Skipping migrations is appropriate for this patch
   only if the previously deployed schema is already current.
2. Rebuild/restart both projects using your existing hosting setup. Ensure it
   serves the new `dist/` if using a production build. Port 5173 alone does not
   tell us whether the service runs a development server or a static host.
3. Refresh each screen once to load this release. Future production deployments
   can use its version checker. Leave an order unchanged for at least two minutes
   and confirm the clock and waiting duration continue advancing.
4. Disconnect one test device from the LAN, confirm the existing board stays
   visible with a warning, then reconnect and confirm it catches up. Confirm new
   orders and serving/collection changes reach the other screens.
5. Confirm the mini PC and PostgreSQL services restart after a planned reboot,
   and check the serving chime on the actual kiosk.

## Limits

No live shop database or physical devices were accessed. Hardware sleep settings,
firewall rules, service startup, actual database restart recovery and kiosk audio
still require the on-site checks above. Tests use a database substitute; they do
not prove the live database migration state or storage reliability.

No external fonts, CDN assets or public clock service are required by the active
app. The LAN and mini PC must still be reachable to fetch orders. Service workers
normally require HTTPS or localhost, so plain HTTP LAN devices should not depend
on a service-worker offline shell ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)).

A failed poll preserves the in-memory board; a full browser/page restart while
the API remains unavailable cannot restore that board until a successful fetch.
Saved database orders are not deleted by a reload. The mini PC clock is the time
authority; no internet time service corrects an incorrect mini PC clock.

Production values may come from `.env.production`, `.env.local`, or process
environment overrides, not just `.env` ([Vite environment precedence](https://vite.dev/guide/env-and-mode)).
