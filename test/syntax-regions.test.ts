import { describe, expect, it } from 'vitest';
import { classifyRegions } from '../src/syntax-regions.js';

function regionAt(content: string, marker: string): 'code' | 'string' | 'comment' {
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error(`marker "${marker}" not in content`);
  const regions = classifyRegions(content);
  return regions[idx] ?? 'code';
}

describe('classifyRegions', () => {
  it('classifies plain code as code', () => {
    const r = classifyRegions('const x = 1;');
    expect(r.every((region) => region === 'code')).toBe(true);
  });

  it('classifies a line comment as comment', () => {
    expect(regionAt('// hello world\n', 'hello')).toBe('comment');
  });

  it('line comment ends at newline', () => {
    const content = '// up\nconst x = 1;';
    const regions = classifyRegions(content);
    expect(regions[content.indexOf('//')]).toBe('comment');
    expect(regions[content.indexOf('const')]).toBe('code');
  });

  it('block comment spans multiple lines', () => {
    const content = '/* line1\n   line2 */\nconst x = 1;';
    expect(regionAt(content, 'line1')).toBe('comment');
    expect(regionAt(content, 'line2')).toBe('comment');
    expect(regionAt(content, 'const')).toBe('code');
  });

  it('classifies content inside single-quoted strings as string', () => {
    expect(regionAt("const x = 'console.log';", 'console.log')).toBe('string');
  });

  it('classifies content inside double-quoted strings as string', () => {
    expect(regionAt('const x = "console.log";', 'console.log')).toBe('string');
  });

  it('classifies content inside template literals as string', () => {
    expect(regionAt('const x = `console.log`;', 'console.log')).toBe('string');
  });

  it('handles escaped quotes inside strings', () => {
    expect(regionAt(String.raw`const x = "say \"console.log\" out loud";`, 'console.log')).toBe(
      'string',
    );
  });

  it('does NOT enter comment mode inside a string', () => {
    // The `//` inside the string is not a comment.
    expect(regionAt('const x = "// not a comment";', 'not a comment')).toBe('string');
  });

  it('does NOT enter string mode inside a comment', () => {
    // The quote inside the comment is not a string opener.
    expect(regionAt('// "hello" world', 'hello')).toBe('comment');
  });

  it('escape after backslash inside template literal is handled', () => {
    const content = 'const x = `before \\` after`;';
    const regions = classifyRegions(content);
    // Both the escaped backtick and the surrounding chars should be string;
    // the closing backtick should be the final string char.
    const closeIdx = content.lastIndexOf('`');
    expect(regions[closeIdx]).toBe('string');
    // The 'a' in `after` should still be string (we didn't exit early).
    expect(regions[content.indexOf('after')]).toBe('string');
  });

  it('returns a region for every character index', () => {
    const content = 'const x = 1;\n// hi\nconst y = "z";';
    const regions = classifyRegions(content);
    expect(regions.length).toBe(content.length);
    for (const region of regions) {
      expect(['code', 'string', 'comment']).toContain(region);
    }
  });

  it('block comment closes on its first `*/` regardless of context', () => {
    // Tokenizer-not-parser: a block comment that opens before a string
    // literal closes on whichever `*/` it encounters first. This matches
    // real JS source (you cannot put `*/` inside a block comment without
    // closing it); a tokenizer doesn't need context-aware string
    // tracking inside comments.
    const content = '/* opens */ const x = "y";';
    const regions = classifyRegions(content);
    expect(regions[content.indexOf('opens')]).toBe('comment');
    expect(regions[content.indexOf('const')]).toBe('code');
    expect(regions[content.indexOf('y')]).toBe('string');
  });
});
