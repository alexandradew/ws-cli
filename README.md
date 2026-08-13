# ws-cli

A terminal WhatsApp client. Scan a QR code once, then chat from a full-screen TUI that looks like an ordinary terminal tool rather than WhatsApp.

## Preview

Mockups below — hand-drawn with placeholder names/messages, not real screenshots.

Login screen (the block pattern is illustrative, not a real scannable code):

```
┌ ─────────────────────────────────────┐
│                                      │
│        █▀▀▀▀▀█ ▄  ██▀█▀▀▀▀▀█         │
│        █ ███ █     ▀▄█ ███ █         │
│        █ ▀▀▀ ██▄    ██ ▀▀▀ █         │
│        ▀███▀██ ▀    █▀▀▀▀▀█▀         │
│        █▄█▄█▄ ▀ ▀▀█▄▄██▀▄▄ ▀         │
│           ▀▄ █▄   ▀█ ▄█ █▀█          │
│        ▀██▄▀██▄▄▀ ▄▄█ ▄▀▄▄▄          │
│        █▀▀▀▀▀█ ▀▀██  ▀▀▀▀▀▀█         │
│        █ ███ █ ▄▀▄▄▀▀ ▀█▄▀▄▀         │
│        █ ▀▀▀ ██▀ ▀ ▄▄ ▄▄█ ▀█         │
│        ▀▀▀▀▀▀▀   ▀▀▀▀    ▀▀▀         │
│                                      │
│  scan with WhatsApp: Linked Devices  │
│                                      │
└──────────────────────────────────────┘
```

Main view — chat list on the left (unread counts, most recent on top), open thread on the right, input bar along the bottom:

```
┌ chats ───────────────┬ thread — Dev Team ─────────────────────────────────────────┐
│> Dev Team            │ 09:14  Grace H. anyone looked at the flaky test yet?       │
│  Ada Lovelace (2)    │ 09:15  me       found it — race condition, PR incoming     │
│  build-alerts (12)   │ 09:16  Priya    nice, thanks for the quick turnaround      │
│  Grace H.            │ 09:20  Grace H. [image] deploy dashboard screenshot        │
│  Mom (1)             │ 09:21  me       lgtm, merging now  (sending…)              │
│  Weekend Trip        │                                                            │
└──────────────────────┴────────────────────────────────────────────────────────────┘
┌ ──────────────────────────────────────────────────────────────────────────────────┐
│ > looks good, merging now_                                                        │
└───────────────────────────────────────────────────────────────────────────────────┘
```

(The selected chat row and the QR box border render in WhatsApp green in the real app — flat text can't show that.)

## Requirements

- Node.js (LTS; developed against Node 24)
- A WhatsApp account on your phone, with the app installed, to scan the login QR code

## Install

```
npm install
```

This pulls in `whatsapp-web.js` (the WhatsApp Web connection) and `blessed` (the TUI), among others. Read the Puppeteer caveats below before your first install — it's the part most likely to trip you up.

### Puppeteer / Chromium caveats

`whatsapp-web.js` talks to WhatsApp by driving a real, headless copy of Chromium via [Puppeteer](https://pptr.dev/). A few things to know:

- **First install downloads a full Chromium build** (100MB+). It happens as a `postinstall` script on the `puppeteer` package. Make sure you have a decent connection and free disk space the first time you `npm install`.
- **Install-script gating.** If your npm setup gates dependency install scripts (this repo's does, via `npm`'s `allowScripts`/`approve-scripts` mechanism), `puppeteer`'s Chromium download and `esbuild`'s postinstall won't run automatically on a fresh clone. You'll see a warning like:
  ```
  npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts
  ```
  Approve them once with:
  ```
  npm approve-scripts esbuild puppeteer
  npm rebuild
  ```
  If you skip this, `npm install` will "succeed" but the app will fail at startup when it tries to launch a browser it never downloaded.
- **Corporate proxies / firewalls** that block Chromium's download host will make the Puppeteer postinstall fail or hang. If you already have Chrome/Chromium installed locally, you can skip the bundled download and point Puppeteer at it instead:
  ```
  PUPPETEER_SKIP_DOWNLOAD=true npm install
  PUPPETEER_EXECUTABLE_PATH="C:\path\to\chrome.exe" npm run dev
  ```
- **Force-killing the app can orphan Chromium processes.** The app closes the browser cleanly on a normal quit (Ctrl+C). But on Windows in particular, a hard kill (e.g. `kill -TERM` from some shells, or a task manager "End Process" on the wrong PID) bypasses Node's graceful shutdown entirely — Windows doesn't deliver a real SIGTERM the way POSIX does — and can leave one or more `chrome.exe` processes running in the background. If things seem to pile up, check Task Manager for stray `chrome.exe`/`node.exe` processes.
- **A vendored bug-fix patch is applied automatically.** As of this writing, the current `whatsapp-web.js@1.34.7` has a known upstream crash ([issue #201868](https://github.com/wwebjs/whatsapp-web.js/issues/201868)) where opening the chat list can throw a cryptic `r: r` error, caused by WhatsApp Web occasionally omitting a field the library expects. This repo carries a small patch for it (via [`patch-package`](https://github.com/ds300/patch-package), see `patches/whatsapp-web.js+1.34.7.patch`) that reapplies automatically as part of `npm install`'s `postinstall` step. You shouldn't need to do anything, but if chat loading ever throws that error again, it likely means the patch stopped matching a newer `whatsapp-web.js` version.

## Running

```
npm run dev      # run directly from TypeScript source (tsx)
```

or build once and run the compiled output:

```
npm run build
npm start
```

### First run

1. Start the app. A QR code renders full-screen.
2. On your phone: WhatsApp → Linked Devices → Link a Device, and scan it.
3. Once linked, the chat list loads and the TUI switches to the normal three-pane view.

Your session is cached in `.wwebjs_auth/` (already gitignored) so you won't need to rescan the QR code on future runs, unless you log out from your phone or the session expires.

## Using it

- **↑ / ↓** or **j / k** — move through the chat list
- **Enter** (on the chat list) — open the highlighted chat
- **Tab** — jump focus between the chat list and the message input
- Type your message and press **Enter** to send
- **Escape** (while typing) — stop typing and return to the chat list
- **Ctrl+C** — quit (closes the browser session cleanly)

## Current limitations (v1)

- Text messages only — images, voice notes, stickers, etc. show as a `[type]` label, not their actual content.
- Single WhatsApp account / single session at a time.
- No local chat history database — messages live in memory for the running session only. Reopening a chat re-fetches recent history from WhatsApp itself.

