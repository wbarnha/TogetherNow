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