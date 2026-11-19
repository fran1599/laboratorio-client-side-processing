# Voz y texto en el navegador

> [← Índice de experimentos](../../README.md#índice-de-experimentos) · [Arquitectura](../../docs/ARCHITECTURE.md) · [Guía de trabajo](../../docs/CONTRIBUTING.md)

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

## Prototipo 0.1.10

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

### Tercera ejecución real — 2026-11-15 — versión 0.1.2

El runtime anterior dejó de fallar en la carga explícita del módulo WASM, pero dos intentos de síntesis devolvieron excepciones numéricas sin mensaje (`138099976` y `79461120`). Este formato es compatible con excepciones de bajo nivel propagadas desde código compilado con Emscripten/WASM, donde un entero puede representar una referencia interna en memoria; por sí solo no identifica la causa.

El intento se hizo con una respuesta de longitud considerable, por lo que el texto largo queda como variable plausible pero todavía no probada. Como referencia de implementación, AnythingLLM segmenta Piper en bloques de hasta 400 caracteres para mantener cada predicción acotada.

**Corrección 0.1.3:** segmentar el texto por oraciones y palabras hasta ~400 caracteres, sintetizar secuencialmente, registrar cada fragmento y unir los WAV localmente en un único audio. El logging ahora conserva tipo, mensaje, stack/cause cuando existan y el índice exacto del fragmento que falla.

### Cuarta ejecución real — 2026-11-15 — versión 0.1.3

La síntesis larga se completó correctamente en el equipo de prueba de 4 GB de RAM aproximada y 4 hilos lógicos informados por el navegador.

Resultados observados:

- 14.213 caracteres;
- 42 fragmentos;
- 560.385 ms de inferencia acumulada (~9 min 20 s);
- WAV final de 93.978.398 bytes;
- audio final observado en la interfaz: 16 min 18 s;
- heap JavaScript informado: ~70 MiB antes y ~518 MiB después;
- los 42 fragmentos finalizaron sin error;
- los controles de velocidad y conservación de tono fueron ejercitados después de la síntesis.

Con esos datos, la generación fue aproximadamente 0,57 veces la duración del audio: el equipo genera más rápido que la reproducción a 1×. Esto abre una vía útil para comenzar a reproducir fragmentos terminados mientras los siguientes continúan sintetizándose.

La captura de interfaz también mostró duplicación conceptual: el reproductor nativo del navegador y los controles personalizados ofrecían play/pausa, tiempo y posición simultáneamente.

**Evolución 0.1.4:** mover la síntesis a un Web Worker para mantener la interfaz responsiva; mostrar progreso total y parcial, tiempo transcurrido, estimación restante, fragmentos completados, audio generado y buffer disponible; iniciar reproducción progresiva en cuanto exista un fragmento; mantener generación secuencial para no multiplicar el consumo de memoria; y conservar un solo conjunto visible de controles de reproducción.

### Evolución 0.1.5 — lectura natural

Se agrega una etapa explícita entre el texto original y Piper:

`texto original → texto preparado → plan semántico → TTS → audio`.

El modo Natural limpia marcas visuales de Markdown, reemplaza URLs por una referencia genérica, conserva la puntuación significativa, separa títulos y elementos de listas y agrega pausas explícitas entre bloques. La preparación es observable desde la interfaz y no modifica el texto original.

Se mantiene un modo Literal para comparación A/B. Esta versión no altera todavía `length_scale`, `noise_scale` ni `noise_w`; primero se busca medir cuánto mejora la percepción actuando únicamente sobre preparación textual, segmentación y pausas.

### Evolución 0.1.6 — selección controlada de voz base

La mejora perceptiva de 0.1.5 fue reportada como leve. Por lo tanto, antes de modificar parámetros de prosodia se incorpora una comparación A/B de voces sobre una muestra fija.

La prueba mantiene constante el texto preparado y cambia únicamente el modelo de voz. Se genera de manera secuencial para no sumar carga simultánea de inferencia. La persona puede valorar cada resultado en naturalidad, claridad y timbre, además de seleccionar una favorita.

El JSON incorpora `voiceComparisons` con las voces probadas, tiempos de inferencia y evaluación subjetiva. Esta evidencia se usará para reducir el espacio de búsqueda a una o dos voces antes de probar perfiles de pausas y parámetros internos del modelo.

### Resultado de comparación y evolución 0.1.7 — Claude

La segunda comparación A/B completó cuatro voces sobre una muestra de 481 caracteres. `es_MX-claude-high` fue marcada como favorita, con naturalidad 2/5, claridad 5/5 y timbre 5/5. Esto orienta la siguiente ronda a conservar el timbre de Claude y trabajar específicamente ritmo y prosodia.

La 0.1.7 incorpora:

- Claude high como voz prioritaria para la prueba;
- segmentación por oración para poder insertar pausas explícitas según puntuación;
- tres perfiles de pausa: Compacto, Natural+ y Marcado;
- en Natural+, pausa aproximada de 380 ms después de punto, 560 ms después de pregunta, 460 ms después de exclamación y 760 ms entre párrafos;
- tres perfiles de prosodia: original de la voz, Natural A y Natural B;
- los perfiles modifican en memoria el JSON de configuración cargado por Piper, sin alterar el archivo ONNX;
- Natural A: `length_scale=1.03`, `noise_scale=0.75`, `noise_w=0.72`;
- Natural B: `length_scale=1.06`, `noise_scale=0.85`, `noise_w=0.65`.

Los presets son hipótesis experimentales moderadas alrededor de los valores originales de Claude (`1.0 / 0.667 / 0.8`). No se consideran todavía configuraciones recomendadas.

La arquitectura del override es reutilizable con otras voces Piper, pero cada modelo deberá calibrarse de forma independiente porque los mismos parámetros pueden producir resultados distintos.

Los resultados deben distinguir observaciones de hipótesis y no deben incluir grabaciones ni textos sensibles.

## Criterio de éxito de esta etapa

La etapa será prometedora si un equipo con 8 GB de RAM, sin depender de una GPU dedicada moderna, puede transcribir aproximadamente un minuto de español de forma estable y Piper puede generar audio localmente.

## Decisión vigente

**Publicar en GitHub Pages como demostración experimental en curso**, por solicitud explícita del usuario para validar funcionamiento desde otros dispositivos mediante CI/CD.

Las pruebas de síntesis Piper son prometedoras y el flujo principal puede producir audio progresivo. Aún no está validada la inspección de tráfico de red ni la operación offline; tampoco se consideran concluidas las pruebas de transcripción (STT) y compatibilidad. No declarar el experimento «Validado» ni usar contenido sensible mientras queden estas verificaciones pendientes.


### Evolución 0.1.8 — Laboratorio Piper

Se incorpora un laboratorio separado del flujo principal para explorar parámetros de Piper de manera controlada. La interfaz permite variar prosodia interna y pausas externas, conservar múltiples muestras simultáneamente y exportar evidencia de cada configuración.

La decisión de separar el laboratorio busca evitar que controles experimentales complejos contaminen la experiencia de uso cotidiano. Las configuraciones que demuestren una mejora estable podrán convertirse luego en presets del flujo principal.

El laboratorio reutiliza la misma arquitectura local-first y el mismo Web Worker ya usados por el prototipo. No incorpora servidor Python ni JavaScript de interfaz adicional.

### Quinta ejecución real — Laboratorio Piper 0.1.8 (15/11/2026, hora de Córdoba)

Se recibió el JSON de una sesión con Claude high, 8 muestras completas y 3 intentos fallidos adicionales. Los intentos fallidos ocurrieron después de completar el primer fragmento y devolvieron valores numéricos no descriptivos desde el Worker. Los tres tenían `noise_w=1.50`; cada configuración fallida luego logró completarse en un reintento. Esto es una **asociación observada**, no evidencia causal suficiente para atribuir el problema al parámetro.

La última muestra (n.º 8) fue considerada subjetivamente la más agradable hasta el momento:

- voz: `es_MX-claude-high`;
- `length_scale=0.89`, `noise_scale=1.10`, `noise_w=1.22`;
- pausa tras punto: 380 ms; pregunta: 560 ms; exclamación: 460 ms; párrafo: 760 ms;
- 229 caracteres, cuatro fragmentos, 4.263 ms de inferencia, 12,99 s de audio, factor de tiempo real 0,328.

La experiencia positiva debe corroborarse en textos más largos, sin asumir que sea una preferencia generalizable a otras voces. La comparación entre muestras 1–4 y 5–8 no controla el texto: se trabajó primero con 348 y luego con 229 caracteres.

**Evolución 0.1.9:** incorporar «Claude · candidata 8» al Laboratorio Piper; conservar en el JSON el fragmento exacto que falla y la configuración de los intentos fallidos; procesar secuencialmente los eventos del Worker para asegurar la integridad del ensamblado del WAV. Se mantienen los modelos y la infraestructura de la 0.1.8.

**Próxima prueba:** comparar el perfil candidato con el original de Claude sobre un mismo texto de 1–2 minutos y evaluar estabilidad, naturalidad, pausas y articulación.

### Evolución 0.1.10 — primera publicación en Pages

Se añade el perfil `Claude · candidata 8` (length_scale 0.89, noise_scale 1.10, noise_w 1.22) como opción en el flujo cotidiano de texto a voz. En el Laboratorio Piper el mismo perfil sigue disponible para experimentar. El perfil se fundamenta en una preferencia reportada tras una muestra corta; no equivale a una validación objetiva de naturalidad.

Se publican los archivos estáticos del prototipo en `site/experimentos/voz-texto/`, con navegación entre herramientas y catálogo actualizado a `in-progress`. El workflow propio ejecuta comprobaciones de CI; el despliegue nativo de Pages publica por separado.

Esta decisión de publicación **no modifica** las restricciones: no hay backend ni fallback a inferencia remota; el código y los modelos pueden descargarse desde terceros; el contenido no debe usarse como sensible hasta revisar el tráfico de red en origen Pages. PR #3 registra el cambio de alcance autorizado y la evidencia.

### Corrección de publicación — 19/11/2026

GitHub Pages desplegó correctamente el artefacto Jekyll del commit de integración. Se inspeccionó el artefacto y se verificaron las dos páginas HTML y sus dependencias estáticas. Como Pages publica desde la rama raíz, las URLs incluyen `/site/`:

- [Catálogo](https://fran1599.github.io/laboratorio-client-side-processing/site/)
- [Voz ↔ texto](https://fran1599.github.io/laboratorio-client-side-processing/site/experimentos/voz-texto/)
- [Laboratorio Piper](https://fran1599.github.io/laboratorio-client-side-processing/site/experimentos/voz-texto/piper-lab.html)

El workflow propio de despliegue falló antes de que se asignara un runner. Se lo convirtió en CI estático sin acción de despliegue para no competir con el sistema nativo. **El CI no bloquea todavía las publicaciones de Pages**. La privacidad y STT continúan pendientes de validación.
