# Prototipo 0.1.8

Aplicación estática para la primera ronda de pruebas del experimento **voz ↔ texto**.

## Ejecutar

Desde esta carpeta:

```bash
python -m http.server 8000
```

Abrir:

```text
http://localhost:8000
```

Usar preferentemente Chrome o Edge actualizado para la primera ronda.

## Orden recomendado

1. Revisar el diagnóstico.
2. Grabar ~15 segundos de audio no sensible.
3. Probar STT en modo Automático.
4. Repetir con WebGPU si está disponible.
5. Repetir con CPU/WASM.
6. Si es estable, probar ~60 segundos.
7. Cargar voces Piper y sintetizar primero una frase corta.
8. Probar después un texto largo; el prototipo lo divide automáticamente en fragmentos de hasta ~400 caracteres.
9. Con «Reproducir en cuanto haya audio disponible» activado, verificar que la escucha empiece antes de terminar la conversión y que el panel muestre progreso, tiempo transcurrido, estimación restante y buffer.
10. Probar play/pausa, seek y velocidades entre 0,5× y 2×. Si la reproducción alcanza a la generación, debe esperar el siguiente fragmento sin cancelar la conversión.
11. Descargar el WAV completo y el JSON de evidencia al finalizar.

## Red y privacidad

No hay backend de inferencia ni fallback remoto.

La aplicación sí descarga recursos de red:

- Transformers.js 3.8.1 desde jsDelivr.
- `@jtsage/piper-tts-web` 1.2.0 desde jsDelivr, con ONNX Runtime 1.22.0.
- Whisper Tiny desde Hugging Face.
- modelos y recursos de voz utilizados por Piper.

El contenido del usuario está diseñado para entregarse a los motores dentro del navegador. **Esto debe verificarse mediante inspección de red antes de publicar la demo o hacer una afirmación fuerte de privacidad.**

## Evidencia

El JSON exportado no incluye el audio, el texto de entrada ni la transcripción. Registra diagnóstico, backend utilizado, tiempos, factor de tiempo real y errores.

No usar material sensible durante esta etapa.


## Progreso y reproducción progresiva

Desde 0.1.4, Piper corre en un Web Worker separado del hilo principal. Esto permite que la interfaz siga actualizando tiempos y estados mientras el modelo procesa un fragmento.

La generación sigue siendo secuencial: no se ejecutan varias inferencias simultáneas. Cada fragmento terminado se agrega a una cola de reproducción y puede escucharse mientras el Worker genera el siguiente.

El panel informa progreso total por caracteres, fragmento actual, tiempo transcurrido, tiempo restante estimado a partir del rendimiento observado, audio ya generado y buffer disponible.

La barra del fragmento actual es indeterminada porque Piper/ONNX no expone progreso interno de una inferencia individual. La estimación se recalibra al completar cada fragmento.


## Lectura natural

Desde 0.1.5 el TTS permite comparar dos modos:

- **Natural:** prepara una copia del texto exclusivamente para síntesis. Elimina marcas visuales de Markdown, evita leer URLs completas, mantiene puntuación útil, conserva separados títulos y elementos de listas y agrega silencios explícitos entre bloques semánticos.
- **Literal:** conserva el texto introducido y mantiene el comportamiento técnico anterior.

La interfaz permite inspeccionar la versión preparada antes de sintetizar. El texto original no se sobrescribe.

La puntuación dentro de cada fragmento sigue siendo interpretada por Piper. Los silencios agregados por la aplicación actúan principalmente en límites de párrafos, títulos/listas y cortes técnicos. Esta etapa no modifica todavía los parámetros internos de prosodia del modelo.


## Comparación A/B de voces

Desde 0.1.6 se agrega un banco comparativo para elegir la mejor voz base antes de intervenir la prosodia.

La prueba usa una muestra corta y mantiene fijo el texto preparado. Se generan secuencialmente varias voces para evitar concurrencia de modelos y consumo innecesario de memoria.

La interfaz permite:

- seleccionar las voces a comparar;
- reutilizar una muestra del texto principal;
- escuchar cada resultado por separado;
- puntuar naturalidad, claridad y timbre del 1 al 5;
- marcar una voz favorita.

Estas valoraciones se incluyen en el JSON experimental bajo `voiceComparisons`. El objetivo es seleccionar una o dos voces candidatas y recién después experimentar con parámetros internos de prosodia.


## Pausas y prosodia — Claude

La 0.1.7 separa dos variables que antes estaban mezcladas:

1. **Pausas externas:** silencios PCM agregados por la aplicación después de cada oración según el signo final y el límite de párrafo.
2. **Prosodia interna:** parámetros de inferencia usados por Piper.

Perfiles de pausa disponibles:

- Compacto.
- Natural+.
- Marcado.

Perfiles de prosodia experimentales para Claude high:

- Original: usa los valores del JSON de la voz.
- Natural A: `length_scale=1.03`, `noise_scale=0.75`, `noise_w=0.72`.
- Natural B: `length_scale=1.06`, `noise_scale=0.85`, `noise_w=0.65`.

El override se realiza mediante el `customLoader` de `CachedFileReader`: se intercepta únicamente el JSON de configuración, se modifican los valores de `inference` en memoria y se conserva el mismo ONNX.

Esta técnica funciona estructuralmente con otras voces Piper, pero los valores deben evaluarse por voz.


## Laboratorio Piper

Desde 0.1.8 el prototipo incorpora una segunda pestaña/página: `piper-lab.html`.

El laboratorio está separado del flujo principal de voz ↔ texto y reutiliza el mismo Web Worker Piper. No agrega backend ni dependencias de interfaz externas.

Permite:

- elegir cualquiera de las voces Piper disponibles;
- editar libremente `length_scale`, `noise_scale` y `noise_w`;
- volver a los valores originales o aplicar los presets Natural A/B;
- ajustar en milisegundos las pausas posteriores a punto, pregunta, exclamación y cambio de párrafo;
- generar múltiples muestras que permanecen visibles lado a lado;
- reutilizar los parámetros de una muestra;
- modificar la velocidad de reproducción sin volver a sintetizar;
- descargar cada WAV;
- exportar un JSON con todas las configuraciones, tiempos y métricas de las muestras.

Los overrides de prosodia se aplican únicamente al JSON de configuración cargado en memoria mediante `CachedFileReader.customLoader`. El modelo ONNX no se modifica.
