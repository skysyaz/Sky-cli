import { describe, it, expect } from 'vitest';
import { applyTextDelta, textDeltaPiece } from '../src/llm/text-delta.js';
import { supportsLiveStreamRewrite } from '../src/tui/stream.js';

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

describe('supportsLiveStreamRewrite', () => {
  it('disables live stream on Termux', () => {
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
