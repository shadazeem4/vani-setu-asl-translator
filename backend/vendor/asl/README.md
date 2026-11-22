# Third-party ASL preprocessing

Source: https://github.com/punpuniacitizen/MediaPipe-ASL-sign-language-recognition
Retrieved 2026-11-17. `preprocessing.py` and `class_names.txt` are used unchanged.
Copyright Nicolás Florentín; source license is in LICENSE.

The model is downloaded separately, not committed or covered by the code's MIT
license. Upstream explicitly excludes weights from that license and identifies
GPL-2.0 and CC0 training datasets. Redistribution/commercial rights must be
resolved separately; this integration does not relicense the weights.
Pinned model Git blob: dd3bca1b2020ddce675fec2abb87eda325cc47d6.
Model size: 1,235,355 bytes. Inputs: float32 RGB [1,96,96,3], pixels 0–255.
Outputs: raw logits for a–z; normalization and rendering match the upstream model.

Vani-Setu rejects J/Z because still frames cannot establish their required motion.
No upstream validation number is represented as Vani-Setu camera accuracy.
