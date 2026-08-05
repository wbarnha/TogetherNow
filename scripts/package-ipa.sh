#!/usr/bin/env bash
#
# Wrap a built .app into an unsigned .ipa that a re-signing tool will accept.
#
# An .ipa is just a zip with one required shape: a top-level `Payload`
# directory containing the .app. Everything that goes wrong here goes wrong
# quietly — a zip of the parent directory, an extended attribute macOS added,
# a binary that lost its execute bit — and the failure surfaces much later as
# an opaque error from Sideloadly or Xcode rather than here.
#
# The output is deliberately unsigned. Signing needs a certificate belonging to
# whoever is installing it, which CI does not and should not have; the tools in
# SIDELOAD.md re-sign it on the user's own machine with their own Apple Account.
#
#   usage: scripts/package-ipa.sh <path-to-App.app> <output.ipa>

set -euo pipefail

APP=${1:-}
OUT=${2:-}

if [ -z "$APP" ] || [ -z "$OUT" ]; then
  echo "usage: $0 <path-to-App.app> <output.ipa>" >&2
  exit 2
fi

if [ ! -d "$APP" ]; then
  echo "error: no app bundle at $APP" >&2
  echo "hint: a device build lands in <derivedData>/Build/Products/<Config>-iphoneos/" >&2
  exit 1
fi

name=$(basename "$APP" .app)
binary="$APP/$name"

if [ ! -f "$binary" ]; then
  echo "error: $APP has no executable named '$name'" >&2
  exit 1
fi

# A simulator build is also a .app and packages happily into an .ipa that can
# never be installed on a phone. Catch it here rather than at the point where
# someone is standing in front of their device wondering why.
if command -v lipo >/dev/null 2>&1; then
  archs=$(lipo -archs "$binary" 2>/dev/null || echo "")
  case "$archs" in
    *arm64*) ;;
    *)
      echo "error: $binary is built for '$archs', not arm64." >&2
      echo "hint: this looks like a simulator build. Use -destination 'generic/platform=iOS'." >&2
      exit 1
      ;;
  esac
fi

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/Payload"
cp -R "$APP" "$stage/Payload/"

staged="$stage/Payload/$(basename "$APP")"

# Quarantine flags and resource forks that macOS attaches survive into the zip
# and make a later `codesign` fail with an unhelpful message.
if command -v xattr >/dev/null 2>&1; then
  xattr -cr "$staged" 2>/dev/null || true
fi
find "$stage" -name '.DS_Store' -delete 2>/dev/null || true

# `cp -R` across filesystems can drop the execute bit. Without it the app
# installs and then refuses to launch.
chmod +x "$staged/$name"
find "$staged" \( -name '*.appex' -o -name '*.framework' \) -print0 2>/dev/null |
  while IFS= read -r -d '' bundle; do
    inner=$(basename "$bundle")
    inner=${inner%.*}
    [ -f "$bundle/$inner" ] && chmod +x "$bundle/$inner"
  done || true

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
abs_out=$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")

# `Payload` must be the first entry in the archive, so zip from inside the
# staging directory rather than naming a path into it. -y keeps symlinks as
# symlinks; frameworks rely on them.
(cd "$stage" && zip -qry "$abs_out" Payload -x '*.DS_Store')

# Prove the shape rather than trusting it: this is the check that would have
# caught every mistake this script exists to avoid.
first=$(unzip -Z1 "$abs_out" | head -1)
case "$first" in
  Payload/*) ;;
  *)
    echo "error: first archive entry is '$first', expected Payload/..." >&2
    exit 1
    ;;
esac

size=$(wc -c <"$abs_out" | tr -d ' ')
echo "Wrote $abs_out ($((size / 1024)) KB, unsigned)"
echo "Sign it on the machine that will install it — see SIDELOAD.md."
