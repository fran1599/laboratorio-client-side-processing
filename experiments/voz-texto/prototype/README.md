# Prototipo 0.1.3

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
8. Probar después un texto largo; el prototipo lo divide automáticamente en fragmentos de hasta ~400 caracteres y vuelve a unir el audio localmente.
9. Si genera audio, probar play/pausa, seek y velocidades entre 0,5× y 2×.
10. Descargar el WAV y el JSON de evidencia.

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
