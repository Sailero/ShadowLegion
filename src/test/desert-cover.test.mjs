import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PairedCover, COVER_ASSIGN_RADIUS, COVER_ECHO_RADIUS, COVER_GRIP_RADIUS,
  COVER_READ_RADIUS, COVER_MIN_SPAN, COVER_MAX_SPAN,
} from '../systems/PairedCover.ts';
import {
  DESERT_WORLD, DESERT_ANCHORS, DESERT_PUZZLES, DESERT_PATHS, DESERT_PLAZAS,
  DESERT_OBSTACLES, DESERT_CHECKPOINTS, DESERT_NPC, DESERT_DISCOVERY, isDesertSafe,
} from '../data/desert.ts';

const anchor = id => DESERT_ANCHORS[id];
const stateAt = id => id === 'lesson' ? 'start' : id === 'courtyard' ? 'stones' : 'lesson';
function sample(model, id, player, extra = {}, delta = 0) {
  return model.update(delta, { player, echo: anchor(id).echo, echoStays: true, ...extra });
}
function assigned(id = 'lesson') {
  const model = new PairedCover(stateAt(id));
  const result = model.assign(id, anchor(id).command);
  assert.equal(result.ok, true);
  assert.equal(result.route, anchor(id).route);
  return model;
}
function holding(id = 'lesson') {
  const model = assigned(id);
  sample(model, id, anchor(id).foldedGrip);
  assert.equal(model.grip(anchor(id).foldedGrip).ok, true);
  return model;
}
const solutions = { lesson: { x: 740, y: 1200 }, 'stones-east': { x: 1660, y: 740 }, courtyard: { x: 1990, y: 500 } };
function solve(id = 'lesson') {
  const model = holding(id);
  assert.deepEqual(sample(model, id, solutions[id]), []);
  const action = model.read(anchor(id).puzzle, solutions[id]);
  assert.equal(action.ok, true);
  return { model, action };
}

test('only real ordered checkpoints restore progress; no dynamic sample, held corner or pending match is restored', () => {
  const fresh = new PairedCover().getSnapshot();
  for (const value of [null, 0, 'complete', '__proto__', { courtyard: true }, { matchedPendingSave: 'courtyard' }]) {
    assert.deepEqual(new PairedCover(value).getSnapshot(), fresh);
  }
  assert.deepEqual(new PairedCover('lesson').getSnapshot().confirmed, { lesson: true, stones: false, courtyard: false });
  assert.deepEqual(new PairedCover('stones').getSnapshot().confirmed, { lesson: true, stones: true, courtyard: false });
  const complete = new PairedCover('courtyard').getSnapshot();
  assert.equal(complete.phase, 'complete'); assert.equal(complete.playerHolding, false); assert.equal(complete.activeAnchor, null);
  assert.deepEqual(complete.grips.courtyard, anchor('courtyard').foldedGrip);
});

test('anchor and puzzle whitelists, safe positions and the preceding saved lesson are enforced by the actual model', () => {
  const model = new PairedCover();
  for (const id of ['__proto__', 'constructor', 'mountain', null, 1]) {
    assert.equal(model.assign(id, anchor('lesson').command).error, 'invalid-anchor');
    assert.equal(model.read(id, solutions.lesson).error, 'invalid-puzzle');
    assert.equal(model.confirmSaved(id).error, 'invalid-puzzle');
  }
  for (const p of [null, {}, { x: NaN, y: 10 }, { x: 0, y: Infinity }, { x: '430', y: 1260 }, { x: 2401, y: 20 }, { x: 1400, y: 950 }]) {
    assert.equal(model.assign('lesson', p).error, 'invalid-position');
    assert.equal(model.grip(p).error, 'invalid-position');
  }
  assert.equal(model.assign('stones-east', anchor('stones-east').command).error, 'locked');
  assert.equal(model.assign('courtyard', anchor('courtyard').command).error, 'locked');
  assert.equal(model.confirmSaved('lesson').error, 'not-matched');
  assert.equal(model.grip(anchor('lesson').foldedGrip).error, 'not-assigned');
});

