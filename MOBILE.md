# Running Together Now on iPhone and Android

The app is a web app wrapped with [Capacitor](https://capacitorjs.com). Building
the native binaries has to happen on your own machine — Xcode (macOS only) for
iOS, Android Studio for Android.

## One-time setup

```bash
git clone <your repo> && cd <your repo>
bun install
bun run build:mobile     # outputs to .output/public, including index.html
bunx cap add ios         # macOS only
bunx cap add android
bun run native:config    # store settings into the generated projects
```

Use `build:mobile` rather than `build`: a phone has no server to render into, so
only the mobile build writes the static `index.html` that Capacitor copies.

## Every time you change the app

```bash
bun run build:mobile
bunx cap sync
bun run native:config    # re-apply after every sync
bunx cap open ios        # opens Xcode
bunx cap open android    # opens Android Studio
```

Then press Run in Xcode / Android Studio with your phone connected, or use a
simulator. For a physical iPhone you need a free Apple developer account
selected under Signing & Capabilities.

## Notes

- Store settings live in `native/app.json`, not in `capacitor.config.ts`, which
  reads `appId` and `appName` from it. After `cap add`/`cap sync`, run
  `bun run native:config` to write the privacy manifest, permission strings,
  deep links, versions and release settings into the generated projects, then
  `bun run store:check`. See [STORE.md](./STORE.md).
- The app ID is `io.github.wbarnha.togethernow` and is permanent from the first
  store upload. It lives in `native/app.json` alongside `iosAppGroup`, which
  must stay `group.` plus that value — but note the group is also hardcoded in
  `src/lib/app/widget.ts` and `native-widgets/ios/TogetherNowWidget.swift`,
  which `bun run store:check` now verifies, because a drift there blanks the
  widget silently.
- Reminders use `@capacitor/local-notifications` and are scheduled on the
  device. They are silently skipped in a browser.
- No backend, no accounts: all data lives in the device's local storage, and
  partners exchange it with share codes.

## Install without a store

The app also works as an installable web app. Open the published URL on your
phone and use Share → Add to Home Screen (iOS) or the install prompt (Android).

## Mood widgets (iOS & Android)

The app writes a small JSON snapshot (both moods, streak, next plan) through
Capacitor Preferences, so the native widgets read it locally — no backend.

- Key: `togethernow.widget.snapshot`
  - iOS: App Group `group.io.github.wbarnha.togethernow`, UserDefaults key
    `CapacitorStorage.togethernow.widget.snapshot`
  - Android: SharedPreferences file `CapacitorStorage`, key
    `togethernow.widget.snapshot`
- Widget taps deep-link back with `togethernow://mood?score=1..5`, which the app
  logs as today's check-in.

### iOS

1. `npx cap add ios && npx cap sync ios && npx cap open ios`
2. File > New > Target > **Widget Extension** (name it `TogetherNowWidget`, uncheck Live Activity).
3. Replace the generated Swift file with `native-widgets/ios/TogetherNowWidget.swift`.
4. Signing & Capabilities: add **App Groups** → the `iosAppGroup` value from
   `native/app.json` to _both_ the app target and the widget target.
5. The `togethernow` URL scheme is already added by `bun run native:config`.

### Android

1. `npx cap add android && npx cap sync android && npx cap open android`
2. Add Glance to `android/app/build.gradle`:
   `implementation "androidx.glance:glance-appwidget:1.1.1"`
3. Copy `native-widgets/android/MoodWidget.kt` into
   `android/app/src/main/java/io/github/wbarnha/togethernow/widget/`.
4. Add a widget info XML (`res/xml/mood_widget_info.xml`) and register the receiver
   in `AndroidManifest.xml`:
   ```xml
   <receiver android:name=".widget.MoodWidgetReceiver" android:exported="true">
     <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
     <meta-data android:name="android.appwidget.provider" android:resource="@xml/mood_widget_info" />
   </receiver>
   ```
5. The `togethernow` intent filter is already added by `bun run native:config`.

## Installing it on your own phone

Neither store carries this app. To put a build on a device you own — an APK
for Android, or an unsigned `.ipa` you re-sign yourself for iOS — see
[SIDELOAD.md](SIDELOAD.md).
