# Campuslit marketing video

The video is built from the real extension running on the invented sample pages (never a real portal), so no real student data can appear.
Headless Chrome draws each frame from a pure function of time and pipes it into ffmpeg; the sound is built separately and mixed in.

## One-off setup (outside the repo, about 1.1 GB)

Everything lives in `~/campuslit-video` (override with `VIDEO_TOOLS`):

| Folder | What | Where it came from |
| --- | --- | --- |
| `ffmpeg/` | encoder, mixer, loudness | gyan.dev "essentials" build (checksum verified) |
| `venv/` | Python with `kokoro-onnx`, `faster-whisper`, `soundfile`, `numpy` | `pip install kokoro-onnx faster-whisper soundfile numpy` |
| `models/` | `kokoro-v1.0.onnx`, `voices-v1.0.bin`, Whisper `base.en` | kokoro-onnx model-files-v1.0 release; Whisper downloads itself |
| `recordings/` | **your own voice lines**, named by line id (`hook.mp4`, `hook.m4a`, `outro.wav`, ...) | you |
| `out/` | finished videos | rendered |

## Make the video

```
~/campuslit-video/venv/Scripts/python video/audio.py full                  # voices, sound effects, music, word timing -> video/out/full/
node video/render.mjs --scene full --audio video/out/full/mix.wav --out ~/campuslit-video/out/campuslit-full.mp4
node video/render.mjs --scene full --stills 1.5,4.6,9.9 --out video/out/stills   # PNG stills to check the look
node video/render.mjs --scene full --eval "document.title"                  # run a snippet inside the composer (debugging)
```

* `video/script.json` is the single source of timing: the voice lines (`id`, `text`, `at` seconds), the sound effects (`id`, `kind`, `at`) and the music settings. The pictures read these times, so a changed line re-times the pictures, the captions and the music together.
* `video/audio.py`: uses your recording for a line if `recordings/<id>.*` exists, otherwise the local voice; every line goes through the same clean-up chain (presence EQ, soft-word lift, compressor, loudness) so a human and a synthetic voice match; Whisper hears each line and times the captions word by word; `slowTail` slows a rushed last phrase; the sound effects are synthesised; the mix ducks the music under every voice and lands at about -14 LUFS. It also writes `mix_nomusic.wav` (voice and effects only) for laying a platform's trending sound underneath in the app.
* `video/music.py`: an original 110 BPM track (pad, kick, clap, hats, bass, chord stabs, bell arpeggio) written as a function of a few numbers in `script.json`, so nothing needs a licence.
* `video/scenes/compose.*`: the 1080x1920 canvas, the page groups with their cameras, the before/after wipes, the theme dock and circular reveals, the typed search, the install card, the closing card and the word-by-word captions. `video/render.mjs`: frame capture and encoding.
* Output is H.264 + AAC, 1080x1920, 30 fps.

`video/out/` is git-ignored.
