"""Read bounded PCM from stdin using an existing local model; never download one."""
import hashlib
import json
import os
import sys

import numpy as np
import torch
import whisper

model_path = sys.argv[1]
if not os.path.isabs(model_path) or not os.path.isfile(model_path):
    raise ValueError("An existing absolute model file is required")

limit = 90 * 16000 * 4
pcm = sys.stdin.buffer.read(limit + 1)
if not pcm or len(pcm) > limit or len(pcm) % 4:
    raise ValueError("PCM must contain at most 90 seconds of mono float32/16kHz audio")

torch.set_num_threads(2)
model = whisper.load_model(model_path, device="cpu")
result = whisper.transcribe(
    model,
    np.frombuffer(pcm, dtype=np.float32).copy(),
    language="ar",
    task="transcribe",
    fp16=False,
    temperature=0,
    condition_on_previous_text=False,
    initial_prompt=None,
    verbose=None,
)
print(json.dumps({
    "model": os.path.basename(model_path),
    "pcmSha256": hashlib.sha256(pcm).hexdigest(),
    "audioSeconds": len(pcm) / (16000 * 4),
    "text": result["text"],
    "segments": [{k: s[k] for k in (
        "start", "end", "text", "avg_logprob", "no_speech_prob"
    )} for s in result["segments"]],
    "warning": "Machine transcription is supporting evidence, not automatic episode identity proof.",
}, ensure_ascii=False))
