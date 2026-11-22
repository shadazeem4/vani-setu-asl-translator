"""Endpoint validation without a live server or microphone."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import app
from fastapi import HTTPException

class AudioRequest:
    base_url = 'http://localhost:8000/'
    def __init__(self, audio, origin=None):
        self.audio = audio
        self.headers = {'origin': origin} if origin else {}
    async def stream(self):
        yield self.audio

async def main():
    for audio, language, origin, status in [(b'', 'en', None, 400), (b'a', 'xx', None, 400), (b'a', 'en', 'https://example.com', 403), (b'a'*(6*1024*1024+1), 'en', None, 413)]:
        try:
            await app.recognize_speech(AudioRequest(audio, origin), language)
        except HTTPException as error:
            assert error.status_code == status
        else:
            raise AssertionError('Expected rejection')
    async def execute(fn, *args): return fn(*args)
    app.run_in_threadpool = execute
    app.speech.transcribe = lambda audio, language: 'Hello'
    assert await app.recognize_speech(AudioRequest(b'audio'), 'en') == {'text': 'Hello'}
    print('PASS: speech size/language/origin validation and transcript response')

asyncio.run(main())
