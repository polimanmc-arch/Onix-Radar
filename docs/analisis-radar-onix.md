# Análisis de Radar Onix

Fecha: 16 de noviembre de 2026.

El proyecto reúne scanner técnico, backtest semanal y construcción de portafolios. Tiene separación entre configuración, indicadores, flujos de cálculo, estado, interfaz y servicios de datos. La identidad visual está definida: azul cian y verde sobre fondo oscuro, con radar como símbolo.

La revisión encontró errores reproducibles que afectan la presentación de costos, el control de concentración y la medición del riesgo. Las pruebas actuales de indicadores pasan, pero no cubren estos casos del simulador. Conviene resolverlos antes de considerar validados sus resultados.

## Estado a 18 de noviembre de 2026

| # | Hallazgo | Estado |
| --- | --- | --- |
| 1 | Comisión de entrada duplicada | Corregido: al cerrar sólo se suma la comisión de salida |
| 2 | Normalización rompe el máximo por posición | Corregido: `boundWeights` (engine.js) reparte el exceso sin superar el máximo; si no cabe el 100 % queda efectivo. Las entradas reparten el efectivo disponible y cada una se limita a `maxWeight` del valor de cartera |
| 3 | Drawdown sin capital inicial | Corregido en motor y gráfico; los retornos semanales incluyen el primer intervalo y la anualización usa las semanas simuladas. Sortino usa la desviación a la baja sobre todas las semanas |
| 4 | Compilación sin TypeScript | Ya estaba corregido (`typescript` en devDependencies) |
| 5 | Agregación 4H descarta barras | Corregido: el último bloque de cada sesión se emite parcial (7 × 1H → 4H + 3H); `ppy` de 4H pasa a 504 |
| 6 | Covarianza alineada por posición | Corregido: retornos cruzados por periodo (día, semana ISO o mes) por pares |
| 7 | Modos de asignación aproximados | Corregido y documentado: Min Varianza pasa a inversa de la volatilidad, Max Return usa el retorno medio, `equalweight` asigna igual. Siguen siendo heurísticas por señal, sin covarianza |
| 8 | Optimización sin semilla ni mínimo | Corregido: semilla configurable (por defecto 42) y límites [mín, máx] en todas las muestras |

| R1 | Disponibilidad temporal de los datos (riesgo) | Corregido: cada temporalidad usa la última vela **cerrada** al cierre de la semana de señal (mensual: inicio del mes siguiente; resto: inicio + duración). Antes la búsqueda imponía un índice mínimo igual al número de semanas, por lo que la vela mensual podía tener más de un año de retraso y la diaria usaba el lunes en lugar del viernes. Aplica también al filtro de régimen |

Pruebas: `tests/fixes.test.js` (casos que fallan con el código anterior y pasan con el actual) y una prueba de interfaz del informe de rendimiento en `tests/workspace.test.js`.

Mejora añadida: informe de rendimiento en Backtest → Análisis (`public/app/core/performance.js`): mapa de retornos mensuales y anuales, peores drawdowns con duración y recuperación, Sharpe móvil de 26 semanas, mejor/peor semana y mes, y beta, alfa de Jensen, correlación, tracking error e information ratio frente al benchmark.

Mejora añadida: rendimiento histórico de la señal en Scanner (`public/app/core/signalPerformance.js`). Recorre el historial ya descargado del universo escaneado con el mismo evaluador que el backtest (`public/app/core/ruleEvaluator.js`, extraído del backtest sin cambiar resultados) y sólo con velas cerradas. Mide el retorno a tres horizontes por temporalidad base (entrada en la apertura siguiente, salida al cierre) frente a la media de todas las velas evaluables. Una prueba comprueba que el evaluador rápido y el del scanner coinciden en la última vela cerrada para cada indicador.

ATR corregido: el scanner, el backtest, el rendimiento de señales, el gráfico y la tarjeta "ATR 14" usan ahora la misma serie de Wilder (`seriesATRNewestFirst` en indicators.js), sembrada con los TR más antiguos y suavizada hacia la vela más reciente. Antes se suavizaba en sentido inverso y el valor reflejaba sobre todo la volatilidad más antigua (NVDA diario: 1,76 antes frente a 9,71 ahora; media simple de 14 TR: 11,50). Los stops ATR siguen usando la media simple de los últimos TR.

