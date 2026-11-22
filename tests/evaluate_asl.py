"""Re-evaluate exported, user-labeled landmark trials on the installed model.
Usage: .venv/Scripts/python tests/evaluate_asl.py path/to/asl-evaluation.json
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import asl_model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("trials", type=Path)
    args = parser.parse_args()
    report = json.loads(args.trials.read_text(encoding="utf-8"))
    if report.get("schema") != "vani-setu-asl-trials-v1":
        raise ValueError("Unsupported evaluation schema")
    samples = report["trials"]
    if not samples: raise ValueError("No labeled trials; accuracy cannot be measured")
    confusion = Counter()
    timings = []
    for trial in samples:
        expected = trial["expected"]
        if expected not in asl_model.SUPPORTED + ["REJECT"]:
            raise ValueError("Unsupported expected label")
        result = asl_model.predict(trial["points"], trial["width"], trial["height"])
        confusion[(expected, result["label"] or "REJECT")] += 1
        timings.append(result["latency_ms"])
    total = len(samples)
    correct = sum(count for (expected,predicted),count in confusion.items() if expected==predicted)
    print(json.dumps({"evaluation":"user-labeled trials, not an independent benchmark", "trials":total,
        "correct":correct,"accuracy":correct/total,"tested_letters":len({t["expected"] for t in samples}-{ "REJECT" }),
        "rejection_rate":sum(count for (_,predicted),count in confusion.items() if predicted=="REJECT")/total,
        "mean_inference_ms":sum(timings)/total,
        "confusion":[{"expected":e,"predicted":p,"count":n} for (e,p),n in sorted(confusion.items())]},indent=2))

if __name__ == "__main__": main()
