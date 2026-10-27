/**
 * Sound effects synthesised with the Web Audio API - no audio files. The AudioContext is only
 * created from a user gesture (unlock()), so browsers never block it or warn about autoplay.
 * Muting silences the master bus and skips scheduling new sounds. The context sleeps while muted
 * or while the page is hidden, and the beam hum only runs while the beam fires.
 */

const MASTER_VOLUME = 0.55;
const HUM_VOLUME = 0.05;
/** Time constant of the beam hum's fade in and out, in seconds. */
const HUM_FADE = 0.03;
const NOISE_SECONDS = 1;
const SILENCE = 0.0001;

/** Shortest time between two sounds of the same busy event type, in seconds. */
const MIN_GAP = Object.freeze({ shoot: 0.05, hit: 0.04, kill: 0.035 });

/** Shot sounds per weapon: start and end pitch (Hz), length (s), waveform, volume. */
const SHOTS = Object.freeze({
  blaster: [880, 440, 0.07, 'square', 0.05],
  spread: [700, 330, 0.08, 'triangle', 0.08],
  rapid: [1200, 800, 0.045, 'square', 0.035],
});

const SOUNDS = Object.freeze({
  shoot: (synth, event) => {
    const [from, to, length, type, gain] = SHOTS[event.weapon] ?? SHOTS.blaster;
    synth.tone(from, to, length, { type, gain });
  },
  hit: (synth) => synth.noise(0.04, { gain: 0.06, filter: 'highpass', from: 3200, to: 1800 }),
  kill: (synth) => {
    synth.noise(0.28, { gain: 0.3, from: 2400, to: 160 });
    synth.tone(150, 45, 0.22, { gain: 0.22 });
  },
  pickup: (synth) => arpeggio(synth, [660, 880, 1320], 0.06, { type: 'triangle', gain: 0.14, length: 0.1 }),
  shieldHit: (synth) => {
    synth.tone(420, 210, 0.18, { type: 'square', gain: 0.07 });
    synth.noise(0.14, { gain: 0.12, filter: 'bandpass', from: 2600, to: 900, q: 3 });
  },
  playerHit: (synth) => {
    synth.noise(0.7, { gain: 0.42, from: 1800, to: 90 });
    synth.tone(220, 40, 0.6, { type: 'sawtooth', gain: 0.14 });
  },
  respawn: (synth) => synth.tone(220, 880, 0.35, { gain: 0.12, attack: 0.05 }),
  waveStart: (synth) => arpeggio(synth, [523, 784], 0.12, { type: 'triangle', gain: 0.12, length: 0.2 }),
  waveClear: (synth) => arpeggio(synth, [523, 659, 784, 1047], 0.07, { type: 'triangle', gain: 0.1, length: 0.16 }),
  bossPhase: (synth) => {
    synth.noise(0.6, { gain: 0.35, from: 1500, to: 120 });
    arpeggio(synth, [110, 110], 0.22, { type: 'sawtooth', gain: 0.13, length: 0.2, slide: 0.75 });
  },
  bossDefeated: (synth) => {
    synth.noise(1.4, { gain: 0.5, from: 2200, to: 60 });
    synth.tone(160, 30, 1.2, { gain: 0.32 });
  },
  gameover: (synth) => arpeggio(synth, [392, 330, 262], 0.22, { type: 'triangle', gain: 0.14, length: 0.34 }),
  victory: (synth) => arpeggio(synth, [523, 659, 784, 1047, 1319], 0.11, { type: 'triangle', gain: 0.12, length: 0.32 }),
});

/**
 * Creates the sound engine (silent until unlock() runs inside a user gesture).
 * @param {{muted?: boolean}} [options]
 * @returns {{unlock(): void, play(event: {type: string}): void, setMuted(muted: boolean): void,
 *   setBeam(on: boolean): void, suspend(): void}}
 */
