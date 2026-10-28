import struct
import unittest
from roomie_voice import VoiceService, pcm16


class VoiceTests(unittest.TestCase):
    def test_auth_and_reuse_of_pipeline(self):
        calls = []
        def factory():
            calls.append('loaded')
            return lambda text, voice: [(None, None, [0, 0.5, -1])]
        service = VoiceService('test-secret', factory)
        self.assertFalse(service.authorized('wrong'))
        self.assertTrue(service.authorized('test-secret'))
        for _ in range(2):
            self.assertEqual(struct.unpack('<hhh', service.generate('hello')), (0, 16384, -32767))
        self.assertEqual(calls, ['loaded'])

    def test_bad_input_or_invalid_samples_fail(self):
        with self.assertRaises(ValueError):
            pcm16('', lambda *_a, **_k: [])
        with self.assertRaises(ValueError):
            pcm16('x' * 501, lambda *_a, **_k: [])
        with self.assertRaises(ValueError):
            pcm16('hello', lambda *_a, **_k: [(None, None, [float('nan')])])
        with self.assertRaises(ValueError):
            pcm16('hello', lambda *_a, **_k: [])


if __name__ == '__main__':
    unittest.main()
