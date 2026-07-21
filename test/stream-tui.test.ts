import { describe, it, expect } from 'vitest';
import { applyTextDelta, textDeltaPiece } from '../src/llm/text-delta.js';
import {
  supportsLiveStreamRewrite,
  preferSimpleTui,
  isTermuxLike,
} from '../src/tui/stream.js';

describe('applyTextDelta', () => {
  it('appends true deltas', () => {
    expect(applyTextDelta('Hi', '!')).toBe('Hi!');
    expect(applyTextDelta('Hi!', ' How')).toBe('Hi! How');
  });

  it('replaces cumulative snapshots', () => {
    expect(applyTextDelta('Hi', 'Hi!')).toBe('Hi!');
    expect(applyTextDelta('Hi!', 'Hi! How')).toBe('Hi! How');
    expect(applyTextDelta('Hi! How', 'Hi! How can I help')).toBe('Hi! How can I help');
  });

  it('emits only the new piece after a cumulative merge', () => {
    expect(textDeltaPiece('Hi', 'Hi!')).toEqual({ next: 'Hi!', piece: '!' });
    expect(textDeltaPiece('Hi!', ' How')).toEqual({ next: 'Hi! How', piece: ' How' });
  });
});

describe('Termux UI mode', () => {
  it('detects Termux via PREFIX / HOME / filesystem hints', () => {
    expect(isTermuxLike({ PREFIX: '/data/data/com.termux/files/usr' })).toBe(true);
    expect(isTermuxLike({ HOME: '/data/data/com.termux/files/home' })).toBe(true);
    expect(isTermuxLike({ TERMUX_VERSION: '0.118' })).toBe(true);
    expect(isTermuxLike({})).toBe(false);
  });

  it('prefers simple TUI on Termux unless SKY_TUI=ink', () => {
    expect(preferSimpleTui({ TERMUX_VERSION: '1' })).toBe(true);
    expect(preferSimpleTui({ TERMUX_VERSION: '1', SKY_TUI: 'ink' })).toBe(false);
    expect(preferSimpleTui({ SKY_TUI: 'readline' })).toBe(true);
    expect(preferSimpleTui({}, { isTTY: true })).toBe(false);
  });

  it('prefers the line UI on any terminal that cannot rewrite in place', () => {
    // The staircase-while-typing bug: a terminal that stacks stream frames also
    // stacks the input box, so the line UI is the safe choice regardless of OS.
    expect(preferSimpleTui({}, { isTTY: false })).toBe(true);
    expect(preferSimpleTui({ CI: 'true' }, { isTTY: true })).toBe(true);
    expect(preferSimpleTui({ SKY_TUI_LIVE_STREAM: '0' }, { isTTY: true })).toBe(true);
    // …but an explicit SKY_TUI=ink still wins even there.
    expect(preferSimpleTui({ SKY_TUI: 'ink', CI: 'true' }, { isTTY: false })).toBe(false);
    // A capable interactive TTY keeps the full Ink TUI.
    expect(preferSimpleTui({}, { isTTY: true })).toBe(false);
  });

  it('disables live stream rewrite on Termux', () => {
    expect(supportsLiveStreamRewrite({ TERMUX_VERSION: '0.118' }, { isTTY: true })).toBe(false);
    expect(supportsLiveStreamRewrite({ ANDROID_ROOT: '/system' }, { isTTY: true })).toBe(false);
  });

  it('allows override via SKY_TUI_LIVE_STREAM', () => {
    expect(supportsLiveStreamRewrite({ TERMUX_VERSION: '1', SKY_TUI_LIVE_STREAM: '1' }, { isTTY: true })).toBe(
      true,
    );
    expect(supportsLiveStreamRewrite({ SKY_TUI_LIVE_STREAM: '0' }, { isTTY: true })).toBe(false);
  });

  it('allows normal TTYs by default', () => {
    expect(supportsLiveStreamRewrite({}, { isTTY: true })).toBe(true);
  });
});
