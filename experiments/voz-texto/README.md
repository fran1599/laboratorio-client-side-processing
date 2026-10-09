# Voz y texto en el navegador

**Estado:** planned. Primera línea de experimentación del laboratorio.

## Preguntas

- ¿Qué alternativas permiten voz a texto con inferencia **realmente local**?
- ¿Cuáles permiten texto a voz, con qué voces e idiomas y bajo qué condiciones?
- ¿Qué límites presentan por navegador, memoria, CPU, aceleración GPU, tamaño de modelo y conectividad?

## Subpruebas previstas

1. Reconocimiento de voz: distinguir APIs del navegador de modelos WASM/WebGPU de inferencia local.
2. Síntesis de voz: evaluar interfaz nativa del navegador, disponibilidad de voces y dependencias del sistema.
3. Privacidad, solicitud de permisos, descarga inicial y funcionamiento offline.
4. Medición en hardware real, incluyendo equipos de recursos limitados.

## Antes de implementar

Recuperar las decisiones técnicas y los casos de uso del trabajo específico sobre transcripciones. No elegir bibliotecas ni declarar funcionamiento local sin validación.

Completar con [plantilla](../../templates/EXPERIMENT.md) al iniciar.
