#!/usr/bin/env bash
# Start a throwaway Django server for Playwright e2e on 127.0.0.1:5190
# (override with E2E_PORT if 5190 is busy).
# Uses its own SQLite file (e2e.sqlite3) so the dev database is never touched.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f ./.env ]; then
  set -a; . ./.env; set +a
fi
export DEBUG=1
export DEMO_PASSWORD=demo-password-123
# settings.py already reads SQLITE_PATH for the SQLite file; point it at the e2e DB.
export SQLITE_PATH="$PWD/e2e.sqlite3"
unset MYSQL_HOST

PYTHON="${PYTHON:-.venv/bin/python}"
rm -f e2e.sqlite3
"$PYTHON" manage.py migrate --noinput
"$PYTHON" manage.py seed_demo
exec "$PYTHON" manage.py runserver "127.0.0.1:${E2E_PORT:-5190}" --noreload
