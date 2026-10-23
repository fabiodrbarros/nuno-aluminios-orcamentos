#!/bin/sh
# Prepara DATA_DIR e larga os privilégios para o utilizador "node".
set -e
DATA_DIR="${DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups "$@"
  fi
  echo "[entrypoint] setpriv indisponível: a continuar como root" >&2
fi
exec "$@"
