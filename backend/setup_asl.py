"""Download the pinned ASL research model with resumable transfers and integrity checking."""
import hashlib
import time
import urllib.request
from pathlib import Path

MODEL = Path(__file__).parent / "models/asl_cnn_model.onnx"
BLOB = "dd3bca1b2020ddce675fec2abb87eda325cc47d6"
SIZE = 1235355
URL = "https://api.github.com/repos/punpuniacitizen/MediaPipe-ASL-sign-language-recognition/contents/asl_cnn_model.onnx"


def valid(path):
    if not path.exists() or path.stat().st_size != SIZE:
        return False
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == BLOB


def main():
    if valid(MODEL):
        print("ASL model already installed and verified.")
        return
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    partial = MODEL.with_suffix(".download")
    for attempt in range(8):
        offset = partial.stat().st_size if partial.exists() else 0
        headers = {"Accept": "application/vnd.github.raw+json", "User-Agent": "Vani-Setu-local-setup"}
        if offset: headers["Range"] = f"bytes={offset}-"
        try:
            with urllib.request.urlopen(urllib.request.Request(URL, headers=headers), timeout=45) as response:
                mode = "ab" if response.status == 206 and offset else "wb"
                with partial.open(mode) as output:
                    while chunk := response.read(16384):
                        output.write(chunk)
            if valid(partial):
                partial.replace(MODEL)
                print("ASL model installed and verified.")
                return
            if partial.stat().st_size >= SIZE:
                partial.unlink()
        except Exception as error:
            print(f"Download attempt {attempt+1}: {error}")
        time.sleep(1)
    raise RuntimeError("ASL model download failed. Run setup again when the connection is stable.")

if __name__ == "__main__":
    main()
