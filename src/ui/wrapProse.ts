/** Punctuation which must stay with the following / preceding printable character. */
const OPENING = new Set(Array.from('（([｛{《〈「『【〔〖〘〚“‘'));
const CLOSING = new Set(Array.from('。，、；：？！!?,.:;）)]｝}》〉」』】〕〗〙〛”’％%‰℃°…—'));
const SPACE = /^[\t \u3000]+$/u;
const WORD = /^[\p{Script=Latin}\p{Number}\p{Mark}]+$/u;

/** Keep combining marks and joined emoji attached even in older browsers without Segmenter. */
function characters(text: string): string[] {
  const result: string[] = [];
  for (const char of text) {
    const previous = result[result.length - 1];
    if (previous && (/^[\p{Mark}\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}]$/u.test(char)
      || char === '\u200d' || previous.endsWith('\u200d'))) result[result.length - 1] += char;
    else result.push(char);
  }
  return result;
}

/**
 * Measured prose wrapping for Chinese and mixed Latin text. Explicit line / paragraph
 * breaks remain intact. Soft wraps discard only boundary spaces; words stay together
 * when possible, while an overlong word may split at a character boundary.
 *
 * Invalid measurements, or a column too narrow for one required punctuation group,
 * throw instead of looping, losing characters or silently overflowing the column.
 */
export function wrapProse(text: string, measure: (text: string) => number, width: number): string[] {
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('Prose width must be finite and positive.');
  const measured = (value: string): number => {
    const result = measure(value);
    if (!Number.isFinite(result) || result < 0) throw new RangeError('Prose measurement must be finite and nonnegative.');
    return result;
  };
  const result: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/u)) {
    const chars = characters(paragraph);
    if (!chars.length) { result.push(''); continue; }
    const opening = chars.map(char => OPENING.has(char));
    const closing = chars.map(char => CLOSING.has(char));
    const quotes = new Map<string, boolean>();
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (char !== '"' && char !== "'") continue;
      // An apostrophe inside a Latin word is part of the word, not a closing quote.
      if (char === "'" && WORD.test(chars[i - 1] ?? '') && WORD.test(chars[i + 1] ?? '')) continue;
      const isOpening = !quotes.get(char);
      opening[i] = isOpening; closing[i] = !isOpening; quotes.set(char, isOpening);
    }
    const wordCharacter = (index: number): boolean => WORD.test(chars[index] ?? '')
      || ((chars[index] === "'" || chars[index] === '’') && WORD.test(chars[index - 1] ?? '') && WORD.test(chars[index + 1] ?? ''));
    const canBreak = (end: number, preserveWord: boolean): boolean => {
      if (end === chars.length) return true;
      let before = end - 1, after = end;
      while (before >= 0 && SPACE.test(chars[before])) before--;
      while (after < chars.length && SPACE.test(chars[after])) after++;
      if (opening[before] || closing[after]) return false;
      // Treat consecutive ellipses / dashes as one punctuation cluster.
      if ((chars[before] === '…' || chars[before] === '—') && chars[before] === chars[after]) return false;
      return !preserveWord || before !== end - 1 || after !== end || !wordCharacter(before) || !wordCharacter(after);
    };
    let start = 0;
    while (start < chars.length) {
      let preferred = 0, fallback = 0;
      for (let end = start + 1; end <= chars.length; end++) {
        const candidate = chars.slice(start, end).join('').trimEnd();
        if (measured(candidate) > width) break;
        if (canBreak(end, false)) fallback = end;
        if (canBreak(end, true)) preferred = end;
      }
      const end = preferred || fallback;
      if (!end) throw new RangeError('Prose column is too narrow for a character and its punctuation.');
      result.push(chars.slice(start, end).join('').trimEnd());
      start = end;
      while (start < chars.length && SPACE.test(chars[start])) start++;
    }
  }
  return result;
}
