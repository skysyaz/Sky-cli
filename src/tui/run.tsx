import React from 'react';
import { render } from 'ink';
import type { SkyConfig } from '../config/index.js';
import type { Logger } from '../logging/index.js';
import type { Session } from '../session/types.js';
import type { SessionStore } from '../session/store.js';
import type { AnySessionStore } from '../session/create-store.js';
import type { Provider } from '../llm/types.js';
import type { ToolRegistry } from '../tools/index.js';
import type { LoadedPlugin } from '../plugins/index.js';
import type { Skill } from '../skills/index.js';
import { App } from './App.js';
import { enterAlternateScreen, supportsLiveStreamRewrite } from './stream.js';

export interface RunTuiOptions {
  makeProvider: (providerName: string, model?: string) => Provider;
  registry: ToolRegistry;
  session: Session;
  store: SessionStore | AnySessionStore;
  config: SkyConfig;
  logger: Logger;
  force?: boolean;
  yolo?: boolean;
  initialPrompt?: string;
  plugins?: LoadedPlugin[];
  skills?: Skill[];
  attach?: boolean;
  attachUrl?: string;
  attachToken?: string;
}

/**
 * Mount the Ink TUI (§2.4.2) and resolve when the user exits. This is the
 * Cursor-style front-end: a bordered input, a slash-command palette navigable
 * with the arrow keys, a live status bar, and inline diff approvals.
 *
 * On terminals that cannot rewrite (Termux), uses the alternate screen buffer
 * so redraws do not stack in the main scrollback.
 */
export async function runTui(options: RunTuiOptions): Promise<void> {
  const leaveAlt = !supportsLiveStreamRewrite() ? enterAlternateScreen() : null;
  try {
    const instance = render(React.createElement(App, options), {
      exitOnCtrlC: false, // App handles Ctrl+C (cancel turn, then quit)
    });
    await instance.waitUntilExit();
  } finally {
    leaveAlt?.();
  }
}
