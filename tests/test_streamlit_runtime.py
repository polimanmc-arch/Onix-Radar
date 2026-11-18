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


if __name__ == '__main__':
    unittest.main()
