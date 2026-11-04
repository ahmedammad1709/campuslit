"""An original backing track for the Campuslit video, synthesised from nothing (so there is no licence to worry about).

A bright, modern pop/tech groove at 110 BPM in A minor: pad build-up, a drop on the before/after wipe, four-on-the-floor kick, clap, hats,
a rolling bass, off-beat chord stabs and a bell-like arpeggio; a breakdown before the call to action and a full return on the end card.
It is written as a pure function of a few numbers in script.json ("music"), so it re-times itself when the voice does.
"""
import numpy as np

SR = 44100


def _env_exp(n, rate):
    return np.exp(-np.arange(n) / SR * rate)


def _fft_filter(x, lo=None, hi=None):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    mask = np.ones_like(f)
    if lo: mask *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4)       # gentle high-pass
    if hi: mask *= 1 / (1 + (f / hi) ** 4)                         # gentle low-pass
    return np.fft.irfft(spec * mask, len(x))


def _reverb(x, seconds=1.3, wet=.28, seed=3):
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * (5.5 / seconds))
    ir = _fft_filter(ir, lo=250, hi=6500)
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return x + wet * y / (np.max(np.abs(y)) + 1e-9) * np.max(np.abs(x)) * 1.2


def _midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def _tone(freq, dur, bright=1.0, decay=3.0, detune=0.0):
    """A plucked tone built from harmonics whose upper partials fade fastest, like a real pluck (no filter needed)."""
    n = int(SR * dur); t = np.arange(n) / SR
    y = np.zeros(n)
    for h in range(1, 14):
        if freq * h > 9000: break
        amp = (1.0 / h) * (bright ** (h - 1))
        for d in ((-detune, detune) if detune else (0.0,)):
            y += amp * np.sin(2 * np.pi * (freq * h * (1 + d)) * t) * np.exp(-t * (decay + (h - 1) * .9))
    return y / (1 + (2 if detune else 1) * .3)


def _put(buf, start, sig, gain=1.0):
    i = int(start * SR)
    if i >= len(buf) or i + len(sig) <= 0: return
    a, b = max(0, -i), min(len(sig), len(buf) - i)
    buf[i + a:i + b] += sig[a:b] * gain