export function createAudio({ muted = false } = {}) {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let hum = null;
  let isMuted = muted;
  let beamOn = false;
  let noiseOffset = 0;
  const lastPlayed = {};

  const synth = {
    tone(from, to, length, { type = 'sine', gain = 0.2, delay = 0, attack = 0.005 } = {}) {
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const amp = envelope(start, gain, attack, length);
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, start);
      if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
      oscillator.connect(amp);
      oscillator.start(start);
      oscillator.stop(start + length + 0.02);
    },
    noise(length, { gain = 0.2, delay = 0, filter = 'lowpass', from = 2000, to = 200, q = 0.7 } = {}) {
      const start = context.currentTime + delay;
      const source = context.createBufferSource();
      const shaper = context.createBiquadFilter();
      source.buffer = noiseBuffer;
      source.loop = true;
      shaper.type = filter;
      shaper.Q.value = q;
      shaper.frequency.setValueAtTime(from, start);
      shaper.frequency.exponentialRampToValueAtTime(to, start + length);
      source.connect(shaper).connect(envelope(start, gain, 0.002, length));
      noiseOffset = (noiseOffset + 0.37) % NOISE_SECONDS;
      source.start(start, noiseOffset);
      source.stop(start + length + 0.02);
    },
  };

  /** A gain stage that fades in quickly and dies away exponentially, wired to the master bus. */
  function envelope(start, gain, attack, length) {
    const amp = context.createGain();
    amp.gain.setValueAtTime(SILENCE, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + Math.min(attack, length / 2));
    amp.gain.exponentialRampToValueAtTime(SILENCE, start + length);
    amp.connect(master);
    return amp;
  }

  function unlock() {
    if (isMuted) return;
    context ??= build();
    if (context?.state === 'suspended') context.resume().catch(() => {});
  }

  function build() {
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      const created = new AudioContextClass();
      const compressor = created.createDynamicsCompressor();
      master = created.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(compressor).connect(created.destination);
      noiseBuffer = makeNoise(created);
      return created;
    } catch {
      return null;
    }
  }

  function play(event) {
    if (!context || isMuted || context.state !== 'running') return;
    const sound = SOUNDS[event.type];
    if (!sound) return;
    const gap = MIN_GAP[event.type] ?? 0;
    const previous = lastPlayed[event.type] ?? -Infinity;
    if (context.currentTime - previous < gap) return;
    lastPlayed[event.type] = context.currentTime;
    sound(synth, event);
  }

  function setMuted(value) {
    isMuted = value;
    if (context) master.gain.setTargetAtTime(value ? 0 : MASTER_VOLUME, context.currentTime, 0.02);
    updateHum();
    if (value) suspend();
    else unlock();
  }

  /** Lets the context sleep (muted, or the page is hidden); the next unlock() wakes it. */
  function suspend() {
    if (context?.state === 'running') context.suspend().catch(() => {});
  }

  function setBeam(on) {
    if (on === beamOn) return;
    beamOn = on;
    updateHum();
  }

  function updateHum() {
    if (!context) return;
    const on = beamOn && !isMuted;
    if (on && !hum) {
      hum = startHum(context, master);
    } else if (!on && hum) {
      stopHum(hum, context.currentTime);
      hum = null;
    }
  }

  return { unlock, play, setMuted, setBeam, suspend };
}

/** Plays notes one after another, each `spacing` seconds after the previous one. */
function arpeggio(synth, notes, spacing, { type, gain, length, slide = 1 }) {
  notes.forEach((note, i) => synth.tone(note, note * slide, length, { type, gain, delay: i * spacing }));
}

/**
 * One second of white noise from a fixed linear congruential sequence (no Math.random). Noise bursts
 * loop it from a moving start offset, so longer bursts play to the end and no two sound alike.
 */
function makeNoise(context) {
  const buffer = context.createBuffer(1, Math.round(context.sampleRate * NOISE_SECONDS), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < data.length; i += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    data[i] = (seed / 0x80000000) - 1;
  }
  return buffer;
}

/** Starts the beam's low, wobbling hum with a short fade in. It only runs while the beam fires. */
function startHum(context, destination) {
  const oscillator = context.createOscillator();
  const wobble = context.createOscillator();
  const depth = context.createGain();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  oscillator.type = 'sawtooth';
  oscillator.frequency.value = 96;
  wobble.frequency.value = 7;
  depth.gain.value = 6;
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(HUM_VOLUME, context.currentTime, HUM_FADE);
  wobble.connect(depth).connect(oscillator.frequency);
  oscillator.connect(filter).connect(gain).connect(destination);
  oscillator.start();
  wobble.start();
  return { gain, oscillators: [oscillator, wobble] };
}

/** Fades the hum out and stops its oscillators once it is silent. */
function stopHum({ gain, oscillators }, now) {
  gain.gain.setTargetAtTime(0, now, HUM_FADE);
  for (const oscillator of oscillators) oscillator.stop(now + HUM_FADE * 8);
}
