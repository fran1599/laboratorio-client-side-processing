# Distrito Luz — renderizado 2D en el navegador

- **Slug:** `distrito-luz`
- **Estado:** `limited` (prototipo funcional, rendimiento real móvil por validar)
- **Pregunta:** ¿qué tan fluido puede ejecutarse un videojuego 2D completamente client-side en móviles, y cómo afectan la resolución y los efectos gráficos al rendimiento?
- **Hipótesis:** bajar la resolución interna, precalcular el escenario y limitar la frecuencia de dibujado reduce la carga de trabajo en celulares.
- **Seguimiento:** [issue #4](https://github.com/fran1599/laboratorio-client-side-processing/issues/4)

> [← Índice de experimentos](../../README.md#índice-de-experimentos) · [Demo publicada](https://fran1599.github.io/laboratorio-client-side-processing/experimentos/distrito-luz/) · [Arquitectura](../../docs/ARCHITECTURE.md)

## Índice de esta prueba

- [Alcance y funcionamiento](#alcance-y-funcionamiento)
- [Tecnología y dependencias](#tecnología-y-dependencias)
- [Requisitos](#requisitos)
- [Ejecución](#ejecución)
- [Modos de rendimiento](#modos-de-rendimiento)
- [Método de prueba y evidencia](#método-de-prueba-y-evidencia)
- [Privacidad y conectividad](#privacidad-y-conectividad)
- [Decisión](#decisión)

## Alcance y funcionamiento

Juego arcade 2D de vista superior. Recolectar ocho núcleos, evitar o enfrentar drones y alcanzar el portal. Incluye controles de teclado, mouse y táctiles; enemigos con lógica local, colisiones, vida, puntuación, sonidos opcionales, pausa y modos de calidad.

No hay servidor de juego, cuentas, guardado remoto ni multijugador.

## Tecnología y dependencias

HTML5, CSS3, JavaScript sin librerías, Canvas 2D, `requestAnimationFrame`, Web Audio API y Pointer Events. Un único `index.html` autónomo, con CSS y JavaScript embebidos, sin compilación, `node_modules`, CDN ni archivos externos. La copia en `site/experimentos/distrito-luz/index.html` publica exactamente el mismo archivo para GitHub Pages.

**Licencia:** no se declara una licencia independiente para este experimento; definir antes de reutilización/distribución bajo condiciones específicas.

## Requisitos

Navegador moderno compatible con Canvas 2D y JavaScript; Pointer Events para joystick táctil y Web Audio API para efectos de sonido opcionales. Hardware mínimo, navegadores concretos, consumo de memoria y compatibilidad total: **aún no determinados**. Se recomienda orientación horizontal en teléfonos. No solicita permisos especiales de micrófono, cámara ni geolocalización.

## Ejecución

1. Abrir `index.html` en un navegador compatible; para reproducir un entorno web, usar servidor estático local.
2. Desde la raíz del repositorio: `python -m http.server 8000` y entrar en `http://localhost:8000/experiments/distrito-luz/`.
3. En PC: WASD/flechas, espacio o clic para disparar, Shift para impulso, P para pausar. En móvil: joystick táctil, DISPARAR e IMPULSO.
4. Cambiar el botón **Gráficos** entre normal, ligero y mínimo; observar el contador de FPS.

## Modos de rendimiento

- **Ligero:** resolución interna prevista de 720 × 405 y objetivo aproximado de 30 FPS.
- **Mínimo:** resolución interna prevista de 480 × 270 y objetivo aproximado de 24 FPS.
- **Normal:** intenta acercarse a 60 FPS, sujeto al equipo.
- El terreno está precalculado en un canvas auxiliar; los efectos costosos se reducen o desactivan en modos livianos.

El contador de FPS estima cuadros procesados por el bucle, no mide todo el sistema ni garantiza continuidad del movimiento. Las cifras anteriores son parámetros de implementación, **no mediciones de rendimiento real**.

## Método de prueba y evidencia

- **2026-10-25:** comprobación estática de JavaScript con `node --check`: sintaxis válida.
- Inspección del HTML: un solo archivo autónomo, controles táctiles presentes; no se detectaron llamadas explícitas a `fetch`, `XMLHttpRequest`, `WebSocket` ni `sendBeacon`.
- En la elaboración previa se probó la interfaz en navegador de escritorio y emulación móvil. **No equivale a una medición en teléfono físico.**
- El usuario reportó lentitud en su celular con la primera versión; la versión optimizada **aún requiere prueba en ese dispositivo**.

### Validaciones pendientes

Registrar dispositivo, sistema operativo, navegador, FPS sostenidos en cada modo, retardo del joystick, consumo de batería/memoria, incidencias y tráfico de red mediante herramientas de desarrollo. Verificar compatibilidad de la demo bajo la subruta definitiva de GitHub Pages tras el merge.

## Privacidad y conectividad

La lógica del juego corre en el navegador y el código no incorpora bibliotecas remotas. La carga inicial de la demo publicada sí implica una petición HTTPS al proveedor de hosting. No se han auditado empíricamente todos los intercambios de red del navegador. El uso **offline** puede ser posible al conservar el HTML en el dispositivo, pero no se declara validado en todos los navegadores. No se recogen ni solicitan datos personales.

## Decisión

Mantener como **experimento limitado** de Canvas 2D y optimización móvil. Continuar iterando y medir sobre hardware real antes de atribuir mejoras cuantificadas.