def render(duration, cfg, drop_to_end):
    """cfg: bpm, drop (seconds), breakdown [from, to], fade (seconds). Returns a stereo float array of `duration` seconds."""
    bpm = cfg.get("bpm", 110); beat = 60.0 / bpm; drop = cfg["drop"]
    b0, b1 = cfg.get("breakdown", [1e9, 1e9]); fade = cfg.get("fade", duration - 1.2)
    n = int(duration * SR)
    kick, clap, hat, bass, chords, arp, pad = (np.zeros(n) for _ in range(7))
    chord_notes = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]]     # Am F C G
    roots = [33, 29, 36, 31]                                                    # A1 F1 C2 G1
    bar = 4 * beat
    # ---- pad: from the very start, swelling toward the drop (kept quiet so the first voice is clear)
    t = 0.0
    start = drop - bar * np.ceil(drop / bar)
    k = 0
    while start + k * bar < duration:
        s = start + k * bar; ch = chord_notes[k % 4]
        for note in ch:
            for d in (-.003, .003):
                dur = bar + .6; m = int(SR * dur); tt = np.arange(m) / SR
                y = np.sin(2 * np.pi * _midi(note - 12) * (1 + d) * tt) + .35 * np.sin(2 * np.pi * _midi(note) * (1 + d) * tt)
                y *= np.minimum(1, tt / .5) * np.minimum(1, (dur - tt) / .5)
                _put(pad, s, y, .05)
        k += 1
    # ---- everything rhythmic is laid on the grid that starts at the drop
    def grid(pos): return drop + pos * beat
    steps = int((duration - drop) / beat * 4) + 4                                # 16th notes after the drop
    for i in range(steps):
        pos = i / 4.0; tm = grid(pos)
        if tm >= duration: break
        bar_i = int(pos // 4); within = pos - bar_i * 4; ch = bar_i % 4
        calm = b0 <= tm < b1
        end_full = tm >= b1
        # kick: four on the floor (not in the breakdown)
        if i % 4 == 0 and not calm:
            m = int(.32 * SR); tt = np.arange(m) / SR
            y = np.sin(2 * np.pi * (46 * tt + 90 * (1 - np.exp(-tt * 35)) / 35)) * np.exp(-tt * 11) + .25 * np.sin(2 * np.pi * 120 * tt) * np.exp(-tt * 60)
            _put(kick, tm, y, 1.0)
        # clap on 2 and 4
        if i % 8 == 4 and not calm:
            m = int(.25 * SR); rng = np.random.default_rng(i)
            y = _fft_filter(rng.standard_normal(m), lo=1100, hi=5200) * _env_exp(m, 18)
            y += .5 * np.roll(y, int(.012 * SR)) + .3 * np.roll(y, int(.024 * SR))
            _put(clap, tm, y, .55)
        # hats: off-beat eighths, plus a soft 16th ticking
        if (i % 4 == 2 or (i % 2 == 1 and tm > grid(8))) and not calm:
            m = int(.07 * SR); rng = np.random.default_rng(1000 + i)
            y = np.diff(rng.standard_normal(m + 1)) * _env_exp(m, 70)
            _put(hat, tm, y, .22 if i % 4 == 2 else .10)
        # bass: rolling root with a jump, ducked in the breakdown
        if not calm and i % 8 in (0, 3, 6):
            root = roots[ch] + (12 if i % 8 == 6 else 0)
            _put(bass, tm, _tone(_midi(root), beat * (.9 if i % 8 == 0 else .55), bright=.55, decay=2.0), .5)
        # chord stabs on the off-beats
        if i % 8 in (2, 5) or (calm and i % 16 == 0):
            for note in chord_notes[ch]:
                _put(chords, tm, _tone(_midi(note), beat * 1.3, bright=.8, decay=3.2, detune=.003), .14 if not calm else .20)
        # bell arpeggio over the top, starting two bars after the drop
        if pos >= 8 and i % 2 == 0:
            tones = chord_notes[ch]; note = tones[(i // 2) % 3] + 12 * (1 + ((i // 6) % 2))
            vol = .13 if not calm else .17
            _put(arp, tm, _tone(_midi(note), beat * .9, bright=.7, decay=4.5), vol)
    # the breakdown softens the drums by simply having none; the return on the end card is a full bar of fill
    # ---- processing
    chords = _reverb(chords, 1.1, .35); arp = _reverb(arp, 1.5, .5, seed=9); clap = _reverb(clap, .7, .3, seed=5); pad = _reverb(pad, 2.0, .2, seed=7)
    arp_echo = np.zeros(n); d = int(beat * .75 * SR); arp_echo[d:] = arp[:-d] * .35; arp = arp + arp_echo
    # drop: everything before it is just the pad; a short silence on the last beat sharpens the entry
    pre = np.clip((np.arange(n) / SR) / max(drop, .1), 0, 1)
    pad_gain = .45 + .5 * pre ** 2
    mix = pad * pad_gain + 1.0 * kick + clap + hat + bass + chords + arp
    gap0 = int((drop - beat * .5) * SR)
    mix[gap0:int(drop * SR)] *= np.linspace(1, 0.15, int(drop * SR) - gap0)         # the beat before the drop dips
    # fade out at the end
    t = np.arange(n) / SR
    mix *= np.clip((fade + 1.1 - t) / 1.1, 0, 1)
    mix = np.tanh(1.3 * mix) / np.tanh(1.3)                                          # gentle glue
    mix /= (np.max(np.abs(mix)) + 1e-9) / .9
    # a touch of stereo width: the arpeggio and chords swing slightly to the sides
    L = mix + .06 * np.roll(arp, int(.011 * SR)); R = mix + .06 * np.roll(arp, -int(.011 * SR))
    return np.stack([L, R], axis=1).astype("float32")
