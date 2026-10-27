# Analíticas de bots

El **panel de tráfico de crawlers al pie del dashboard** muestra las peticiones de crawlers reportadas por el servidor, agrupadas por bot, categoría y página, con gráficas de tráfico y peticiones recientes. Cambia entre **Respuestas IA**, **Indexación** y **Entrenamiento**, selecciona un crawler para filtrar la gráfica, o elige **Páginas** para agrupar la gráfica por ruta solicitada. Haz clic en el control activo **Crawlers** o **Páginas** para abrir su filtro de selección múltiple. La búsqueda de páginas admite comodines `*` (por ejemplo `/blog/*`). Los filtros se intersectan entre crawlers y rutas; **Limpiar todo** no selecciona ninguno, **Todos** restaura todos, y **Restablecer filtros** quita ambas restricciones. La gráfica muestra hasta 10 series y el selector de páginas ofrece hasta 100 rutas. Otros bots aparecen en una pestaña aparte cuando existen. Usa el rango de fechas seleccionado; los filtros humanos no aplican. Los conteos representan peticiones reportadas, no bots únicos ni identidades verificadas. El tráfico de bots nunca crea sesiones humanas ni ingresos.

La mayoría de los crawlers no ejecutan JavaScript. Instala el reporte del lado del servidor en cada sitio rastreado; el script del navegador por sí solo no poblará esta vista. En tu backend, reenvía la URL original y el user agent a:

```js
await fetch('https://TU-HOST-MINILYTICS/api/v1/bots', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.MINILYTICS_SITE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: request.url,
    user_agent: request.headers.get('user-agent') || '',
  }),
});
```

Mantén esta clave en el servidor. Usa el mecanismo de tareas en segundo plano que soporte tu framework para no retrasar las respuestas de la página, y maneja los fallos de reporte sin que falle la petición de la página. Reporta una vez por petición; los reintentos se cuentan por separado. Las peticiones servidas desde una caché antes de que corra tu código de reporte no se observan.

Solo se aceptan URLs HTTP(S) que coincidan con el sitio de la clave o sus subdominios. Los user agents de navegador normales se ignoran. Los datos almacenados contienen la hora de recepción, la etiqueta/categoría del bot, el host y la ruta normalizada; no se guardan query strings, IPs ni user agents en crudo. La clasificación se basa en cadenas de user agent y puede falsificarse. Los datos se retienen hasta que se elimina el sitio; considera el uso de almacenamiento antes de habilitar reportes de alto volumen.

Aplica las migraciones locales, inicia el servidor de desarrollo, y luego corre `node scripts/smoke-bots.mjs` para probar la recolección y el aislamiento con sitios temporales. Antes del despliegue, aplica la migración `0005_bot_requests.sql` mediante el flujo de despliegue normal.
