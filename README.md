# Together Now

A private app for long-distance couples: a shared calendar, milestone countdowns,
date ideas with a map, travel planning, shared money tools, and daily mood
check-ins with home-screen widgets.

**No backend, no accounts.** Everything lives on the device. Partners exchange
data with share codes (QR or text), and calendars/ideas can be imported and
exported as `.ics` / `.csv` files.

- Web app: TanStack Start + React + TypeScript + Tailwind CSS
- Native shell: [Capacitor](https://capacitorjs.com) (app ID `app.lovable.togethernow`)
- Package manager: [Bun](https://bun.sh)

---

## Quick start (web)

```sh
git clone https://github.com/wbarnha/TogetherNow.git
cd TogetherNow
bun install
bun run dev            # http://localhost:8080
```

Other scripts:

| Command | What it does |
| --- | --- |
| `bun run build` | Production build into `.output/public` |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest unit tests |

CI runs lint → typecheck → test → build on every push and pull request
(`.github/workflows/ci.yml`).

---

## Prerequisites for native builds

| | iOS | Android |
| --- | --- | --- |
| OS | macOS 13+ | macOS, Windows, or Linux |
| Tooling | Xcode 15+ and Xcode Command Line Tools | Android Studio (Hedgehog or newer) |
| Extra | CocoaPods (`sudo gem install cocoapods`) | JDK 21 + Android SDK 34 (installed via Android Studio) |
| Device | Free Apple ID for on-device runs | USB debugging enabled, or an emulator |

Both platforms also need `bun install` and one successful `bun run build` first —
Capacitor copies the built web output from `.output/public`.

---

## iOS setup and build

```sh
bun install
bun run build
bunx cap add ios          # one time only
bunx cap sync ios
bunx cap open ios         # opens Xcode
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities**.
2. Pick your Apple ID under *Team* and set a unique bundle identifier if
   `app.lovable.togethernow` is taken.
3. Choose your iPhone or a simulator in the toolbar and press **Run** (⌘R).

To build from the command line without signing (what CI does):

```sh
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App \
  -sdk iphonesimulator -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build
```

---

## Android setup and build

```sh
bun install
bun run build
bunx cap add android      # one time only
bunx cap sync android
bunx cap open android     # opens Android Studio
```

In Android Studio, let Gradle sync finish, pick a device or emulator, and press
**Run**.

To build a debug APK from the command line:

```sh
cd android
./gradlew assembleDebug
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected phone with `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

---

## After every code change

```sh
bun run build && bunx cap sync
```

Then re-run from Xcode / Android Studio. `cap sync` copies the web build and
updates native dependencies; you only need `cap add` once per platform.

---

## Home-screen mood widgets

The widgets read a local JSON snapshot written through Capacitor Preferences —
no network involved. Native widget sources live in `native-widgets/`, and the
full step-by-step target setup (App Groups, Glance, deep links) is in
[MOBILE.md](./MOBILE.md).

## Install without a store

Together Now also works as an installable web app: open the published URL on
your phone and use **Share → Add to Home Screen** (iOS) or the install prompt
(Android).

## Troubleshooting

- **`cap sync` says the web directory is missing** — run `bun run build` first;
  `webDir` is `.output/public`.
- **Pod install fails on iOS** — `cd ios/App && pod repo update && pod install`.
- **Gradle can't find a JDK** — set Java 21 under *Settings → Build Tools →
  Gradle → Gradle JDK* in Android Studio.
- **Notifications never appear** — they are scheduled on-device with
  `@capacitor/local-notifications` and are skipped in a desktop browser; allow
  notifications when the app first asks.
