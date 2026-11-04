"""Builds the sound for a scene of the Campuslit video: the voice lines, the sound effects and the mix, plus word-by-word timing for the captions.

    python video/audio.py look

For each line in video/script.json it uses your own recording if one exists (<tools>/recordings/<id>.m4a|wav|mp3|ogg), otherwise it speaks the line
with the local Kokoro voice. Every line goes through the same clean-up chain (so a human and a synthetic voice sit at the same level and tone),
is transcribed with Whisper to time the captions, and is checked for intelligibility. Needs the tools folder (see video/README.md).
"""
import difflib, json, os, re, subprocess, sys
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.environ.get("VIDEO_TOOLS") or os.path.join(os.path.expanduser("~"), "campuslit-video")
FFMPEG = os.path.join(TOOLS, "ffmpeg", "bin", "ffmpeg.exe")
scene = sys.argv[1] if len(sys.argv) > 1 else "look"
cfg = json.load(open(os.path.join(ROOT, "video", "script.json"), encoding="utf8"))
sc = cfg[scene]
out = os.path.join(ROOT, "video", "out", scene); os.makedirs(out, exist_ok=True)

def run(*cmd):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *cmd], check=True)

def spoken(text):  # brand words are spelled the way a voice should say them
    for word, say in cfg["respell"].items():
        text = re.sub(r"\b" + re.escape(word) + r"\b", say, text)
    return text

# ---------- 1. each line: your recording, or the local voice ----------
_kokoro = None
def tts(text, path):
    global _kokoro
    from kokoro_onnx import Kokoro
    if _kokoro is None: _kokoro = Kokoro(os.path.join(TOOLS, "models", "kokoro-v1.0.onnx"), os.path.join(TOOLS, "models", "voices-v1.0.bin"))
    samples, rate = _kokoro.create(spoken(text), voice=cfg["voice"]["name"], speed=cfg["voice"]["speed"], lang=cfg["voice"]["lang"])
    sf.write(path, samples, rate)

# speechnorm lifts the soft words (a trailing "it", the end of a sentence) so nothing is swallowed; the EQ adds the presence that makes consonants carry over music
CLEAN = "highpass=f=90,lowpass=f=13000,equalizer=f=2800:t=q:w=1.0:g=2.5,equalizer=f=220:t=q:w=1.2:g=-1.5,speechnorm=e=6:r=0.0002:l=1,acompressor=threshold=-20dB:ratio=3:attack=6:release=120,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=44100"
def slow_tail(raw, factor):
    """A recording that rushes its last phrase: find the pause inside the line and play what comes after it a little slower, so every word lands."""
    info = subprocess.run([FFMPEG, "-hide_banner", "-i", raw, "-af", "silencedetect=n=-34dB:d=0.2", "-f", "null", "-"], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info).groups(); total = int(h) * 3600 + int(m) * 60 + float(s)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", info)]; ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", info)]
    gaps = [(e - s, (s + e) / 2) for s, e in zip(starts, ends) if s > 0.4 and e < total - 0.3]
    if not gaps: return raw
    mid = max(gaps)[1]; out_path = raw.replace("_raw.wav", "_slow.wav")
    run("-i", raw, "-filter_complex", f"[0:a]atrim=0:{mid},asetpts=N/SR/TB[a];[0:a]atrim={mid},asetpts=N/SR/TB,atempo={factor}[b];[a][b]concat=n=2:v=0:a=1[o]", "-map", "[o]", out_path)
    return out_path

lines = []
for line in sc["lines"]:
    raw = os.path.join(out, line["id"] + "_raw.wav"); clean = os.path.join(out, line["id"] + ".wav")
    mine = next((os.path.join(TOOLS, "recordings", line["id"] + ext) for ext in (".wav", ".m4a", ".mp4", ".mp3", ".ogg", ".flac") if os.path.exists(os.path.join(TOOLS, "recordings", line["id"] + ext))), None)
    if mine: run("-i", mine, "-ac", "1", raw); source = "your recording"
    else: tts(line["text"], raw); source = "synthetic voice"
    if line.get("slowTail"): raw = slow_tail(raw, line["slowTail"])
    run("-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse," + CLEAN, "-ac", "1", clean)
    data, rate = sf.read(clean, dtype="float32")
    lines.append({**line, "path": clean, "duration": len(data) / rate, "source": source})
    print(f'{line["id"]:6s} {source:15s} {len(data) / rate:5.2f}s  at {line["at"]}s', flush=True)

