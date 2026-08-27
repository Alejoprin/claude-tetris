#!/usr/bin/env bash
# Consulta el clima desde la terminal. Sin API key.
# Uso:
#   weather.sh                 -> clima actual por IP (wttr.in)
#   weather.sh "Ciudad"        -> clima actual de la ciudad
#   weather.sh "Ciudad" full   -> resumen extendido (wttr.in, 3 dias)
#   weather.sh "Ciudad" json   -> JSON de Open-Meteo (current + daily)
set -euo pipefail

# Ciudad por defecto si no se pasa argumento. "auto" = ubicacion por IP (wttr.in).
LOCATION="${1:-Madrid}"
[ "$LOCATION" = "auto" ] && LOCATION=""
MODE="${2:-current}"
CURL=(curl -fsS --max-time 15)

die() { echo "clima: $*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || die "curl no esta instalado"

case "$MODE" in
  current)
    "${CURL[@]}" "https://wttr.in/${LOCATION// /+}?format=%l:+%c+%t+(sensacion+%f),+humedad+%h,+lluvia+%p,+viento+%w&m" \
      || die "no se pudo consultar wttr.in"
    echo
    ;;
  full)
    "${CURL[@]}" "https://wttr.in/${LOCATION// /+}?mnT2&lang=es" \
      || die "no se pudo consultar wttr.in"
    ;;
  json)
    [ -n "$LOCATION" ] || die "el modo json necesita un nombre de ciudad"
    geo=$("${CURL[@]}" "https://geocoding-api.open-meteo.com/v1/search?name=${LOCATION// /+}&count=1&language=es&format=json") \
      || die "fallo la geocodificacion"
    lat=$(printf '%s' "$geo" | grep -o '"latitude":[-0-9.]*' | head -1 | cut -d: -f2)
    lon=$(printf '%s' "$geo" | grep -o '"longitude":[-0-9.]*' | head -1 | cut -d: -f2)
    [ -n "${lat:-}" ] && [ -n "${lon:-}" ] || die "ciudad no encontrada: $LOCATION"
    "${CURL[@]}" "https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3" \
      || die "no se pudo consultar Open-Meteo"
    echo
    ;;
  *)
    die "modo desconocido: $MODE (usa current | full | json)"
    ;;
esac
