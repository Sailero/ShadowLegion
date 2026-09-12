import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import {
  STORIES, LETTER_RECIPIENTS, getStory, getStoryLibrary, getStoryForChapter,
  getStoriesForCompletedStage, getStoryProgressStage, isStoryUnlocked,
  sanitizeStoryReturnRoute, resolveStoryRequest, turnStoryPage,
} from '../data/story.ts';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { StoryScene } = await import('../scenes/StoryScene.ts');
const { CampaignProgressionManager } = await import('../systems/CampaignProgressionManager.ts');

function progress(cleared) {
  return { stageResults: Object.fromEntries(Array.from({ length: cleared }, (_, i) => [i + 1, { stars: 1, migrated: true }])) };
}

test('the book contains a three-page opening, five two-page replies and a three-page ending in causal address order', () => {
  assert.deepEqual(STORIES.map(story => story.pages.length), [3, 2, 2, 2, 2, 2, 3]);
  assert.equal(new Set(STORIES.map(story => story.id)).size, 7);
  assert.equal(new Set(LETTER_RECIPIENTS.map(recipient => recipient.species)).size, 5);
  assert.equal(new Set(LETTER_RECIPIENTS.map(recipient => recipient.region)).size, 5);
  for (let i = 0; i < 5; i++) {
    const recipient = LETTER_RECIPIENTS[i];
    const story = getStoryForChapter(i + 1);
    assert.equal(story.id, recipient.storyId);
    assert.equal(story.recipient, recipient.name);
    assert.equal(story.unlockAfterStage, (i + 1) * 10);
    const next = LETTER_RECIPIENTS[i + 1]?.name ?? '棉棉和小暖';
    assert.ok(recipient.nextAddress.includes(next));
    assert.ok(story.pages.map(page => page.body).join('').includes(LETTER_RECIPIENTS[i + 1]?.name ?? '棉棉和小暖'));
  }
});

test('reading-length bounds leave enough space for static pages without forced timing or truncated prose', () => {
  for (const story of STORIES) for (const page of story.pages) {
    assert.ok(page.eyebrow && page.title && page.body && page.signature && page.motif);
    assert.ok([...page.title].length <= 17, page.title);
    assert.ok([...page.signature].length <= 44, page.signature);
    // Conservative full-width character budget: 23 CJK glyphs per 460px line at 20px.
    const bodyLines = page.body.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / 23)), 0);
    assert.ok(bodyLines <= 9, `${story.id}: ${page.title} needs ${bodyLines} modelled lines`);
  }
  const end = getStory('epilogue').pages.map(page => page.body).join('');
  assert.match(end, /柏叔/);
  assert.match(end, /小暖也会在/);
});

test('story unlocks follow saved consecutive chapter boundaries, not cached counters or isolated high-stage clears', () => {
  assert.deepEqual(getStoryLibrary(progress(0)).filter(story => story.unlocked).map(story => story.id), ['prologue']);
  assert.equal(isStoryUnlocked('letter-forest', progress(9)), false);
  assert.equal(isStoryUnlocked('letter-forest', progress(10)), true);
  assert.equal(isStoryUnlocked('letter-lake', progress(19)), false);
  assert.equal(isStoryUnlocked('letter-lake', progress(20)), true);
  assert.equal(isStoryUnlocked('epilogue', progress(49)), false);
  assert.equal(getStoryLibrary(progress(50)).filter(story => story.unlocked).length, 7);
  const forged = { stageResults: { 10: { stars: 3 }, 50: { stars: 3 } }, highestUnlockedStage: 50, totalStars: 150 };
  assert.equal(getStoryProgressStage(forged), 0);
  assert.equal(isStoryUnlocked('epilogue', forged), false);
  const gap = progress(50); delete gap.stageResults[18];
  assert.equal(getStoryProgressStage(gap), 17);
  assert.equal(isStoryUnlocked('letter-lake', gap), false);
});

