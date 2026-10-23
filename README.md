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
Dockerfile, nginx.conf, docker-compose.yml   # ejecución local
render.yaml                                  # Blueprint de Render
```
