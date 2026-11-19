"""Run the existing Node API behind a Streamlit component, without a public port."""
from __future__ import annotations

import atexit
from concurrent.futures import ThreadPoolExecutor
import json
import hashlib
import io
import os
import platform
import tarfile
import tempfile
import threading
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
ALLOWED_API = re.compile(r"^/api/(?:health|tickers|quotes|sectors|chart/[A-Za-z0-9.^=\-]+|charts(?:/cache/(?:check|stats|prune))?|telegram/(?:status|send))$")


FRONTEND_SUFFIXES = {'.html', '.js', '.css', '.svg', '.json'}


def frontend_version() -> str:
    """Hash of every text asset in public/: any frontend change yields a new version.

    Streamlit Cloud can keep the Python process alive after a git push, so the cached
    frontend copy and the component URL must change whenever any served file changes,
    not only the bridge script.
    """
    digest = hashlib.sha256()
    for file in sorted((ROOT / 'public').rglob('*')):
        if file.is_file() and file.suffix.lower() in FRONTEND_SUFFIXES:
            digest.update(file.relative_to(ROOT).as_posix().encode('utf-8'))
            digest.update(file.read_bytes())
    return digest.hexdigest()


MIN_NODE_MAJOR = 22  # yahoo-finance2 (cotizaciones y fundamentales) requiere Node 22+
NODE_DIST = 'https://nodejs.org/dist/latest-v22.x/'


def node_major(node: str | None) -> int:
    if not node:
        return 0
    try:
        out = subprocess.run([node, '-v'], capture_output=True, text=True, timeout=15).stdout.strip()
        return int(out.lstrip('v').split('.')[0])
    except (OSError, ValueError, subprocess.SubprocessError):
        return 0


