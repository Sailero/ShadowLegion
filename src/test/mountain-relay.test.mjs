import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MountainRelay, MOUNTAIN_OBSERVE_RADIUS, MOUNTAIN_ASSIGN_RADIUS, MOUNTAIN_BELL_RADIUS,
  MOUNTAIN_ECHO_RADIUS, MOUNTAIN_NOTE_INTERVAL_MS, MOUNTAIN_MAX_DELTA_MS,
} from '../systems/MountainRelay.ts';
import {
  MOUNTAIN_WORLD, MOUNTAIN_STATIONS, MOUNTAIN_NOTE_LABELS, MOUNTAIN_ECHO_ROUTES,
  MOUNTAIN_PATHS, MOUNTAIN_PLAZAS, MOUNTAIN_CHECKPOINTS, MOUNTAIN_GATE,
  MOUNTAIN_SPAWN, MOUNTAIN_NPC, MOUNTAIN_DISCOVERY, isMountainSafe,
} from '../data/mountain.ts';

const station = id => MOUNTAIN_STATIONS[id];
function assigned(id = 'lesson') {
  const model = new MountainRelay(id === 'pass' ? 'lesson' : 'start');
  assert.equal(model.observe(id, station(id).instruction).ok, true);
  assert.equal(model.assign(id, station(id).command).ok, true);
  return model;
}
function advance(model, milliseconds, id = 'lesson', stays = true, stepMs = 100) {
  const events = [];
  while (milliseconds > 0) {
    const delta = Math.min(milliseconds, stepMs);
    events.push(...model.update(delta, station(id).echo, stays));
    milliseconds -= delta;
  }
  return events;
}
function player(model, id, note) { return model.ringPlayer(id, note, station(id).playerBells[note]); }
function matchLesson(model = assigned()) {
  advance(model, MOUNTAIN_NOTE_INTERVAL_MS * 2);
  const result = player(model, 'lesson', 'bell');
  assert.equal(result.ok, true);
  return { model, events: result.events };
}

test('the two authored patterns expose distinct ownership and Chinese visual symbols for silent play', () => {
  const snapshot = new MountainRelay().getSnapshot();
  assert.equal(snapshot.phase, 'idle'); assert.equal(snapshot.activeStation, null);
  assert.deepEqual(snapshot.stations.lesson.pattern.map(p => [p.label, p.actor]), [['叶', 'echo'], ['日', 'echo'], ['铃', 'player']]);
  assert.deepEqual(snapshot.stations.pass.pattern.map(p => [p.label, p.actor]), [['铃', 'echo'], ['叶', 'player'], ['日', 'echo']]);
  assert.deepEqual(MOUNTAIN_NOTE_LABELS, { leaf: '叶', sun: '日', bell: '铃' });
});

test('observe, assign and confirmation validate whitelist stations, unlock order and bounded coordinates', () => {
  const model = new MountainRelay();
  for (const id of ['__proto__', 'constructor', 'forest', '', null, 0]) {
    assert.equal(model.observe(id, station('lesson').instruction).error, 'invalid-station');
    assert.equal(model.assign(id, station('lesson').command).error, 'invalid-station');
    assert.equal(model.ringPlayer(id, 'leaf', station('lesson').playerBells.leaf).error, 'invalid-station');
    assert.equal(model.confirmSaved(id).error, 'invalid-station');
  }
  for (const p of [null, {}, { x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: '540', y: 1080 }, { x: -1, y: 0 }, { x: 2101, y: 0 }]) {
    assert.equal(model.observe('lesson', p).error, 'invalid-position');
    assert.equal(model.assign('lesson', p).error, 'invalid-position');
  }
  assert.equal(model.assign('lesson', station('lesson').command).error, 'not-observed');
  assert.equal(model.observe('pass', station('pass').instruction).error, 'locked');
  assert.equal(model.confirmSaved('lesson').error, 'not-matched');
  assert.equal(model.confirmSaved('pass').error, 'not-matched');
});