# ---------- 2. caption timing: Whisper hears every line and tells us when each word is said ----------
from faster_whisper import WhisperModel
model = WhisperModel("base.en", device="cpu", compute_type="int8", download_root=os.path.join(TOOLS, "models", "whisper"))
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
timing = {"lines": []}
worst = 1.0
for line in lines:
    tmp = os.path.join(out, line["id"] + "_16k.wav"); run("-i", line["path"], "-ac", "1", "-ar", "16000", tmp)
    audio, _ = sf.read(tmp, dtype="float32")
    segs, _ = model.transcribe(audio, language="en", beam_size=5, word_timestamps=True)
    heard = [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", line["text"]) if s.strip()]
    shown = [[w for w in s.split()] for s in sentences]
    flat = [w for s in shown for w in s]
    # match what was heard to what is shown (the shown words are the real spelling, the heard ones may differ in small ways)
    sm = difflib.SequenceMatcher(None, [norm(h[0]) for h in heard], [norm(w) for w in flat], autojunk=False)
    t0 = [None] * len(flat); t1 = [None] * len(flat)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size): t0[b + k], t1[b + k] = heard[a + k][1], heard[a + k][2]
    ratio = sm.ratio(); worst = min(worst, ratio)
    end = heard[-1][2] if heard else line["duration"]
    # words the matcher could not pair are spread evenly between their neighbours
    known = [i for i, v in enumerate(t0) if v is not None]
    for i in range(len(flat)):
        if t0[i] is not None: continue
        lo = max([k for k in known if k < i], default=None); hi = min([k for k in known if k > i], default=None)
        a = t1[lo] if lo is not None else 0.0; b = t0[hi] if hi is not None else end
        gap = [j for j in range(len(flat)) if t0[j] is None and (lo is None or j > lo) and (hi is None or j < hi)]
        step = (b - a) / (len(gap) + 1); n = gap.index(i) + 1
        t0[i], t1[i] = a + step * (n - .5), a + step * n
    k = 0; sents = []
    for si, words in enumerate(shown):
        ws = [{"w": w, "t0": round(line["at"] + t0[k + j], 3), "t1": round(line["at"] + t1[k + j], 3)} for j, w in enumerate(words)]; k += len(words)
        sents.append({"words": ws, "t0": ws[0]["t0"], "t1": ws[-1]["t1"], "small": si in line.get("smallSentences", [])})
    timing["lines"].append({"id": line["id"], "at": line["at"], "duration": round(line["duration"], 3), "heard": " ".join(h[0] for h in heard), "match": round(ratio, 2), "sentences": sents})
    print(f'{line["id"]:6s} match {ratio:.2f} | {" ".join(h[0] for h in heard)}')
timing["sfx"] = sc.get("sfx", []); timing["duration"] = float(sc.get("duration") or 0)
json.dump(timing, open(os.path.join(out, "timing.json"), "w"), indent=1)
if worst < 0.9: print("WARNING: a line was not heard as written; listen to it before using it")

