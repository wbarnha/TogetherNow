/**
 * Check the things the App Store and Play Console reject builds for.
 *
 * Store compliance is easy to write down and easy to lose: a regenerated
 * native project silently drops a usage string, a placeholder bundle ID
 * survives to submission, a permission creeps in that needs a declaration
 * form. Everything here is a rule that a reviewer or an automated store check
 * would otherwise catch after the upload.
 *
 * Config-only checks always run. The native checks run against whichever of
 * `ios/` and `android/` have been generated, so this is useful both in the web
 * CI and in the mobile build.
 *
 * A few items are the owner's decision rather than a defect — the bundle ID has
 * to be a domain they control, and nobody but them can pick it. Those are
 * reported as TODO on an ordinary run and become failures with `--release`, so
 * everyday CI stays green while a release that would be rejected does not go
 * out. Everything else fails either way.
 *
 * Usage: node scripts/verify-store-readiness.mjs [--release]
 */

import { readFile, access } from "node:fs/promises";
import path from "node:path";
import plist from "plist";

const ROOT = process.cwd();
const CONFIG = JSON.parse(await readFile(path.join(ROOT, "native/app.json"), "utf8"));

const RELEASE = process.argv.includes("--release");

const failures = [];
const todos = [];
const warnings = [];
const passed = [];

const warn = (rule, detail) => warnings.push({ rule, detail });

function check(rule, ok, detail) {
  if (ok) passed.push(rule);
  else failures.push({ rule, detail });
}

/** A decision only the app's owner can make. Blocks a release, not a commit. */
function checkBeforeRelease(rule, ok, detail) {
  if (ok) passed.push(rule);
  else if (RELEASE) failures.push({ rule, detail });
  else todos.push({ rule, detail });
}

