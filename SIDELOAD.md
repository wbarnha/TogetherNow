# Putting Together Now on your own phone

The app is not in either store. This is how to install it anyway, on a device
you own.

Android is straightforward: download an APK, allow the installer, done. iOS is
not, and no amount of tooling makes it so — Apple requires every app on every
iPhone to be signed by a certificate tied to an Apple Account, and CI cannot
hold yours. So the iOS build ships **unsigned**, and you sign it on your own
machine. Everything below is a variation on that.

**Before you start on iOS, read [The bundle identifier problem](#the-bundle-identifier-problem).**
It blocks every iOS route and you will hit it in the first five minutes.

---

## Android

### What to download

| artifact              | when it is built | notes                                                   |
| --------------------- | ---------------- | ------------------------------------------------------- |
| `android-debug-apk`   | every push       | always available; debug-signed, larger, not minified    |
| `android-release-apk` | tagged releases  | minified, signed with the upload key                    |
| `android-release-aab` | tagged releases  | **for Play only — this cannot be installed on a phone** |

Get them from the **Actions** tab → the **Mobile builds** run → _Artifacts_ at
the bottom. They are zipped by GitHub; unzip to get the `.apk`.

Do not try to install the `.aab`. Android bundles are an upload format, not an
install format, and the failure is an unhelpful "There was a problem parsing
the package".

### Installing it on the phone

1. Get the `.apk` onto the device — download it in Chrome, or copy it over.
2. Tap it. Android says _"For your security, your phone is not allowed to
   install unknown apps from this source."_ Tap **Settings**.
3. Turn on **Allow from this source**.
   The manual path is **Settings → Apps → Special app access → Install unknown
   apps →** _the app doing the installing_ **→ Allow from this source**.
   Some manufacturers put it under Settings → Apps & notifications.
4. Go back, tap the APK again, tap **Install**.
5. Play Protect may say it has not seen this app before. Choose **Scan app** or
   decline — either lets the install continue.

The permission is granted **per source**, not once globally. Installing from
Chrome and then from Files means granting it twice.

### Or over USB, which is less fiddly

```bash
# One-time on the phone:
#   Settings → About phone → tap "Build number" seven times
#   Settings → System → Developer options → USB debugging → on
adb devices          # accept the fingerprint prompt on the phone
adb install app-debug.apk
```

Useful variants:

```bash
adb install -r app.apk    # reinstall, keep existing data
adb install -d app.apk    # allow installing an older version code
```

### When it will not install

- **`INSTALL_FAILED_UPDATE_INCOMPATIBLE`** — you already have a build signed
  with a different key. Debug and release builds are signed differently, so
  swapping between them hits this. Uninstall first; **your archive goes with
  it**, so export a share code beforehand if you care about the data.
- **"There was a problem parsing the package"** — usually the `.aab`, or a
  partial download.
- **An "update from a different source?" dialog** — appears if a Play-installed
  copy exists. Accepting hands future updates to whatever installed it last.

---

## iOS

### The bundle identifier problem

Read this first; it blocks everything else.

The project currently declares:

```
app.lovable.togethernow
```

`app.lovable.*` is the scaffold's namespace, not yours. Bundle identifiers are
globally unique across every Apple developer account, and this one is used by
thousands of generated projects. Xcode will refuse it:

> Failed to register bundle identifier. The app identifier
> 'app.lovable.togethernow' cannot be registered to your development team
> because it is not available.

**Change it to something nobody else has** before you build. Reverse-DNS on a
domain you control is the convention — `com.yourname.togethernow` works fine
for a personal build even if you own no domain, as long as it is unique.

In `native/app.json`, set `appId`, and set `iosAppGroup` to `group.` plus that
same value. Then `bun run native:config` writes it through to the Xcode
project. `bun run store:check` fails while the placeholder is still there,
which is deliberate.

The re-signing tools further down can override the identifier for you, so this
matters most for the Xcode route.

### Route 1 — Xcode, free Apple Account

Needs a Mac. Costs nothing. **The app stops working after 7 days** and you
repeat the process.

```bash
bun install
bun run build:mobile
bunx cap add ios
bunx cap sync ios
bun run native:config
open ios/App/App.xcodeproj
```

In Xcode:

1. **Xcode → Settings → Apple Accounts**, sign in. Your free account appears as
   a **Personal Team**.
2. Select the **App** target → **Signing & Capabilities**. Tick **Automatically
   manage signing** and pick your Personal Team.
3. Fix the bundle identifier here if you have not already.
4. Plug the phone in. Pick it as the run destination. Press **Run**.

On the phone, two separate gates, and it is easy to think you have done one
when you have done the other:

- **Trust the certificate**: Settings → General → VPN & Device Management →
  your Apple Account → **Trust**.
- **Developer Mode**: Settings → Privacy & Security → **Developer Mode** → on,
  then restart. This only appears once the phone has been paired with a Mac.

The first launch needs an internet connection — iOS checks the signature with
Apple before it will run a development-signed app.

**The limits, which are Apple's and not negotiable:**

|                               |                                                   |
| ----------------------------- | ------------------------------------------------- |
| provisioning profile validity | **7 days**, then the app refuses to launch        |
| signing certificate validity  | 1 year (it is the profile that expires, not this) |
| apps installed per device     | 3                                                 |
| devices registered            | 3 per platform                                    |
| App IDs                       | 10 per rolling 7 days                             |

Nothing on the phone can renew the 7 days. You reconnect to the Mac and press
Run again.

**The home-screen widget will not work on this route.** It reads the mood
snapshot through an App Group, and App Groups need a server-side App ID
configuration that a Personal Team does not get. The app itself is fine; the
widget stays blank.

### Route 2 — re-sign the `.ipa` that CI builds

Needs no Xcode, and depending on the tool, no Mac. Download the
**`ios-unsigned-ipa`** artifact from the Actions tab, then feed it to one of:

- **Sideloadly** (macOS or Windows) — the most direct. Point it at the `.ipa`,
  sign in with your Apple Account, and it can override the bundle identifier
  for you, which sidesteps the problem above entirely.
- **AltStore / SideStore** — installs an on-device app that refreshes the
  signature for you, which is the main reason to prefer them: they push back
  the 7-day cliff without you plugging in each time. SideStore does this
  without a computer running alongside.
- **Apple Configurator** (macOS) — Apple's own tool.

The same 7-day expiry applies to all of them on a free account: what changes is
how painful the renewal is, not whether it happens.

### Route 3 — paid Apple Developer Program

$99/year, and it makes the problem go away. Profiles last a year rather than a
week, and **TestFlight** becomes available — which is genuinely the right
answer if more than one or two people need this. They install a normal app from
a normal Apple app; no cables, no certificates, no expiry to explain.

---

## Building it yourself instead of using CI

```bash
bun install
bun run build:mobile          # web bundle the native shells wrap

# Android — needs the Android SDK and a JDK
bunx cap add android && bunx cap sync android
bun run native:config
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk

# iOS — needs a Mac with Xcode
bunx cap add ios && bunx cap sync ios
bun run native:config
cd ios/App && xcodebuild -project App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
cd ../.. && ./scripts/package-ipa.sh \
  ios/App/build/Build/Products/Release-iphoneos/App.app \
  TogetherNow-unsigned.ipa
```

`android/` and `ios/` are generated rather than committed, so `cap add` is not
optional — and re-running it is safe.

---

## Your data

The archive lives on the device, in the app's own storage. Two consequences
worth knowing before you start moving builds around:

- **Uninstalling deletes it.** Android will make you uninstall when you switch
  between differently-signed builds.
- **Reinstalling does not restore it.** There is no account and no server; the
  app has nowhere to restore from.

Before replacing a build you care about, open **Share code**, copy your code,
and keep it somewhere. Merging it back into the fresh install restores what it
carries. It is not a complete backup — imported chat history and viewing
history are too large for a code and are not included — so keep the original
export files if those matter to you.
