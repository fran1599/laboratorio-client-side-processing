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

## Prototipo 0.1.2

Código: [`prototype/`](prototype/).

La prueba es una aplicación estática. No requiere Node ni build para ejecutarse.

### Dependencias fijadas

- `@huggingface/transformers@3.8.1`, cargado desde jsDelivr.
- `@jtsage/piper-tts-web@1.2.0`, cargado desde jsDelivr; actualiza ONNX Runtime a 1.22.0.
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

### Primera ejecución real — 2026-11-15

Ambiente informado por el navegador:

- Windows 10/11 x64, Chrome 157;
- contexto seguro disponible;
- 4 hilos lógicos informados;
- 4 GB de RAM aproximada informada por `navigator.deviceMemory`;
- WebGPU disponible;
- WebAssembly disponible;
- micrófono y Cache API disponibles;
- límite de heap JavaScript informado: ~4,1 GiB.

La prueba llegó correctamente al catálogo de Piper y obtuvo 124 voces, pero la versión 0.1.0 no pudo sintetizar audio. El JSON mostró que el selector estaba enviando `"[object Object]"` como `voiceId`, seguido por `Entry not found`.

**Diagnóstico:** error del prototipo, no evidencia de incompatibilidad del hardware ni de Piper. `voices()` devuelve objetos y Piper requiere la propiedad `key` como `voiceId`.

**Corrección 0.1.1:** normalizar el catálogo y usar `voice.key` como identificador. Pendiente repetir TTS con la nueva versión.

El JSON recibido no contiene ejecuciones STT, por lo que todavía no hay mediciones reales de Whisper para este equipo.

### Segunda ejecución real — 2026-11-15 — versión 0.1.1

La corrección del selector quedó validada parcialmente: el catálogo se redujo a 7 voces candidatas en español y la selección pasó a ser una clave válida, `es_ES-carlfm-x_low`.

La síntesis todavía no llegó a ejecutarse. ONNX Runtime 1.18 intentó cargar `ort-wasm-simd-threaded.mjs` desde cdnjs y el navegador informó `Failed to fetch dynamically imported module`, por lo que Piper terminó con `no available backend found`.

**Interpretación:** el bloqueo ocurre en la carga del runtime WASM remoto, antes de la inferencia; no es todavía evidencia de falta de RAM/CPU ni de incompatibilidad del modelo de voz.

**Corrección 0.1.2:** migrar el prototipo a `@jtsage/piper-tts-web@1.2.0`, que usa ONNX Runtime 1.22.0 y jsDelivr para el runtime, y agregar un reproductor independiente del motor con play/pausa, reinicio, seek, velocidad 0,5×–2×, conservación de tono y descarga WAV.

Los resultados deben distinguir observaciones de hipótesis y no deben incluir grabaciones ni textos sensibles.

## Criterio de éxito de esta etapa

La etapa será prometedora si un equipo con 8 GB de RAM, sin depender de una GPU dedicada moderna, puede transcribir aproximadamente un minuto de español de forma estable y Piper puede generar audio localmente.

## Decisión vigente

**Continuar en experimentación.**

No publicar aún el prototipo en GitHub Pages ni marcarlo como validado hasta ejecutar la primera ronda, revisar tráfico de red y documentar limitaciones.
