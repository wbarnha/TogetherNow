# Putting Together Now on your own phone

The app is not in either store. This is how to install it anyway, on a device
you own.

Android is straightforward: download an APK, allow the installer, done. iOS is
not, and no amount of tooling makes it so — Apple requires every app on every
iPhone to be signed by a certificate tied to an Apple Account, and CI cannot
hold yours. So the iOS build ships **unsigned**, and you sign it on your own
machine. Everything below is a variation on that.

The bundle identifier used to block every iOS route here; it is
[settled now](#the-bundle-identifier) and only needs your attention if you sign
with an Apple Account other than the owner's.

---

## Install, in short

The long version of each of these is further down. If you have done this kind
of thing before, this is all you need.

**Android**

1. **Actions** tab → latest **Mobile builds** run → download `android-debug-apk`.
2. Unzip it, put the `.apk` on the phone, tap it.
3. When Android objects, tap **Settings** and turn on **Allow from this source**.
4. Tap the APK again → **Install**.

Or, with the phone plugged in and USB debugging on: `adb install app-debug.apk`.

**iOS**

1. Either open `ios/App/App.xcodeproj` in Xcode, sign in with a free Apple
   Account, pick your Personal Team, and press **Run** with the phone attached;
2. Or download the `ios-unsigned-ipa` artifact and re-sign it with Sideloadly
   or AltStore, which needs no Xcode.
3. On the phone: trust the certificate **and** enable Developer Mode. They are
   two different settings and you need both.

Expect to redo step 1 or 2 every 7 days on a free account. If Xcode says the
identifier "cannot be registered to your development team", see
[The bundle identifier](#the-bundle-identifier).

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

### The bundle identifier

The project declares:

```
io.github.wbarnha.togethernow
```

This used to be the scaffold's `app.lovable.togethernow`, which Xcode refused
outright, and it was the first thing that blocked every iOS route. It is
settled now and needs no action from you — but one case still bites.

**A bundle identifier can only be registered to one Apple team.** If you are
signing with your own Apple Account rather than the owner's, Xcode will say:

> Failed to register bundle identifier. The app identifier
> 'io.github.wbarnha.togethernow' cannot be registered to your development team
> because it is not available.

That is not a problem with the identifier; it is Apple saying somebody else
already claimed it. Change it to something under a namespace you control —
`com.yourname.togethernow` is fine for a personal build even if you own no
domain, as long as it is unique.

If you do change it, change it in `native/app.json` (`appId`, plus
`iosAppGroup` as `group.` and the same value) and run `bun run native:config`
rather than editing Xcode directly, since the project is regenerated. Two more
files hardcode the App Group — `src/lib/app/widget.ts` and
`native-widgets/ios/TogetherNowWidget.swift` — and `bun run store:check` fails
if they drift, because the only symptom otherwise is a widget that renders
nothing.

The re-signing tools further down can override the identifier for you, so this
matters most for the Xcode route.

**Changing it also means a separate app.** iOS keys storage to the identifier,
so a build under a different one installs alongside the old copy with an empty
archive rather than updating it.

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

## Updating an install you already have

### Android

Install the new APK over the old one. Nothing else is needed, and your archive
survives:

```bash
adb install -r app-debug.apk      # -r = replace, keep the data
```

Tapping the APK on the phone does the same thing — the installer recognises it
as an update and offers **Update** rather than Install. The "allow from this
source" grant you gave earlier still applies, so that prompt should not return
unless you are installing from a different app than last time.

Three things that turn an update into a reinstall, and a reinstall loses your
archive:

- **Switching between the debug and release APK.** They are signed with
  different keys, and Android refuses to replace one with the other:
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. There is no flag for this — the only
  way through is to uninstall first. Pick one and stay on it.
- **Going back to an older build.** Android will not install a lower version
  code over a higher one. `adb install -r -d` allows the downgrade.
- **Uninstalling "to get a clean copy".** It does what it says.

If you see a dialog asking whether to update from a different source, that is
Android noticing this app was originally installed by something else. Accepting
transfers future updates to whatever installed it last.

### iOS

Reinstalling over an existing install keeps your archive, on any route, as long
as **the bundle identifier and the signing account both stay the same**. iOS
keys the app's storage to that identity. Change the identifier and you have a
second, empty copy of the app rather than an updated one — the old one is still
there with your data in it.

**Xcode route:** rebuild and press **Run** again with the phone attached.

```bash
git pull
bun install
bun run build:mobile
bunx cap sync ios
bun run native:config
```

Then Run. `cap sync` rather than `cap add` — the project already exists.

**Re-signed `.ipa` route:** download the new `ios-unsigned-ipa`, re-sign it the
same way as before, install over the top.

### Refreshing is not updating

On a free Apple Account these are two different operations and it is easy to
conflate them:

- **Refreshing** re-signs the build already on the phone, resetting the 7-day
  clock. AltStore and SideStore do this for you, which is their main reason to
  exist. The app does not change.
- **Updating** puts a newer build on the phone. Nothing refreshes you into a
  new version.

So an app that has stopped launching needs a refresh, not a new download — and
an app that is running an old version needs a new build, which a refresh will
never give you.

### Keeping up with changes

There is no update notification, because there is no server to send one. New
builds appear in the **Actions** tab on every push to `main`; watch the
repository if you want an email when something lands.

---

## Your data

The archive lives on the device, in the app's own storage. There is no account
and no server, so nothing is backed up anywhere and nothing can be restored
from anywhere.

The distinction that matters when moving builds around:

- **Installing over an existing copy keeps everything.** That is an update, and
  it is the normal case — see [Updating an install you already
  have](#updating-an-install-you-already-have).
- **Uninstalling deletes the archive**, and installing again afterwards starts
  empty. Android forces this when you switch between differently-signed builds;
  on iOS, changing the bundle identifier has the same effect by a different
  route, since the new identifier gets its own empty storage.

Before replacing a build you care about, open **Share code**, copy your code,
and keep it somewhere. Merging it back into the fresh install restores what it
carries. It is not a complete backup — imported chat history and viewing
history are too large for a code and are not included — so keep the original
export files if those matter to you.
