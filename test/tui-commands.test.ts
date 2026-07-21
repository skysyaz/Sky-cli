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
    // Descriptions are short tags — not a duplicate of the model id (Termux wrap bug).
    expect(s[0].description).toBe('free');
    expect(s[0].label).toBe('x-ai/grok-4.5-free');
  });
  it('lists OpenCode free models for /model when provider is opencode', () => {
    const s = getSuggestions('/model ', { provider: 'opencode' });
    const values = s.map((x) => x.value);
    expect(values).toContain('deepseek-v4-flash-free');
    expect(values).toContain('mimo-v2.5-free');
    expect(values).toContain('big-pickle');
    // Full ids, not truncated; tag is separate.
    const free = s.find((x) => x.value === 'deepseek-v4-flash-free')!;
    expect(free.label).toBe('deepseek-v4-flash-free');
    expect(free.description).toBe('free');
  });
  it('returns nothing for an unknown command with a space', () => {
    expect(getSuggestions('/nope ')).toEqual([]);
  });
});

describe('modelsForProvider / modelTag', () => {
  it('puts the current model first and includes free OpenCode models', async () => {
    const { modelsForProvider, modelTag } = await import('../src/tui/commands.js');
    const list = modelsForProvider('opencode', 'deepseek-v4-flash-free');
    expect(list[0]).toBe('deepseek-v4-flash-free');
    expect(list).toEqual(expect.arrayContaining(['mimo-v2.5-free', 'north-mini-code-free']));
    expect(modelTag('deepseek-v4-flash-free')).toBe('free');
    expect(modelTag('gpt-4o')).toBe('openai');
  });
});