test('assignment checks its own 85px command range and never treats the request or an unassigned echo as arrival', () => {
  const model = new PairedCover(), config = anchor('lesson');
  sample(model, 'lesson', config.foldedGrip);
  assert.equal(model.getSnapshot().echoPresent, false);
  const edge = { x: config.command.x + COVER_ASSIGN_RADIUS, y: config.command.y };
  assert.equal(model.assign('lesson', { ...edge, x: edge.x + .01 }).error, 'far-from-command');
  const result = model.assign('lesson', edge);
  assert.equal(result.ok, true); assert.deepEqual(result.target, config.echo);
  assert.equal(model.getSnapshot().phase, 'awaitingEcho');
  assert.equal(model.grip(config.foldedGrip).error, 'echo-not-ready');
  for (let i = 0; i < 100; i++) assert.equal(model.assign('lesson', edge).duplicate, true);
  assert.equal(model.getSnapshot().echoPresent, false); assert.equal(model.getSnapshot().matchedPendingSave, null);
});

test('a travelling or recalled echo cannot hold the cloth; the exact 24px occupancy boundary and actual grip range apply', () => {
  const model = assigned(), config = anchor('lesson');
  sample(model, 'lesson', config.foldedGrip, { echo: config.command });
  assert.equal(model.grip(config.foldedGrip).error, 'echo-not-ready');
  for (const echoStays of [false, 'true', 1, undefined]) {
    sample(model, 'lesson', config.foldedGrip, { echoStays });
    assert.equal(model.getSnapshot().echoPresent, false);
  }
  sample(model, 'lesson', config.foldedGrip, { echo: { x: config.echo.x, y: config.echo.y + COVER_ECHO_RADIUS + .01 } });
  assert.equal(model.getSnapshot().echoPresent, false);
  sample(model, 'lesson', config.foldedGrip, { echo: { x: config.echo.x, y: config.echo.y + COVER_ECHO_RADIUS } });
  assert.equal(model.getSnapshot().echoPresent, true);
  const edge = { x: config.foldedGrip.x + COVER_GRIP_RADIUS, y: config.foldedGrip.y };
  assert.equal(model.grip({ ...edge, x: edge.x + .01 }).error, 'far-from-grip');
  assert.equal(model.grip(edge).ok, true);
  assert.equal(model.getSnapshot().phase, 'holding');
});

test('a short real cloth has no taut coverage; actual movement changes the rectangle rather than snapping its ends', () => {
  const model = holding();
  assert.equal(model.getSnapshot().taut, false); assert.equal(model.getSnapshot().spanLength, 40);
  assert.deepEqual(model.getSnapshot().shadowPolygon, [{ x: 500, y: 1280 }, { x: 540, y: 1280 }, { x: 540, y: 1120 }, { x: 500, y: 1120 }]);
  const diagonal = { x: 700, y: 1240 };
  sample(model, 'lesson', diagonal);
  const snapshot = model.getSnapshot();
  assert.equal(snapshot.taut, true);
  assert.ok(Math.abs(snapshot.spanLength - Math.hypot(200, 40)) < 1e-9);
  assert.deepEqual(snapshot.playerPosition, diagonal);
  assert.ok(snapshot.shadowPolygon[0].x < 500 && snapshot.shadowPolygon[0].y < 1280, 'the real orientation rotated the complete shadow');
  assert.equal(snapshot.matchedPendingSave, null, 'covering never automatically reads a sign');
});

test('the target needs its complete 16px radius plus 8px margin, not merely its center beneath the cloth', () => {
  const model = holding();
  const tooCloseToEnd = { x: 700, y: 1200 };
  sample(model, 'lesson', tooCloseToEnd);
  assert.equal(model.getSnapshot().spanLength, COVER_MIN_SPAN);
  assert.equal(model.getSnapshot().coveredTargets['lesson-sign'], false, 'the center at x690 is inside, but only 10px from the end');
  assert.equal(model.read('lesson', tooCloseToEnd).error, 'not-covered');
  const exactMargin = { x: 714, y: 1200 };
  sample(model, 'lesson', exactMargin);
  assert.equal(model.getSnapshot().coveredTargets['lesson-sign'], true);
  assert.equal(model.read('lesson', exactMargin).ok, true);
});

