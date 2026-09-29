# Acalink advert (vertical 9:16, all modules)

A ~2 minute animated product tour with a spoken voiceover. Not a screen recording: the scenes are
HTML (`ad.html`) rendered frame by frame, so it builds anywhere without Firebase logins. All names,
messages and amounts on screen are sample data and are labelled as such.

- `script.json`: the voiceover, scene by scene. Edit the words here.
- `synth.py`: turns the script into `build/voiceover.wav` and `build/timeline.js` (scene lengths follow the speech).
- `ad.html`: the scenes. The module lists live in the `S` object; keep them in step with `src/pages/*/`.
- `record.mjs`: renders every frame at an exact timestamp and muxes the audio into `output/acalink-ad.mp4`.

## Build

```bash
pip install kokoro-onnx soundfile numpy imageio-ffmpeg     # imageio-ffmpeg ships a full ffmpeg
npm i -g playwright                                        # or any install that `require("playwright")` finds
# Voice: the Kokoro model and voice packs are bundled in the `expo-kokoro` npm package.
npm pack expo-kokoro && tar xzf expo-kokoro-*.tgz package/build/kokoro-quantized.onnx package/build/voices
python3 - <<'PY'   # pack the raw voice files into the npz that kokoro-onnx reads
import numpy as np, glob, os
np.savez("voices.npz", **{os.path.basename(f)[:-4]: np.fromfile(f, np.float32).reshape(-1, 1, 256)
                          for f in glob.glob("package/build/voices/*.bin")})
PY
export KOKORO_MODEL=$PWD/package/build/kokoro-quantized.onnx KOKORO_VOICES=$PWD/voices.npz
ln -sf "$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')" /usr/local/bin/ffmpeg
./build.sh
```

Change the narrator with `"voice"` in `script.json` (`bf_emma`, `bf_isabella`, `bm_george`, `bm_lewis`, `af_heart`, ...).
Kokoro speaks English only, so there is no Chichewa voiceover.
