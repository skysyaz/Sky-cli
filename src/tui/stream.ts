/**
 * Terminal capabilities for the Ink TUI.
 *
 * On Termux / many Android terminals, Ink cannot reliably rewrite the line
 * below `<Static>` — every `setState` of the live streaming `<Text>` is
 * painted as a **new** scrollback line. That produces the classic pyramid:
 *
 *   Hi
 *   Hi!
 *   Hi! How
 *   …
 *
 * Detect those environments and keep the live body in memory until turn-end,
 * when we commit once into `<Static>`.
 */

export function supportsLiveStreamRewrite(
  env: NodeJS.ProcessEnv = process.env,
  stdout: { isTTY?: boolean } = process.stdout,
): boolean {
  if (env.SKY_TUI_LIVE_STREAM === '1') return true;
  if (env.SKY_TUI_LIVE_STREAM === '0') return false;
  if (env.CI) return false;
  if (env.TERMUX_VERSION) return false;
  if (env.PREFIX && env.PREFIX.includes('com.termux')) return false;
  if (env.ANDROID_ROOT || env.ANDROID_DATA) return false;
  if (stdout.isTTY === false) return false;
  return true;
}

export { applyTextDelta, textDeltaPiece } from '../llm/text-delta.js';
