"""Download the local speech model once during setup, never during recording."""
from pathlib import Path
from huggingface_hub import snapshot_download

if __name__ == "__main__":
    destination = Path(__file__).parent / "models" / "whisper-tiny"
    snapshot_download("Systran/faster-whisper-tiny", local_dir=str(destination),
                      allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.*", "preprocessor_config.json"])
    print("Local speech model ready.")
