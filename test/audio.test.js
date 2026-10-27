import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/audio.js';

const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = () => ({ gain: param(), frequency: param(), Q: param(), connect: (target) => target, start() {}, stop() {} });

/** A silent stand-in for the Web Audio API that records every source it hands out. */
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = node();
  sources = [];
  oscillators = [];

  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data };
  }

  createBufferSource() {
    const source = { ...node(), loop: false };
    source.start = (when, offset = 0) => Object.assign(source, { when, offset });
    source.stop = (end) => Object.assign(source, { end });
    this.sources.push(source);
    return source;
  }

  createGain() {
    return node();
  }

  createOscillator() {
    const oscillator = node();
    oscillator.start = () => Object.assign(oscillator, { started: true });
    oscillator.stop = (end) => Object.assign(oscillator, { end });
    this.oscillators.push(oscillator);
    return oscillator;
  }

  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  createBiquadFilter() {
    return node();
  }

  createDynamicsCompressor() {
    return node();
  }
}

test('noise bursts sound for their whole length, even when longer than the noise buffer', () => {
  const contexts = [];
  globalThis.AudioContext = class extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  };
  try {
    const audio = createAudio();
    audio.unlock();
    for (const type of ['bossDefeated', 'playerHit', 'bossPhase', 'kill', 'shieldHit']) audio.play({ type });
    const [context] = contexts;
    assert.equal(context.sources.length, 5);
    for (const source of context.sources) {
      const audible = source.loop ? Infinity : source.buffer.duration - source.offset;
      const length = source.end - source.when;
      assert.ok(audible >= length, `a ${length.toFixed(2)} s burst from offset ${source.offset.toFixed(2)} s`);
    }
  } finally {
    delete globalThis.AudioContext;
  }
});

test('the beam hum only runs while the beam fires, and the context sleeps while muted or hidden', () => {
  const contexts = [];
  globalThis.AudioContext = class extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  };
  try {
    const audio = createAudio();
    audio.unlock();
    const [context] = contexts;
    const humming = () => context.oscillators.filter((oscillator) => oscillator.started && oscillator.end === undefined).length;
    assert.equal(humming(), 0, 'no hum before the beam fires');
    audio.setBeam(true);
    assert.equal(humming(), 2, 'the hum and its wobble run while the beam fires');
    audio.setBeam(false);
    assert.equal(humming(), 0, 'both stop when the beam ends');

    audio.setBeam(true);
    audio.setMuted(true);
    assert.equal(humming(), 0, 'muting stops the hum');
    assert.equal(context.state, 'suspended', 'muting lets the context sleep');
    audio.play({ type: 'kill' });
    assert.equal(context.sources.length, 0, 'nothing is scheduled while muted');
    audio.unlock();
    assert.equal(context.state, 'suspended', 'a gesture does not wake a muted context');
    audio.setMuted(false);
    assert.equal(context.state, 'running', 'unmuting wakes it');
    assert.equal(humming(), 2, 'the hum comes back while the beam still fires');

    audio.setBeam(false);
    audio.suspend();
    assert.equal(context.state, 'suspended', 'a hidden page lets the context sleep');
    audio.play({ type: 'kill' });
    assert.equal(context.sources.length, 0, 'nothing is scheduled while it sleeps');
    audio.unlock();
    assert.equal(context.state, 'running', 'the next gesture wakes it');
  } finally {
    delete globalThis.AudioContext;
  }
});
