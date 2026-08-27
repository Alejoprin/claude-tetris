---
name: clima
description: >-
  Consulta el clima actual y el pronóstico desde la línea de comandos usando
  APIs públicas gratuitas (wttr.in y Open-Meteo, sin API key). Úsala cuando el
  usuario pida "el clima", "el tiempo", "temperatura", "pronóstico", "va a
  llover", o el clima de una ciudad concreta.
---

# Clima

Obtiene datos meteorológicos localmente con `curl`. No requiere API key ni
dependencias. Dos fuentes:

- **wttr.in** — salida legible para humanos, detecta la ubicación por IP.
- **Open-Meteo** — JSON estructurado, útil cuando se necesita procesar los datos.

## Ciudad por defecto

Si el usuario no indica ninguna ciudad, usa **Madrid**. No consultes la
ubicación por IP en ese caso; llama al script con `"Madrid"` explícito.

## Uso

Ejecuta el script incluido:

```bash
bash .claude/skills/clima/scripts/weather.sh              # sin argumento -> Madrid
bash .claude/skills/clima/scripts/weather.sh "Madrid"     # clima de una ciudad
bash .claude/skills/clima/scripts/weather.sh "Madrid" full # resumen extendido de 3 días
bash .claude/skills/clima/scripts/weather.sh "Madrid" json # JSON de Open-Meteo (geocodifica el nombre)
```

## Detalles

- Sin argumento el script usa Madrid. Para consultar la ubicación real por IP,
  pásale `auto` o el nombre de la ciudad explícito.
- El modo `json` primero geocodifica el nombre con la API de geocoding de
  Open-Meteo y luego pide `current` + `daily`.
- Si `curl` falla o no hay red, el script sale con código distinto de cero y un
  mensaje en stderr; repórtalo tal cual al usuario.
- Presenta al usuario la temperatura, la sensación térmica y la probabilidad de
  lluvia; el resto es contexto.
