# Laboratorio de capacidades client-side

Exploraciones reproducibles de tecnologías que procesan información **en el navegador**, sin backend propio para el procesamiento.

**Alcance:** HTML, CSS, JavaScript, WebAssembly, WebGPU, APIs del navegador y modelos descargados que se ejecuten en el dispositivo. GitHub Pages publica el sitio; no ejecuta un servidor de aplicaciones.

**Regla esencial:** «se abre en el navegador» no equivale a «procesa localmente». Cada prueba debe documentar solicitudes de red, dependencias externas, permisos, disponibilidad offline y tratamiento de datos.

## Organización

- `raíz del repositorio/`: catálogo público, independiente de la tecnología de cada experimento.
- `experiments/<slug>/`: código fuente autónomo, pruebas y documentación de cada experimento.
- `docs/`: arquitectura, método de validación y normas de trabajo.
- `templates/`: plantilla para iniciar nuevas pruebas.
- Publicación desde `main` mediante GitHub Pages, sin workflow de despliegue.

## Empezar

1. Leer [arquitectura](docs/ARCHITECTURE.md) y [guía de trabajo](docs/CONTRIBUTING.md).
2. Crear una rama `experiment/<slug>`, una carpeta `experiments/<slug>/` y completar su README.
3. Ejecutar y validar localmente. Registrar el resultado en su ficha.
4. Para publicar la demo en GitHub Pages, copiar/compilar exclusivamente archivos estáticos públicos a `experimentos/<slug>/` y añadir una entrada a `experiments.json`.
5. Abrir un pull request; no incorporar resultados sin verificarlos.

## Primer experimento previsto

**Voz ↔ texto**: comparar reconocimiento de voz y síntesis de habla con tecnologías del navegador e inferencia realmente local. Está registrado como **planeado**, sin afirmar capacidades todavía verificadas.

## Publicación

GitHub Pages publica directamente desde la rama `main`, carpeta `/(root)`. Configurar una vez en **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main → Folder: /(root)**.

Sitio previsto: https://fran1599.github.io/laboratorio-client-side-processing/

Proyecto experimental: sin garantía de compatibilidad, confidencialidad ni funcionamiento offline hasta validar cada implementación.
