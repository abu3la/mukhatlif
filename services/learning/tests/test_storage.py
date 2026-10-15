import importlib
import json
import sys
import types
import unittest
from unittest.mock import MagicMock, patch
from mukhtalif_learning.domain import InvalidInput


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.frappe = types.ModuleType('frappe')
        self.frappe.conf = {'allow_tests': False}
        self.frappe.local = types.SimpleNamespace(site='production.localhost')
        self.frappe.db = MagicMock()
        self.modules = patch.dict(sys.modules, {'frappe': self.frappe})
        self.modules.start()
        sys.modules.pop('mukhtalif_learning.storage', None)
        self.storage = importlib.import_module('mukhtalif_learning.storage')

    def tearDown(self):
        self.modules.stop()
        sys.modules.pop('mukhtalif_learning.storage', None)

    def test_no_persistent_filesystem_fallback_in_production(self):
        with patch.dict('os.environ', {}, clear=True), self.assertRaises(InvalidInput):
            self.storage.remote()
        self.frappe.conf['allow_tests'] = True
        with self.assertRaises(InvalidInput):
            self.storage.remote()
        self.frappe.local.site = 'learning-test.localhost'
        self.assertFalse(self.storage.remote())

    def test_download_scoped_to_environment_and_short_lived(self):
        client = MagicMock()
        item = {'key': 'learning/development/video.mp4', 'filename': 'video.mp4', 'contentType': 'video/mp4'}
        self.frappe.db.get_value.return_value = json.dumps({'/private/files/video.mp4': item})
        with patch.object(self.storage, 'connection', return_value=(client, 'mukhtalif-media', 'learning/production/')):
            with self.assertRaises(InvalidInput):
                self.storage.download('course', '/private/files/video.mp4')
        client.generate_presigned_url.assert_not_called()
        with patch.object(self.storage, 'connection', return_value=(client, 'mukhtalif-media', 'learning/development/')):
            self.storage.download('course', '/private/files/video.mp4')
        self.assertEqual(client.generate_presigned_url.call_args.kwargs['ExpiresIn'], 300)
        self.assertEqual(client.generate_presigned_url.call_args.kwargs['Params']['Bucket'], 'mukhtalif-media')