test('failed, malformed and missing stage records do not unlock a letter while migrated real clears do', () => {
  for (const malformed of [null, undefined, {}, { stageResults: [] }, { stageResults: '50' }]) {
    assert.equal(getStoryProgressStage(malformed), 0);
    assert.equal(isStoryUnlocked('prologue', malformed), true);
  }
  for (const stars of [0, -1, 4, 1.5, '3', Infinity, NaN, undefined]) {
    const route = progress(10); route.stageResults[5].stars = stars;
    assert.equal(getStoryProgressStage(route), 4);
  }
  assert.equal(isStoryUnlocked('letter-forest', progress(10)), true);
  assert.equal(getStoryForChapter(0), undefined);
  assert.equal(getStory('invented-letter'), undefined);
  assert.equal(isStoryUnlocked('invented-letter', progress(50)), false);
});

test('chapter completion suggests only its letter, with the final letter before the epilogue', () => {
  for (const id of [0, 1, 9, 11, 49, 51, NaN]) assert.deepEqual(getStoriesForCompletedStage(id), []);
  assert.deepEqual(getStoriesForCompletedStage(10).map(story => story.id), ['letter-forest']);
  assert.deepEqual(getStoriesForCompletedStage(50).map(story => story.id), ['letter-snow', 'epilogue']);
});

test('a real forest delivery unlocks its reply independently without granting future letters or altering campaign progress', () => {
  const empty = progress(0);
  assert.deepEqual(getStoryLibrary(empty, true).filter(story => story.unlocked).map(story => story.id), ['prologue', 'letter-forest']);
  assert.equal(isStoryUnlocked('letter-forest', empty, true), true);
  assert.equal(isStoryUnlocked('letter-lake', empty, true), false);
  assert.equal(isStoryUnlocked('epilogue', empty, true), false);
  assert.equal(resolveStoryRequest({ storyId: 'letter-forest' }, empty, true).storyId, 'letter-forest');
  assert.equal(resolveStoryRequest({ storyId: 'letter-forest', postalDelivered: true }, empty).storyId, 'prologue');
  assert.equal(isStoryUnlocked('letter-forest', empty, 'true'), false);
  assert.equal(getStoryProgressStage(empty), 0);
});

test('return routing rejects scene loops, battle/results and malformed inputs; safe readers discard payloads', () => {
  for (const raw of [null, undefined, [], 'MenuScene', {}, { scene: 'StoryScene' }, { scene: 'GameOverScene' },
    { scene: 'ArenaScene' }, { scene: '../MenuScene' }, { scene: { toString: () => 'MenuScene' } }]) {
    assert.deepEqual(sanitizeStoryReturnRoute(raw), { scene: 'MenuScene', data: {} });
  }
  for (const scene of ['MenuScene', 'WorkshopScene', 'LetterBookScene', 'DeliveryScene']) {
    assert.deepEqual(sanitizeStoryReturnRoute({ scene, data: { completionId: 'do-not-replay', score: 999, chapter: 5 } }), { scene, data: {} });
  }
});

test('return routing preserves bounded navigation only and cannot smuggle result or resume state', () => {
  assert.deepEqual(sanitizeStoryReturnRoute({ scene: 'CampaignScene', data: { stageId: 23, chapter: 5, score: 999 } }),
    { scene: 'CampaignScene', data: { stageId: 23 } });
  assert.deepEqual(sanitizeStoryReturnRoute({ scene: 'CampaignScene', data: { stageId: 999, chapter: 2 } }),
    { scene: 'CampaignScene', data: { chapter: 2 } });
  assert.deepEqual(sanitizeStoryReturnRoute({ scene: 'LoadoutScene', data: { mode: 'shadow', trialTier: 5, stageId: 30,
    operativeId: 'engineer', freshRun: false, checkpoint: { level: 50 }, completionId: 'blocked', score: 9 } }),
    { scene: 'LoadoutScene', data: { mode: 'shadow', stageId: 30, trialTier: 5, operativeId: 'engineer' } });
  assert.deepEqual(sanitizeStoryReturnRoute({ scene: 'LoadoutScene', data: { mode: 'combat', trialTier: Infinity,
    stageId: '30', operativeId: { toString: () => 'engineer' } } }), { scene: 'LoadoutScene', data: {} });
});

