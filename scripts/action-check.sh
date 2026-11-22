#!/usr/bin/env bash
set -u

if [[ -z "${GITHUB_ACTION_PATH:-}" ]]; then
  echo "GITHUB_ACTION_PATH is not set." >&2
  exit 1
fi

config="${SPECVOW_CONFIG:-}"
spec="${SPECVOW_SPEC:-}"
sdk="${SPECVOW_SDK:-}"
client="${SPECVOW_CLIENT:-}"
lock="${SPECVOW_LOCK:-}"
format="${SPECVOW_FORMAT:-markdown}"

if [[ -z "$config" && ( -z "$spec" || -z "$sdk" ) ]]; then
  echo "Pass config, or both spec and sdk." >&2
  exit 1
fi

args=(check --format "$format")
if [[ -n "$config" ]]; then args+=(--config "$config"); fi
if [[ -n "$spec" ]]; then args+=(--spec "$spec"); fi
if [[ -n "$sdk" ]]; then args+=(--sdk "$sdk"); fi
if [[ -n "$client" ]]; then args+=(--client "$client"); fi
if [[ -n "$lock" ]]; then args+=(--lock "$lock"); fi

set +e
output="$(node "$GITHUB_ACTION_PATH/dist/cli/cli.js" "${args[@]}")"
code=$?
set -e

printf '%s\n' "$output"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf '%s\n' "$output" >> "$GITHUB_STEP_SUMMARY"
fi
printf '%s' "$output" | node "$GITHUB_ACTION_PATH/scripts/pr-comment.mjs" || true
exit "$code"
