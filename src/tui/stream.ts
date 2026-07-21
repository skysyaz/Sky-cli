/**
 * Terminal capabilities for the Ink TUI / Termux.
 *
 * On Termux / many Android terminals, Ink cannot reliably rewrite the region
 * below `<Static>`. Every React state update (including each keystroke in the
 * input box) is painted as a **new** scrollback line — stacked empty frames,
 * pyramid streaming text, and a broken status bar.
 *
 * Default: use the simple readline UI on Termux (`preferSimpleTui`).
 * Override: `SKY_TUI=ink` forces Ink (optionally with an alternate screen).
 */

import { existsSync } from 'node:fs';

export function isTermuxLike(env: NodeJS.ProcessEnv = process.env): boolean {
  // Node built for Termux reports platform 'android' — the most reliable signal,
  // set even when the shell strips TERMUX_/ANDROID_ env vars.
  if (process.platform === 'android') return true;
  if (env.TERMUX_VERSION || env.TERMUX_APP__VERSION_NAME) return true;
  if (env.PREFIX && env.PREFIX.includes('com.termux')) return true;
  if (env.HOME && env.HOME.includes('/com.termux/')) return true;
  if (env.TMPDIR && env.TMPDIR.includes('/com.termux/')) return true;
  if (env.ANDROID_ROOT || env.ANDROID_DATA || env.ANDROID_STORAGE) return true;
  try {
    if (existsSync('/data/data/com.termux/files/usr')) return true;
    // proot-based Android distros (UserLAnd, Andronix, …) strip the TERMUX_/
    // ANDROID_ env vars but still run on an Android kernel with /system mounted.
    // Those terminals cannot rewrite either, so treat them as Termux-like.
    if (existsSync('/system/bin/sh') || existsSync('/system/build.prop')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Prefer the readline line UI over Ink. Ink needs to rewrite the region below
 * `<Static>` in place; on terminals that cannot (Termux, proot-Android, piped
 * output), every keystroke repaints the input box as a **new** line — the
 * "staircase" you get typing `scan bug`. Because that is the *same* capability
 * the live stream needs, we key the choice off `supportsLiveStreamRewrite`
 * rather than Android detection alone.
 *
 * `SKY_TUI=ink|full` forces Ink; `SKY_TUI=readline|simple|line` forces the line UI.
 */
export function preferSimpleTui(
  env: NodeJS.ProcessEnv = process.env,
  stdout: { isTTY?: boolean } = process.stdout,
): boolean {
  const flag = (env.SKY_TUI ?? '').toLowerCase();
  if (flag === 'ink' || flag === 'full') return false;
  if (flag === 'readline' || flag === 'simple' || flag === 'line') return true;
  return !supportsLiveStreamRewrite(env, stdout);
}

export function supportsLiveStreamRewrite(
  env: NodeJS.ProcessEnv = process.env,
  stdout: { isTTY?: boolean } = process.stdout,
): boolean {
  if (env.SKY_TUI_LIVE_STREAM === '1') return true;
  if (env.SKY_TUI_LIVE_STREAM === '0') return false;
  if (env.CI) return false;
  if (isTermuxLike(env)) return false;
  if (stdout.isTTY === false) return false;
  return true;
}

/** Enter/leave the alternate screen buffer (keeps Ink redraws off main scrollback). */
export function enterAlternateScreen(stdout: NodeJS.WriteStream = process.stdout): () => void {
  try {
    stdout.write('\x1b[?1049h\x1b[H\x1b[2J');
  } catch {
    /* ignore */
  }
  return () => {
    try {
      stdout.write('\x1b[?1049l');
    } catch {
      /* ignore */
    }
  };
}

export { applyTextDelta, textDeltaPiece } from '../llm/text-delta.js';