test('read requires the fresh actual player sample and a reachable 65px interaction instead of remote completion', () => {
  const model = holding();
  sample(model, 'lesson', { x: 760, y: 1200 });
  assert.equal(model.getSnapshot().taut, true);
  assert.equal(model.read('lesson', solutions.lesson).error, 'invalid-position');
  assert.equal(model.read('lesson', { x: 760, y: 1200 }).error, 'far-from-target');
  const target = DESERT_PUZZLES.lesson.targets[0];
  const edge = { x: target.x + COVER_READ_RADIUS, y: target.y };
  assert.deepEqual(sample(model, 'lesson', edge), []);
  assert.equal(model.read('lesson', edge).ok, true);
});

test('overstretch releases once at the last legal corner, which remains recoverable after moving back', () => {
  const model = holding(), valid = { x: 760, y: 1200 };
  sample(model, 'lesson', valid);
  assert.equal(model.getSnapshot().spanLength, COVER_MAX_SPAN);
  const released = sample(model, 'lesson', { x: 760.01, y: 1200 });
  assert.deepEqual(released, [{ type: 'released', reason: 'overstretched', grip: valid }]);
  assert.equal(model.getSnapshot().playerHolding, false);
  assert.deepEqual(sample(model, 'lesson', { x: 770, y: 1200 }), []);
  assert.equal(model.read('lesson', { x: 770, y: 1200 }).error, 'not-holding');
  sample(model, 'lesson', valid);
  assert.equal(model.grip(valid).ok, true);
  assert.equal(model.getSnapshot().playerHolding, true);
});

test('the whole cloth face hits stone even when both actors and all four corners are outside the stone rectangle', () => {
  const model = holding('stones-west'), end = { x: 1530, y: 980 }, stone = DESERT_OBSTACLES[0];
  assert.ok(isDesertSafe(anchor('stones-west').echo)); assert.ok(isDesertSafe(end));
  for (const p of [{ x: 1270, y: 900 }, { x: 1530, y: 900 }, { x: 1530, y: 1060 }, { x: 1270, y: 1060 }]) {
    assert.equal(p.x >= stone.x && p.x <= stone.x + stone.width && p.y >= stone.y && p.y <= stone.y + stone.height, false);
  }
  const events = sample(model, 'stones-west', end);
  assert.equal(events[0].reason, 'obstructed');
  assert.deepEqual(events[0].grip, anchor('stones-west').foldedGrip);
  assert.equal(model.getSnapshot().coveredTargets['stones-sign'], false);
});

test('a legal endpoint reached safely around the north cannot be reached by sweeping the same cloth through the stones', () => {
  const start = { x: 1660, y: 800 }, end = { x: 1180, y: 800 };
  const around = holding('stones-east');
  sample(around, 'stones-east', { x: 1660, y: 740 });
  for (let degrees = 5; degrees <= 180; degrees += 5) {
    const angle = -degrees * Math.PI / 180;
    const p = { x: 1420 + 240 * Math.cos(angle), y: 740 + 240 * Math.sin(angle) };
    assert.deepEqual(sample(around, 'stones-east', p), [], 'walking the actual clear northern arc is permitted');
  }
  assert.deepEqual(sample(around, 'stones-east', end), []);
  assert.equal(around.getSnapshot().playerHolding, true, 'the destination itself is legal');
  const crossing = holding('stones-east');
  assert.deepEqual(sample(crossing, 'stones-east', start), []);
  assert.equal(crossing.getSnapshot().playerHolding, true, 'the starting rectangle is also legal');
  const events = sample(crossing, 'stones-east', end);
  assert.deepEqual(events, [{ type: 'released', reason: 'obstructed', grip: start }]);
  assert.equal(crossing.getSnapshot().playerHolding, false);
});

