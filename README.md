# Radar Onix

## Publicar en Streamlit Community Cloud

1. En [Streamlit](https://share.streamlit.io/), conecta GitHub y selecciona **Create app**.
2. Repositorio: `polimanmc-arch/Onix-Radar`; rama: `main`; archivo: `streamlit_app.py`.
3. En opciones avanzadas, selecciona Python **3.12** y pulsa **Deploy**.
4. Comparte la dirección `https://….streamlit.app` que genere Streamlit.

No necesitas claves ni exponer el puerto de Node. `requirements.txt` instala Streamlit y
`packages.txt` instala Node y npm; al iniciar se instalan las dependencias del servidor.
La interfaz React se conserva dentro de un componente de Streamlit. Las consultas pasan
por Python hacia un servidor Node interno. El primer inicio puede tardar varios minutos.
Los archivos de caché se regeneran al reiniciar el alojamiento; no son almacenamiento permanente.
Los datos dependen de la disponibilidad de Yahoo Finance y Nasdaq desde el alojamiento.
En un alojamiento compartido, los escaneos y backtests grandes comparten los recursos disponibles.

Para probar este despliegue localmente, con Node.js 18+ y Python 3.12:

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

Scanner técnico de acciones multi-temporalidad con backtest integrado.

## Setup

```bash
npm install
npm start
```

Abre **http://localhost:3000** en tu navegador.

```bash
# Tests de indicadores
npm test
```

## Qué hace

**Scanner** — Escanea universos (S&P 500, NASDAQ 100, Dow 30 o lista propia) aplicando filtros técnicos configurables. Soporta señales Long y Short, concurrencia ajustable, y score de calidad de señal.

**Backtest** — Verifica históricamente tus reglas de entrada/salida con grupos de condiciones OR-AND, stops ATR o %, costos de transacción, y comparación de múltiples estrategias guardadas.

**Portafolio** — Construye y optimiza portafolios desde los resultados del scanner. Frontera eficiente por muestreo, filtro de correlación, y stops individuales.

## Indicadores

WMA · SMA · EMA · RSI · Estocástico %K · MACD Histograma · ATR · Precio · Volumen · Cambio %

## Temporalidades

1M · 1W · 1D · 4H (agregado desde 1H)

## Datos

Yahoo Finance · Nasdaq Screener
