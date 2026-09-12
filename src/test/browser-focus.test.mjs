import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { syncInitialBrowserFocus } from '../systems/BrowserFocus.ts';

const require = createRequire(import.meta.url);
const EventEmitter = require('eventemitter3');
const VisibilityHandler = require('../../node_modules/phaser/src/core/VisibilityHandler.js');

test('an already focused browser initializes input, while real blur still pauses it', () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const listeners = new Map();
  let domFocus = true;
  globalThis.document = { hidden: false, hasFocus: () => domFocus, addEventListener: (name, callback) => listeners.set(name, callback) };
  globalThis.window = { focus() {} }; // Browser is already focused: no new focus event.
  try {
    const game = { config: { autoFocus: true }, events: new EventEmitter(), hasFocus: false };
    VisibilityHandler(game);
    const events = [];
    game.events.on('focus', () => { game.hasFocus = true; events.push('focus'); });
    game.events.on('blur', () => { game.hasFocus = false; events.push('blur'); });
    assert.equal(game.hasFocus, false, 'Phaser alone has missed the initial focus');
    syncInitialBrowserFocus(game, document);
    assert.equal(game.hasFocus, true);
    syncInitialBrowserFocus(game, document);
    assert.deepEqual(events, ['focus'], 'no repeated focus events');
    domFocus = false; window.onblur();
    syncInitialBrowserFocus(game, document);
    assert.equal(game.hasFocus, false, 'click recovery cannot bypass actual window blur');
    domFocus = true; document.hidden = true;
    syncInitialBrowserFocus(game, document);
    assert.equal(game.hasFocus, false, 'hidden tabs cannot recover focus');
    document.hidden = false; window.onfocus();
    assert.equal(game.hasFocus, true, 'normal focus lifecycle still works');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
