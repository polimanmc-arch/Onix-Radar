"""Entry point for Streamlit Community Cloud: streamlit run streamlit_app.py."""
import streamlit as st
import streamlit.components.v1 as components
import hashlib

from streamlit_runtime import ROOT, NodeRuntime, prepare_frontend

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


@st.cache_resource(show_spinner='Iniciando Radar Onix…')
def resources(frontend_version):
    return NodeRuntime(), prepare_frontend()


try:
    frontend_version = hashlib.sha256((ROOT / 'public/app/streamlitBridge.js').read_bytes()).hexdigest()
    runtime, frontend = resources(frontend_version)
    if runtime.process.poll() is not None:
        resources.clear()
        runtime, frontend = resources(frontend_version)
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
