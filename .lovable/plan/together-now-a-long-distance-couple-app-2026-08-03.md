# Together Now: A long-distance couple app

A mobile-first app for two partners to keep a shared calendar, remember the dates that matter, and jump into their conversations fast. No backend: everything lives on the device, and partners exchange data with share codes.

## What gets built

**Onboarding / pairing**

- Set your name, your partner's name, your two time zones, and a relationship start date.
- Pairing screen generates a share code (a compact encoded snapshot of your data) as a QR code plus copyable text. Your partner scans or pastes it to merge your events and dates into their app. Works in both directions.
- Everything is stored in the browser/app's local storage on each device.

**Home**

- Dual clocks showing both partners' local times, with a "good time to call" indicator.
- Countdown to the next big date and the next shared plan.
- Days-together counter.
- Quick actions row.

**Shared calendar**

- Month view plus an upcoming list.
- Add plans with title, date, time, notes, and a "whose time zone" toggle so both times display side by side.
- Events are tagged as mine, theirs, or ours.
- Import/export via the same share code so calendars stay in sync after each exchange.

**Milestones**

- Birthdays, anniversaries, first-met dates, custom recurring milestones.
- Automatic yearly recurrence, days-until countdowns, and a sorted timeline.
- Local device reminders ahead of each date.

**Message hub**

- Tiles for iMessage, Discord, Instagram, WhatsApp, Telegram, and FaceTime that deep-link straight into the conversation with your partner.
- You store the handle/username per app once; the tile opens that app directly.
- No message content is read or stored — the platforms don't permit it.

**Settings**

- Edit profiles, time zones, handles, reminder lead time, theme.
- Export a full backup code, import one, reset data.

## Design

Warm, intimate, and tactile — not a generic productivity app. Dual-tone palette with one color per partner so shared items read at a glance, soft rounded cards, a bottom tab bar sized for thumbs, and gentle transitions. Dark mode included.

## Technical notes

- Frontend-only. TanStack Start routes: `/` (home), `/calendar`, `/milestones`, `/messages`, `/settings`, `/pair`.
- State in React context backed by `localStorage`, with a versioned schema.
- Share codes: JSON snapshot, compressed and base64url-encoded, rendered as a QR via a small QR library and importable by paste or camera scan.
- Time-zone math and recurrence with `date-fns`.
- Capacitor added for iOS/Android: `@capacitor/core`, `/cli`, `/ios`, `/android`, `capacitor.config.ts`, plus local notifications and camera (for QR scanning). Native builds require Xcode / Android Studio on your own machine — the plan includes the config and a short README with the run steps.

## Deliberately out of scope

Netflix, Hulu, and Crunchyroll viewing history: none of these expose an API for third-party apps, so there's no way to read it. Same for reading iMessage, Discord, or Instagram message content. Skipping the streaming feature for v1 per your call; messaging is a deep-link hub instead.

Automatic calendar sync also isn't possible without a backend — share codes are the manual substitute. If you later want true live sync, enabling Lovable Cloud would make it work with no external accounts.