test('explicit release and recall retain each local cloth corner and prevent changing anchors while a cloth is assigned', () => {
  const model = holding('stones-west');
  const laid = { x: 1080, y: 980 };
  sample(model, 'stones-west', laid);
  assert.equal(model.release().ok, true);
  assert.equal(model.getSnapshot().phase, 'laid');
  assert.equal(model.assign('stones-east', anchor('stones-east').command).error, 'other-anchor-active');
  assert.equal(model.cancel().ok, true);
  assert.deepEqual(model.getSnapshot().grips['stones-west'], laid);
  assert.deepEqual(model.getSnapshot().grips['stones-east'], anchor('stones-east').foldedGrip);
  assert.equal(model.assign('stones-east', anchor('stones-east').command).ok, true);
  model.cancel(); model.assign('stones-west', anchor('stones-west').command);
  sample(model, 'stones-west', laid);
  assert.deepEqual(model.getSnapshot().grip, laid);
  assert.equal(model.grip(laid).ok, true);
});

test('two courtyard targets must be covered in one current pose, never accumulated across earlier placements', () => {
  const model = holding('courtyard');
  const cushionOnly = { x: 1980, y: 580 }, signOnly = { x: 1990, y: 430 };
  assert.deepEqual(sample(model, 'courtyard', cushionOnly), []);
  assert.deepEqual(model.getSnapshot().coveredTargets, { 'courtyard-sign': false, 'courtyard-cushion': true });
  assert.deepEqual(sample(model, 'courtyard', signOnly), []);
  assert.deepEqual(model.getSnapshot().coveredTargets, { 'courtyard-sign': true, 'courtyard-cushion': false });
  assert.equal(model.read('courtyard', signOnly).error, 'not-covered');
  assert.equal(model.getSnapshot().matchedPendingSave, null);
  assert.deepEqual(sample(model, 'courtyard', solutions.courtyard), []);
  assert.deepEqual(model.getSnapshot().coveredTargets, { 'courtyard-sign': true, 'courtyard-cushion': true });
  assert.equal(model.read('courtyard', solutions.courtyard).ok, true);
});

test('an actual successful read emits once and remains pending across failed-save opportunities or recall attempts', () => {
  const { model, action } = solve();
  assert.deepEqual(action.events, [{ type: 'matched', puzzle: 'lesson' }]);
  for (let i = 0; i < 10; i++) {
    assert.equal(model.read('lesson', solutions.lesson).error, 'awaiting-save');
    assert.equal(model.release().error, 'awaiting-save'); assert.equal(model.cancel().error, 'awaiting-save');
    assert.equal(model.getSnapshot().confirmed.lesson, false);
    assert.equal(model.getSnapshot().matchedPendingSave, 'lesson');
    assert.deepEqual(sample(model, 'lesson', solutions.lesson, {}, 100), []);
  }
  assert.equal(model.confirmSaved('stones').error, 'not-matched');
  assert.equal(model.confirmSaved('lesson').ok, true);
  assert.equal(model.confirmSaved('lesson').duplicate, true);
  assert.equal(model.getSnapshot().activeAnchor, null);
  assert.equal(model.assign('stones-east', anchor('stones-east').command).ok, true);
});

