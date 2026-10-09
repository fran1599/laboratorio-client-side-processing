# Prototipo 0.1

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
7. Cargar voces Piper y sintetizar una frase.
8. Descargar el JSON de evidencia.

## Red y privacidad

No hay backend de inferencia ni fallback remoto.

La aplicación sí descarga recursos de red:

- Transformers.js 3.8.1 desde jsDelivr.
- Piper TTS Web 1.0.5 desde jsDelivr.
- Whisper Tiny desde Hugging Face.
- modelos y recursos de voz utilizados por Piper.

El contenido del usuario está diseñado para entregarse a los motores dentro del navegador. **Esto debe verificarse mediante inspección de red antes de publicar la demo o hacer una afirmación fuerte de privacidad.**

## Evidencia

El JSON exportado no incluye el audio, el texto de entrada ni la transcripción. Registra diagnóstico, backend utilizado, tiempos, factor de tiempo real y errores.

No usar material sensible durante esta etapa.