Mejora añadida: optimización walk-forward en Backtest (`public/app/core/walkForward.js`). Hasta 2 parámetros numéricos de las reglas o los stops, rejilla de hasta 64 combinaciones, ventanas IS/OOS móviles o ancladas y objetivo Sharpe, retorno anual, Calmar o Sortino. Muestra la curva OOS encadenada frente a los parámetros actuales en las mismas ventanas, la rejilla completa (optimista), la tabla de tramos, la estabilidad de lo elegido y la eficiencia WF. El backtest admite una ventana (`btEndOffset`) y cede a la interfaz sólo tras 24 ms de cálculo (antes cada 4 semanas: ~30 veces más lento en universos pequeños).

Mejora añadida: composición histórica del S&P 500 (universo "S&P 500 histórico" del Backtest). Datos de https://github.com/fja05680/sp500 (MIT) generados con `node scripts/build-sp500-history.js` en `public/app/config/sp500History.js`; la lógica está en `public/app/core/indexMembership.js`. En cada semana sólo son elegibles los miembros de esa fecha y se vende al salir del índice. Los renombres (FB → META) se resuelven con la fecha de alta de Wikipedia de los miembros actuales. Datos → Composición histórica muestra la cobertura (miembros con historial en Yahoo / tamaño del índice). Limitación: Yahoo no tiene precios de las empresas que dejaron de cotizar, ni se simulan las que no tienen historial completo de la ventana. El backtest descarta además las series cuya última vela es más de 10 días anterior a la del resto (quedarían desplazadas al alinear por posición). Para actualizar los datos basta con volver a ejecutar el script.

La lista "S&P 500" del scanner (`config/universes.js`) sale ahora de los miembros actuales del mismo archivo: antes tenía 57 tickers que ya no pertenecían al índice y le faltaban 84 miembros. `sp500History.js` debe cargarse antes que `universes.js`.

Mejora añadida: alertas por Telegram (`public/app/core/alerts.js`, `scripts/run-alerts.js`, `.github/workflows/telegram-alerts.yml`, ruta `/api/telegram/*`). GitHub Actions ejecuta las alertas de `alerts/alerts.json` de lunes a viernes a las 21:30 UTC y envía sólo las señales nuevas (vela cerrada dentro de la ventana de 26 h y que no pasaba en la vela anterior, sin guardar estado). En el scanner hay un botón de envío manual (texto generado en el servidor, con límite de frecuencia) y la exportación de los filtros actuales como alerta. Configuración en el README. Corrección asociada: la clave de fecha del portafolio desplazaba al día siguiente las velas diarias de EE. UU. (13:30 UTC + 12 h); ahora usa +6 h.

Backtest con historial parcial: los valores con al menos 30 velas semanales participan desde que tienen datos (salidas a bolsa o altas recientes) en lugar de descartarse por no cubrir todo el periodo. El calendario semanal sale de la serie válida más larga. Datos y diagnóstico indica cuántos valores tienen historial parcial.

Indicadores verificados contra implementaciones de referencia independientes (`tests/indicatorReference.test.js`). Además, `tests/tradingSignals.test.js` compara los indicadores con la librería trading-signals.

Cotizaciones y fundamentales: las llamadas propias a `/v7/finance/quote` y `/v10/finance/quoteSummary` devolvían vacío porque Yahoo exige cookie y *crumb*; los filtros fundamentales del scanner y el enriquecimiento del portafolio no recibían datos. Ahora se usa yahoo-finance2 (Node 22+) con el cliente propio como respaldo. Las alertas de Telegram adjuntan también los fundamentales cuando la alerta los usa.

Mejora añadida: portafolio con modo HRP (Hierarchical Risk Parity de López de Prado: distancia de correlación, enlace simple, orden cuasi-diagonal y bisección recursiva por varianza; no invierte la covarianza) y tarjeta X-ray en Resumen con avisos de posición dominante (>25 %), tres mayores (>50 %), sector (>40 %), diversificación efectiva (<5 posiciones equivalentes), pares con correlación >0,8 y efectivo sin invertir.

## Alcance y comprobaciones