test('request resolution keeps an authorized return route when falling back from an unavailable story and never mutates progress', () => {
  const state = progress(10), before = JSON.stringify(state);
  assert.deepEqual(resolveStoryRequest({ storyId: 'letter-forest', returnTo: { scene: 'LetterBookScene' } }, state),
    { storyId: 'letter-forest', returnTo: { scene: 'LetterBookScene', data: {} }, fallback: null });
  assert.deepEqual(resolveStoryRequest({ storyId: 'epilogue', returnTo: { scene: 'CampaignScene', data: { stageId: 11 } } }, state),
    { storyId: 'prologue', returnTo: { scene: 'CampaignScene', data: { stageId: 11 } }, fallback: 'locked-story' });
  assert.equal(resolveStoryRequest(null, state).fallback, 'unknown-story');
  assert.equal(JSON.stringify(state), before);
  const route = { scene: 'CampaignScene', data: { stageId: 11 } };
  const request = resolveStoryRequest({ storyId: 'prologue', returnTo: route }, state);
  route.data.stageId = 50;
  assert.equal(request.returnTo.data.stageId, 11, 'route copies primitives instead of retaining mutable caller data');
});

test('page navigation clamps previous, restarts freely, and finishes only on the last page', () => {
  assert.deepEqual(turnStoryPage(3, 0, 'previous'), { index: 0, finished: false });
  assert.deepEqual(turnStoryPage(3, 0, 'next'), { index: 1, finished: false });
  assert.deepEqual(turnStoryPage(3, 2, 'next'), { index: 2, finished: true });
  assert.deepEqual(turnStoryPage(3, 2, 'restart'), { index: 0, finished: false });
  assert.deepEqual(turnStoryPage(3, -100, 'next'), { index: 1, finished: false });
  assert.deepEqual(turnStoryPage(3, NaN, 'previous'), { index: 0, finished: false });
});

test('real postal receipts unlock consecutive replies without combat stars or story reward writes', () => {
  const postal = { deliveries: { forest: { completionId: 'forest-real' }, lake: { completionId: 'lake-real' } } };
  const before = JSON.stringify(postal);
  assert.equal(isStoryUnlocked('letter-lake', progress(0), postal), true);
  assert.equal(isStoryUnlocked('letter-mountain', progress(0), postal), false);
  assert.equal(isStoryUnlocked('epilogue', progress(0), postal), false);
  assert.equal(isStoryUnlocked('letter-lake', progress(0), { deliveries: { lake: { completionId: 'out-of-order' } } }), false);
  assert.equal(isStoryUnlocked('letter-lake', progress(0), { deliveries: { ...postal.deliveries, lake: { completionId: '' } } }), false);
  assert.equal(getStoryLibrary(progress(0), postal).find(story => story.id === 'letter-lake').unlocked, true);
  assert.equal(resolveStoryRequest({ storyId: 'letter-lake', returnTo: { scene: 'LakeScene', data: { completed: true } } }, progress(0), postal).returnTo.scene, 'LakeScene');
  assert.deepEqual(sanitizeStoryReturnRoute({ scene: 'LakeScene', data: { completionId: 'cannot-reward', checkpoint: 'mail' } }), { scene: 'LakeScene', data: {} });
  assert.equal(JSON.stringify(postal), before);
});

