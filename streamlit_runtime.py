"""Run the existing Node API behind a Streamlit component, without a public port."""
from __future__ import annotations

import atexit
from concurrent.futures import ThreadPoolExecutor
import json
import hashlib
import os
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
ALLOWED_API = re.compile(r"^/api/(?:health|tickers|quotes|sectors|chart/[A-Za-z0-9.^=\-]+|charts(?:/cache/(?:check|stats|prune))?)$")


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
        node = shutil.which('node')
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not node or not npm:
            raise RuntimeError('Node.js y npm son necesarios. En Community Cloud se instalan mediante packages.txt.')
        if not (ROOT / 'node_modules' / 'express' / 'package.json').exists():
            subprocess.run([npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
                           cwd=ROOT, check=True, timeout=240)
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
            env={**os.environ, 'HOST': '127.0.0.1', 'PORT': str(self.port)},
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
