# Roomie voice experiment

The optional endpoint returns 24 kHz mono signed PCM16 little-endian audio at
`POST /api/roomie/voice`. It accepts a JSON object containing `text` and requires
the `x-roomie-token` header to match `ROOMIE_VOICE_TOKEN` in the server environment.
The endpoint is absent when the secret is not configured; the Discord bot and
status page do not depend on Kokoro. Responses are not cached.

`requirements-roomie.txt` lists the optional Python model dependency. Kokoro's
English pipeline also requires the espeak-ng system package and its model files.
Installing the dependency, loading the actual model and validating inference on
the target Space are separate from the included mock tests. Do not enable the
endpoint until these checks and a load test pass.

The Hugging Face Space has its own repository and does not automatically update
its root `app.py` and requirements when these files change on GitHub. Its release
must be prepared separately, preserving the running bot configuration. This HTTP
endpoint is not the game's realtime WebSocket protocol; a separately authenticated
and tested realtime gateway and a client redirect are still required.
