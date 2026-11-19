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

Yahoo Finance · Nasdaq Screener · Composición histórica del S&P 500: [fja05680/sp500](https://github.com/fja05680/sp500) (MIT). Para actualizarla: `node scripts/build-sp500-history.js`.

Cotizaciones, fundamentales, sector e industria se obtienen con [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) (MIT), que gestiona la cookie y el *crumb* que Yahoo exige. Requiere **Node 22+**: en Streamlit Cloud, si el Node del sistema es anterior, el arranque descarga el Node 22 oficial de nodejs.org y verifica su SHA-256 (`ONIX_PROVISION_NODE=0` lo desactiva). Sin Node 22, o con `ONIX_YF2=0`, se usa el cliente propio, cuyos precios siguen funcionando. `/api/health` indica la versión de Node y si yahoo-finance2 está activo.

## Alertas por Telegram

Dos formas de recibir señales del scanner en Telegram:

- **Alertas diarias automáticas** (GitHub Actions, `.github/workflows/telegram-alerts.yml`): de lunes a viernes a las 21:30 UTC, después del cierre de Wall Street, se ejecutan las alertas de `alerts/alerts.json` y se envían solo las **señales nuevas**: valores que cumplen los filtros en una vela cerrada desde la ejecución anterior y no los cumplían en la vela previa. Funciona aunque la app de Streamlit esté dormida.
- **Botón "Enviar a Telegram"** en el scanner, para mandar los resultados del escaneo actual.

### Configuración (una sola vez)

1. En Telegram, habla con [@BotFather](https://t.me/BotFather), envía `/newbot` y guarda el **token** que te da.
2. Envía cualquier mensaje a tu bot y abre `https://api.telegram.org/bot<TOKEN>/getUpdates`: el número de `"chat":{"id": ...}` es tu **chat id**. Para un grupo, añade el bot al grupo y repite el paso.
3. **GitHub** → repositorio → Settings → Secrets and variables → Actions → *New repository secret*: crea `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
4. **Streamlit Cloud** (solo para el botón) → tu app → Settings → Secrets:
   ```toml
   TELEGRAM_BOT_TOKEN = "123456:ABC..."
   TELEGRAM_CHAT_ID = "123456789"
   ```
5. Prueba: GitHub → Actions → *Alertas Telegram* → *Run workflow* (marca *dry run* para ver los mensajes sin enviarlos).

El token solo vive en esos secretos: nunca llega al navegador. El botón de la app tiene un límite de un envío cada 15 segundos y 40 al día.

### Definir alertas

En el scanner, **Alerta diaria…** muestra la definición con el universo y los filtros actuales. Cópiala dentro de la lista `"alerts"` de `alerts/alerts.json` y súbela a GitHub. Campos:

| Campo | Descripción |
| --- | --- |
| `id`, `name` | Identificador único y título del mensaje |
| `universe` | Universo predefinido (`"SP500"`, `"NASDAQ100"`, `"DOW30"`…) o lista de ellos; o bien `tickers` con símbolos |
| `direction` | `"long"` o `"short"` |
| `filters` | Filtros del scanner (mismo formato que la app) |
| `notifyEmpty` | `true` para recibir también un mensaje cuando no haya señales nuevas |
| `enabled` | `false` para pausar la alerta |

Probar en local: `node scripts/run-alerts.js --dry-run` (añade `--window-hours 240` para ver señales de los últimos días).
