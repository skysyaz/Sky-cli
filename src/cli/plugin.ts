import { PluginManager } from '../plugins/index.js';
import { runPluginCommand } from '../plugins/run.js';
import type { GlobalOptions } from './runtime.js';

/** `sky plugin …` CLI entry point. Prints the manager's result lines. */
export async function pluginCommand(args: string[], _global: GlobalOptions): Promise<number> {
  const manager = new PluginManager();
  const lines = await runPluginCommand(args, manager);
  for (const line of lines) process.stdout.write(line + '\n');
  return 0;
}