test('a matched read lays down the real corner while pending save, even when both cats later leave', () => {
  const { model, action } = solve();
  assert.deepEqual(action.events, [{ type: 'matched', puzzle: 'lesson' }]);
  const matched = model.getSnapshot();
  assert.equal(matched.phase, 'matchedPendingSave');
  assert.equal(matched.playerHolding, false);
  assert.deepEqual(matched.shadowPolygon, []);
  assert.deepEqual(matched.grip, solutions.lesson);

  for (const player of [{ x: 1020, y: 1100 }, { x: 1640, y: 650 }, DESERT_NPC]) {
    assert.equal(isDesertSafe(player), true);
    for (const delta of [0, 16, 100]) {
      assert.deepEqual(model.update(delta, { player, echo: DESERT_CHECKPOINTS.start, echoStays: false }), []);
      const snapshot = model.getSnapshot();
      assert.equal(snapshot.playerHolding, false);
      assert.deepEqual(snapshot.shadowPolygon, []);
      assert.deepEqual(snapshot.grips.lesson, solutions.lesson);
      assert.equal(snapshot.matchedPendingSave, 'lesson');
      assert.equal(snapshot.confirmed.lesson, false);
    }
  }
  assert.equal(model.read('lesson', DESERT_NPC).error, 'awaiting-save');
  assert.deepEqual(model.confirmSaved('lesson').events, []);
  assert.equal(model.getSnapshot().confirmed.lesson, true);
  assert.equal(model.getSnapshot().matchedPendingSave, null);
  assert.deepEqual(model.getSnapshot().grips.lesson, solutions.lesson);
  assert.equal(model.confirmSaved('lesson').duplicate, true);
  assert.deepEqual(model.update(0, { player: DESERT_NPC, echo: DESERT_CHECKPOINTS.start, echoStays: false }), []);
});

test('all three real correct poses can be read and saved sequentially without granting a delivery or skipping a puzzle', () => {
  const model = new PairedCover();
  for (const id of ['lesson', 'stones-east', 'courtyard']) {
    assert.equal(model.assign(id, anchor(id).command).ok, true);
    sample(model, id, anchor(id).foldedGrip); assert.equal(model.grip(anchor(id).foldedGrip).ok, true);
    assert.deepEqual(sample(model, id, solutions[id]), []);
    const puzzle = anchor(id).puzzle;
    assert.deepEqual(model.read(puzzle, solutions[id]).events, [{ type: 'matched', puzzle }]);
    assert.equal(model.confirmSaved(puzzle).ok, true);
  }
  const snapshot = model.getSnapshot();
  assert.equal(snapshot.phase, 'complete');
  assert.deepEqual(snapshot.confirmed, { lesson: true, stones: true, courtyard: true });
  assert.equal('delivery' in snapshot, false);
});

test('echo movement, recall and malformed frames release an unfinished cloth without preserving stale coverage', () => {
  for (const error of ['echo-left', 'invalid-position']) {
    const model = holding(); sample(model, 'lesson', solutions.lesson);
    const events = error === 'echo-left' ? sample(model, 'lesson', solutions.lesson, { echoStays: false })
      : model.update(NaN, { player: solutions.lesson, echo: anchor('lesson').echo, echoStays: true });
    assert.equal(events[0].reason, error); assert.deepEqual(events[0].grip, solutions.lesson);
    assert.equal(model.getSnapshot().playerHolding, false);
    assert.equal(model.getSnapshot().coveredTargets['lesson-sign'], false);
  }
  const moved = holding(); sample(moved, 'lesson', solutions.lesson);
  assert.equal(sample(moved, 'lesson', solutions.lesson, { echo: { x: 525, y: 1200 } })[0].reason, 'echo-left');
});

test('zero-time refresh handles real invalidation; positive elapsed time or repeated commands cannot fabricate a match', () => {
  const model = holding();
  for (const delta of [0, 16, 50, 100, 999999]) {
    assert.deepEqual(sample(model, 'lesson', solutions.lesson, {}, delta), []);
    assert.equal(model.grip(solutions.lesson).duplicate, true);
    assert.equal(model.getSnapshot().matchedPendingSave, null);
  }
  const paused = model.getSnapshot();
  for (let i = 0; i < 100; i++) assert.deepEqual(model.getSnapshot(), paused);
  assert.equal(sample(model, 'lesson', solutions.lesson, { echoStays: false }, 0)[0].type, 'released');
});

