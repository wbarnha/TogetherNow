# Running Together Now on iPhone and Android

The app is a web app wrapped with [Capacitor](https://capacitorjs.com). Building
the native binaries has to happen on your own machine — Xcode (macOS only) for
iOS, Android Studio for Android.

## One-time setup

```bash
git clone <your repo> && cd <your repo>
npm install
npm run build            # outputs to .output/public
npx cap add ios          # macOS only
npx cap add android
```

## Every time you change the app

```bash
npm run build
npx cap sync
npx cap open ios         # opens Xcode
npx cap open android     # opens Android Studio
```

Then press Run in Xcode / Android Studio with your phone connected, or use a
simulator. For a physical iPhone you need a free Apple developer account
selected under Signing & Capabilities.

## Notes

- `capacitor.config.ts` sets the app ID `app.lovable.togethernow`; change it
  before submitting to a store.
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
  - iOS: App Group `group.app.lovable.togethernow`, UserDefaults key
    `CapacitorStorage.togethernow.widget.snapshot`
  - Android: SharedPreferences file `CapacitorStorage`, key
    `togethernow.widget.snapshot`
- Widget taps deep-link back with `togethernow://mood?score=1..5`, which the app
  logs as today's check-in.

### iOS

1. `npx cap add ios && npx cap sync ios && npx cap open ios`
2. File > New > Target > **Widget Extension** (name it `TogetherNowWidget`, uncheck Live Activity).
3. Replace the generated Swift file with `native-widgets/ios/TogetherNowWidget.swift`.
4. Signing & Capabilities: add **App Groups** → `group.app.lovable.togethernow`
   to _both_ the app target and the widget target.
5. In `Info.plist` of the app target add a URL scheme `togethernow`.

### Android

1. `npx cap add android && npx cap sync android && npx cap open android`
2. Add Glance to `android/app/build.gradle`:
   `implementation "androidx.glance:glance-appwidget:1.1.1"`
3. Copy `native-widgets/android/MoodWidget.kt` into
   `android/app/src/main/java/app/lovable/togethernow/widget/`.
4. Add a widget info XML (`res/xml/mood_widget_info.xml`) and register the receiver
   in `AndroidManifest.xml`:
   ```xml
   <receiver android:name=".widget.MoodWidgetReceiver" android:exported="true">
     <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
     <meta-data android:name="android.appwidget.provider" android:resource="@xml/mood_widget_info" />
   </receiver>
   ```
5. Add an intent filter on `MainActivity` for the `togethernow` scheme.