# ---------- 3. sound effects (made here, so there is nothing to license) ----------
def sfx(kind, path):
    if kind == "whoosh":
        run("-f", "lavfi", "-i", "anoisesrc=d=0.9:c=pink:a=0.6:r=44100", "-af", "highpass=f=250,lowpass=f=7000,afade=t=in:st=0:d=0.5:curve=qsin,afade=t=out:st=0.5:d=0.4:curve=qsin,volume=0.9", path)
    elif kind == "swish":
        run("-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:a=0.5:r=44100", "-af", "highpass=f=500,lowpass=f=6500,afade=t=in:st=0:d=0.22:curve=qsin,afade=t=out:st=0.22:d=0.28:curve=qsin,volume=0.7", path)
    elif kind == "tick":
        run("-f", "lavfi", "-i", "sine=f=1700:d=0.06:r=44100", "-af", "afade=t=out:st=0.01:d=0.05,volume=0.5", path)
    elif kind == "pop":
        run("-f", "lavfi", "-i", "sine=f=520:d=0.12:r=44100", "-af", "afade=t=out:st=0.02:d=0.1,volume=0.6", path)
    elif kind == "hit":      # a low impact with a short noise burst on top
        run("-f", "lavfi", "-i", "sine=f=55:d=0.9:r=44100", "-f", "lavfi", "-i", "anoisesrc=d=0.9:c=pink:a=0.5:r=44100", "-filter_complex",
            "[0:a]afade=t=out:st=0.05:d=0.85:curve=exp,volume=1.6[a];[1:a]lowpass=f=900,afade=t=out:st=0:d=0.35:curve=exp,volume=0.8[b];[a][b]amix=inputs=2:normalize=0", path)
    elif kind == "riser":    # noise that climbs for 1.6 s, then stops dead on the drop
        run("-f", "lavfi", "-i", "anoisesrc=d=1.6:c=white:a=0.6:r=44100", "-af", "highpass=f=1200,lowpass=f=10000,afade=t=in:st=0:d=1.55:curve=exp,afade=t=out:st=1.5:d=0.1,volume=0.8", path)
    elif kind == "ding":     # two soft bell partials
        run("-f", "lavfi", "-i", "sine=f=1318:d=1.0:r=44100", "-f", "lavfi", "-i", "sine=f=1976:d=1.0:r=44100", "-filter_complex",
            "[0:a]afade=t=out:st=0.02:d=0.95:curve=exp,volume=0.5[a];[1:a]afade=t=out:st=0.02:d=0.7:curve=exp,volume=0.25[b];[a][b]amix=inputs=2:normalize=0", path)
    else: raise SystemExit("unknown sound effect " + kind)
effects = []
for e in timing["sfx"]:
    p = os.path.join(out, "sfx_" + e["id"] + ".wav"); sfx(e["kind"], p); effects.append((p, e["at"], e.get("gain", 0.0)))

# ---------- 4. music: an original track synthesised in music.py ----------
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import music
total = float(sc.get("duration") or 0)
track = music.render(total, cfg["music"], None)
music_wav = os.path.join(out, "music_raw.wav"); sf.write(music_wav, track, 44100)

# ---------- 5. the mix: voice on top, music ducked under it, effects between, one loudness for the whole video ----------
def bus(items, name, gain_db=0.0):
    ins, fl, lb = [], [], []
    for i, (p, at, g) in enumerate(items):
        ins += ["-i", p]; ms = int(at * 1000); fl.append(f"[{i}:a]adelay={ms}|{ms},volume={10 ** (g / 20):.3f}[x{i}]"); lb.append(f"[x{i}]")
    path = os.path.join(out, name + ".wav")
    run(*ins, "-filter_complex", ";".join(fl) + ";" + "".join(lb) + f"amix=inputs={len(lb)}:normalize=0,apad=whole_dur={total},atrim=0:{total},aresample=44100[o]", "-map", "[o]", "-ac", "2", path)
    return path
voice_bus = bus([(l["path"], l["at"], 0.0) for l in lines], "voice_bus")
sfx_bus = bus([(p, at, gain + 5.0) for p, at, gain in effects], "sfx_bus")
lvl = cfg["music"].get("level", -17)
mix = os.path.join(out, "mix.wav")
run("-i", voice_bus, "-i", sfx_bus, "-i", music_wav, "-filter_complex",
    f"[0:a]asplit=2[v][k];[2:a]volume={lvl}dB,lowpass=f=15000[m];"
    "[m][k]sidechaincompress=threshold=0.015:ratio=9:attack=12:release=420:makeup=1[md];"      # the music dips whenever someone speaks
    "[v][1:a][md]amix=inputs=3:normalize=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=44100[mix]",
    "-map", "[mix]", "-ac", "2", mix)
# a version without music, to lay trending sound from the app (Instagram, TikTok) under the voice yourself
nomusic = os.path.join(out, "mix_nomusic.wav")
run("-i", voice_bus, "-i", sfx_bus, "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=44100[mix]", "-map", "[mix]", "-ac", "2", nomusic)
print("wrote", os.path.relpath(mix, ROOT), "and", os.path.relpath(nomusic, ROOT))
