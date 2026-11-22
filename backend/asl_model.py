"""CPU ASL static-letter recognizer; this is not sentence translation."""
from pathlib import Path
from threading import Lock
import time
import numpy as np
from vendor.asl.preprocessing import normalize_landmarks, render_skeleton, model_input

ROOT = Path(__file__).parent
LABELS = (ROOT / "vendor/asl/class_names.txt").read_text().strip().upper().split(",")
SUPPORTED = [label for label in LABELS if label not in {"J", "Z"}]
MODEL_PATH = ROOT / "models/asl_cnn_model.onnx"
_session = None
_lock = Lock()
THRESHOLD = 0.85
MARGIN = 0.20


def session():
    global _session
    with _lock:
        if _session is None:
            import onnxruntime as ort
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            _session = ort.InferenceSession(str(MODEL_PATH), sess_options=options, providers=["CPUExecutionProvider"])
        return _session


def predict(points, width, height):
    start = time.perf_counter()
    points = np.asarray(points, dtype=np.float32)
    if points.shape != (21, 2) or not np.isfinite(points).all():
        raise ValueError("Expected 21 finite x/y landmarks")
    pixels = points * np.array([width, height], dtype=np.float32)
    if np.ptp(pixels, axis=0).max() < 12:
        return {"label": None, "confidence": 0.0, "reason": "Hand too small", "latency_ms": 0.0}
    runtime = session()
    input_meta = runtime.get_inputs()[0]
    output_names = [output.name for output in runtime.get_outputs()]
    output_name = "logits" if "logits" in output_names else output_names[0]
    image = render_skeleton(normalize_landmarks(pixels), size=input_meta.shape[1])
    logits = runtime.run([output_name], {input_meta.name: model_input(image)})[0][0]
    probabilities = np.exp(logits - np.max(logits))
    probabilities /= probabilities.sum()
    order = np.argsort(probabilities)[::-1]
    candidate = LABELS[int(order[0])]
    confidence = float(probabilities[order[0]])
    margin = confidence - float(probabilities[order[1]])
    accepted = candidate in SUPPORTED and confidence >= THRESHOLD and margin >= MARGIN
    return {"label": candidate if accepted else None, "confidence": confidence,
            "reason": "" if accepted else "Uncertain or unsupported motion letter; hold a supported static letter",
            "latency_ms": round((time.perf_counter()-start)*1000, 2)}
