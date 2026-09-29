#!/usr/bin/env bash
# Rebuild the advert: voiceover -> timeline -> record -> mux. See README.md for one-time setup.
set -euo pipefail
cd "$(dirname "$0")"
python3 synth.py
node record.mjs