test('a mountain reply requires consecutive real receipts and its safe return discards supplied completion payloads', () => {
  const postal = { deliveries: { forest: { completionId: 'forest-real' }, lake: { completionId: 'lake-real' },
    mountain: { completionId: 'mountain-real' } } };
  const before = JSON.stringify(postal);
  assert.equal(isStoryUnlocked('letter-mountain', progress(0), postal), true);
  assert.equal(isStoryUnlocked('letter-desert', progress(0), postal), false);
  assert.equal(isStoryUnlocked('epilogue', progress(0), postal), false);
  const missingLake = structuredClone(postal); delete missingLake.deliveries.lake;
  assert.equal(isStoryUnlocked('letter-mountain', progress(0), missingLake), false);
  const request = resolveStoryRequest({ storyId: 'letter-mountain', returnTo: { scene: 'MountainScene',
    data: { completionId: 'cannot-deliver-again', checkpoint: 'mailbox', passOpened: true, score: 999 } } }, progress(0), postal);
  assert.equal(request.storyId, 'letter-mountain'); assert.equal(request.fallback, null);
  assert.deepEqual(request.returnTo, { scene: 'MountainScene', data: {} });
  assert.deepEqual(sanitizeStoryReturnRoute({ scene: 'MountainScene', data: { deliveries: postal.deliveries } }),
    { scene: 'MountainScene', data: {} });
  assert.equal(JSON.stringify(postal), before);
});

test('a real fourth receipt unlocks the two-page desert reply and a DesertScene return cannot forge completion', () => {
  const postal = { deliveries: { forest: { completionId: 'forest-real' }, lake: { completionId: 'lake-real' },
    mountain: { completionId: 'mountain-real' }, desert: { completionId: 'desert-real' } } };
  const before = JSON.stringify(postal);
  assert.equal(isStoryUnlocked('letter-desert', progress(0), postal), true);
  assert.equal(getStory('letter-desert').pages.length, 2);
  assert.equal(getStoryLibrary(progress(0), postal).find(story => story.id === 'letter-desert').unlocked, true);
  for (const region of ['forest', 'lake', 'mountain', 'desert']) {
    const missing = structuredClone(postal); delete missing.deliveries[region];
    assert.equal(isStoryUnlocked('letter-desert', progress(0), missing), false);
  }
  assert.equal(isStoryUnlocked('letter-snow', progress(0), postal), false);
  assert.equal(isStoryUnlocked('epilogue', progress(0), postal), false);
  const request = resolveStoryRequest({ storyId: 'letter-desert', returnTo: { scene: 'DesertScene',
    data: { completionId: 'do-not-deliver', checkpoint: 'mailbox', addressRead: true, optionalDiscoveries: ['desert.sixthCushion'] } } }, progress(0), postal);
  assert.equal(request.storyId, 'letter-desert'); assert.equal(request.fallback, null);
  assert.deepEqual(request.returnTo, { scene: 'DesertScene', data: {} });
  assert.deepEqual(sanitizeStoryReturnRoute({ scene: 'DesertScene', data: { deliveries: postal.deliveries, score: 999 } }),
    { scene: 'DesertScene', data: {} });
  assert.equal(isStoryUnlocked('letter-desert', progress(40)), true, 'legacy practice reading remains compatible');
  assert.equal(JSON.stringify(postal), before);
});

test('real StoryScene controller exits once on final next or skip and resets on re-entry without recording progress', () => {
  const originalGetState = CampaignProgressionManager.getState;
  CampaignProgressionManager.getState = () => progress(50);
  try {
    const story = new StoryScene(), starts = [], pages = [];
    story.scene = { start: (name, data) => starts.push({ name, data }) };
    story.renderPage = () => pages.push(story.pageIndex);
    story.init({ storyId: 'letter-snow', returnTo: { scene: 'LetterBookScene' } });
    story.turn('previous'); story.turn('next');
    assert.deepEqual(pages, [0, 1]);
    story.turn('next'); story.leave(); story.turn('next');
    assert.deepEqual(starts, [{ name: 'LetterBookScene', data: {} }]);
    story.init({ storyId: 'prologue', returnTo: { scene: 'DeliveryScene' } });
    assert.equal(story.pageIndex, 0);
    story.leave(); story.leave();
    assert.deepEqual(starts[1], { name: 'DeliveryScene', data: {} });
    assert.equal(starts.length, 2);
  } finally { CampaignProgressionManager.getState = originalGetState; }
});
