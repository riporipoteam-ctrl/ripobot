import os
import struct
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from roomie_voice import VoiceService, attach_voice_endpoint


class VoiceHttpTests(unittest.TestCase):
    def test_optional_route_and_authenticated_pcm_response(self):
        disabled = FastAPI()
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(attach_voice_endpoint(disabled))
        self.assertEqual(TestClient(disabled).post('/api/roomie/voice').status_code, 404)

        app = FastAPI()
        fake = lambda text, voice: [(None, None, [0, 0.5])]
        with patch.dict(os.environ, {'ROOMIE_VOICE_TOKEN': 'secret'}, clear=True), patch.object(
            VoiceService, '_default_factory', staticmethod(lambda: fake)
        ):
            self.assertTrue(attach_voice_endpoint(app))
            client = TestClient(app)
            self.assertEqual(client.post('/api/roomie/voice', json={'text': 'hello'}).status_code, 401)
            headers = {'x-roomie-token': 'secret'}
            response = client.post('/api/roomie/voice', json={'text': 'hello'}, headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['x-audio-sample-rate'], '24000')
            self.assertEqual(struct.unpack('<hh', response.content), (0, 16384))
            self.assertEqual(client.post('/api/roomie/voice', json={'text': ''}, headers=headers).status_code, 400)
            self.assertEqual(client.post('/api/roomie/voice', content=b'x' * 4097, headers=headers).status_code, 413)


if __name__ == '__main__':
    unittest.main()
