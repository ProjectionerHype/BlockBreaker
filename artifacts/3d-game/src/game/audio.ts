let ctx: AudioContext | null = null;
let _muted = localStorage.getItem("bb-sound") === "off";

export function setAudioMuted(m: boolean) {
  _muted = m;
  localStorage.setItem("bb-sound", m ? "off" : "on");
}
export function isAudioMuted() { return _muted; }

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function note(freq: number, type: OscillatorType, dur: number, vol = 0.15, detune = 0) {
  if (_muted) return;
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (detune) osc.detune.setValueAtTime(detune, c.currentTime);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + dur);
  } catch (_) {}
}

function noise(dur: number, vol = 0.08, hiFreq = 2000) {
  if (_muted) return;
  try {
    const c = getCtx();
    const bufLen = c.sampleRate * dur;
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hiFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start();
  } catch (_) {}
}

export const Audio = {
  paddleHit() {
    note(280, "sine", 0.08, 0.12);
    note(420, "sine", 0.06, 0.06, 5);
  },
  blockHit(hp: number) {
    const freq = hp > 1 ? 180 : 340;
    note(freq, "square", 0.07, 0.1);
    note(freq * 1.5, "sine", 0.05, 0.06);
  },
  blockDestroy(combo: number) {
    const f = 440 + combo * 40;
    note(f, "sawtooth", 0.12, 0.1);
    note(f * 1.25, "sine", 0.1, 0.08);
    noise(0.07, 0.06, 1500);
  },
  powerUp() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => note(f, "sine", 0.15, 0.1), i * 60);
    });
  },
  lifeLost() {
    [300, 240, 180].forEach((f, i) => {
      setTimeout(() => note(f, "sawtooth", 0.2, 0.12), i * 80);
    });
    noise(0.3, 0.08, 100);
  },
  levelComplete() {
    [523, 659, 784, 880, 1047].forEach((f, i) => {
      setTimeout(() => note(f, "sine", 0.25, 0.12), i * 80);
    });
  },
  gameOver() {
    [220, 185, 165, 110].forEach((f, i) => {
      setTimeout(() => note(f, "sawtooth", 0.35, 0.15), i * 100);
    });
  },
  victory() {
    const mel = [523, 659, 784, 659, 784, 880, 1047];
    mel.forEach((f, i) => {
      setTimeout(() => note(f, "sine", 0.3, 0.14), i * 90);
    });
  },
  laser() {
    note(800, "sawtooth", 0.06, 0.08);
    note(400, "sine", 0.05, 0.05);
  },
  explosion() {
    noise(0.25, 0.12, 80);
    note(120, "sawtooth", 0.2, 0.1);
  },
  combo(n: number) {
    const freqs = [440, 550, 660, 770, 880, 990, 1100];
    const f = freqs[Math.min(n - 2, freqs.length - 1)];
    note(f, "sine", 0.12, 0.1);
  },
  ballLaunch() {
    note(660, "sine", 0.1, 0.09);
  },
  menuClick() {
    note(440, "sine", 0.06, 0.08);
  },
};
