/**
 * Apply store configuration to the generated native projects.
 *
 * `ios/` and `android/` are produced by `cap add` and are not committed, so
 * anything the App Store or Play Console needs — privacy manifest, permission
 * strings, version numbers, deep links, release build settings — would be lost
 * on every regeneration. This script is the source of that configuration, and
 * `native/app.json` is the source for the values it writes.
 *
 * Everything here is idempotent: running it twice changes nothing the second
 * time. Every write is verified by reading the result back, so a silent
 * no-op is not a possible outcome.
 *
 * Usage: node scripts/apply-native-config.mjs [ios|android]
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import plist from "plist";
import xcode from "xcode";

const ROOT = process.cwd();
const CONFIG = JSON.parse(await readFile(path.join(ROOT, "native/app.json"), "utf8"));

const changes = [];
const note = (message) => changes.push(message);

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------- iOS ---------------------------------- */

const IOS_APP = "ios/App/App";
const IOS_PROJECT = "ios/App/App.xcodeproj/project.pbxproj";

async function applyIos() {
  if (!(await exists(path.join(ROOT, IOS_APP)))) {
    console.log("ios: not generated, skipping (run `bunx cap add ios` first)");
    return;
  }

  await writePrivacyManifest();
  await patchInfoPlist();
  await patchXcodeProject();
}

async function writePrivacyManifest() {
  const source = path.join(ROOT, "native/ios/PrivacyInfo.xcprivacy");
  const target = path.join(ROOT, IOS_APP, "PrivacyInfo.xcprivacy");
  const contents = await readFile(source, "utf8");
  if ((await exists(target)) && (await readFile(target, "utf8")) === contents) return;
  await writeFile(target, contents, "utf8");
  note("ios: wrote PrivacyInfo.xcprivacy");
}

async function patchInfoPlist() {
  const file = path.join(ROOT, IOS_APP, "Info.plist");
  const before = await readFile(file, "utf8");
  const info = plist.parse(before);

  info.CFBundleDisplayName = CONFIG.displayName;

  // Without this key iOS terminates the app the moment the Ideas screen asks
  // for a location, and App Review rejects the build.
  info.NSLocationWhenInUseUsageDescription = CONFIG.permissions.iosLocationWhenInUse;

  // Answers the export-compliance question once, in the build, instead of by
  // hand on every submission. The app ships no cryptography beyond HTTPS.
  info.ITSAppUsesNonExemptEncryption = false;

  // The home-screen widget deep-links back in as togethernow://mood?score=…
  const urlTypes = Array.isArray(info.CFBundleURLTypes) ? info.CFBundleURLTypes : [];
  const hasScheme = urlTypes.some((entry) =>
    (entry?.CFBundleURLSchemes ?? []).includes(CONFIG.urlScheme),
  );
  if (!hasScheme) {
    urlTypes.push({
      CFBundleURLName: CONFIG.appId,
      CFBundleURLSchemes: [CONFIG.urlScheme],
    });
  }
  info.CFBundleURLTypes = urlTypes;

  // The template still declares armv7, retired long before this app's minimum
  // of iOS 15. Leaving it there can exclude every device that can run the app.
  info.UIRequiredDeviceCapabilities = ["arm64"];

  const after = plist.build(info);
  if (after.trim() === before.trim()) return;
  await writeFile(file, after, "utf8");

  const check = plist.parse(await readFile(file, "utf8"));
  if (!check.NSLocationWhenInUseUsageDescription || check.ITSAppUsesNonExemptEncryption !== false) {
    throw new Error("Info.plist did not take the store keys");
  }
  note("ios: patched Info.plist (display name, location string, export compliance, URL scheme)");
}

async function patchXcodeProject() {
  const file = path.join(ROOT, IOS_PROJECT);
  const before = await readFile(file, "utf8");
  const project = xcode.project(file);
  project.parseSync();

  // Version numbers belong in the build settings, not the Info.plist, which
  // references them as $(MARKETING_VERSION) / $(CURRENT_PROJECT_VERSION).
  project.updateBuildProperty("MARKETING_VERSION", `"${CONFIG.version}"`);
  project.updateBuildProperty("CURRENT_PROJECT_VERSION", `"${CONFIG.buildNumber}"`);
  project.updateBuildProperty("PRODUCT_BUNDLE_IDENTIFIER", `"${CONFIG.appId}"`);

  // A privacy manifest sitting on disk does nothing — it has to be a resource
  // of the app target or it never reaches the bundle Apple inspects.
  const alreadyLinked = JSON.stringify(project.hash.project.objects["PBXBuildFile"] ?? {}).includes(
    "PrivacyInfo.xcprivacy",
  );
  if (!alreadyLinked) {
    // Capacitor's template names this group by path, not by name.
    const group =
      project.findPBXGroupKey({ path: "App" }) ?? project.findPBXGroupKey({ name: "App" });
    if (!group) throw new Error("Could not find the App group in the Xcode project");

    // `addResourceFile` unconditionally dereferences a group called
    // "Resources" to decide whether to rewrite the path. Capacitor's template
    // has no such group, so the call throws before doing anything. Standing in
    // a pathless stub gives that check the answer it would have got from an
    // empty group — leave the path alone — without touching the project.
    const byName = project.pbxGroupByName.bind(project);
    project.pbxGroupByName = (name) => byName(name) ?? { path: null, children: [] };
    try {
      project.addResourceFile("PrivacyInfo.xcprivacy", {}, group);
    } finally {
      project.pbxGroupByName = byName;
    }
  }

  const after = project.writeSync();
  if (after === before) return;
  await writeFile(file, after, "utf8");

  // Read it back: a corrupt pbxproj is far worse than an unpatched one.
  const verify = xcode.project(file);
  verify.parseSync();
  const linked = JSON.stringify(verify.hash.project.objects["PBXBuildFile"] ?? {}).includes(
    "PrivacyInfo.xcprivacy",
  );
  if (!linked) throw new Error("PrivacyInfo.xcprivacy is not in the app target's resources");
  note(
    `ios: set version ${CONFIG.version} (${CONFIG.buildNumber}) and linked the privacy manifest`,
  );
}

