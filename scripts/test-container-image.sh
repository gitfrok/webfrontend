#!/usr/bin/env bash
# T-0021 AC2a/AC3: build and assert the ADR-0035 SSR image posture.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$root/Dockerfile" ] || { echo "container-image: FAIL — missing Dockerfile" >&2; exit 1; }

runtime=${CONTAINER_RUNTIME:-}
if [ -z "$runtime" ]; then
  if command -v docker >/dev/null; then runtime=docker
  elif command -v podman >/dev/null; then runtime=podman
  else echo "container-image: neither docker nor podman is available" >&2; exit 2
  fi
fi

image=localhost/gitfrok-webfrontend:test
"$runtime" build --file "$root/Dockerfile" --tag "$image" "$root"

user=$("$runtime" image inspect "$image" --format '{{.Config.User}}')
[ "$user" = "node" ] || { echo "container-image: FAIL — user is '$user'" >&2; exit 1; }

if "$runtime" run --rm "$image" /bin/sh >/dev/null 2>&1; then
  echo "container-image: FAIL — image unexpectedly contains /bin/sh" >&2
  exit 1
fi

cid=$("$runtime" run --detach --read-only --tmpfs /tmp "$image")
cleanup() { "$runtime" rm --force "$cid" >/dev/null 2>&1 || true; }
trap cleanup EXIT
sleep 1
running=$("$runtime" inspect "$cid" --format '{{.State.Running}}')
[ "$running" = "true" ] || { "$runtime" logs "$cid" >&2; exit 1; }
echo "container-image: OK"
