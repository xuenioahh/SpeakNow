"""Local-only audio transcription. One model, bounded requests, no audio files."""
import base64
import io
import json
import os
import sys
import time

from faster_whisper import WhisperModel
import av
import numpy as np


def decode_recording(raw):
    chunks = []
    samples = 0
    resampler = av.AudioResampler(format="flt", layout="mono", rate=16000)
    with av.open(io.BytesIO(raw), mode="r") as container:
        for frame in container.decode(audio=0):
            frame.pts = None
            for converted in resampler.resample(frame):
                chunk = converted.to_ndarray().reshape(-1)
                samples += len(chunk)
                if samples > 130 * 16000:
                    raise ValueError("audio_too_long")
                chunks.append(chunk)
        for converted in resampler.resample(None):
            chunks.append(converted.to_ndarray().reshape(-1))
    if not chunks:
        raise ValueError("empty_audio")
    audio = np.concatenate(chunks).astype(np.float32, copy=False)
    if len(audio) > 130 * 16000:
        raise ValueError("audio_too_long")
    return audio

model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        started = time.monotonic()
        raw = base64.b64decode(request["data"], validate=True)
        if not raw or len(raw) > 4 * 1024 * 1024:
            raise ValueError("invalid_audio")
        audio = decode_recording(raw)
        duration = len(audio) / 16000
        if duration > 130:
            raise ValueError("audio_too_long")
        segments, _ = model.transcribe(audio, language="en", beam_size=5,
            vad_filter=True, vad_parameters={"min_silence_duration_ms": 400},
            condition_on_previous_text=False, temperature=0)
        text = " ".join(segment.text.strip() for segment in segments if segment.no_speech_prob < 0.6).strip()
        result = {"text": text, "source": "local-audio", "model": "faster-whisper-base.en",
                  "durationSeconds": round(duration, 3), "processingMs": round((time.monotonic() - started) * 1000)}
        print(json.dumps({"id": request["id"], "result": result}), flush=True)
    except Exception:
        print(json.dumps({"id": request.get("id"), "error": "audio_transcription_failed"}), flush=True)
