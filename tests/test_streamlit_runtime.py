import json
import unittest

from streamlit_runtime import NodeRuntime, prepare_frontend


class StreamlitRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = NodeRuntime()

    @classmethod
    def tearDownClass(cls):
        cls.runtime.close()

    def test_round_trip_batch(self):
        result = self.runtime.batch({'batch_id': 'test', 'requests': [
            {'id': 'health', 'url': '/api/health'},
            {'id': 'invalid', 'url': 'https://example.com/api/health'},
            {'id': 'badtype', 'url': None},
        ]})
        self.assertEqual(result['batch_id'], 'test')
        health, invalid, badtype = result['results']
        self.assertEqual(health['status'], 200)
        self.assertTrue(json.loads(health['body'])['ok'])
        self.assertEqual(invalid['status'], 502)
        self.assertEqual(badtype['status'], 502)

    def test_component_assets(self):
        directory = prepare_frontend()
        html = (directory / 'index.html').read_text(encoding='utf-8')
        self.assertIn('src="./app/streamlitBridge.js?v=', html)
        self.assertNotIn('src="/', html)
        self.assertNotIn('href="/', html)
        self.assertTrue((directory / 'app' / 'compiled').is_dir())



class NodeProvisioningTests(unittest.TestCase):
    """Descarga de Node 22 con verificación SHA-256 (sin red: servidor simulado)."""

    def _fake(self, payload: bytes, checksum: str):
        import io
        name = 'node-v22.99.0-linux-x64.tar.xz'
        sums = f'{checksum}  {name}' + chr(10) + 'abc  node-v22.99.0-darwin-arm64.tar.xz' + chr(10)
        files = {'SHASUMS256.txt': sums.encode(), name: payload}

        class Response(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *exc): self.close()

        return lambda url, timeout=None: Response(files[url.rsplit('/', 1)[-1]])

    def _tarball(self) -> bytes:
        import io, tarfile
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w:xz') as archive:
            data = ('#!/bin/sh' + chr(10) + 'echo v22.99.0' + chr(10)).encode()
            info = tarfile.TarInfo('node-v22.99.0-linux-x64/bin/node')
            info.size, info.mode = len(data), 0o755
            archive.addfile(info, io.BytesIO(data))
        return buffer.getvalue()

    def test_verified_download_is_extracted_and_reused(self):
        import hashlib, tempfile
        from pathlib import Path
        from streamlit_runtime import provision_node
        payload = self._tarball()
        with tempfile.TemporaryDirectory() as tmp:
            opener = self._fake(payload, hashlib.sha256(payload).hexdigest())
            node = provision_node(dest=Path(tmp), suffix='linux-x64', opener=opener, verify=False)
            self.assertTrue(node.exists())
            self.assertEqual(node.parent.parent.name, 'node-v22.99.0-linux-x64')
            again = provision_node(dest=Path(tmp), suffix='linux-x64', opener=lambda *a, **k: self.fail('no debe descargar'), verify=False)
            self.assertEqual(again, node)

    def test_checksum_mismatch_is_rejected(self):
        import tempfile
        from pathlib import Path
        from streamlit_runtime import provision_node
        with tempfile.TemporaryDirectory() as tmp:
            opener = self._fake(self._tarball(), '0' * 64)
            with self.assertRaisesRegex(RuntimeError, 'SHA-256'):
                provision_node(dest=Path(tmp), suffix='linux-x64', opener=opener, verify=False)
            self.assertFalse(any(Path(tmp).iterdir()), 'nothing is extracted')

    def test_no_download_off_linux_or_with_recent_node(self):
        from streamlit_runtime import choose_node, node_major, node_platform, provision_node
        if node_platform() is None:
            self.assertIsNone(provision_node())
        self.assertGreaterEqual(node_major(choose_node()), 18)



class SingleRuntimeTests(unittest.TestCase):
    """Un solo servidor de Node: se reutiliza y, si cambia el código, se cierra el anterior."""

    def test_reuse_and_replace(self):
        import streamlit_runtime as rt
        original = rt.server_version
        try:
            rt.server_version = lambda: 'v1'
            first = rt.get_runtime()
            self.assertIs(rt.get_runtime(), first)
            rt.server_version = lambda: 'v2'
            second = rt.get_runtime()
            self.assertIsNot(second, first)
            self.assertIsNotNone(first.process.poll(), 'the previous Node server was stopped')
            self.assertIsNone(second.process.poll())
            second.process.kill(); second.process.wait(timeout=5)
            third = rt.get_runtime()
            self.assertIsNot(third, second, 'a crashed server is restarted')
        finally:
            rt.server_version = original
            if rt._STATE.runtime is not None:
                rt._STATE.runtime.close()
                rt._STATE.runtime, rt._STATE.key = None, None


    def test_state_survives_module_reload(self):
        import importlib
        import streamlit_runtime as rt
        state = rt._STATE
        reloaded = importlib.reload(rt)
        self.assertIs(reloaded._STATE, state, 'a reload must not lose track of the running Node server')


class DeployHelpersTests(unittest.TestCase):
    def test_bundled_npm_is_used_with_downloaded_node(self):
        import tempfile
        from pathlib import Path
        from streamlit_runtime import npm_command
        with tempfile.TemporaryDirectory() as tmp:
            node = Path(tmp) / 'node-v22.0.0-linux-x64' / 'bin' / 'node'
            cli = Path(tmp) / 'node-v22.0.0-linux-x64' / 'lib' / 'node_modules' / 'npm' / 'bin' / 'npm-cli.js'
            cli.parent.mkdir(parents=True); node.parent.mkdir(parents=True)
            node.write_text(''); cli.write_text('')
            self.assertEqual(npm_command(str(node)), [str(node), str(cli.resolve())])

    def test_frontend_copy_is_published_once_per_version(self):
        from streamlit_runtime import frontend_version, prepare_frontend
        first = prepare_frontend()
        self.assertEqual(first.name, frontend_version()[:12])
        self.assertTrue((first / '.ready').exists())
        mtime = (first / 'index.html').stat().st_mtime_ns
        self.assertEqual(prepare_frontend(), first)
        self.assertEqual((first / 'index.html').stat().st_mtime_ns, mtime, 'files are never rewritten in place')


if __name__ == '__main__':
    unittest.main()
