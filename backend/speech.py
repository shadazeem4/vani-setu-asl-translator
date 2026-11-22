"""Local speech recognition. Audio is processed in memory, never saved."""
from io import BytesIO
from pathlib import Path
from threading import Lock

MODEL_DIR = Path(__file__).parent / "models" / "whisper-tiny"
_model = None
_lock = Lock()


def transcribe(audio: bytes, language: str) -> str:
    global _model
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    if not (MODEL_DIR / "model.bin").exists():
        raise RuntimeError("Speech model missing. Run setup-speech.bat and restart the app.")
    if not _lock.acquire(blocking=False):
        raise RuntimeError("Speech recognition is busy. Please retry in a moment.")
    try:
        samples = decode_audio(BytesIO(audio), sampling_rate=16000)
        if len(samples) > 35 * 16000:
            raise ValueError("Recordings must be shorter than 35 seconds.")
        if len(samples) < 1600:
            return ""
        if _model is None:
            _model = WhisperModel(str(MODEL_DIR), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
        segments, _ = _model.transcribe(samples, language=language, beam_size=3,
                                        vad_filter=True, condition_on_previous_text=False)
        return " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        _lock.release()
