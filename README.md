# Laboratorio de capacidades client-side

Exploraciones reproducibles de tecnologías que procesan información **en el navegador**, sin backend propio para el procesamiento.

**Alcance:** HTML, CSS, JavaScript, WebAssembly, WebGPU, APIs del navegador y modelos descargados que se ejecuten en el dispositivo. GitHub Pages publica el sitio; no ejecuta un servidor de aplicaciones.

**Regla esencial:** «se abre en el navegador» no equivale a «procesa localmente». Cada prueba debe documentar solicitudes de red, dependencias externas, permisos, disponibilidad offline y tratamiento de datos.

## Índice de experimentos

| Estado | Prueba | Propósito | Acceso |
| --- | --- | --- | --- |
| En curso | [Voz ↔ texto](experiments/voz-texto/README.md) | Probar Whisper y Piper, reproducción progresiva y prosodia. | [Documentación](experiments/voz-texto/README.md) · [Demo](https://fran1599.github.io/laboratorio-client-side-processing/site/experimentos/voz-texto/) · [Laboratorio Piper](https://fran1599.github.io/laboratorio-client-side-processing/site/experimentos/voz-texto/piper-lab.html) |
| Con limitaciones | [Distrito Luz](experiments/distrito-luz/README.md) | Medir el rendimiento de un videojuego Canvas 2D en móviles. | [Documentación](experiments/distrito-luz/README.md) · [Demo](https://fran1599.github.io/laboratorio-client-side-processing/site/experimentos/distrito-luz/) |

Cada experimento comienza con enlaces de retorno a este índice y un índice de sus secciones.

## Organización

- `site/`: catálogo público, independiente de la tecnología de cada experimento.
- `experiments/<slug>/`: código fuente autónomo, pruebas y documentación de cada experimento.
- `docs/`: arquitectura, método de validación y normas de trabajo.
- `templates/`: plantilla para iniciar nuevas pruebas.
- `.github/workflows/`: publicación del catálogo mediante GitHub Actions.

## Empezar

1. Leer [arquitectura](docs/ARCHITECTURE.md) y [guía de trabajo](docs/CONTRIBUTING.md).
2. Crear una rama `experiment/<slug>`, una carpeta `experiments/<slug>/` y completar su README.
3. Ejecutar y validar localmente. Registrar el resultado en su ficha.
4. Para publicar la demo en GitHub Pages, copiar/compilar exclusivamente archivos estáticos públicos a `site/experimentos/<slug>/` y añadir una entrada a `site/experiments.json`.
5. Abrir un pull request; no incorporar resultados sin verificarlos.

## Experimento de voz en curso

**Voz ↔ texto** ofrece una demostración pública de Piper y Whisper. Las pruebas de síntesis en equipos reales resultaron prometedoras; la privacidad de red, operación offline y transcripción todavía no están completamente validadas.

## Publicación

**Configuración observada:** Pages construye y publica desde la rama `main` mediante Jekyll. La carpeta `site/` se mantiene como parte de la dirección pública:

- Catálogo: https://fran1599.github.io/laboratorio-client-side-processing/site/
- Voz ↔ texto: https://fran1599.github.io/laboratorio-client-side-processing/site/experimentos/voz-texto/
- Laboratorio Piper: https://fran1599.github.io/laboratorio-client-side-processing/site/experimentos/voz-texto/piper-lab.html

El workflow `.github/workflows/deploy-pages.yml` verifica sintaxis JavaScript y rutas de la demo en CI, **sin intentar otro despliegue**. El pipeline nativo de Pages publica la rama independientemente de esos checks; el CI no bloquea aún esa publicación.

Para publicar `site/` como raíz, habría que configurar Pages con «Source: GitHub Actions» y restablecer un único workflow que valide antes del despliegue. Actualmente no se realizó ese cambio de configuración.

Proyecto experimental: sin garantía de compatibilidad, confidencialidad ni funcionamiento offline hasta validar cada implementación.
