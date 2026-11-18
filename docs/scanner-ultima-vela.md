# Scanner: última vela cerrada por temporalidad

Se eliminó el ancla común de fecha del scanner. Antes se elegía el timestamp más antiguo entre las penúltimas barras descargadas y se retrocedían todas las series hasta esa fecha. Por ejemplo, un filtro mensual podía desplazar los diarios y semanales hacia velas anteriores; la serie diaria descargada para los minigráficos también participaba en el ancla.

Ahora cada temporalidad requerida por los filtros se evalúa de forma independiente, usando el índice 1 de su serie ordenada de reciente a antigua. Se conserva la convención existente de la aplicación: índice 0 como vela actual y 1 como última cerrada. Este cambio no implementa un calendario de sesiones ni detecta si la última barra del proveedor ya quedó cerrada fuera del horario de mercado.

Todos los filtros del lado seleccionado deben pasar en esas barras. Las condiciones de cruce comparan esa barra con su predecesora, sin buscar coincidencias antiguas. El precio del resultado usa la misma barra principal. Cada resultado incluye `signalTimes` con la fecha evaluada por temporalidad.

Las tarjetas del mini gráfico, sin cursor activo, usan esas fechas para mostrar valores y estados de la señal. Al mover el cursor siguen mostrando la vela apuntada, con la etiqueta Cursor, y al retirarlo vuelven a la última cerrada.

Pruebas de regresión: filtros diarios, semanales y mensuales con valores distintos en las últimas barras y en el pasado; cruces long/short que solo aparecen en la última cerrada frente a cruces antiguos o exclusivos de la vela actual; concordancia de tarjetas con el resultado del scanner.