test('snapshots and events deeply isolate every local grip, coverage flag, route and confirmed milestone', () => {
  const model = holding(); sample(model, 'lesson', solutions.lesson);
  const snapshot = model.getSnapshot();
  assert.deepEqual(snapshot.grips.lesson, solutions.lesson);
  assert.throws(() => { snapshot.grips.lesson.x = 0; }, TypeError);
  assert.throws(() => { snapshot.grips['stones-east'] = { x: 0, y: 0 }; }, TypeError);
  assert.throws(() => { snapshot.shadowPolygon[0].y = 0; }, TypeError);
  assert.throws(() => { snapshot.coveredTargets['lesson-sign'] = false; }, TypeError);
  assert.throws(() => { snapshot.confirmed.courtyard = true; }, TypeError);
  model.cancel();
  assert.deepEqual(model.getSnapshot().grips.lesson, solutions.lesson, 'inactive cloth still exposes its real last corner');
  assert.equal(snapshot.playerHolding, true, 'an older snapshot cannot change after cancellation');
  const result = model.assign('lesson', anchor('lesson').command);
  assert.throws(() => { result.route.waypoints[0].x = 0; }, TypeError);
  sample(model, 'lesson', solutions.lesson); model.grip(solutions.lesson);
  const event = model.read('lesson', solutions.lesson).events[0];
  assert.throws(() => { event.puzzle = 'courtyard'; }, TypeError);
});

function segmentPoints(a, b, step = 5) {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  return Array.from({ length: count + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count }));
}
test('shared safe geometry preserves 12px clearance, continuous path joins, every checkpoint and all authored echo routes', () => {
  for (const point of [...Object.values(DESERT_CHECKPOINTS), DESERT_NPC, DESERT_DISCOVERY]) assert.ok(isDesertSafe(point));
  for (const plaza of DESERT_PLAZAS) assert.ok(isDesertSafe(plaza), plaza.id);
  for (const path of DESERT_PATHS) for (let i = 1; i < path.waypoints.length; i++) {
    assert.ok(segmentPoints(path.waypoints[i - 1], path.waypoints[i]).every(p => isDesertSafe(p)), path.id);
  }
  for (const config of Object.values(DESERT_ANCHORS)) {
    assert.deepEqual(config.route.waypoints[0], config.command); assert.deepEqual(config.route.waypoints.at(-1), config.echo);
    assert.ok(isDesertSafe(config.foldedGrip));
  }
  assert.equal(isDesertSafe({ x: 1308, y: 980 }), false);
  assert.equal(isDesertSafe({ x: 1307.99, y: 980 }), true);
  assert.equal(isDesertSafe({ x: 1400, y: 850 }), false);
  assert.equal(isDesertSafe({ x: 1400, y: 847.99 }), true);
  assert.equal(isDesertSafe({ x: -1, y: 100 }), false);
  assert.equal(isDesertSafe(DESERT_NPC, -1), false);
});

test('a 12px actor can reach all command, grip, read and recovery locations by the fixed ground without relying on a held cloth', () => {
  const pending = new Set([
    ...Object.values(DESERT_CHECKPOINTS), DESERT_NPC, DESERT_DISCOVERY, ...Object.values(solutions),
    ...Object.values(DESERT_ANCHORS).flatMap(a => [a.command, a.echo, a.foldedGrip]),
  ].map(p => `${p.x},${p.y}`));
  const queue = [DESERT_CHECKPOINTS.start], seen = new Set([`${queue[0].x},${queue[0].y}`]);
  for (let i = 0; i < queue.length && pending.size; i++) {
    const p = queue[i]; pending.delete(`${p.x},${p.y}`);
    for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
      const next = { x: p.x + dx, y: p.y + dy }, key = `${next.x},${next.y}`;
      if (seen.has(key) || next.x < 0 || next.y < 0 || next.x > DESERT_WORLD.width || next.y > DESERT_WORLD.height) continue;
      seen.add(key); if (isDesertSafe(next)) queue.push(next);
    }
  }
  assert.deepEqual([...pending], [], 'a folded or released cloth must never remove the only route to its own corner');
});