def node_platform() -> str | None:
    """Sufijo de los binarios oficiales de Node para este sistema (sólo Linux, como Community Cloud)."""
    if platform.system().lower() != 'linux':
        return None
    arch = {'x86_64': 'x64', 'amd64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(platform.machine().lower())
    return f'linux-{arch}' if arch else None


def provision_node(dest: Path | None = None, suffix: str | None = None, opener=urlopen, verify: bool = True) -> Path | None:
    """Descarga el último Node 22 oficial de nodejs.org y comprueba su SHA-256 con SHASUMS256.txt."""
    suffix = suffix or node_platform()
    if not suffix:
        return None
    dest = dest or ROOT / '.cache' / 'node22'
    for existing in sorted(dest.glob(f'node-v*-{suffix}/bin/node')):
        if not verify or node_major(str(existing)) >= MIN_NODE_MAJOR:
            return existing
    with opener(NODE_DIST + 'SHASUMS256.txt', timeout=30) as response:
        sums = response.read().decode('utf-8')
    entry = next((line.split() for line in sums.splitlines() if line.endswith(f'-{suffix}.tar.xz')), None)
    if not entry or len(entry) != 2:
        raise RuntimeError(f'No hay binario de Node para {suffix}.')
    expected, name = entry
    dest.mkdir(parents=True, exist_ok=True)
    # En streaming a un archivo temporal: no se carga el binario entero en memoria.
    digest = hashlib.sha256()
    with tempfile.NamedTemporaryFile(dir=dest, suffix='.tar.xz', delete=False) as tmp:
        tmp_path = Path(tmp.name)
        with opener(NODE_DIST + name, timeout=300) as response:
            while chunk := response.read(1 << 20):
                digest.update(chunk)
                tmp.write(chunk)
    try:
        if digest.hexdigest() != expected:
            raise RuntimeError('La suma SHA-256 del binario de Node no coincide: no se usa.')
        with tarfile.open(tmp_path, mode='r:xz') as archive:
            archive.extractall(dest, filter='data')
    finally:
        tmp_path.unlink(missing_ok=True)
    node = dest / name[:-len('.tar.xz')] / 'bin' / 'node'
    if verify and node_major(str(node)) < MIN_NODE_MAJOR:
        return None
    return node


def choose_node() -> str | None:
    """Node del sistema si es 22+; si no, intenta el oficial descargado. Ante cualquier fallo, el del sistema."""
    system = shutil.which('node')
    if node_major(system) >= MIN_NODE_MAJOR or os.environ.get('ONIX_PROVISION_NODE', '1') == '0':
        return system
    try:
        provisioned = provision_node()
        if provisioned:
            return str(provisioned)
    except Exception as error:  # la app sigue con el Node del sistema y el cliente de Yahoo propio
        print(f'[Radar Onix] Node {MIN_NODE_MAJOR} no disponible: {error}', flush=True)
    return system


def server_version() -> str:
    """Huella del código que ejecuta Node: si no cambia, se reutiliza el mismo servidor."""
    digest = hashlib.sha256()
    files = [ROOT / 'server.js', ROOT / 'package-lock.json', *sorted((ROOT / 'server').rglob('*.js')),
             ROOT / 'public' / 'app' / 'core' / 'alerts.js']
    for file in files:
        if file.is_file():
            digest.update(file.relative_to(ROOT).as_posix().encode('utf-8'))
            digest.update(file.read_bytes())
    return digest.hexdigest()


_runtime_lock = threading.Lock()
_runtime: 'NodeRuntime | None' = None
_runtime_key: str | None = None


def get_runtime() -> 'NodeRuntime':
    """Un único servidor de Node por proceso de Streamlit.

    Antes se guardaba en st.cache_resource con la versión del frontend como clave: cada despliegue
    creaba un servidor nuevo sin cerrar los anteriores y la app acababa sin memoria.
    """
    global _runtime, _runtime_key
    key = server_version()
    with _runtime_lock:
        alive = _runtime is not None and _runtime.process.poll() is None
        if alive and _runtime_key == key:
            return _runtime
        if _runtime is not None:
            _runtime.close()
        _runtime, _runtime_key = None, None
        _runtime = NodeRuntime()
        _runtime_key = key
        return _runtime


def prepare_frontend() -> Path:
    """Keep a generated copy: the local Node app and source assets stay intact."""
    destination = ROOT / '.cache' / 'streamlit_frontend'
    shutil.copytree(ROOT / 'public', destination, dirs_exist_ok=True)
    index = destination / 'index.html'
    html = index.read_text(encoding='utf-8')
    html = html.replace('src="/', 'src="./').replace('href="/', 'href="./')
    version = frontend_version()[:12]
    # Cache-busting for every local script and stylesheet so browsers never mix releases.
    html = re.sub(r'(src|href)="\./([^"?]+\.(?:js|css))"', lambda m: f'{m.group(1)}="./{m.group(2)}?v={version}"', html)
    index.write_text(html, encoding='utf-8')
    for file in (destination / 'app').rglob('*.js'):
        source = file.read_text(encoding='utf-8')
        source = source.replace('"/assets/', '"./assets/').replace("'/assets/", "'./assets/")
        file.write_text(source, encoding='utf-8')
    return destination


class NodeRuntime:
    def __init__(self):
        node = choose_node()
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not node or not npm:
            raise RuntimeError('Node.js y npm son necesarios. En Community Cloud se instalan mediante packages.txt.')
        # Reinstalar si falta express o si cambió package-lock.json (p. ej. nuevas dependencias tras un push).
        lock_hash = hashlib.sha256((ROOT / 'package-lock.json').read_bytes()).hexdigest()
        marker = ROOT / 'node_modules' / '.onix-lock-sha256'
        installed = (ROOT / 'node_modules' / 'express' / 'package.json').exists()
        # En desarrollo (dependencias de desarrollo instaladas) no se toca node_modules: lo gestiona npm.
        development = (ROOT / 'node_modules' / 'typescript' / 'package.json').exists()
        stale = not marker.exists() or marker.read_text(encoding='utf-8').strip() != lock_hash
        if not installed or (stale and not development):
            subprocess.run([npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
                           cwd=ROOT, check=True, timeout=300)
            marker.write_text(lock_hash, encoding='utf-8')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        self.base_url = f'http://127.0.0.1:{self.port}'
        log_dir = ROOT / '.cache'
        log_dir.mkdir(exist_ok=True)
        self.log_path = log_dir / 'streamlit-node.log'
        self._log = self.log_path.open('ab')
        self.process = subprocess.Popen(
            [node, 'server.js'], cwd=ROOT,
            env={**os.environ, 'HOST': '127.0.0.1', 'PORT': str(self.port),
                 # Red de seguridad: si Node supera este montón se cae y get_runtime() lo reinicia.
                 'NODE_OPTIONS': os.environ.get('NODE_OPTIONS', '--max-old-space-size=768')},
            stdout=self._log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        atexit.register(self.close)
        for _ in range(100):
            if self.process.poll() is not None:
                self.close()
                raise RuntimeError('No se pudo iniciar el servidor. Revisa .cache/streamlit-node.log.')
            try:
                with urlopen(self.base_url + '/api/health', timeout=1) as response:
                    if json.load(response).get('ok'):
                        return
            except OSError:
                time.sleep(.1)
        self.close()
        raise RuntimeError('El servidor no respondió durante el inicio.')

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self._log.close()

    def request(self, item: dict) -> dict:
        request_id = item.get('id')
        try:
            url = item.get('url', '')
            if not isinstance(url, str) or not isinstance(item.get('method', 'GET'), str):
                raise ValueError('Solicitud de API inválida.')
            parsed = urlsplit(url)
            method = item.get('method', 'GET').upper()
            if parsed.scheme or parsed.netloc or parsed.fragment or not ALLOWED_API.fullmatch(unquote(parsed.path)):
                raise ValueError('Ruta de API no permitida.')
            if method not in ('GET', 'POST'):
                raise ValueError('Método no permitido.')
            body = item.get('body')
            if body is not None and not isinstance(body, str):
                raise ValueError('El cuerpo debe ser JSON serializado.')
            encoded = body.encode('utf-8') if body is not None else None
            if encoded and len(encoded) > 4 * 1024 * 1024:
                raise ValueError('Solicitud demasiado grande.')
            request = Request(self.base_url + url, data=encoded, method=method,
                              headers={'Content-Type': 'application/json'})
            try:
                with urlopen(request, timeout=180) as response:
                    return {'id': request_id, 'status': response.status,
                            'body': response.read().decode('utf-8')}
            except HTTPError as error:
                return {'id': request_id, 'status': error.code,
                        'body': error.read().decode('utf-8', errors='replace')}
        except (ValueError, OSError) as error:
            return {'id': request_id, 'status': 502,
                    'body': json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False)}

    def batch(self, value: dict) -> dict:
        items = value.get('requests', [])
        if not isinstance(items, list) or len(items) > 128 or any(not isinstance(item, dict) for item in items):
            raise ValueError('Lote de solicitudes inválido.')
        with ThreadPoolExecutor(max_workers=min(16, max(1, len(items)))) as pool:
            results = list(pool.map(self.request, items))
        return {'batch_id': value.get('batch_id'), 'results': results}
