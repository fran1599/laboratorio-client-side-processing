# Voz y texto en el navegador

- **Slug:** `voz-texto`
- **Estado:** in-progress
- **Responsable:** Franco Fariña
- **Issue:** #2
- **Pregunta:** ¿Speech-to-Text y Text-to-Speech pueden resultar útiles ejecutando la inferencia íntegramente en el navegador, sin backend de procesamiento ni fallback remoto?
- **Hipótesis:** Whisper Tiny + Transformers.js y Piper pueden sostener una primera experiencia local-first en hardware de consumo, usando CPU/WASM como ruta base y WebGPU como aceleración opcional.

## Alcance

Esta etapa prueba:

- diagnóstico básico de capacidades del dispositivo;
- grabación desde micrófono o selección de un archivo de audio;
- Speech-to-Text local con Whisper Tiny;
- Text-to-Speech local con Piper;
- comparación entre WebGPU y CPU/WASM cuando sea posible;
- métricas de carga e inferencia;
- exportación de resultados a JSON sin incluir audio ni texto.

Fuera de alcance por ahora: backend, cuentas, almacenamiento remoto, fallback a inferencia externa, diarización, branding definitivo, producto final y promesas de funcionamiento offline.

## Prototipo 0.1

Código: [`prototype/`](prototype/).

La prueba es una aplicación estática. No requiere Node ni build para ejecutarse.

### Dependencias fijadas

- `@huggingface/transformers@3.8.1`, cargado desde jsDelivr.
- `@mintplex-labs/piper-tts-web@1.0.5`, cargado desde jsDelivr.
- modelo STT: `onnx-community/whisper-tiny`, descargado desde Hugging Face.
- voces TTS: catálogo de Piper; la licencia del modelo de voz debe revisarse individualmente antes de redistribuirlo.

Las bibliotecas se ejecutan en el navegador. Esta versión **sí necesita red para descargar código y modelos** y todavía no fue validada como offline.

## Privacidad y conectividad

No existe endpoint de inferencia propio ni fallback remoto configurado. El audio y el texto se entregan a las bibliotecas dentro del navegador.

Esto **no equivale todavía a una afirmación de privacidad validada**: antes de publicar la demo se debe inspeccionar tráfico de red y comprobar que durante la inferencia no sale contenido del usuario.

La aplicación sí contacta orígenes externos para descargar:

- módulos JavaScript desde jsDelivr;
- modelos STT desde Hugging Face;
- recursos/modelos de voces requeridos por Piper.

## Requisitos: hipótesis a validar

No son mínimos oficiales.

- 4 GB RAM: borde experimental.
- 8 GB RAM: candidato a piso práctico.
- 16 GB RAM: escenario cómodo esperado para modelos pequeños.
- GPU dedicada: no obligatoria.
- WebGPU: aceleración opcional.
- CPU/WASM: ruta alternativa que debe probarse.
- VRAM mínima: sin definir; el navegador no ofrece una medición portable suficiente.

## Ejecución local

Desde `experiments/voz-texto/prototype/`:

```bash
python -m http.server 8000
```

Luego abrir `http://localhost:8000` en Chrome o Edge actualizado.

No abrir directamente con `file://`: micrófono y otras APIs requieren contexto seguro; `localhost` es válido para desarrollo.

## Método de prueba inicial

1. Revisar el diagnóstico del dispositivo.
2. Grabar audio propio no sensible de unos 15 segundos.
3. Transcribir en modo automático.
4. Si WebGPU está disponible, repetir forzando WebGPU.
5. Repetir con CPU/WASM.
6. Si el flujo es estable, repetir con ~60 segundos.
7. Cargar voces Piper y sintetizar una frase corta en español.
8. Descargar el JSON de resultados.
9. Inspeccionar tráfico de red antes de declarar privacidad u operación offline.

Métrica principal STT:

`realtimeFactor = segundos de inferencia / segundos de audio`.

- menor que 1: más rápido que tiempo real;
- cercano a 1: aproximadamente tiempo real;
- mayor que 1: más lento que la duración del audio.

## Evidencia y resultados

Todavía no hay mediciones de hardware real registradas. El código pasó revisión estática de sintaxis, pero la inferencia en navegador queda pendiente de validación.

Los resultados deben distinguir observaciones de hipótesis y no deben incluir grabaciones ni textos sensibles.

## Criterio de éxito de esta etapa

La etapa será prometedora si un equipo con 8 GB de RAM, sin depender de una GPU dedicada moderna, puede transcribir aproximadamente un minuto de español de forma estable y Piper puede generar audio localmente.

## Decisión vigente

**Continuar en experimentación.**

No publicar aún el prototipo en GitHub Pages ni marcarlo como validado hasta ejecutar la primera ronda, revisar tráfico de red y documentar limitaciones.