async function exists(target) {
  try {
    await access(path.join(ROOT, target));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------ identity -------------------------------- */

// Apple will not register a bundle ID under someone else's reverse-DNS prefix,
// and on Play the package name is permanent from the first upload — shipping
// the scaffold's placeholder means never being able to correct it.
checkBeforeRelease(
  "Bundle/package ID is one you own",
  !/^app\.lovable\./.test(CONFIG.appId) && !/^com\.example\./.test(CONFIG.appId),
  `appId is still the scaffold placeholder "${CONFIG.appId}". Set it in native/app.json to a reverse-DNS ID on a domain you control, and update iosAppGroup to match.`,
);

check(
  "Bundle/package ID is valid reverse-DNS",
  /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(CONFIG.appId),
  `"${CONFIG.appId}" is not a valid identifier. Both stores require lowercase reverse-DNS with at least two segments and no hyphens.`,
);

check(
  "iOS App Group matches the bundle ID",
  CONFIG.iosAppGroup === `group.${CONFIG.appId}`,
  `iosAppGroup is "${CONFIG.iosAppGroup}" but the bundle ID is "${CONFIG.appId}". The home-screen widget reads the mood snapshot through this group; a mismatch means it silently shows nothing.`,
);

check(
  "Marketing version is set",
  /^\d+\.\d+(\.\d+)?$/.test(CONFIG.version),
  `version "${CONFIG.version}" must look like 1.0.0.`,
);

check(
  "Build number is a positive integer",
  Number.isInteger(CONFIG.buildNumber) && CONFIG.buildNumber > 0,
  "buildNumber must increase with every upload to either store.",
);

/* ------------------------------- URLs ----------------------------------- */

for (const [field, label] of [
  ["privacyPolicyUrl", "Privacy policy URL"],
  ["supportUrl", "Support URL"],
]) {
  const value = CONFIG[field];
  let ok = false;
  try {
    ok = new URL(value).protocol === "https:";
  } catch {
    ok = false;
  }
  // Both stores require a reachable privacy policy for every app, and Apple
  // requires a support URL on the listing.
  check(`${label} is an https URL`, ok, `${field} is "${value}".`);
}

/* --------------------------- privacy claims ----------------------------- */

// The listing and the policy both say the archive stays on the device. If the
// app ever gains a backend, these declarations have to change with it.
const serverCalls = await readFile(path.join(ROOT, "src/lib/security.ts"), "utf8");
check(
  "Content-Security-Policy still limits outbound connections",
  /connect-src 'self' \$\{GEOCODER\}/.test(serverCalls),
  "connect-src has been widened. Anything the app can now reach must be reflected in the privacy policy and in both stores' data disclosures.",
);

/* --------------------------------- iOS ---------------------------------- */

if (await exists("ios/App/App/Info.plist")) {
  const info = plist.parse(await readFile(path.join(ROOT, "ios/App/App/Info.plist"), "utf8"));

  check(
    "iOS display name is set",
    typeof info.CFBundleDisplayName === "string" &&
      info.CFBundleDisplayName.length > 0 &&
      info.CFBundleDisplayName !== "My App",
    `CFBundleDisplayName is "${info.CFBundleDisplayName}" — the template placeholder would ship as the home-screen name.`,
  );

  // Requesting location without this key terminates the app immediately.
  check(
    "iOS location usage description is present",
    typeof info.NSLocationWhenInUseUsageDescription === "string" &&
      info.NSLocationWhenInUseUsageDescription.length > 30,
    "NSLocationWhenInUseUsageDescription is missing or too vague. iOS kills the app when the Ideas screen asks for a location, and App Review rejects generic wording.",
  );

  check(
    "iOS export compliance is declared",
    info.ITSAppUsesNonExemptEncryption === false,
    "ITSAppUsesNonExemptEncryption is unset, so App Store Connect asks the export-compliance question by hand on every single upload.",
  );

  const schemes = (info.CFBundleURLTypes ?? []).flatMap((t) => t.CFBundleURLSchemes ?? []);
  check(
    "iOS registers the widget deep-link scheme",
    schemes.includes(CONFIG.urlScheme),
    `No "${CONFIG.urlScheme}" URL scheme, so tapping the home-screen widget does nothing.`,
  );

  // App Transport Security exceptions draw review questions and need
  // justification; this app talks to nothing that needs one.
  const ats = info.NSAppTransportSecurity ?? {};
  check(
    "iOS has no App Transport Security exceptions",
    ats.NSAllowsArbitraryLoads !== true,
    "NSAllowsArbitraryLoads is enabled. Every request this app makes is https, so this only invites review questions.",
  );

  check(
    "iOS device capabilities are current",
    !(info.UIRequiredDeviceCapabilities ?? []).includes("armv7"),
    "UIRequiredDeviceCapabilities still lists armv7, retired long before this app's minimum of iOS 15.",
  );

  const manifestOnDisk = await exists("ios/App/App/PrivacyInfo.xcprivacy");
  check(
    "iOS privacy manifest is present",
    manifestOnDisk,
    "PrivacyInfo.xcprivacy is missing. Apple has required it since May 2024 and App Store Connect rejects builds without one.",
  );

  if (await exists("ios/App/App.xcodeproj/project.pbxproj")) {
    const pbx = await readFile(path.join(ROOT, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    // On disk is not enough — it has to be a resource of the app target or it
    // never reaches the bundle Apple inspects.
    check(
      "iOS privacy manifest is bundled with the app target",
      /PrivacyInfo\.xcprivacy in Resources/.test(pbx),
      "PrivacyInfo.xcprivacy exists but is not in the target's Resources build phase, so it will not be in the uploaded build.",
    );
  }

  if (manifestOnDisk) {
    const manifest = plist.parse(
      await readFile(path.join(ROOT, "ios/App/App/PrivacyInfo.xcprivacy"), "utf8"),
    );
    const reasons = (manifest.NSPrivacyAccessedAPITypes ?? []).map(
      (e) => e.NSPrivacyAccessedAPIType,
    );
    // @capacitor/preferences writes the widget snapshot through UserDefaults
    // and ships no manifest of its own.
    check(
      "iOS privacy manifest declares the UserDefaults reason",
      reasons.includes("NSPrivacyAccessedAPICategoryUserDefaults"),
      "The app writes the widget snapshot through UserDefaults, which is a required-reason API.",
    );
    check(
      "iOS privacy manifest declares no tracking",
      manifest.NSPrivacyTracking === false,
      "NSPrivacyTracking must be false unless the app really does track across other companies' apps.",
    );
  }
} else {
  warn("iOS project", "Not generated — run `bunx cap add ios` to check the iOS rules.");
}

/* ------------------------------- Android -------------------------------- */

if (await exists("android/app/src/main/AndroidManifest.xml")) {
  const manifest = await readFile(
    path.join(ROOT, "android/app/src/main/AndroidManifest.xml"),
    "utf8",
  );

  for (const permission of CONFIG.permissions.androidUsesPermissions) {
    check(
      `Android declares ${permission.name.split(".").pop()}`,
      manifest.includes(permission.name),
      `${permission.name} is missing, so the feature it backs cannot work on Android.`,
    );
  }

  // Auto Backup would copy the whole archive to the user's Google Drive, which
  // contradicts both the listing copy and the Data Safety answers.
  check(
    "Android excludes the archive from cloud backup",
    /android:allowBackup="false"/.test(manifest),
    "android:allowBackup is not false. Auto Backup would upload plans, moods, money and imported message history to Google Drive, which the app tells people does not happen.",
  );

  check(
    "Android registers the widget deep-link scheme",
    manifest.includes(`android:scheme="${CONFIG.urlScheme}"`),
    `No intent filter for "${CONFIG.urlScheme}", so tapping the home-screen widget does nothing.`,
  );

  // Each of these triggers a Play declaration form, an appeal, or an outright
  // policy block. None of them is needed by anything this app does.
  const restricted = [
    [
      "android.permission.SCHEDULE_EXACT_ALARM",
      "needs an exemption; reminders do not have to be exact",
    ],
    ["android.permission.USE_EXACT_ALARM", "restricted to alarm and calendar apps"],
    ["android.permission.QUERY_ALL_PACKAGES", "needs a declaration form and is usually rejected"],
    ["android.permission.MANAGE_EXTERNAL_STORAGE", "needs a declaration form"],
    ["android.permission.READ_SMS", "restricted to default SMS handlers"],
    [
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "needs prominent disclosure and a video review",
    ],
    ["android.permission.ACCESS_FINE_LOCATION", "coarse is enough for a distance filter"],
    ["android.permission.READ_CONTACTS", "nothing in this app reads contacts"],
  ];
  // A permission listed in native/app.json with a justification is a decision
  // someone made on purpose; these rules exist to catch the ones that arrive by
  // accident, through a plugin or a copied snippet.
  const declared = new Set(CONFIG.permissions.androidUsesPermissions.map((p) => p.name));
  for (const [permission, why] of restricted) {
    if (declared.has(permission)) continue;
    check(
      `Android does not request ${permission.split(".").pop()}`,
      !manifest.includes(permission),
      `${permission} is in the manifest but not in native/app.json — ${why}. Remove it, or declare it there with a justification if you really need it.`,
    );
  }

  if (await exists("android/variables.gradle")) {
    const vars = await readFile(path.join(ROOT, "android/variables.gradle"), "utf8");
    const target = Number(/targetSdkVersion\s*=\s*(\d+)/.exec(vars)?.[1] ?? 0);
    // Play requires new apps and updates to target an API level within about a
    // year of the latest release.
    check(
      "Android targets a recent API level",
      target >= 35,
      `targetSdkVersion is ${target}. Play rejects uploads below its rolling minimum (35 at the time of writing).`,
    );
  }

  if (await exists("android/app/build.gradle")) {
    const gradle = await readFile(path.join(ROOT, "android/app/build.gradle"), "utf8");
    check(
      "Android version matches native/app.json",
      gradle.includes(`versionName "${CONFIG.version}"`) &&
        gradle.includes(`versionCode ${CONFIG.buildNumber}`),
      "The Gradle version does not match native/app.json — run `node scripts/apply-native-config.mjs`.",
    );
  }
} else {
  warn("Android project", "Not generated — run `bunx cap add android` to check the Play rules.");
}

/* -------------------------------- report -------------------------------- */

for (const rule of passed) console.log(`  ok    ${rule}`);
for (const { rule, detail } of warnings) console.log(`  skip  ${rule}: ${detail}`);

for (const { rule, detail } of todos) {
  console.log(`  TODO  ${rule}`);
  console.log(`        ${detail}`);
}

if (failures.length > 0) {
  console.log("");
  for (const { rule, detail } of failures) {
    console.log(`  FAIL  ${rule}`);
    console.log(`        ${detail}`);
  }
  console.log(
    `\n${failures.length} store requirement${failures.length === 1 ? "" : "s"} not met. See STORE.md.`,
  );
  process.exit(1);
}

console.log(`\n${passed.length} store checks passed.`);
if (todos.length > 0) {
  console.log(
    `${todos.length} item${todos.length === 1 ? "" : "s"} still to decide before publishing — ` +
      "re-run with --release to make them blocking. See STORE.md.",
  );
}