Se revisaron la estructura, las entradas de la aplicación, los flujos de scanner/backtest/portafolio, la configuración de temporalidades, persistencia, servicios y cachés, rutas, compilación, pruebas e identidad visual. No es una certificación financiera ni una auditoría exhaustiva de cada interacción.

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd test` | 35 pruebas, 8 grupos, todas pasan |
| Sintaxis con `node --check` | 47 archivos JavaScript sin errores; excluye las fuentes JSX y comprueba sus versiones compiladas existentes |
| `npm.cmd run build:client` | Falla: `Cannot find module 'typescript'` |
| HTTP local de inicio | 200 |
| HTTP local de la portada | 200 |
| POST `/api/charts` con lista vacía | Respuesta válida, cero resultados |
| Diagnósticos sintéticos | Reproducen comisiones duplicadas, límites de pesos, drawdown y pérdida de barras al agregar 4H |

Los diagnósticos ejecutan fragmentos del código actual con entradas controladas. No sustituyen una prueba integral del flujo de backtest. No se descargaron precios, no se ejecutó un backtest real ni se verificó visualmente la aplicación en navegador. No se cambió la lógica del simulador.

## Hallazgos prioritarios

### 1. El contador duplica la comisión de entrada al cerrar una operación — alta

Ubicaciones: [backtestWorkflow.js:1115](../public/app/core/backtestWorkflow.js#L1115) y [backtestWorkflow.js:1159](../public/app/core/backtestWorkflow.js#L1159).

La entrada suma `entryCommission`. El cierre vuelve a sumar `entryCommission + exitCommission`. Con 10 de entrada y 10 de salida, `totalCommissionPaid` devuelve 30 en lugar de 20. Esta duplicación afecta el contador informado; el efectivo y el PnL usan cálculos separados y no deben describirse como duplicados por este mismo hallazgo.

Corrección propuesta: sumar únicamente `exitCommission` en el contador al cerrar; verificar operaciones abiertas y cerradas por separado.

### 2. La normalización puede romper el límite máximo por posición — alta

Ubicación: [backtestWorkflow.js:977](../public/app/core/backtestWorkflow.js#L977).

`buildTargetWeights` recorta pesos y después los divide entre su suma. La segunda operación puede volver a superar el límite. Con cuatro señales de puntuación `[100, 1, 1, 1]`, mínimo 1% y máximo 40%, el resultado asigna aproximadamente **93,02%** a la primera.

Corrección propuesta: redistribuir entre posiciones que conservan capacidad y definir el efectivo residual cuando no sea posible invertir todo respetando los límites. Revisar también cuánto capital ya está invertido antes de asignar nuevas entradas.

### 3. El drawdown omite la pérdida desde el capital inicial — alta

Ubicación: [backtestWorkflow.js:1185](../public/app/core/backtestWorkflow.js#L1185).

El máximo histórico empieza en cero y la curva no contiene un punto inicial con el capital. Con capital inicial 100 y valores posteriores `[90, 95]`, el cálculo devuelve 0% de drawdown; desde el capital inicial corresponde 10%. Esto también puede alterar Calmar.

Corrección propuesta: incluir el valor inicial en la curva y usarlo como primer máximo. Revisar que los retornos semanales incluyan el primer intervalo y que la anualización corresponda al período efectivamente simulado.

### 4. El cliente no se puede recompilar con las dependencias declaradas — alta

Ubicaciones: [precompile-jsx.js:3](../scripts/precompile-jsx.js#L3) y [package.json](../package.json).

El script requiere `typescript`, pero el paquete no está declarado y falta en el entorno. La aplicación dispone de archivos previamente compilados, por lo que servir la página no demuestra que los cambios en JSX se puedan construir.

Corrección propuesta: declarar TypeScript como dependencia de desarrollo compatible con las opciones del script y verificar una instalación limpia seguida de compilación. No se instaló ni modificó esa dependencia durante esta revisión.

### 5. La agregación 4H descarta el resto de cada día — media

Ubicación: [engine.js:5](../public/app/core/engine.js#L5).

La agregación vacía el búfer al cambiar de día y solo emite grupos completos de cuatro barras. Una entrada sintética de siete barras horarias del mismo día produce una sola barra 4H: quedan fuera tres barras horarias. Los extremos de precio de las barras descartadas tampoco llegan a la serie agregada usada por los stops.

Corrección propuesta: definir el tratamiento de la última vela parcial de cada sesión y conservar su cobertura, distinguiendo barras cerradas y en formación. Validar además gaps y períodos sin datos intradía.

### 6. La covarianza del portafolio alinea por posición, sin cruzar fechas — media

Ubicación: [portfolioWorkflow.js:144](../public/app/core/portfolioWorkflow.js#L144).

Correlaciones y covarianzas toman un número común de retornos y los comparan por índice. Si dos series tienen huecos distintos, pueden emparejar períodos diferentes. Aunque existe `timePath`, no se usa para ese cruce.

Corrección propuesta: construir retornos por intervalo temporal y cruzar las fechas comunes antes de calcular la matriz.

### 7. Los modos de asignación del backtest usan aproximaciones distintas del optimizador — media

Ubicaciones: [backtestWorkflow.js:885](../public/app/core/backtestWorkflow.js#L885) y [backtestWorkflow.js:977](../public/app/core/backtestWorkflow.js#L977).

La puntuación base es un cociente de media y desviación de retornos recientes. El modo `minvol` usa el inverso del valor absoluto de esa puntuación, no la volatilidad; `maxret` recibe como momentum la misma puntuación. El modo `portfolio` selecciona una regla de pesos según `pfMode`, sin reutilizar los pesos ni la matriz de covarianza del optimizador de portafolios.

Corrección propuesta: documentar las aproximaciones o implementar los criterios que anuncian los nombres de cada modo.

### 8. La optimización de portafolios carece de semilla y no aplica el mínimo en el muestreo — media

Ubicación: [portfolioWorkflow.js:207](../public/app/core/portfolioWorkflow.js#L207).

El muestreo usa `Math.random()`, por lo que no permite repetir exactamente la selección. `drawWeights` limita el máximo, pero no impone `minW`; el mínimo sí se utiliza en el camino separado de pesos iguales. El tratamiento de límites difiere entre modos.

Corrección propuesta: permitir semilla, guardar configuración y aplicar restricciones consistentes a todos los candidatos.

## Riesgos que requieren validación adicional

- **Disponibilidad temporal de los datos:** la alineación busca timestamps anteriores al ancla, sin representar explícitamente el instante de cierre de todas las temporalidades. Validar con casos históricos que un cierre mensual o semanal no pueda usarse antes de estar disponible.
- **Stops y orden de ejecución:** revisar las ventanas intradía frente a la fecha real de entrada y la prioridad entre salida por regla y stop. La reproducción completa debe incluir gaps, entradas recientes y datos 4H ausentes.
- **Filtro de régimen:** cuando está habilitado y faltan datos del mercado, `checkMktRegimeRules` permite las entradas. Conviene indicar claramente que no se aplicó el filtro o detener el cálculo según una política explícita.
- **Universo histórico:** revisar el sesgo al usar listas actuales o resultados actuales del scanner en simulaciones históricas; no se identificó un universo con componentes históricos por fecha.
- **Datos y operación:** la caché de gráficos en disco tiene TTL predeterminado de 12 horas. Comprobar que sea adecuado para cada uso y mostrar la antigüedad de los datos. Las bibliotecas del navegador se descargan desde CDN; la ejecución depende de su disponibilidad.
- **Mantenimiento:** `main.js` concentra coordinación importante y los controladores son placeholders. README todavía usa el nombre Probus y el comentario de carga JSX menciona Babel en runtime aunque la página carga archivos compilados.

## Orden sugerido

1. Corregir contabilidad, restricciones de pesos y drawdown, con casos sintéticos del motor completo.
2. Hacer reproducible la compilación desde una instalación limpia.
3. Validar cierre de velas, calendario común, cobertura 4H y ejecución de stops.
4. Unificar la semántica de los modos de asignación y permitir semillas.
5. Ampliar las pruebas más allá de indicadores y actualizar documentación y diagnóstico de datos.

## Portada entregada

[Abrir portada PNG](../public/assets/radar-onix-portada-v1.png).

Arte horizontal con el título **RADAR ONIX**, subtítulo **SIMULADOR DE ESTRATEGIAS** y línea **SCANNER · BACKTESTING · PORTAFOLIOS**. Conserva el fondo oscuro, cian y verde de la marca y representa sus tres funciones con radar, gráficos y distribución de portafolio. Es ilustración promocional, no una captura de resultados reales.

Generada con la herramienta integrada `image_gen`; el [prompt completo](analisis/prompt-portada.txt) queda guardado para posteriores versiones. El archivo se incorporó a `public/assets` y se verificó que el servidor lo entrega correctamente. No se añadió un banner a la interfaz.

Para repetir los diagnósticos: `node docs/analisis/verificar-hallazgos.cjs`. La [salida de esta revisión](analisis/resultados-verificacion.json) queda guardada junto al script.
