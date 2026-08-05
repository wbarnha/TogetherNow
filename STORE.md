# Publishing to the App Store and Google Play

Everything in this file that can be enforced by a machine is. Run:

```sh
bun run store:check              # everyday: fails on defects, lists owner decisions
bun run store:check -- --release # before submitting: owner decisions become failures
```

The build configuration itself lives in [`native/app.json`](./native/app.json) and is
written into the generated `ios/` and `android/` projects by
`scripts/apply-native-config.mjs` (`bun run native:config`), which the mobile
workflow runs on every build. The native projects are regenerated rather than
committed, so that script — not a one-off edit in Xcode or Android Studio — is
where store configuration belongs.

---

## 1. Before anything else: pick your own identifier

`native/app.json` still carries the scaffold's `app.lovable.togethernow`.
**This has to change before your first upload, and it can never change after.**

- Apple will not let you register a bundle ID under a prefix you do not own.
- On Play the package name is permanent from the first upload. Getting it wrong
  means publishing a second, unrelated listing and abandoning the first.

Edit `native/app.json`:

```jsonc
{
  "appId": "com.yourdomain.togethernow",
  "iosAppGroup": "group.com.yourdomain.togethernow", // must mirror appId
}
```

Then `bun run native:config && bun run store:check -- --release`.

`iosAppGroup` is how the home-screen widget reads the mood snapshot. If the two
drift apart the widget silently renders nothing, so the check enforces the match.

While you are here, decide `privacyPolicyUrl` and `supportUrl`. The app serves
its own policy at `/privacy`, so `https://<your-domain>/privacy` works as soon as
the web build is deployed. Both stores require the policy URL; Apple also
requires the support URL.

---

## 2. What the code actually does with data

Both stores ask you to declare this, and both treat a wrong answer as a policy
violation rather than a mistake. These answers come from the source, not from
intent:

| Question                         | Answer                                                           | Where it comes from                                                                                               |
| -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Is there a backend?              | No                                                               | There is no API client anywhere; `connect-src` in `src/lib/security.ts` permits only this origin and the geocoder |
| Are there accounts?              | No                                                               | No auth code, no credential storage                                                                               |
| Analytics or crash reporting?    | No                                                               | No SDK is installed                                                                                               |
| Advertising or tracking?         | No                                                               | `NSPrivacyTracking` is `false`; no ad identifier is read                                                          |
| Where does user data live?       | On the device                                                    | `src/lib/app/persistence.ts` writes to IndexedDB in the app's own sandbox; Android backup is disabled             |
| What is transmitted off device?  | Place-search text, when the user searches                        | `src/lib/app/geocode.ts`                                                                                          |
| Third-party network destinations | OpenStreetMap Nominatim (search), OpenStreetMap tiles (map view) | Enforced by the CSP and by the CI origin check                                                                    |
| Can the user delete everything?  | Yes, in-app, immediately                                         | **You two → Erase everything**                                                                                    |

Share codes are worth stating plainly on both forms if asked: they are handed to
whatever app the user picks (Messages, WhatsApp, the clipboard, a QR code on
screen). They do not pass through any server of ours. The user chooses what a
code contains under **Partner → what's shared**.

---

## 3. Apple — App Store Connect

### Handled in the build

`bun run native:config` writes these; `bun run store:check` fails if any go missing.

- **`PrivacyInfo.xcprivacy`**, required for all submissions since May 2024 and
  bundled into the app target (a file merely sitting on disk never reaches the
  build Apple inspects). It declares `NSPrivacyAccessedAPICategoryUserDefaults`
  with reason `CA92.1`, because `@capacitor/preferences` writes the widget
  snapshot through `UserDefaults` and ships no manifest of its own.
- **`NSLocationWhenInUseUsageDescription`.** Without it iOS terminates the app
  the moment the Ideas screen asks for a location — this was the single most
  likely crash-on-review in the project.
- **`ITSAppUsesNonExemptEncryption = false`**, so the export-compliance question
  is answered in the build instead of by hand on every upload. The app uses only
  HTTPS, which is exempt.
- **`CFBundleDisplayName`**, which the template leaves as `My App`.
- The `togethernow` URL scheme, so widget taps reach the app.
- `arm64` in `UIRequiredDeviceCapabilities`, replacing the template's retired
  `armv7`.
- Version and build number from `native/app.json`.

### App Privacy questionnaire

Answer **"Data Not Collected"**. Apple defines collection as transmitting data
off the device and retaining it; this app retains nothing anywhere.

One nuance to be ready for: the place search sends the user's typed text to
OpenStreetMap. That is a third-party service, not an SDK, and the request is
answered in real time and not retained by you. If you would rather not have the
conversation at all, make the geocoder opt-in behind a settings toggle — the
manual "pick an area" flow already covers the same need.

### Review notes worth writing

- **No account is needed.** Reviewers reject apps whose main features sit behind
  a login they were not given; say up front there is no login at all.
- **How to test pairing with one device.** Open **You two → Share or import a
  code**, copy the code from _Send mine_, then paste it into _Receive_. That
  exercises the whole partner flow without a second phone.
- **Imports are optional.** Every import screen accepts a file the user already
  downloaded from another service. The app does not connect to Netflix, Discord,
  Instagram or anyone else — it reads an export the user provides.

### Still to do by hand

- Register the bundle ID and create the app record.
- Screenshots for every required device size, plus the app icon (1024×1024, no
  alpha channel).
- Age rating questionnaire. Nothing here is objectionable; mood notes and
  imported messages are user-generated but private to the device and never shown
  to anyone else, so there is no user-generated-content moderation obligation.
- Support URL and marketing URL on the listing.
- The widget extension target, if you want the home-screen widget in the first
  release — see [MOBILE.md](./MOBILE.md). It is a separate Xcode target and
  cannot be generated from this repository.

