#!/usr/bin/env bash
# ABOUTME: Runs opencode fork CI in a scrubbed environment using the repo-local turbo binary.
# ABOUTME: Uses temporary XDG directories and checks for the ignored Birdhouse plugin source before typecheck.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
turbo_bin="$repo_root/node_modules/.bin/turbo"
mode="${1:-all}"

if [[ ! -x "$turbo_bin" ]]; then
  printf 'Missing local turbo binary at %s\nRun bun install from the repo root first.\n' "$turbo_bin" >&2
  exit 1
fi

if grep -q 'import("\./birdhouse")' "$repo_root/packages/opencode/src/plugin/index.ts" && [[ ! -f "$repo_root/packages/opencode/src/plugin/birdhouse.ts" ]]; then
  printf 'Missing ignored Birdhouse plugin source at packages/opencode/src/plugin/birdhouse.ts\n' >&2
  printf 'Copy it in before running clean-env CI.\n' >&2
  exit 1
fi

tmp_home="$(mktemp -d)"
tmp_cfg="$(mktemp -d)"
tmp_data="$(mktemp -d)"
tmp_state="$(mktemp -d)"
tmp_cache="$(mktemp -d)"

run_turbo() {
  env -i \
    PATH="$PATH" \
    HOME="$tmp_home" \
    USER="test-user" \
    SHELL="${SHELL:-/bin/bash}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    OPENCODE_TEST_HOME="$tmp_home" \
    XDG_CONFIG_HOME="$tmp_cfg" \
    XDG_DATA_HOME="$tmp_data" \
    XDG_STATE_HOME="$tmp_state" \
    XDG_CACHE_HOME="$tmp_cache" \
    "$turbo_bin" "$@"
}

cd "$repo_root"

case "$mode" in
  typecheck)
    run_turbo typecheck
    ;;
  test)
    run_turbo test
    ;;
  all)
    run_turbo typecheck
    run_turbo test
    ;;
  *)
    printf 'Usage: %s [typecheck|test|all]\n' "${BASH_SOURCE[0]}" >&2
    exit 1
    ;;
esac
