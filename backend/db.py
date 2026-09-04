"""SQLite persistence for saved ASL translations."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "translations.db"


def init_db():
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS translations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                mode TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
            """
        )
        conn.commit()


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def create_translation(text: str, mode: str, timestamp: str) -> dict:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO translations (text, mode, timestamp) VALUES (?, ?, ?)",
            (text, mode, timestamp),
        )
        conn.commit()
        return {"id": cur.lastrowid, "text": text, "mode": mode, "timestamp": timestamp}


def list_translations() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, text, mode, timestamp FROM translations ORDER BY id ASC"
        ).fetchall()
        return [dict(row) for row in rows]


def delete_translation(translation_id: int) -> bool:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM translations WHERE id = ?", (translation_id,))
        conn.commit()
        return cur.rowcount > 0
