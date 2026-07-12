import { describe, it, expect } from 'vitest';
import { parseInput, getSuggestions, SLASH_COMMANDS } from '../src/tui/commands.js';

describe('slash-command parsing', () => {
  it('detects non-slash input', () => {
    expect(parseInput('hello world').isSlash).toBe(false);
  });
  it('parses a bare command', () => {
    expect(parseInput('/mod')).toMatchObject({ isSlash: true, command: 'mod', hasSpace: false });
  });
  it('parses a command with an argument', () => {
    expect(parseInput('/mode ag')).toMatchObject({ command: 'mode', hasSpace: true, arg: 'ag' });
  });
});

describe('palette suggestions (§5.5)', () => {
  it('returns nothing for plain text', () => {
    expect(getSuggestions('build the thing')).toEqual([]);
  });
  it('lists all commands for a bare slash', () => {
    const s = getSuggestions('/');
    expect(s).toHaveLength(SLASH_COMMANDS.length);
    expect(s[0].kind).toBe('command');
  });
  it('filters commands as you type', () => {
    const s = getSuggestions('/mo');
    expect(s.map((x) => x.value).sort()).toEqual(['mode', 'model']);
  });
  it('offers argument suggestions after a known command + space', () => {
    const s = getSuggestions('/mode ');
    expect(s.map((x) => x.value)).toEqual(['agent', 'plan', 'ask']);
    expect(s[0].kind).toBe('arg');
  });
  it('filters argument suggestions', () => {
    expect(getSuggestions('/mode pl').map((x) => x.value)).toEqual(['plan']);
    expect(getSuggestions('/mode as').map((x) => x.value)).toEqual(['ask']);
  });
  it('uses provided model suggestions for /model', () => {
    const s = getSuggestions('/model ', { modelSuggestions: ['x-ai/grok-4.5-free', 'gpt-4o'] });
    expect(s.map((x) => x.value)).toEqual(['x-ai/grok-4.5-free', 'gpt-4o']);
  });
  it('returns nothing for an unknown command with a space', () => {
    expect(getSuggestions('/nope ')).toEqual([]);
  });
});