test('instruction and assignment each require their own proximity and assignment does not fabricate echo arrival', () => {
  const model = new MountainRelay(), lesson = station('lesson');
  assert.equal(model.observe('lesson', { x: lesson.instruction.x + MOUNTAIN_OBSERVE_RADIUS + .01, y: lesson.instruction.y }).error, 'far-from-instruction');
  assert.equal(model.observe('lesson', { x: lesson.instruction.x + MOUNTAIN_OBSERVE_RADIUS, y: lesson.instruction.y }).ok, true);
  assert.equal(model.getSnapshot().phase, 'observed');
  assert.equal(model.assign('lesson', { x: lesson.command.x + MOUNTAIN_ASSIGN_RADIUS + .01, y: lesson.command.y }).error, 'far-from-command');
  const result = model.assign('lesson', { x: lesson.command.x + MOUNTAIN_ASSIGN_RADIUS, y: lesson.command.y });
  assert.equal(result.ok, true); assert.deepEqual(result.target, lesson.echo);
  assert.equal(result.route, MOUNTAIN_ECHO_ROUTES['lesson-echo']);
  assert.equal(model.getSnapshot().phase, 'awaitingEcho');
  assert.equal(model.getSnapshot().echoPresent, false);
  assert.deepEqual(result.events, []);
});

test('unassigned, travelling or recalled echo cannot produce a note even if commands are spammed', () => {
  const model = new MountainRelay(), lesson = station('lesson');
  assert.deepEqual(advance(model, 3000), []);
  model.observe('lesson', lesson.instruction); model.assign('lesson', lesson.command);
  for (let i = 0; i < 100; i++) {
    assert.equal(model.observe('lesson', lesson.instruction).ok, true);
    assert.equal(model.assign('lesson', lesson.command).duplicate, true);
    assert.deepEqual(model.update(0, lesson.echo, true), []);
  }
  assert.equal(model.getSnapshot().played, 0); assert.equal(model.getSnapshot().echoElapsedMs, 0);
  assert.deepEqual(advance(model, 3000, 'lesson', false), []);
  assert.deepEqual(model.update(100, lesson.command, true), []);
  assert.equal(model.getSnapshot().echoPresent, false);
});

test('the first echo note needs 900ms of real stable occupancy, including the exact 24px boundary', () => {
  const model = assigned(), echo = station('lesson').echo;
  assert.deepEqual(advance(model, 899), []);
  assert.equal(model.getSnapshot().played, 0);
  assert.equal(model.assign('lesson', station('lesson').command).duplicate, true);
  assert.equal(model.getSnapshot().echoElapsedMs, 899, 'a repeated command neither resets nor advances the timer');
  const note = model.update(1, { x: echo.x + MOUNTAIN_ECHO_RADIUS, y: echo.y }, true);
  assert.deepEqual(note, [{ type: 'note', station: 'lesson', actor: 'echo', note: 'leaf', index: 0 }]);
  assert.equal(model.getSnapshot().played, 1);
  advance(model, 800);
  model.update(0, { x: echo.x + MOUNTAIN_ECHO_RADIUS + .01, y: echo.y }, true);
  assert.equal(model.getSnapshot().echoElapsedMs, 0, 'leaving the pad loses only the current unfinished hold');
  assert.equal(model.getSnapshot().played, 1, 'the matched prefix is retained');
  assert.deepEqual(advance(model, 899), []);
  assert.equal(model.update(1, echo, true)[0].note, 'sun');
});

test('lesson plays two echo notes then waits without time pressure for the player at the bell location', () => {
  const model = assigned();
  assert.equal(player(model, 'lesson', 'bell').error, 'echo-not-ready');
  model.update(0, station('lesson').echo, true);
  assert.equal(player(model, 'lesson', 'bell').error, 'not-player-turn');
  const notes = advance(model, 1800);
  assert.deepEqual(notes.map(e => [e.actor, e.note]), [['echo', 'leaf'], ['echo', 'sun']]);
  assert.equal(model.getSnapshot().phase, 'awaitingPlayer');
  assert.equal(model.getSnapshot().playerWait, true);
  assert.deepEqual(advance(model, 30000), []);
  assert.equal(model.getSnapshot().played, 2); assert.equal(model.getSnapshot().echoElapsedMs, 0);
  const result = player(model, 'lesson', 'bell');
  assert.deepEqual(result.events, [{ type: 'note', station: 'lesson', actor: 'player', note: 'bell', index: 2 }, { type: 'matched', station: 'lesson' }]);
  assert.equal(model.getSnapshot().phase, 'matchedPendingSave');
});

