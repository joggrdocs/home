#!/usr/bin/env bash
#
# Joggr offboarding — bootstrap.
#
# Downloads `offboarding/coding/` from the joggrdocs/home repo to ./joggr-offboarding.
#
# Usage: curl -fsSL https://raw.githubusercontent.com/joggrdocs/home/main/offboarding/coding/install.sh | bash

set -euo pipefail

REPO="joggrdocs/home"
REF="main"
SUBDIR="offboarding/coding"
OUTPUT="${OUTPUT:-./joggr-offboarding}"

if [[ -z "$OUTPUT" || -e "$OUTPUT" ]]; then
  echo "Error: OUTPUT must be a non-existent path (got: '$OUTPUT')." >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

echo "Downloading $REPO/$SUBDIR to $OUTPUT..."
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$TMP"

TOP=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
if [[ -z "$TOP" || ! -d "$TOP/$SUBDIR" ]]; then
  echo "Error: could not find '$SUBDIR/' in the archive." >&2
  exit 1
fi

mv "$TOP/$SUBDIR" "$OUTPUT"
chmod +x "$OUTPUT"/*.mjs 2>/dev/null || true

echo
echo "Done. Next:"
echo "  cd $OUTPUT"
echo "  npm run status     # see what's installed"
echo "  npm run offboard   # interactive cleanup"
