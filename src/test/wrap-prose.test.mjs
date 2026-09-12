import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapProse } from '../ui/wrapProse.ts';
import { STORIES } from '../data/story.ts';

const mono = text => Array.from(text).length;
const mixed = text => Array.from(text).reduce((width, char) => width + (/^[\x20-\x7e]$/.test(char) ? 9 : 20), 0);
const forbiddenStart = /^[。，、；：？！!?,.:;）)\]》〉」』】〕”’％%…—]/u;
const forbiddenEnd = /[（(\[《〈「『【〔“‘]$/u;
function assertTypography(lines, measure, width) {
  for (const line of lines) {
    assert.ok(measure(line) <= width, `${JSON.stringify(line)} exceeds ${width}`);
    assert.ok(!forbiddenStart.test(line), `closing punctuation at start: ${line}`);
    assert.ok(!forbiddenEnd.test(line), `opening punctuation at end: ${line}`);
  }
}

test('backs up a Chinese character to keep the closing quote and full stop on their line', () => {
  const input = '柏叔说：“茶还温着。”棉棉点头。';
  const lines = wrapProse(input, mono, 7);
  assertTypography(lines, mono, 7);
  assert.equal(lines.join(''), input);
  assert.ok(lines.some(line => line.includes('。”')));
  assert.deepEqual(wrapProse('棉棉在读一封信。', mono, 7), ['棉棉在读一封', '信。']);
});

test('moves an opening quote with its text and keeps consecutive punctuation together', () => {
  const input = '棉棉抬爪：“真的？！”小暖说：“嗯……”';
  const lines = wrapProse(input, mono, 8);
  assertTypography(lines, mono, 8);
  assert.equal(lines.join(''), input);
  assert.ok(lines.some(line => line.includes('？！”')));
  assert.ok(lines.some(line => line.includes('……”')));
  assert.deepEqual(wrapProse('这是“回信”。', mono, 3), ['这是', '“回', '信”。']);
});

test('mixed Chinese and English uses measured widths and preserves fitting Latin words', () => {
  const input = `棉棉读着 Mail for you，再写下 "Don't worry!" 然后出门。`;
  const lines = wrapProse(input, mixed, 140);
  assertTypography(lines, mixed, 140);
  assert.ok(lines.some(line => line.includes('Mail')));
  assert.ok(lines.some(line => line.includes("Don't")));
  assert.ok(lines.every(line => !line.endsWith('"') || line.includes('!"')));
  assert.equal(lines.join('').replaceAll(' ', ''), input.replaceAll(' ', ''));
  assert.deepEqual(wrapProse('Extraordinary', mono, 5), ['Extra', 'ordin', 'ary']);
});

test('preserves explicit line breaks, empty paragraphs and trailing paragraph breaks', () => {
  assert.deepEqual(wrapProse('第一段。\r\n\r\n第二段。\n\n', mono, 10), ['第一段。', '', '第二段。', '', '']);
  assert.deepEqual(wrapProse('', mono, 10), ['']);
  assert.deepEqual(wrapProse('先走\n再等', mono, 10), ['先走', '再等']);
});

test('never breaks a combining character or joined emoji apart', () => {
  const input = 'Cafe\u0301小猫👩‍👩‍👧‍👦回家';
  const lines = wrapProse(input, text => Array.from(text.replace(/👩‍👩‍👧‍👦/gu, '猫').normalize('NFC')).length, 5);
  assert.equal(lines.join(''), input);
  assert.ok(lines.some(line => line.includes('e\u0301')));
  assert.ok(lines.some(line => line.includes('👩‍👩‍👧‍👦')));
});

test('invalid widths and impossible measurements fail explicitly rather than looping or overflowing', () => {
  for (const width of [0, -1, NaN, Infinity, -Infinity]) assert.throws(() => wrapProse('回信', mono, width), RangeError);
  for (const measure of [() => NaN, () => -1, () => Infinity]) assert.throws(() => wrapProse('回信', measure, 460), RangeError);
  assert.throws(() => wrapProse('回。', mono, 1), /too narrow/);
  assert.throws(() => wrapProse('猫', () => 30, 20), /too narrow/);
});

test('every actual story body obeys punctuation rules at the 460px column with representative font widths', () => {
  for (const story of STORIES) for (const page of story.pages) {
    const lines = wrapProse(page.body, mixed, 460);
    assertTypography(lines, mixed, 460);
    assert.equal(lines.join('').replaceAll(' ', ''), page.body.replaceAll('\n', '').replaceAll(' ', ''));
    assert.equal(lines.filter(line => !line).length, page.body.split('\n').filter(line => !line).length);
  }
});