test('every player note checks its own fixed bell, and a wrong nearby note retains the matched prefix', () => {
  const model = assigned(); advance(model, 1800);
  const before = model.getSnapshot();
  assert.equal(model.ringPlayer('lesson', 'bell', station('lesson').playerBells.leaf).error, 'far-from-bell');
  for (const note of ['leaf', 'sun']) assert.equal(player(model, 'lesson', note).error, 'wrong-note');
  for (const note of ['__proto__', 'bells', null, 1]) assert.equal(model.ringPlayer('lesson', note, station('lesson').playerBells.bell).error, 'invalid-note');
  assert.deepEqual(model.getSnapshot(), before);
  const bell = station('lesson').playerBells.bell;
  assert.equal(model.ringPlayer('lesson', 'bell', { x: bell.x + MOUNTAIN_BELL_RADIUS + .01, y: bell.y }).error, 'far-from-bell');
  assert.equal(model.ringPlayer('lesson', 'bell', { x: bell.x + MOUNTAIN_BELL_RADIUS, y: bell.y }).ok, true);
});

test('an echo that stops staying blocks player input until a fresh actual occupancy sample', () => {
  const model = assigned(); advance(model, 1800);
  for (const stays of [false, 'true', 1, undefined]) {
    model.update(0, station('lesson').echo, stays);
    assert.equal(player(model, 'lesson', 'bell').error, 'echo-not-ready');
    assert.equal(model.getSnapshot().played, 2);
  }
  model.update(0, station('lesson').echo, true);
  assert.equal(player(model, 'lesson', 'bell').ok, true);
});

test('an unsaved lesson match emits once and cannot be cancelled, replayed or used to unlock pass', () => {
  const { model, events } = matchLesson();
  assert.equal(events.filter(e => e.type === 'matched').length, 1);
  for (let i = 0; i < 5; i++) {
    assert.equal(model.getSnapshot().matchedPendingSave, 'lesson');
    assert.equal(model.getSnapshot().confirmed.lesson, false);
    assert.equal(model.cancel().error, 'awaiting-save');
    assert.equal(model.assign('lesson', station('lesson').command).error, 'awaiting-save');
    assert.equal(player(model, 'lesson', 'bell').error, 'awaiting-save');
    assert.equal(model.observe('pass', station('pass').instruction).error, 'locked');
    assert.deepEqual(advance(model, 1000), []);
  }
  assert.equal(model.confirmSaved('pass').error, 'not-matched');
  assert.equal(model.confirmSaved('lesson').ok, true);
  assert.equal(model.confirmSaved('lesson').duplicate, true);
  assert.equal(model.getSnapshot().phase, 'idle');
  assert.equal(model.getSnapshot().matchedPendingSave, null);
  assert.equal(model.observe('pass', station('pass').instruction).ok, true);
});

test('pass really alternates echo bell, player leaf, then echo sun instead of replaying the lesson pattern', () => {
  const model = assigned('pass');
  const first = advance(model, 900, 'pass');
  assert.deepEqual(first, [{ type: 'note', station: 'pass', actor: 'echo', note: 'bell', index: 0 }]);
  assert.equal(model.getSnapshot().phase, 'awaitingPlayer');
  assert.equal(model.getSnapshot().next.label, '叶');
  assert.deepEqual(advance(model, 30000, 'pass'), []);
  assert.equal(player(model, 'pass', 'sun').error, 'wrong-note');
  const middle = player(model, 'pass', 'leaf');
  assert.deepEqual(middle.events, [{ type: 'note', station: 'pass', actor: 'player', note: 'leaf', index: 1 }]);
  assert.equal(model.getSnapshot().phase, 'echoPlaying');
  assert.equal(player(model, 'pass', 'leaf').error, 'not-player-turn');
  assert.deepEqual(advance(model, 899, 'pass'), []);
  assert.deepEqual(model.update(1, station('pass').echo, true), [
    { type: 'note', station: 'pass', actor: 'echo', note: 'sun', index: 2 }, { type: 'matched', station: 'pass' },
  ]);
  assert.equal(model.getSnapshot().confirmed.pass, false);
  assert.deepEqual(advance(model, 10000, 'pass'), []);
  assert.equal(model.confirmSaved('pass').ok, true);
  assert.equal(model.getSnapshot().phase, 'complete');
  assert.equal(model.confirmSaved('pass').duplicate, true);
  assert.equal(model.assign('pass', station('pass').command).error, 'finished');
});

