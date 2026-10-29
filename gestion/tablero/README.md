# Tablero de gestión DevWatch

Tablero de seguimiento del proyecto: avance y costo (valor ganado, SPI), curva S,
ruta crítica y holguras, simulador de postergaciones y matriz de riesgos.

Está publicado como Artifact de Claude: https://claude.ai/artifact/JFLpjtfkY97VU3soDUA6XV
(privado; se comparte desde el menú **Share**).

## Archivos

| Archivo                     | Qué es                                                                    |
| --------------------------- | ------------------------------------------------------------------------- |
| `actualizar-cronograma.mjs` | Baja el proyecto «Cronograma DevWatch» de GitHub Projects a `cronograma.json`. |
| `cronograma.json`           | Las 17 actividades de la EDT: estado, hito, horas, costo, predecesoras y fechas. |
| `riesgos.json`              | Riesgos R1–R7 del Acta de Constitución, con las tareas que afecta cada uno. |
| `calcs.js`                  | Cálculos del tablero: ruta crítica, valor ganado, pronóstico, escenarios y riesgos. |
| `index.html`                | Página del tablero (usa la API de dashboards de Claude, no se abre suelta). |

## Actualizar el cronograma

Los datos salen del Project de GitHub, donde se cargan el estado de cada tarea y los
campos Horas/Costo, Predecesoras, Fecha inicio, Fecha fin y Ruta critica.

```bash
gh auth refresh -s read:project   # una sola vez
node actualizar-cronograma.mjs    # escribe cronograma.json
node actualizar-cronograma.mjs --campos   # lista los campos del Project
```

El tablero publicado se actualiza solo todas las mañanas (alrededor de las 8) con una tarea
programada de Claude, que corre este script y sube el resultado al Artifact.