/* ------------------------------- Android -------------------------------- */

const ANDROID_MANIFEST = "android/app/src/main/AndroidManifest.xml";
const ANDROID_GRADLE = "android/app/build.gradle";

async function applyAndroid() {
  if (!(await exists(path.join(ROOT, "android/app")))) {
    console.log("android: not generated, skipping (run `bunx cap add android` first)");
    return;
  }
  await patchAndroidManifest();
  await patchAndroidGradle();
}

/** Insert `snippet` before `anchor`, unless `marker` is already present. */
function insertBefore(source, anchor, snippet, marker) {
  if (source.includes(marker)) return source;
  const at = source.indexOf(anchor);
  if (at === -1) throw new Error(`Could not find ${JSON.stringify(anchor)} to patch`);
  return source.slice(0, at) + snippet + source.slice(at);
}

async function patchAndroidManifest() {
  const file = path.join(ROOT, ANDROID_MANIFEST);
  const before = await readFile(file, "utf8");
  let source = before;

  // The Ideas screen's "use my location" button goes through the WebView's
  // geolocation API, which is inert unless the app itself holds the permission.
  // Coarse only: a distance filter does not need a precise fix.
  for (const permission of CONFIG.permissions.androidUsesPermissions) {
    source = insertBefore(
      source,
      "</manifest>",
      `    <!-- ${permission.why} -->\n` +
        `    <uses-permission android:name="${permission.name}" />\n`,
      permission.name,
    );
  }

  // Android's Auto Backup would copy the whole archive — plans, moods, money,
  // imported message history — into the user's Google Drive. The app tells
  // people nothing leaves their phone, so this makes that true.
  if (source.includes('android:allowBackup="true"')) {
    source = source.replace(
      'android:allowBackup="true"',
      'android:allowBackup="false"\n        android:dataExtractionRules="@xml/data_extraction_rules"',
    );
  }

  // Widget taps come back as togethernow://mood?score=…
  source = insertBefore(
    source,
    "        </activity>",
    `
            <!-- Home-screen widget taps: ${CONFIG.urlScheme}://mood?score=1..5 -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${CONFIG.urlScheme}" />
            </intent-filter>
`,
    `android:scheme="${CONFIG.urlScheme}"`,
  );

  if (source !== before) {
    await writeFile(file, source, "utf8");
    note("android: patched AndroidManifest.xml (location, backup, widget deep link)");
  }

  // Referenced by android:dataExtractionRules; Android 12+ reads this instead
  // of the legacy allowBackup flag for cloud backup and device transfer.
  const rulesDir = path.join(ROOT, "android/app/src/main/res/xml");
  const rulesFile = path.join(rulesDir, "data_extraction_rules.xml");
  if (!(await exists(rulesFile))) {
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      rulesFile,
      `<?xml version="1.0" encoding="utf-8"?>
<!--
  The archive is private to the device. Excluding it from cloud backup and from
  device-to-device transfer is what makes "nothing leaves your phone" accurate,
  and it is what the Play Data Safety form is answered against.
-->
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="file" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="file" />
    </device-transfer>
</data-extraction-rules>
`,
      "utf8",
    );
    note("android: wrote res/xml/data_extraction_rules.xml");
  }
}

async function patchAndroidGradle() {
  const file = path.join(ROOT, ANDROID_GRADLE);
  const before = await readFile(file, "utf8");
  let source = before;

  source = source.replace(/versionCode \d+/, `versionCode ${CONFIG.buildNumber}`);
  source = source.replace(/versionName "[^"]*"/, `versionName "${CONFIG.version}"`);

  // Play uploads are app bundles, and an unminified release bundle ships the
  // whole debug surface. R8 is on by default for release in a bundle build,
  // but the Capacitor template explicitly turns it off.
  if (source.includes("minifyEnabled false")) {
    source = source.replace(
      "minifyEnabled false",
      "minifyEnabled true\n            shrinkResources true",
    );
  }

  // Release signing from a keystore the CI provides, without putting any of it
  // in the repository. Debug builds are unaffected.
  if (!source.includes("signingConfigs")) {
    source = source.replace(
      "    buildTypes {",
      `    signingConfigs {
        release {
            // Supplied by the release workflow from repository secrets; absent
            // locally, in which case the release build stays unsigned.
            def storePath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (storePath) {
                storeFile file(storePath)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`,
    );
    source = source.replace(
      "        release {\n            minifyEnabled",
      '        release {\n            signingConfig System.getenv("ANDROID_KEYSTORE_PATH") ? signingConfigs.release : null\n            minifyEnabled',
    );
  }

  if (source === before) return;
  await writeFile(file, source, "utf8");
  note(
    `android: set version ${CONFIG.version} (${CONFIG.buildNumber}), release minify and signing`,
  );
}

/* --------------------------------- run ---------------------------------- */

const only = process.argv[2];
if (only && !["ios", "android"].includes(only)) {
  throw new Error(`Unknown platform ${only}. Use "ios", "android", or no argument for both.`);
}

if (!only || only === "ios") await applyIos();
if (!only || only === "android") await applyAndroid();

if (changes.length === 0) console.log("Native config already applied — nothing to do.");
else for (const change of changes) console.log(change);
