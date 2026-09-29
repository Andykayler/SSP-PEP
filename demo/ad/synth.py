"""Synthesises the voiceover from script.json with Kokoro (offline ONNX) and writes
build/voiceover.wav plus build/timeline.js (scene start/duration, driven by the audio).
Model and voices: the Kokoro int8 model and voice packs shipped in the `expo-kokoro` npm
package (see README). Set KOKORO_MODEL and KOKORO_VOICES to override the paths."""
import json, os, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(here, "script.json")))
model = os.environ.get("KOKORO_MODEL", "/tmp/tts/package/build/kokoro-quantized.onnx")
voices = os.environ.get("KOKORO_VOICES", "/tmp/tts/voices.npz")
k = Kokoro(model, voices)
SR = 24000
PRE, POST = 0.45, 0.65          # breathing room before/after each scene's speech

def fade(x, n=int(SR * 0.02)):
    x = x.copy(); x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n); return x

track, timeline, t = [], [], 0.0
for sc in cfg["scenes"]:
    parts = []
    for i, line in enumerate(sc["vo"]):
        a, sr = k.create(line, voice=cfg["voice"], speed=cfg["speed"], lang=cfg["lang"])
        assert sr == SR
        a = fade(a.astype(np.float32))
        parts.append(a)
        if i < len(sc["vo"]) - 1:
            parts.append(np.zeros(int(SR * cfg["gap"]), np.float32))
    speech = np.concatenate(parts)
    dur = PRE + len(speech) / SR + POST
    seg = np.concatenate([np.zeros(int(SR * PRE), np.float32), speech, np.zeros(int(SR * POST), np.float32)])
    track.append(seg)
    timeline.append({"id": sc["id"], "start": round(t, 3), "dur": round(dur, 3), "speech": round(len(speech) / SR, 3)})
    print(f'{sc["id"]:8s} start {t:6.1f}s  dur {dur:5.1f}s', flush=True)
    t += dur

audio = np.concatenate(track)
peak = float(np.abs(audio).max())
audio = audio * (0.89 / peak)   # peak-normalise to about -1 dBFS
os.makedirs(os.path.join(here, "build"), exist_ok=True)
sf.write(os.path.join(here, "build", "voiceover.wav"), audio, SR)
open(os.path.join(here, "build", "timeline.js"), "w").write(
    "window.TIMELINE=" + json.dumps(timeline) + ";window.END=" + str(round(t, 3)) + ";\n")
print("total", round(t, 1), "s")
