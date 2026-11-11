#!/usr/bin/env bash
# Build, then zip the project without node_modules, build output, or git history.
set -euo pipefail
cd "$(dirname "$0")/.."

EXPECTED="6dba24b2f9eb77c533021bd364f62b9acad098f21289dcfe773f29e7021f5f2b"
ACTUAL="$(shasum -a 256 fixtures/sample_data.json | cut -d' ' -f1)"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "Fixture changed. Expected $EXPECTED, got $ACTUAL." >&2
  exit 1
fi

npm run build
rm -f ember-recon.zip
zip -rq ember-recon.zip . \
  -x "node_modules/*" "dist/*" ".git/*" "test-results/*" "playwright-report/*" "*.zip" "*.DS_Store" ".superpowers/*"
echo "Wrote ember-recon.zip ($(du -h ember-recon.zip | cut -f1))"
