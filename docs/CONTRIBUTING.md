# Cómo trabajar en el laboratorio

## Ciclo de trabajo

1. Abrir un issue con pregunta, hipótesis, alcance y criterio de éxito.
2. Crear rama `experiment/<slug>` (o `docs/<tema>`, `fix/<tema>`).
3. Crear `experiments/<slug>/README.md` basado en la plantilla; código y dependencias van en esa carpeta.
4. Ejecutar en localhost, preferentemente en servidor estático local para evitar restricciones de `file://`.
5. Probar navegador/hardware previstos, tamaño de archivos, permisos, consumo y errores.
6. Documentar evidencia, limitaciones y tráfico externo observado.
7. Si hay demo estática, generar los archivos en `experimentos/<slug>/` con rutas relativas y registrar el enlace en `experiments.json`.
8. Abrir pull request; describir pruebas ejecutadas y posibles riesgos. Integrar a `main` solo después de revisar.

## Convenciones

- Slugs cortos en minúsculas y guiones.
- No introducir frameworks globales ni un build monolítico.
- Dependencias por experimento; fijar versiones y registrar sus licencias.
- No tocar otros experimentos salvo cambio transversal deliberado y documentado.
- No subir muestras con datos sensibles; usar archivos sintéticos y pequeños.
- Los resultados deben distinguir **observaciones comprobadas** de hipótesis.
- Estado de ficha: `planned`, `in-progress`, `validated`, `limited`, `archived`.

## Checklist del pull request

- [ ] Cambios confinados al experimento o justificación explícita.
- [ ] README actualizado con comandos y requisitos.
- [ ] Pruebas realizadas y limitaciones documentadas.
- [ ] Sin secretos, archivos personales ni modelos pesados.
- [ ] Tráfico de red y servicios externos explicados.
- [ ] Demo probada bajo subruta de GitHub Pages si corresponde.
- [ ] Catálogo actualizado solo si existe ficha que publicar.

## Trabajo asistido por IA

Primero leer este documento, `docs/ARCHITECTURE.md` y el README del experimento concreto. Respetar los límites de carpetas; no reestructurar todo el repositorio por una prueba puntual. No afirmar que un experimento funciona sin pruebas y no introducir servicios remotos silenciosamente.
