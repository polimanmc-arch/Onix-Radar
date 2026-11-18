"""Entry point for Streamlit Community Cloud: streamlit run streamlit_app.py."""
import streamlit as st
import streamlit.components.v1 as components

from streamlit_runtime import NodeRuntime, prepare_frontend

st.set_page_config(page_title='Radar Onix', page_icon='📊', layout='wide', initial_sidebar_state='collapsed')
st.markdown('''<style>
  .stMainBlockContainer {padding: .5rem!important; max-width: none!important;}
  iframe[title*="onix_radar"] {border: 0; width: 100%;}
</style>''', unsafe_allow_html=True)


@st.cache_resource(show_spinner='Iniciando Radar Onix…')
def resources():
    return NodeRuntime(), prepare_frontend()


try:
    runtime, frontend = resources()
    if runtime.process.poll() is not None:
        resources.clear()
        runtime, frontend = resources()
except Exception as error:
    st.error(f'No se pudo iniciar Radar Onix: {error}')
    st.stop()

radar = components.declare_component('onix_radar', path=str(frontend))
value = radar(response=st.session_state.get('radar_response'), key='radar_workspace', default=None)
if isinstance(value, dict) and value.get('batch_id') and value.get('batch_id') != st.session_state.get('radar_last_batch'):
    st.session_state.radar_response = runtime.batch(value)
    st.session_state.radar_last_batch = value['batch_id']
    st.rerun()
