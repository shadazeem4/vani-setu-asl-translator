# Vani-Setu — local ASL fingerspelling prototype

The chosen scope is laptop-only, bounded vocabulary with measured evaluation.
This build recognizes **24 static ASL letters (A–Z except J/Z)** using a trained
ONNX model. It does not recognize arbitrary ASL words or translate continuous
ASL sentences. Camera phrase heuristics have been disabled instead of presenting
untrained gesture guesses as ASL. Letter scores are not measured accuracy.

- Camera → English: hold a supported letter; lower your hand before repeating it.
  Use Space to build words, Finish sentence to save, and Speak for audio output.
- English → stick figure: schematic gesture cues and fingerspelling, including
  names. This output still needs ASL signer validation and is not a validated
  ASL production model. It does not preserve full ASL grammar or facial markers.
- Voice → English: local Whisper transcription, then the same schematic output.
- Evaluation: select the intended letter in the camera test panel and record
  labeled trials. Export contains hand coordinates, predictions and labels, no
  video. Accuracy is initially unmeasured, never a hard-coded percentage.

Run `setup-speech.bat` for both speech and ASL dependencies/models, then `run.bat`.
The local model is installed in this checkout. Restart an already running server.
Models run on CPU; no cloud GPU is used. MediaPipe JS/WASM still need jsDelivr.
Camera images stay in the browser; landmarks go to the local backend.

## Verification

Local CPU model smoke test: 20 warm inferences, median 6.57 ms, on synthetic
landmarks. **This is a speed measurement, not recognition accuracy.**
No labeled real-signer dataset is included, so real-camera accuracy remains
unmeasured until trials are collected. For meaningful evaluation, use separate
signers/sessions, varied lighting, unsupported poses and all supported letters.
Record failed/rejected attempts too; do not repeatedly sample one successful pose.

From the parent workspace: `node vani-setu/tests/frontend.test.cjs`.
From this folder: `.venv/Scripts/python tests/evaluate_asl.py <exported-trials.json>`.
The evaluator reruns the installed model and reports accuracy, rejection rate,
class coverage and a confusion matrix on those labeled samples.

## Model provenance and remaining work

Source/model: https://github.com/punpuniacitizen/MediaPipe-ASL-sign-language-recognition
See `backend/vendor/asl/README.md` and `LICENSE` for attribution and separate
model/data licensing. The model file is ignored by Git and verified during setup.
Only static letters are enabled; thresholds reject low-score/ambiguous candidates,
but high scores can still be wrong on unfamiliar inputs. This is not a reliable
out-of-distribution detector.

To support a real word vocabulary, a separate temporal model and labeled two-hand,
body and face sequences are needed, plus verified motion clips for stick-figure
output. Alphabet recognition and schematic animations do not fulfill that work.
A sentence research candidate is https://github.com/HGardner1108/SpaMo-Sign-VLA,
whose documented standard inference requirement exceeds this laptop's 6 GB GPU.
The user selected the bounded local path instead.

## Files and startup

`frontend/`: browser UI and camera landmark tracking.
`backend/`: FastAPI, SQLite history, local ASL and Whisper inference.
`tests/`: regression checks and labeled-trial evaluation.
`desktop/`: older separate prototype, not used by run.bat; its rule-based
recognition is not the trained web model.

Open http://localhost:8000 after running run.bat. Use localhost, not file://.
The camera supports one visible hand at a time. Switch modes to release devices.

## APIs

- GET /api/health: server health.
- GET /api/asl/status: installed-model readiness and supported letters.
- POST /api/asl/recognize: 21 x/y hand landmarks and frame dimensions.
- POST /api/speech?language=en: short audio recording; hi also supported.
- GET/POST /api/translations: saved sentences.
- DELETE /api/translations/{id}: remove a saved sentence.

History is stored in backend/translations.db. Audio recordings are not saved.
The browser offers English and Hindi speech recognition; Hindi text does not
constitute ASL translation. Setup downloads models once; local inference does
not use a speech cloud service.

## Render hosting

Deploy as one Python web service from the repository root. Python 3.11 is
selected by `.python-version`.

- Build: `pip install -r backend/requirements.txt && python backend/setup_asl.py && python backend/setup_speech.py`
- Start: `uvicorn app:app --app-dir backend --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'`
- Environment: `VANI_PUBLIC_DEMO=true`, `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`.
- Health endpoint: `/api/health`.

The hosted version sends hand landmarks and microphone audio to the Render
server for recognition. Camera frames remain in the browser; audio is not saved.
Hosted history is stored in each browser (up to 200 entries), and the shared
server history API is disabled. Clearing browser data removes that history.
Localhost runs retain their existing SQLite history.

The free compute plan is intended for demos and sleeps when idle. Speech model
inference may be slow or exceed available memory; a larger compute plan may be
needed for regular speech use. No measured real-signer accuracy is claimed.
