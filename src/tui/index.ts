/**
 * The `tui/` module (§2.4.2).
 *
 * The specification calls for an Ink (React) renderer. Because the agent loop
 * emits a provider-agnostic event stream (see {@link AgentEvent}), the
 * presentation layer is fully decoupled from orchestration — exactly the
 * property §2.4.2 relies on so headless mode can reuse the entire agent module
 * without linking against Ink.
 *
 * This build ships a dependency-light, readline-based front-end (see
 * `src/cli/session-runner.ts` and `src/cli/render.ts`) that consumes the same
 * event stream. An Ink `<App />` can be added here later without touching the
 * agent, safety, or tool layers. The two surfaces are re-exported so callers can
 * treat "render an event stream" as the TUI's public interface.
 */
export { renderStream, type RenderOptions } from '../cli/render.js';
export { createInteractivePrompter } from '../cli/prompter.js';
