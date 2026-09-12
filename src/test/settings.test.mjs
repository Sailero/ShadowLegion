import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsManager } from '../systems/SettingsManager.ts';

let stored = null;
beforeEach(() => {
  stored = null;
  // Reset the cached preferences between independent browser-session scenarios.
  SettingsManager.state = undefined;
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
  };
  globalThis.matchMedia = () => ({ matches: false });
});

test('first-run settings honor OS reduced-motion preference with restrained volume', () => {
  globalThis.matchMedia = () => ({ matches: true });
  assert.deepEqual(SettingsManager.get(), { volume: 0.3, reducedMotion: true, autoFire: false });
});

test('saved settings clamp volume and reject non-boolean preferences', () => {
  stored = JSON.stringify({ volume: 88, reducedMotion: 'false', autoFire: 'true' });
  assert.deepEqual(SettingsManager.get(), { volume: 1, reducedMotion: false, autoFire: false });
  assert.deepEqual(SettingsManager.update({ volume: -3 }), { volume: 0, reducedMotion: false, autoFire: false });
  assert.equal(SettingsManager.update({ volume: NaN }).volume, 0.3);
});

test('corrupt settings recover and blocked storage still allows session preferences', () => {
  stored = '{broken';
  assert.equal(SettingsManager.get().volume, 0.3);
  globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  SettingsManager.state = undefined;
  assert.doesNotThrow(() => SettingsManager.get());
  assert.equal(SettingsManager.update({ autoFire: true, reducedMotion: true }).autoFire, true);
  assert.equal(SettingsManager.get().reducedMotion, true);
});

test('explicit accessibility choice persists and returned objects cannot change stored state', () => {
  globalThis.matchMedia = () => ({ matches: true });
  SettingsManager.update({ reducedMotion: false, volume: 0.5 });
  const copy = SettingsManager.get();
  copy.volume = 99;
  assert.equal(SettingsManager.get().volume, 0.5);
  SettingsManager.state = undefined;
  assert.equal(SettingsManager.get().reducedMotion, false);
  assert.equal(SettingsManager.get().volume, 0.5);
});
