"""Public deployment must not expose the local shared translation database."""
import os
import sys
from pathlib import Path
os.environ['VANI_PUBLIC_DEMO'] = 'true'
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import app
from fastapi import HTTPException

for operation in (
    app.get_translations,
    lambda: app.create_translation(app.TranslationIn(text='private', mode='spell', timestamp='now')),
    lambda: app.remove_translation(1),
):
    try:
        operation()
    except HTTPException as error:
        assert error.status_code == 403
    else:
        raise AssertionError('Shared history must be disabled')
print('PASS: hosted API blocks shared history reads and writes')
