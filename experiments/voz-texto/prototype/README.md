# Prototipo 0.1.4

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
