# Vani-Setu — ASL Sign Language Translator

Real-time American Sign Language translator that bridges voice and gesture.
Hand tracking runs entirely in the browser (MediaPipe HandLandmarker) — a
FastAPI backend serves the app and persists translation history to SQLite.

Two modes:
- **PHRASE mode** — ~15 common words/phrases (Hello, Yes, No, I Love You, ...)
- **SPELL mode** — ASL alphabet fingerspelling

Features: live hand-landmark overlay, per-finger state indicators, sentence
building, text-to-speech (Web Speech API), an activity log, and a saved
"past sessions" history backed by the API.

A standalone OpenCV desktop version is also included as an alternative to
the web app.

## Project layout

```
vani-setu/
├── frontend/           client-side app (HTML/CSS/JS, MediaPipe in-browser)
├── backend/             FastAPI server: serves the frontend, the hand model,
│                        and the translation-history API
├── desktop/              OpenCV + pyttsx3 desktop version
├── docs/                team presentation / reference material
├── LICENSE
└── citation.cff
```

## Running the web app

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:8000** in Chrome or Edge and click **Start
Camera**. The browser will ask for camera permission — allow it for hand
tracking to work. No microphone permission is needed (speech is
text-to-speech output only, not speech recognition).

The server serves the frontend, the local `hand_landmarker.task` model
(so hand detection works fully offline after the first load, without
depending on Google's CDN), and the translation-history API.

### API

| Method | Route                     | Description                        |
|--------|---------------------------|-------------------------------------|
| GET    | `/api/health`              | Health check                       |
| GET    | `/api/translations`        | List saved translations            |
| POST   | `/api/translations`        | Save a completed sentence          |
| DELETE | `/api/translations/{id}`   | Delete a saved translation         |

Saved sentences persist in `backend/translations.db` (SQLite) across server
restarts.

## Controls

| Key       | Action                    |
|-----------|---------------------------|
| `M`       | Toggle Phrase / Spell mode |
| `Space`   | Commit current word        |
| `Backspace` | Delete last letter/word   |
| `C`       | Clear sentence             |
| `V`       | Toggle voice on/off        |
| `S`       | Speak current sentence     |
| `Enter`   | Finish sentence (saves it) |

## Running the desktop app

```bash
cd desktop
pip install -r requirements.txt
python sign_language_app.py
```

Opens an OpenCV window with the webcam feed and a translator panel. Same
classification logic and controls as the web app (keyboard-driven; press
`Q` to quit). On first run it downloads `hand_landmarker.task` next to the
script if not already present.

## Credits

Originally based on [Sign-Language-Interpreter-using-Deep-Learning](https://github.com/harshbg/Sign-Language-Interpreter-using-Deep-Learning)
by **harshbg** (Harsh Gupta), licensed under MIT (see [LICENSE](LICENSE)).
The legacy color-histogram/CNN training pipeline from that project was
removed; the current app is a from-scratch MediaPipe hand-landmark
classifier for both phrase and fingerspelling recognition, split into a
web app (FastAPI + browser-side MediaPipe) and a desktop app (OpenCV).
