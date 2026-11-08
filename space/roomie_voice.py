"""Optional Roomie voice endpoint. The Discord bot does not depend on this module."""
import hmac
import math
import os
import struct
import threading

SAMPLE_RATE = 24_000
MAX_TEXT = 500
MAX_AUDIO = SAMPLE_RATE * 30 * 2


def pcm16(text, pipeline):
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise ValueError('invalid text')
    result = bytearray()
    for _, _, audio in pipeline(text.strip(), voice='af_heart'):
        for value in audio:
            value = float(value)
            if not math.isfinite(value):
                raise ValueError('invalid voice sample')
            result.extend(struct.pack('<h', round(min(1.0, max(-1.0, value)) * 32767)))
            if len(result) > MAX_AUDIO:
                raise ValueError('voice output too long')
    if not result:
        raise ValueError('voice output empty')
    return bytes(result)


class VoiceService:
    def __init__(self, token, factory=None):
        if not token:
            raise ValueError('voice authentication token required')
        self._token = token.encode('utf-8')
        self._factory = factory or self._default_factory
        self._pipeline = None
        self._lock = threading.Lock()

    @staticmethod
    def _default_factory():
        from kokoro import KPipeline
        return KPipeline(lang_code='a')

    def authorized(self, supplied):
        return isinstance(supplied, str) and hmac.compare_digest(supplied.encode('utf-8'), self._token)

    def generate(self, text):
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
            raise ValueError('invalid text')
        if not self._lock.acquire(blocking=False):
            raise BlockingIOError('voice service busy')
        try:
            if self._pipeline is None:
                self._pipeline = self._factory()
            return pcm16(text, self._pipeline)
        finally:
            self._lock.release()


def attach_voice_endpoint(app):
    """Enable only with a private token; optional Kokoro dependencies load on demand."""
    token = os.environ.get('ROOMIE_VOICE_TOKEN', '')
    if not token:
        return False
    from fastapi import Request
    from fastapi.responses import Response
    from starlette.concurrency import run_in_threadpool
    import json

    service = VoiceService(token)

    @app.post('/api/roomie/voice')
    async def roomie_voice(request: Request):
        if not service.authorized(request.headers.get('x-roomie-token')):
            return Response(status_code=401)
        payload = bytearray()
        async for chunk in request.stream():
            if len(chunk) > 4096 - len(payload):
                return Response(status_code=413)
            payload.extend(chunk)
        try:
            body = json.loads(payload)
            text = body.get('text') if isinstance(body, dict) else None
            audio = await run_in_threadpool(service.generate, text)
        except (ValueError, TypeError):
            return Response(status_code=400)
        except BlockingIOError:
            return Response(status_code=429, headers={'Retry-After': '2'})
        except Exception:
            # Do not leak provider details, text, or secrets in the response.
            return Response(status_code=503)
        return Response(audio, media_type='application/octet-stream', headers={
            'Cache-Control': 'no-store', 'X-Audio-Format': 'pcm16le',
            'X-Audio-Sample-Rate': str(SAMPLE_RATE), 'X-Audio-Channels': '1',
        })
    return True
