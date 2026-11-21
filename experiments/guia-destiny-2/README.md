# Guía interactiva de Destiny 2 — Equilibrio

> [← Índice de experimentos](../../README.md#índice-de-experimentos) · [Demo en GitHub Pages](https://fran1599.github.io/laboratorio-client-side-processing/site/experimentos/guia-destiny-2/) · [Seguimiento: issue #9](https://github.com/fran1599/laboratorio-client-side-processing/issues/9)

- **Slug:** `guia-destiny-2`
- **Estado:** `in-progress` (prototipo pendiente de prueba funcional real en Android y PC).
- **Pregunta:** ¿ayuda una guía paso a paso y con progreso local a resolver mazmorras desde una segunda pantalla?
- **Hipótesis:** las instrucciones breves, los criterios observables de éxito y los detalles opcionales reducen la necesidad de recorrer artículos largos durante el juego.

## Índice
- [Alcance](#alcance)
- [Tecnología](#tecnología)
- [Uso y ejecución](#uso-y-ejecución)
- [Fuentes y localización](#fuentes-y-localización)
- [Datos y conectividad](#datos-y-conectividad)
- [Validación](#validación)
- [Límites y próximos pasos](#límites-y-próximos-pasos)

## Alcance

Guía experimental de la mazmorra **Equilibrio** de Destiny 2 con 28 pasos distribuidos en seis secciones: preparación, Cosechadora, tránsito, Harrow, tránsito y Dredgen Sere. Incluye pasos opcionales de cofres, selector de encuentro, índice completo, vista rápida y detallada, comprobación de finalización, consejos, glosario bilingüe de trabajo, esquema conceptual y progreso guardado en el dispositivo mediante `localStorage`. Se puede compartir un enlace con `#paso=<id>` para abrir una instrucción determinada; **no** se comparte el progreso entre personas.

No integra la API de Bungie, no lee cuentas ni perfiles y no puede detectar automáticamente dónde está el jugador.

## Tecnología

Un único `index.html` autocontenido con HTML, CSS y JavaScript nativos. Sin backend, CDN, fuentes remotas, librerías ni proceso de compilación. La copia en `site/experimentos/guia-destiny-2/index.html` es idéntica a la del experimento. Diagramas conceptuales propios (texto y nodos), no mapas geométricos exactos.

## Uso y ejecución

Para probar en localhost desde la raíz del repositorio:

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/experiments/guia-destiny-2/`.

En la interfaz: seleccionar encuentro, avanzar y retroceder, cambiar vista, marcar pasos completados y copiar enlace a un paso. En PC se admiten las flechas izquierda/derecha cuando el foco no está en un control.

## Fuentes y localización

Referencias **consultadas** para la síntesis original de las mecánicas:
- [Vaexil — Equilibrium](https://destiny2.vaexil.tv/guides/dungeons/equilibrium).
- [ThePsychDr — Equilibrium](https://thepsychdr.com/destiny/dungeons/equilibrium).
- [Shacknews — Equilibrium](https://www.shacknews.com/article/147168/how-to-complete-the-equilibrium-dungeon-in-destiny-2).

**No** se publicó una traducción íntegra de las guías ni se copiaron sus imágenes/diagramas. No hay autorización verificada para republicar obras ajenas. Los nombres españoles de enemigos, efectos y objetos se consideran provisionales salvo validación específica dentro del juego o con manifestaciones localizadas de Bungie. Se conserva una referencia inglesa para consulta. Las dinámicas del juego pueden cambiar.

## Datos y conectividad

La lógica de la guía se ejecuta en el navegador. `localStorage` guarda únicamente el paso activo, el estado de casillas y el modo de lectura. No hay solicitudes programadas a APIs de terceros ni analítica de uso. Cargar el sitio desde GitHub Pages requiere red y genera solicitudes normales al host. Abrir enlaces de fuentes externas sí contacta esos sitios. El modo sin conexión **no está validado**. Las imágenes de terceros no se cargan automáticamente.

Los datos guardados en un navegador no se sincronizan con otro dispositivo y pueden desaparecer al borrar almacenamiento.

## Validación

- Comprobación estática del archivo fuente y su copia publicada, datos JSON, identificadores y sintaxis JavaScript mediante `node experiments/guia-destiny-2/validate.mjs`.
- El chequeo anterior **no implica** prueba funcional en un navegador real.
- Pendiente: Android físico, PC con Chrome/Firefox, accesibilidad táctil, recarga y persistencia, contraste de términos localizados y observación directa dentro de la mazmorra.
- No se han inspeccionado empíricamente las solicitudes de red del navegador.

## Límites y próximos pasos

1. Probar la navegación durante Equilibrio con dos jugadores y registrar fricciones.
2. Revisar nombres de Destiny 2 en español contra el cliente y el Destiny Manifest.
3. Añadir imágenes con licencia o permiso, y esquemas espaciales originales precisos.
4. Separar el motor y los datos estructurados al convertirlo en proyecto independiente.
5. Explorar API de Bungie como módulo opcional; evitar secretos en GitHub Pages.

**Licencia:** no se declara licencia de reutilización general para este experimento. Antes de promoverlo a repositorio propio, decidir licencia del código y condiciones del contenido.