test('explicit cancellation resets only the live attempt and requires a new real arrival after reassignment', () => {
  const model = assigned(); advance(model, 900);
  assert.equal(model.cancel().ok, true);
  assert.equal(model.getSnapshot().phase, 'idle'); assert.equal(model.getSnapshot().played, 0);
  assert.equal(model.getSnapshot().stations.lesson.observed, true);
  assert.deepEqual(advance(model, 10000), []);
  assert.equal(model.assign('lesson', station('lesson').command).ok, true);
  assert.equal(model.getSnapshot().echoPresent, false);
  assert.deepEqual(advance(model, 899), []);
  assert.equal(model.update(1, station('lesson').echo, true)[0].note, 'leaf');
});

test('restore accepts only confirmed checkpoints and never restores observation, timing or an unsaved matching attempt', () => {
  const fresh = new MountainRelay().getSnapshot();
  for (const input of [null, 'matchedPendingSave', 'constructor', 1, { lesson: true }, { phase: 'complete' }]) {
    assert.deepEqual(new MountainRelay(input).getSnapshot(), fresh);
  }
  const lesson = new MountainRelay('lesson');
  assert.deepEqual(lesson.getSnapshot().confirmed, { lesson: true, pass: false });
  assert.equal(lesson.getSnapshot().phase, 'idle');
  assert.equal(lesson.getSnapshot().stations.pass.observed, false);
  assert.equal(lesson.assign('pass', station('pass').command).error, 'not-observed');
  assert.deepEqual(advance(lesson, 10000, 'pass'), []);
  const complete = new MountainRelay('pass');
  assert.equal(complete.getSnapshot().phase, 'complete');
  assert.deepEqual(complete.getSnapshot().confirmed, { lesson: true, pass: true });
  assert.deepEqual(advance(complete, 10000, 'pass'), []);
});

test('paused and invalid updates cannot advance notes or preserve malformed occupancy, and a stalled frame is capped', () => {
  const model = assigned(); advance(model, 400);
  const before = model.getSnapshot();
  for (let i = 0; i < 100; i++) model.update(0, station('lesson').echo, true);
  assert.deepEqual(model.getSnapshot(), before);
  for (const delta of [NaN, Infinity, -Infinity, -1, undefined, '900']) {
    assert.deepEqual(model.update(delta, station('lesson').echo, true), []);
    assert.equal(model.getSnapshot().echoPresent, false); assert.equal(model.getSnapshot().echoElapsedMs, 0);
  }
  assert.deepEqual(model.update(100000, station('lesson').echo, true), []);
  assert.equal(model.getSnapshot().echoElapsedMs, MOUNTAIN_MAX_DELTA_MS);
  assert.equal(model.getSnapshot().played, 0);
});

test('equivalent real frame partitions produce the same two-note prefix and cannot bank player-wait time', () => {
  const a = assigned(), b = assigned();
  assert.deepEqual(advance(a, 1800, 'lesson', true, 16), advance(b, 1800, 'lesson', true, 100));
  assert.deepEqual(a.getSnapshot(), b.getSnapshot());
  const pass = assigned('pass'); advance(pass, 900, 'pass'); advance(pass, 10000, 'pass');
  player(pass, 'pass', 'leaf');
  assert.deepEqual(pass.update(100, station('pass').echo, true), []);
  assert.equal(pass.getSnapshot().echoElapsedMs, 100);
});

test('snapshots, visual patterns, assignment routes and emitted events cannot mutate model state', () => {
  const model = assigned(), snapshot = model.getSnapshot();
  assert.throws(() => { snapshot.confirmed.pass = true; }, TypeError);
  assert.throws(() => { snapshot.stations.lesson.pattern[0].note = 'bell'; }, TypeError);
  assert.throws(() => { snapshot.echoTarget.x = 0; }, TypeError);
  const route = model.assign('lesson', station('lesson').command).route;
  assert.throws(() => { route.waypoints[0].x = 0; }, TypeError);
  assert.throws(() => { route.waypoints.push({ x: 0, y: 0 }); }, TypeError);
  const event = advance(model, 900)[0];
  assert.throws(() => { event.note = 'sun'; }, TypeError);
  assert.equal(model.getSnapshot().played, 1);
});