---

## 4. Google — Play Console

### Handled in the build

- **`ACCESS_COARSE_LOCATION`** and nothing more. The WebView's geolocation API
  is inert unless the app itself holds the permission, so "use my location" could
  never have worked on Android before this. Coarse is deliberate: a distance
  filter does not need a precise fix, and it is far easier to justify in review.

  One trade-off to know about. Capacitor asks the WebView for coarse and fine
  together, and only Android 12 (API 31) and later will settle for coarse alone.
  On Android 7–11 the button falls back to the manual "pick an area" flow, which
  is a graceful degradation rather than a failure. If you would rather it worked
  everywhere, add `ACCESS_FINE_LOCATION` to `androidUsesPermissions` in
  `native/app.json` — `store:check` accepts any permission declared there with a
  justification, and only objects to ones that arrive by accident.

- **`android:allowBackup="false"`** plus `data_extraction_rules.xml`. Auto Backup
  would otherwise copy the entire archive — plans, moods, money, imported message
  history — into the user's Google Drive, which contradicts both the listing copy
  and the Data Safety answers below.
- The `togethernow` deep-link intent filter for widget taps.
- `versionCode` / `versionName` from `native/app.json`.
- Release builds: R8 and resource shrinking on, signed from the keystore the
  workflow supplies. Capacitor ships the consumer ProGuard rules that keep its
  plugin classes, so minification is safe.
- `targetSdkVersion 36` from Capacitor 8, comfortably inside Play's rolling
  requirement.

### Permissions the listing will show

Gradle merges every Capacitor plugin's manifest into the one that ships, so the
built app requests more than the app manifest names. The complete set, which
`store:check` prints on every run:

| Permission               | Comes from                       | Why                                                                     |
| ------------------------ | -------------------------------- | ----------------------------------------------------------------------- |
| `INTERNET`               | Capacitor                        | Loading the app's own bundled web assets                                |
| `ACCESS_COARSE_LOCATION` | this app                         | The distance filter on the Ideas screen                                 |
| `POST_NOTIFICATIONS`     | `@capacitor/local-notifications` | Reminders for plans and important dates (runtime prompt on Android 13+) |
| `RECEIVE_BOOT_COMPLETED` | `@capacitor/local-notifications` | Re-registering already-scheduled reminders after a restart              |
| `WAKE_LOCK`              | `@capacitor/local-notifications` | Delivering a reminder while the device is idle                          |

None is restricted and none needs a Play declaration form. `store:check` reads
the plugin manifests as well as the app's, so a permission arriving through a
newly added plugin fails the build and names the plugin that introduced it. The
list it enforces against is `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`,
`QUERY_ALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`, `READ_SMS`,
`ACCESS_BACKGROUND_LOCATION`, `ACCESS_FINE_LOCATION` and `READ_CONTACTS`.
Reminders are scheduled inexactly on purpose, so no exact-alarm exemption is
needed.

### Data Safety form

| Section                                       | Answer                                       |
| --------------------------------------------- | -------------------------------------------- |
| Does your app collect or share any user data? | **No**                                       |
| Is all data encrypted in transit?             | Yes — every request is HTTPS                 |
| Do you provide a way to delete data?          | Yes — in-app, **You two → Erase everything** |
| Data collected                                | None                                         |
| Data shared                                   | None                                         |

"Collect" in Play's definition means transmitting off the device. Location is
used on the device and never transmitted, so it is not collected — but be ready
to say that in a review reply, since a location permission with a "no data
collected" declaration does attract questions. The permission's purpose string in
`native/app.json` is the same explanation.

### Other declarations

- **Financial features:** none. The Money screen is a shared expense notepad. It
  moves no money, connects to no bank, and has no payment integration.
- **Health:** none. Mood check-ins are a personal diary entry stored on the
  device; the app makes no health claim and shares nothing.
- **Ads:** none.
- **News:** no.
- **Target audience:** adults. Not designed for or directed at children.
- **Content rating:** answer the questionnaire honestly; there is no violence,
  no sexual content, no gambling and no user-to-user content visible to anyone
  but the two people who exchanged a code.

### Still to do by hand

- Create the app, accept the Developer Program policies, complete the identity
  and address verification (Google now requires this before publishing).
- Enrol in **Play App Signing**, generate your upload key, and add these
  repository secrets so the release job can sign:
  `ANDROID_KEYSTORE_BASE64` (`base64 -w0 upload.jks`), `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Store listing: icon, feature graphic, phone screenshots, short and full
  description.
- Closed testing with the required number of testers before production access, if
  your account is subject to it.

---

## 5. Cutting a release

```sh
# 1. Bump both fields in native/app.json — buildNumber must increase every upload
# 2. Confirm nothing is outstanding
bun run store:check -- --release
# 3. Tag; the mobile workflow builds and signs
git tag v1.0.0 && git push origin v1.0.0
```

The workflow produces a signed `.aab` for Play and an unsigned simulator build
for iOS. iOS archives for App Store Connect still need signing credentials on a
Mac or a signing service — that step is deliberately not automated here, because
it needs certificates this repository should never hold.

Before you upload either one, install the **release** build on a real device and
use it. A minified Android release and a debug build are not the same binary, and
a store rejection is a slow way to discover the difference.

---

## 6. What this repository cannot check for you

- Whether your screenshots match the current UI.
- Whether the domain in `privacyPolicyUrl` is actually deployed and reachable —
  both stores fetch it, and a 404 is a rejection.
- Whether the widget extension has been added to the Xcode project.
- Anything about your developer account: enrolment, verification, tax and
  banking details, or the agreements each store asks you to accept.
