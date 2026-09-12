import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundManager } from '../systems/SoundManager.ts';
import { SettingsManager } from '../systems/SettingsManager.ts';

// Web Audio boundary only: these checks assert scheduling and cleanup, never human hearing.
function audio(t, { volume = .3, state = 'running', failConstructor = false, failOscillator = 0 } = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const previousSettings = SettingsManager.state, previousSound = SoundManager.instance;
  let now = 1000, attempts = 0, contexts = 0;
  const oscillators = [], gains = [], resumes = [];
  const param = () => ({ value: 0, values: [], ramps: [],
    setValueAtTime(value, time) { this.values.push({ value, time }); },
    linearRampToValueAtTime(value, time) { this.ramps.push({ value, time }); },
    exponentialRampToValueAtTime(value, time) { this.ramps.push({ value, time }); },
  });
  let context;
  globalThis.AudioContext = class {
    constructor() { contexts++; if (failConstructor) throw Error('audio blocked'); this.state = state; this.currentTime = 2; this.destination = {}; context = this; }
    createGain() { const node = { gain: param(), disconnected: false, connect() {}, disconnect() { this.disconnected = true; } }; gains.push(node); return node; }
    createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 0 }, connect() {} }; }
    createOscillator() {
      if (++attempts === failOscillator) throw Error('node refused');
      const node = { type: '', frequency: param(), starts: [], stops: [], disconnected: false,
        connect() {}, disconnect() { this.disconnected = true; }, start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); } };
      oscillators.push(node); return node;
    }
    resume() { resumes.push(true); return Promise.reject(Error('gesture required')); }
  };
  SettingsManager.state = { volume, reducedMotion: false, autoFire: false };
  SoundManager.instance = undefined;
  t.mock.method(performance, 'now', () => now);
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'AudioContext', previous); else delete globalThis.AudioContext;
    SettingsManager.state = previousSettings; SoundManager.instance = previousSound;
  });
  return { sound: SoundManager.get(), oscillators, gains, resumes, advance: () => { now += 81; },
    contexts: () => contexts, context: () => context };
}

test('postal mute and unknown cues create no AudioContext or nodes', t => {
  const f = audio(t, { volume: 0 });
  for (const cue of ['address', 'delivery', 'command', 'dash', 'unknown']) assert.equal(f.sound.postalCue(cue), false);
  assert.equal(f.contexts(), 0); assert.equal(f.oscillators.length, 0); assert.equal(f.gains.length, 0);
});

test('postal cues have bounded middle-register tones, low gain and finite starts; repeated requests are rate limited', t => {
  const f = audio(t);
  for (const [cue, count] of [['address', 2], ['delivery', 3], ['command', 1], ['dash', 1]]) {
    const before = f.oscillators.length;
    assert.equal(f.sound.postalCue(cue), true);
    for (let i = 0; i < 50; i++) assert.equal(f.sound.postalCue(cue), false);
    assert.equal(f.oscillators.length - before, count);
    f.advance();
  }
  assert.equal(f.gains[0].gain.value, .3, 'the output follows the saved volume');
  for (const osc of f.oscillators) {
    assert.ok(['sine', 'triangle'].includes(osc.type));
    assert.ok(osc.frequency.values[0].value >= 330 && osc.frequency.values[0].value <= 660);
    assert.equal(osc.starts.length, 1); assert.equal(osc.stops.length, 1);
    assert.ok(osc.stops[0] - osc.starts[0] <= .18);
    osc.onended(); assert.equal(osc.disconnected, true);
  }
  for (const gain of f.gains.slice(1)) {
    assert.ok(gain.gain.ramps.every(item => item.value <= .08));
    assert.equal(gain.disconnected, true);
  }
});

test('postal unavailable AudioContext returns failure without throwing', t => {
  const f = audio(t, { failConstructor: true });
  assert.doesNotThrow(() => assert.equal(f.sound.postalCue('delivery'), false));
  assert.equal(f.oscillators.length, 0);
});

test('postal partial audio failure stops and disconnects nodes already created', t => {
  const f = audio(t, { failOscillator: 2 });
  assert.equal(f.sound.postalCue('delivery'), false);
  assert.equal(f.oscillators.length, 1);
  assert.equal(f.oscillators[0].disconnected, true);
  assert.equal(f.oscillators[0].stops.length, 2);
  assert.equal(f.gains[1].disconnected, true);
});

test('postal suspended audio never schedules stale success tones and a later running context can play normally', async t => {
  const f = audio(t, { state: 'suspended' });
  assert.equal(f.sound.postalCue('delivery'), false);
  await Promise.resolve();
  assert.equal(f.resumes.length, 1); assert.equal(f.oscillators.length, 0);
  f.context().state = 'running';
  assert.equal(f.sound.postalCue('address'), true);
  assert.equal(f.oscillators.length, 2);
});