function sampleSegment(a, b, step = 5) {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  return Array.from({ length: count + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count }));
}
test('authored relay routes are whitelisted, connected safe paths and the pass echo genuinely walks a separate 400px route', () => {
  for (const id of ['lesson', 'pass']) {
    const s = station(id), route = MOUNTAIN_ECHO_ROUTES[s.routeId];
    assert.equal(route.station, id);
    assert.deepEqual(route.waypoints[0], s.command); assert.deepEqual(route.waypoints.at(-1), s.echo);
    assert.ok(isMountainSafe(s.instruction)); assert.ok(isMountainSafe(s.command)); assert.ok(isMountainSafe(s.echo));
    for (const bell of Object.values(s.playerBells)) assert.ok(isMountainSafe(bell));
    for (let i = 1; i < route.waypoints.length; i++) {
      assert.ok(sampleSegment(route.waypoints[i - 1], route.waypoints[i]).every(p => isMountainSafe(p)), `${id} must not cross a cliff`);
    }
    const bells = Object.values(s.playerBells);
    for (let i = 0; i < bells.length; i++) for (let j = i + 1; j < bells.length; j++) {
      assert.ok(Math.hypot(bells[i].x - bells[j].x, bells[i].y - bells[j].y) > MOUNTAIN_BELL_RADIUS * 2, 'no position can ring two different bells');
    }
  }
  const route = MOUNTAIN_ECHO_ROUTES['pass-echo'].waypoints;
  const length = route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.y - route[i].y), 0);
  assert.ok(length > 400 && length < 500);
});

test('shared mountain geometry has continuous 12px joins, a real optional wind branch and a gate that blocks the entire bridge', () => {
  for (const path of MOUNTAIN_PATHS) {
    assert.ok(path.width >= 150);
    for (let i = 1; i < path.waypoints.length; i++) assert.ok(sampleSegment(path.waypoints[i - 1], path.waypoints[i]).every(p =>
      isMountainSafe(p, { windOpen: true, gateOpen: true })), `${path.id} has an unsafe seam`);
  }
  for (const plaza of MOUNTAIN_PLAZAS) assert.ok(isMountainSafe(plaza, { windOpen: true, gateOpen: true }));
  for (const point of Object.values(MOUNTAIN_CHECKPOINTS)) assert.ok(isMountainSafe(point, { gateOpen: true }));
  assert.equal(isMountainSafe(MOUNTAIN_DISCOVERY), false);
  assert.equal(isMountainSafe(MOUNTAIN_DISCOVERY, { windOpen: true }), true);
  assert.equal(isMountainSafe({ x: 1720, y: 390 }), false);
  assert.equal(isMountainSafe({ x: 1720, y: 390 }, { gateOpen: true }), true);
  assert.equal(isMountainSafe({ x: MOUNTAIN_GATE.x - 12, y: 390 }), false);
  assert.equal(isMountainSafe({ x: MOUNTAIN_GATE.x - 12 - .01, y: 390 }), true);
  assert.equal(isMountainSafe({ x: 900, y: 420 }), false, 'background slopes are not hidden walkable shortcuts');
  assert.equal(isMountainSafe({ x: NaN, y: 100 }), false);
  assert.equal(isMountainSafe(MOUNTAIN_SPAWN, {}, -1), false);
});

function canWalkTo(goal, options) {
  const queue = [MOUNTAIN_SPAWN], seen = new Set([`${MOUNTAIN_SPAWN.x},${MOUNTAIN_SPAWN.y}`]);
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index];
    if (p.x === goal.x && p.y === goal.y) return true;
    for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
      const next = { x: p.x + dx, y: p.y + dy }, key = `${next.x},${next.y}`;
      if (next.x < 0 || next.y < 0 || next.x > MOUNTAIN_WORLD.width || next.y > MOUNTAIN_WORLD.height || seen.has(key)) continue;
      seen.add(key);
      if (isMountainSafe(next, options)) queue.push(next);
    }
  }
  return false;
}
test('the wide main path reaches both relay sites without wind, while neither route bypasses the unconfirmed pass gate', () => {
  assert.equal(canWalkTo(station('pass').playerBells.leaf, {}), true);
  assert.equal(canWalkTo(MOUNTAIN_NPC, {}), false);
  assert.equal(canWalkTo(MOUNTAIN_NPC, { windOpen: true }), false);
  assert.equal(canWalkTo(MOUNTAIN_NPC, { gateOpen: true }), true);
});
