# Nuevo workspace de Radar Onix

Inspiración: superficies sobrias, navegación discreta y jerarquía de paneles de las referencias aportadas por el usuario. La identidad, controles y funciones son de Radar Onix.

## Diseño implementado

- Barra lateral con Scanner, Portafolio y Backtest; se convierte en navegación horizontal en pantallas pequeñas.
- Cabecera compacta con estado de conexión y cambio de tema. Tema oscuro de carbón y acento lavanda; tema claro conservado.
- Scanner en dos columnas: resultados e inspector de velas/volumen. Al pulsar una fila se actualiza el inspector; el botón Ampliar gráfico y el doble clic mantienen acceso al análisis completo existente. En pantallas estrechas, el inspector pasa debajo de la tabla.
- Universo y filtros plegados por defecto para nuevas sesiones; se respeta la preferencia guardada. Presets dentro de un desplegable. Resumen de conteos en una franja; actividad oculta hasta solicitarla.
- Backtest separado en Resumen, Operaciones, Análisis y Datos y diagnóstico. Tras recibir un resultado, se ocultan reglas y opciones para dar prioridad al informe.
- Portafolio separado en Resumen, Posiciones y Correlación. Configuración plegada tras obtener resultados.

## Menos trabajo para el navegador

El inspector reutiliza la caché del escaneo y descarga datos solo si se selecciona una temporalidad que falta. Muestra inicialmente hasta 150 velas, conservando el historial para calcular indicadores y permitir desplazamiento. Libera los gráficos al cambiar de símbolo o salir y no los recrea al recibir líneas de actividad. Solo se montan los informes de Backtest y Portafolio correspondientes a la vista seleccionada. Los paneles usan superficies opacas, sin filtros de desenfoque ni sombras costosas.

El inspector comparte el motor de medias y osciladores del gráfico ampliado. Incluye controles de visibilidad por indicador, selector de temporalidad, valores y estado de reglas, y tarjetas de mercado y análisis técnico con datos disponibles. Las tarjetas reutilizan los cálculos del modal. La serie histórica de ATR reproduce el cálculo existente del motor con sufijos ponderados en tiempo lineal.

Las pestañas del backtest aprovechan la altura disponible: tabla de operaciones hasta la altura del viewport menos los controles, curva de capital entre 280 y 560 px, drawdown entre 100 y 200 px y gráficos de análisis entre 280 y 430 px. La distribución circular mide hasta 320 px, con leyendas más grandes y adaptación a pantallas pequeñas.

Estas mejoras reducen renderizado y cálculos de las vistas ocultas; no representan una medición de descarga de precios ni una promesa de tiempo de ejecución. Se conservan las optimizaciones previas del scanner y del cálculo de portafolios.

## Validación

`npm test` recompila primero el cliente y ejecuta indicadores, workflows e integración de React. Los casos de interfaz verifican navegación, selección del inspector, datos de velas ordenados, liberación de gráficos, plegado de opciones y montaje exclusivo de la vista activa. El compilador no escribe los archivos generados si encuentra errores de transpilación.

La validación de interacción se hizo con React Test Renderer y adaptadores de DOM/gráficos; no se realizó comprobación visual en Chrome porque la conexión al navegador no está disponible. Debe revisarse el ajuste visual con datos reales al abrir la aplicación.

## Interacciones del backtest

La configuración agrupa Simulación, Asignación y Riesgo y costos, con campos de ancho moderado. Los presets quedan en un desplegable secundario. En pantallas estrechas los grupos se apilan.

Cada cabecera de Operaciones es un botón que alterna orden ascendente y descendente. Los precios, fechas, retornos, PnL y duración usan su valor numérico; el texto usa comparación natural. Los datos ausentes quedan al final y no se modifica el resultado original ni el orden del CSV exportado.

La curva de capital y el drawdown tienen tooltip, guía de cursor, interacción táctil y navegación por teclado (flechas, Inicio, Fin, Escape). El tooltip muestra el punto de la estrategia seleccionado y los valores comparativos interpolados en la misma posición horizontal que sus líneas. El SVG base se conserva al mover el cursor. El drawdown siempre se representa con línea; se retiraron el selector y su preferencia guardada.

## Portada

[Portada del nuevo workspace](../public/assets/radar-onix-portada-workspace-v6.png). Es una ilustración generada con la herramienta integrada de imágenes, basada en la estructura implementada; no es una captura real. [Prompt completo](analisis/prompt-portada-workspace-v6.txt).
