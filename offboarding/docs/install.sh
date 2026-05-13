#!/usr/bin/env bash
#
# Joggr docs offboarding — bootstrap.
#
# Downloads `offboarding/docs/` from the joggrdocs/home repo to the
# current working directory so customers can run the scripts locally
# without cloning the whole repo.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/joggrdocs/home/main/offboarding/docs/install.sh | bash
#
# Or download first, then run:
#   curl -fsSL .../install.sh -o install.sh
#   bash install.sh
#
# Environment variables:
#   OUTPUT   Destination directory (default: ./joggr-docs-offboarding)

set -euo pipefail

REPO="joggrdocs/home"
REF="main"
# Path inside the repo archive to the directory we want.
SUBDIR="offboarding/docs"
# `${OUTPUT-default}` (no colon) so that an explicit empty OUTPUT="" hits the
# validation case below instead of silently falling back to the default.
OUTPUT="${OUTPUT-./joggr-docs-offboarding}"

# Refuse an output path that would clobber the current directory or its parent.
case "$OUTPUT" in
  "." | "./" | ".." | "../" | "")
    echo "Error: OUTPUT must be a real subdirectory path (got: '$OUTPUT')." >&2
    exit 1
    ;;
esac

if [[ -e "$OUTPUT" ]]; then
  echo "Error: $OUTPUT already exists. Remove it or set OUTPUT=./other-path." >&2
  exit 1
fi

for cmd in curl tar mktemp find mv chmod dirname head; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: $cmd is required but not installed." >&2
    exit 1
  fi
done

# Make sure the parent of $OUTPUT exists (mkdir -p is a no-op if it does).
OUTPUT_PARENT=$(dirname "$OUTPUT")
if [[ -n "$OUTPUT_PARENT" && ! -d "$OUTPUT_PARENT" ]]; then
  mkdir -p "$OUTPUT_PARENT"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

echo "Downloading $REPO/$SUBDIR to $OUTPUT..."

curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" \
  | tar -xz -C "$TMP"

TOP=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
if [[ -z "$TOP" || ! -d "$TOP/$SUBDIR" ]]; then
  echo "Error: could not find '$SUBDIR/' in the downloaded archive." >&2
  exit 1
fi

mv "$TOP/$SUBDIR" "$OUTPUT"

# The .mjs scripts have shebangs; make them runnable directly.
chmod +x "$OUTPUT"/*.mjs "$OUTPUT/install.sh" 2>/dev/null || true

echo
echo "Done. Next:"
echo "  cd $OUTPUT"
echo "  node offboard.mjs --dry-run   # preview what would change"
echo "  node offboard.mjs             # interactive strip (per-file backups)"
echo "  node restore.mjs              # undo a previous offboarding"
