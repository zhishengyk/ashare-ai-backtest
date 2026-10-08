#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist/server dist/.openai
node scripts/bundle.mjs
cp .openai/hosting.json dist/.openai/hosting.json
cp -R drizzle dist/.openai/drizzle
