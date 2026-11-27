# Rider visual — editor de escenario

[Volver al laboratorio](../../README.md) · [Incidencia #12](https://github.com/fran1599/laboratorio-client-side-processing/issues/12)

## Propósito
Permitir que agrupaciones no convencionales, con 15–50 integrantes o más, describan su planta y requerimientos técnicos sin software especializado. El ejemplo inicial es el evento de los 10 años de la RAC. Las medidas 12 × 3 m son una hipótesis configurable, no una ficha técnica oficial ni una declaración de aforo. Se informaron medidas de caja escénica de 19 × 12 m y de tablas de 11,5 × 12,7 m en prensa; confirmar el espacio útil con el teatro.

## Uso
Abrir index.html en un navegador compatible o servir la carpeta por HTTP estático. Completar identificación, medidas, participantes, instrumentos y equipos; arrastrar o usar ubicación numérica/tocar para mover. Los canales se consolidan desde el plano y entradas adicionales. Guardar JSON para intercambio y usar imprimir/guardar como PDF para producción. El PDF no reemplaza el archivo JSON editable.

## Arquitectura, datos y dependencias
HTML/CSS/JavaScript nativos; sin librerías externas ni backend. Pointer Events, localStorage (cuando disponible), Blob/URL, File API y diálogo de impresión. La demo es copia idéntica del fuente. Sin peticiones de red explícitas ni envío de contenido. El hospedaje de Pages distribuye archivos estáticos. No incluir riders reales, contactos ni nombres en Git. La persistencia depende del navegador/origen y no se garantiza entre dispositivos; descargar JSON. La aplicación no solicita permisos adicionales.

## Evidencia y límites
- Sintaxis JS: node --check correcto.
- Chromium automatizado: se cargó HTML en el documento de prueba (sin navegación, bloqueada por el entorno); se verificaron 50 personas, micrófono adicional, arrastre con mouse, canales, descarga/reimportación JSON, reset, generación de vista PDF e impresión programática, ancho de viewport 390 px sin desbordamiento global. Sin errores JS ni solicitudes de red observadas durante esa ejecución.
- Pendiente: probar en Android/iOS reales, arrastre táctil, almacenamiento persistente entre recargas en un origen HTTP real, guardado de PDF desde móviles, publicación y acceso bajo subruta Pages, revisión humana de legibilidad y usabilidad.
- Los símbolos indican posiciones y pueden solaparse; no representan dimensiones físicas ni certifican aforo, circulación o seguridad. El equipo técnico debe validar todo requerimiento.
- Estado: in-progress; sin integración a main antes de revisión.
