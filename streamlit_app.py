"""Entry point for Streamlit Community Cloud: streamlit run streamlit_app.py."""
import os
import streamlit as st
import streamlit.components.v1 as components

from streamlit_runtime import frontend_version as compute_frontend_version, get_runtime, prepare_frontend

st.set_page_config(page_title='Radar Onix', page_icon='📊', layout='wide', initial_sidebar_state='collapsed')
st.markdown('''<style>
  header[data-testid="stHeader"], [data-testid="stToolbar"],
  [data-testid="stDecoration"], footer, #MainMenu {display: none!important;}
  .stMainBlockContainer {padding: 0!important; max-width: none!important;}
  [data-testid="stMain"] {padding: 0!important;}
  .stMainBlockContainer > div {gap: 0!important;}
  .stElementContainer:has(iframe[title*="onix_radar"]) {margin: 0!important;}
  iframe[title*="onix_radar"] {display: block; border: 0; width: 100%;}
</style>''', unsafe_allow_html=True)


# Secretos de Telegram (App settings → Secrets) para el proceso de Node; nunca llegan al navegador.
for _key in ('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'):
    try:
        _value = st.secrets.get(_key)
    except Exception:  # sin archivo de secretos
        _value = None
    if _value and not os.environ.get(_key):
        os.environ[_key] = str(_value)


# Copia del frontend: una sola entrada en caché (la de la versión actual).
@st.cache_resource(max_entries=1, show_spinner=False)
def frontend_copy(frontend_version):
    return prepare_frontend()


try:
    frontend_version = compute_frontend_version()
    frontend = frontend_copy(frontend_version)
    # Un único servidor de Node: se reutiliza entre ejecuciones y se reinicia (cerrando el anterior)
    # sólo si cambia su código o se ha caído.
    with st.spinner('Iniciando Radar Onix…'):
        runtime = get_runtime()
except Exception as error:
    st.error(f'No se pudo iniciar Radar Onix: {error}')
    st.stop()

# A running component keeps its iframe across Python reruns. Change its URL on
# frontend releases so existing Cloud sessions actually load the updated bridge.
radar = components.declare_component(f'onix_radar_{frontend_version[:12]}', path=str(frontend))
value = radar(response=st.session_state.get('radar_response'), key='radar_workspace', default=None)
if isinstance(value, dict) and value.get('batch_id') and value.get('batch_id') != st.session_state.get('radar_last_batch'):
    st.session_state.radar_response = runtime.batch(value)
    st.session_state.radar_last_batch = value['batch_id']
    st.rerun()
