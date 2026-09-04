"""Vani-Setu backend: serves the frontend, the hand-tracking model, and
persists translation history to SQLite."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db

BASE_DIR = Path(__file__).parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
MODELS_DIR = BASE_DIR / "models"

app = FastAPI(title="Vani-Setu API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranslationIn(BaseModel):
    text: str
    mode: str
    timestamp: str


@app.on_event("startup")
def on_startup():
    db.init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/translations")
def create_translation(payload: TranslationIn):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    return db.create_translation(payload.text, payload.mode, payload.timestamp)


@app.get("/api/translations")
def get_translations():
    return db.list_translations()


@app.delete("/api/translations/{translation_id}")
def remove_translation(translation_id: int):
    if not db.delete_translation(translation_id):
        raise HTTPException(status_code=404, detail="translation not found")
    return {"deleted": translation_id}


@app.get("/models/hand_landmarker.task")
def get_model():
    model_path = MODELS_DIR / "hand_landmarker.task"
    if not model_path.exists():
        raise HTTPException(status_code=404, detail="model file not found")
    return FileResponse(model_path, media_type="application/octet-stream")


app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
