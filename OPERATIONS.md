# Operating the MUJI queue system

Field notes for the deployed install: one mini PC on the shop LAN serving the
backend and this SPA, with a handheld scanner, a Bluebird tablet and a TV all
running Fully Kiosk against it.

---

## 1. How the screens now stay alive

The original design made the socket the only way data reached a screen. When a
socket died quietly — which Android does constantly — the screen kept saying
"Connected" and showed nothing until somebody power-cycled the device.

That is no longer the case. **The socket is now only an accelerator. REST
polling is the safety net.** Every screen reconciles its whole board against the
backend on a timer, so even with a completely dead socket it stays correct.

| Layer | What it does | Where |
| --- | --- | --- |
| Socket events | Instant updates | `src/lib/use-queue.ts` |
| Reconcile poll | Full board refresh every 15s (3s while degraded) | `doSync` |
| Liveness watchdog | Spots a half-open socket via engine.io's ping and rebuilds it | `tick` |
| Room-loss detector | A poll that finds news the socket missed → rejoin, then recycle | `doSync` |
| Wake hooks | Immediate resync on visible / online / focus / pageshow | `wake` |
| Recovery reload | Both paths dead 5+ min → reload the page automatically | `recoveryReload` |

Failures are also no longer allowed to blank the board. A failed poll keeps the
last known good state; the old code turned any non-2xx into an empty queue.

### Reading the status pill

| Pill | Meaning | Action |
| --- | --- | --- |
| **Connected** (green) | Socket live, board fresh | none |
| **Syncing…** (amber) | Socket down, polling is carrying the board | none — data is correct, just ~3s behind. Note it if it persists. |
| **Connecting…** (red) | First 45s after load | none |
| **Reconnecting…** (red) | Nothing has reconciled recently — **what is on screen may be stale** | check the mini PC |

Only **Reconnecting…** means the numbers can't be trusted. The customer-facing TV
now shows its banner only in that state.

### On-site escape hatches

- `http://<mini-pc-ip>/table?debug=1` — verbose console logging (every socket
  event, every sync). Also settable permanently: `localStorage.setItem('muji-qms:debug','1')`.
- `http://<mini-pc-ip>/table?nosw=1` — unregisters the service worker and wipes
  every cache, then reloads. Use this if a device seems stuck on an old build.

---

## 2. Diagnosing a broken screen

Work down this list; stop when the answer is yes.

1. **What does the pill say?**
   "Reconnecting…" → the device cannot reach the mini PC at all. Go to §3.
   "Syncing…" → the socket path is broken but data is flowing. Go to §4.
   "Connected" but wrong → this should now be impossible; capture the console
   with `?debug=1` before touching anything.

2. **Can the device reach the backend?** In Fully Kiosk, open
   `http://<mini-pc-ip>:8000/api/v1/orders/store/<store-uuid>` directly. JSON
   back means the network is fine and the problem is in the app; a browser error
   means it's the network or the mini PC.

3. **Do all devices fail, or just one?** All → mini PC or network (§3). One →
   that device (§4).

---

## 3. Mini PC checks

Run these in an elevated PowerShell on the mini PC.

```powershell
# Are both services running, and set to start on boot?
Get-CimInstance Win32_Service | Where-Object Name -like 'muji*' |
  Select-Object Name, State, StartMode

# Is anything actually listening on the API and web ports?
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 8000,80,3000 |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

### Firewall profile (the "sometimes after a reboot" suspect)

Windows re-identifies the network at every boot. If Network Location Awareness
starts before the link is up, the connection comes back as **Public** and any
firewall rule scoped to Private stops applying — inbound `:8000` is blocked, and
the devices see exactly what you described.

```powershell
# What profile is the LAN on right now? Look at NetworkCategory.
Get-NetConnectionProfile

# Force it to Private (use the InterfaceAlias from the command above)
Set-NetConnectionProfile -InterfaceAlias 'Ethernet' -NetworkCategory Private

# Do the rules exist, and which profiles do they apply to?
Get-NetFirewallRule -DisplayName '*MUJI*' |
  Select-Object DisplayName, Enabled, Direction, Profile, Action
```

**The durable fix is not to chase the profile — it is to scope the rules to
`Any`, so it stops mattering which profile Windows picks:**

```powershell
New-NetFirewallRule -DisplayName 'MUJI QMS API'      -Direction Inbound `
  -Protocol TCP -LocalPort 8000 -Action Allow -Profile Any
New-NetFirewallRule -DisplayName 'MUJI QMS Frontend' -Direction Inbound `
  -Protocol TCP -LocalPort 80   -Action Allow -Profile Any   # match the real web port
```

Verify from another machine on the LAN: `Test-NetConnection <mini-pc-ip> -Port 8000`.

### Address and power

```powershell
# PrefixOrigin must be 'Manual'. 'Dhcp' means the IP can move and every device
# breaks at once, because VITE_API_URL is compiled into the bundle.
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress, PrefixOrigin

# The mini PC must never sleep or hibernate.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

# And Windows must not power down the NIC.
Get-NetAdapterPowerManagement -Name 'Ethernet'
Disable-NetAdapterPowerManagement -Name 'Ethernet'
```

### Static file serving

Whatever serves `dist/` must fall back to `index.html` for unknown paths, or a
cold visit to `/staff` or `/table` returns a 404. The service worker now refuses
to cache a 404 as the app shell (it used to, permanently poisoning the device),
but the first load on a fresh device still needs the server to answer correctly.

---

## 4. Per-device checks (Fully Kiosk)

Settings that matter on the scanner, tablet and TV:

- **Device Management → Keep Screen On: ON**, Screen Off Timer: 0. A screen-off
  Android throttles JS timers, which is what strands sockets.
- **Wi-Fi must not sleep.** Fully Kiosk → "Keep Wi-Fi On"; and in Android,
  disable battery optimisation for Fully Kiosk.
- **Start on Boot: ON**, **Restart on Crash: ON**.
- **Reload on Network Reconnect: ON.**
- **Scheduled daily restart** (e.g. 04:00) is cheap insurance.
- Keep all three devices on mains power.
- Confirm the URL each device points at: `/` is the TV display, `/staff` is the
  counter/scanner, `/table` is the table-service tablet. Anything else redirects
  to the TV display — there is no `/counter`, `/status` or `/display` route.

---

## 5. Redeploying

```powershell
.\deploy.ps1            # or -SkipInstall when only code changed
```

`deploy.ps1` now refuses to build when `.env` has no `VITE_API_URL`, points at
localhost, or still carries the `your-store-uuid-here` placeholder — that
placeholder produced a screen that said "Connected" and showed an empty board
forever. It also probes the backend and warns if it isn't reachable.

Devices pick up a new build on their own: the service worker's cache is keyed to
a build stamp, and each screen checks for an update every 30 minutes and on every
wake, reloading once the new version activates. No need to touch the devices.

The reload waits for the screen to be idle for 30s first, so a redeploy can never
interrupt someone mid-order. The TV takes it immediately; the counter and table
tablets take it in the next lull — expect them to land within a minute or two of
each other rather than all at once.
