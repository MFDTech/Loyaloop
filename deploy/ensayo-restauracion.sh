#!/bin/sh
# Ensayo de restauración: restaura un respaldo en una base aparte («ensayo»),
# cuenta lo que trae y la borra. No toca la base real de LoyaLoop.
#
#   cd ~/loyaloop && sh deploy/ensayo-restauracion.sh                 # el respaldo más reciente
#   cd ~/loyaloop && sh deploy/ensayo-restauracion.sh backups/X.dump  # uno en particular
set -eu
cd "$(dirname "$0")/.."

FILE="${1:-$(ls -1t backups/*.dump 2>/dev/null | head -n 1)}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "No hay respaldos en backups/. Revisa: docker compose logs backup" >&2
  exit 1
fi
echo "Respaldo: $FILE ($(du -h "$FILE" | cut -f1), $(date -r "$FILE" '+%Y-%m-%d %H:%M'))"

db() { docker compose exec -T db "$@"; }
db dropdb -U loyaloop --if-exists ensayo
db createdb -U loyaloop ensayo
trap 'db dropdb -U loyaloop --if-exists ensayo >/dev/null 2>&1 || true' EXIT
db pg_restore -U loyaloop -d ensayo --no-owner --exit-on-error < "$FILE"
db psql -U loyaloop -d ensayo -v ON_ERROR_STOP=1 -c "
  select (select count(*) from businesses) as negocios,
         (select count(*) from customers) as clientes,
         (select count(*) from transactions) as movimientos,
         (select max(at) from transactions) as ultimo_movimiento;"
echo "Ensayo correcto: este respaldo se puede restaurar."
