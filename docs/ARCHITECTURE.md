# Arquitectura y límites

## Objetivo

Publicar un catálogo de pruebas independientes de procesamiento client-side. No requiere ni debe incluir backend de procesamiento. GitHub Pages únicamente distribuye recursos estáticos por HTTPS.

## Capas

1. **Catálogo** (`site/`): HTML/CSS/JS sin framework, índice navegable de experimentos.
2. **Experimentos fuente** (`experiments/<slug>/`): cada carpeta es autónoma. Puede usar cualquier herramienta de desarrollo.
3. **Demo publicada** (`site/experimentos/<slug>/`): opcional; solamente archivos estáticos resultantes de una compilación o copia revisada.
4. **Documentación** (`docs/`): decisiones transversales; no imponer dependencias a las pruebas.

## Contratos de aislamiento

- Ningún experimento debe importar archivos, bibliotecas instaladas ni estado privado de otro experimento.
- Cada experimento declara versiones, instalación, ejecución, permisos, hardware, compatibilidad y licencias.
- No hay `node_modules`, entornos virtuales, modelos grandes, datasets personales o claves en Git.
- Las demos deben funcionar bajo una **ruta base de proyecto** de Pages: `/laboratorio-client-side-processing/experimentos/<slug>/`. Preferir URLs relativas.
- El catálogo jamás ejecuta código del experimento; solo enlaza demos y documentación.
- Se admite `localhost` como entorno de desarrollo: no es el origen final en GitHub Pages.
- Si una prueba necesita backend de inferencia o transmite contenidos a terceros, declararlo como fuera del alcance de una demo estrictamente local, o presentarla explícitamente como comparación no-local sin procesar datos sensibles.
- Evitar renderizar contenido no confiable mediante `innerHTML` y fijar versiones de dependencias/CDN.

## Criterios para decir «local»

La captura/interfaz puede utilizar APIs nativas, pero confirmar dónde ocurre el procesamiento real. Diferenciar:
- procesamiento en navegador mediante JS/WASM/WebGPU;
- API de navegador cuya implementación puede depender de servicios externos;
- descarga inicial de recursos/modelos desde la red;
- procesamiento offline después de precargar recursos y habilitar almacenamiento persistente, **solo si fue probado**.

Registrar tráfico de red durante las pruebas; jamás prometer privacidad total por usar Pages.

## Publicación y promoción

Las pruebas permanecen aisladas. Una demo se publica solo tras verificar rutas, funcionamiento, permisos y ausencia de secretos/datos personales. Al convertirse en producto, crear repositorio propio conservando en este laboratorio una ficha histórica y un enlace.
