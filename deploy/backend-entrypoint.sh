#!/bin/sh
set -eu

python manage.py migrate --noinput
python manage.py cleanup_stale_peers --max-age-hours 24

exec uvicorn cloudrop.asgi:application \
  --host 0.0.0.0 \
  --port 8000 \
  --proxy-headers \
  --forwarded-allow-ips="*" \
  --workers "${UVICORN_WORKERS:-2}"

