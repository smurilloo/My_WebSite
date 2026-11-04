# My_WebSite

Sitio personal de **Samuel Murillo Ospina** — Senior MLOps Engineer.
Servicios: sistemas de trading algorítmico, agentes de IA / LLMs, MLOps y CI/CD,
Data Engineering en Azure + Databricks, ML aplicado e infraestructura.

Sitio estático (HTML + CSS + JS) con fondo WebGL en Three.js (shaders con ruido
simplex, partículas y transiciones por sección), preloader, cursor personalizado,
texto dividido animado, gráfico de velas BTCUSDT 1H en vivo desde la API pública
de Bitget, ticker BTC y textos en inglés (por defecto) y español.

## Correr en local con Docker

```bash
docker compose up -d --build
# abrir http://localhost:8088  (otro puerto: $env:PORT=9000; docker compose up -d)
```

Detener: `docker compose down`

## Despliegue en Render

`render.yaml` define un Blueprint con un Static Site que publica `site/` desde
la rama `main` (autodeploy en cada push). En Render: **New → Blueprint**,
seleccionar este repositorio y aplicar.

## Estructura

```
site/
  index.html
  css/main.css
  js/scene.js   # escena WebGL (Three.js por CDN)
  js/main.js    # loader, cursor, reveals, menú, ticker, gráfico de velas en vivo
  js/i18n.js    # textos en inglés
  js/vr.js      # sala VR opcional (botón "VR")
  css/vr.css    # estilos de la sala VR
Dockerfile, nginx.conf, docker-compose.yml   # ejecución local
render.yaml                                  # Blueprint de Render
```

## Sala VR (opcional)

El botón **VR** (abajo a la derecha) abre una sala virtual leída del propio HTML (sigue el idioma y los datos en vivo). Los paneles
son bloques 3D que salen de las paredes, el orbe de la página cuelga del techo y el suelo es un espejo en tiempo real. Al llegar a
Trading las cifras cuentan, las velas de Bitget crecen en 3D con el mismo aspecto de la web y se enciende un punto de luz por cada
trade cerrado, a partir de los conteos por estrategia que ya muestra la página. Al seleccionar Experiencia profesional aparecen un camino de luz,
una esfera verde nebulosa y un panel por empleo.

Mouse: arrastrar para girar, rueda para avanzar, clic para entrar, flechas o clic en el suelo para caminar. Táctil: deslizar en
horizontal para girar y en vertical para caminar, pellizcar para avanzar, tocar para entrar o caminar hasta ese punto del suelo. Doble clic o doble toque retrocede un nivel, igual que el botón Volver.

Para quitarla: borrar `site/js/vr.js`, `site/css/vr.css` y las dos líneas marcadas `VR room` al final de `site/index.html`.
