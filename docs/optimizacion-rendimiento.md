# Optimización de rendimiento

## Cambios

- Scanner: trabajadores con concurrencia limitada sustituyen los lotes que esperaban al símbolo más lento. Cada hueco disponible toma el siguiente ticker; el orden final sigue siendo el del universo de entrada.
- Resultados y progreso: publicación como máximo cada 250 ms, más publicación final obligatoria al terminar o cancelar. Registro agrupado y limitado a 80 líneas. Los resultados parciales se conservan al cancelar y se omite la descarga posterior de sectores.
- Gráficos pequeños: `React.memo` evita recalcular cada sparkline cuando sus datos y dimensiones no cambian.
- Portafolios: medias y retornos centrados se calculan una vez. Las correlaciones se evalúan para las parejas requeridas por selección y para la matriz final; desaparece la matriz completa N × N del universo.
- Portafolios: muestreo en bloques de 64 con pausas cooperativas cuando se supera el presupuesto de 16 ms. La interfaz puede procesar eventos durante el cálculo. No se redujo el número solicitado de simulaciones.

## Validación local

Comparación con copias del código anterior en `.cache/perf-baseline`, precios sintéticos y la misma secuencia pseudoaleatoria. Se comprobó igualdad exacta de los resultados del scanner y del objeto completo de portafolio, incluido el caso de 1.000 símbolos. También se comprobaron concurrencia, cancelación, errores y publicación de resultados.

Medición ilustrativa de la última comparación antes del ajuste del fallback de historial:

| Caso controlado | Antes | Después |
| --- | ---: | ---: |
| Scanner, 24 símbolos, respuestas de 3/45 ms, concurrencia 4 | 293 ms | 153 ms |
| Portafolio, 1.000 símbolos, filtro de correlación desactivado, 200 muestras | 638 ms | 152 ms |
| Portafolio, 50 símbolos, filtro activado, 8.000 muestras | 80 ms | 80 ms |
| Portafolio, 50 símbolos, filtro desactivado, 8.000 muestras | 212 ms | 231 ms |

En los dos casos pequeños el código anterior atendió cero ticks del temporizador durante el cálculo; el nuevo atendió 4 y 9. Ceder tiempo a la interfaz puede añadir tiempo total en trabajos pequeños; su finalidad es mantener la respuesta a eventos. Los tiempos varían por carga del equipo y no son una medición de Yahoo ni del navegador del usuario.

`npm test` ejecuta indicadores y regresiones de workflows. Las comparaciones antes/después son opcionales: se habilitan con `ONIX_PERF_BASELINE` apuntando a las copias locales anteriores. Estas copias están en la caché ignorada por Git y no se requieren para las pruebas habituales.

No se cambian fórmulas de señales ni políticas de precios. La primera descarga de miles de símbolos sigue dependiendo del proveedor y de la red. No se verificó visualmente en Chrome durante este cambio.
