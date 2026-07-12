import { ErrorCode, SkyError } from '../errors/index.js';
import type { PluginManager } from './manager.js';

/**
 * Execute a `plugin` subcommand and return human-readable output lines. Shared
 * by the `sky plugin …` CLI command and the TUI `/plugin …` slash command so
 * both behave identically. Throws {@link SkyError} on failure.
 */
export async function runPluginCommand(args: string[], manager: PluginManager): Promise<string[]> {
  const [action, ...rest] = args;

  switch (action) {
    case undefined:
    case 'list': {
      const plugins = manager.listInstalled();
      if (plugins.length === 0) {
        return [
          'No plugins installed. Add a marketplace and install one:',
          '  /plugin marketplace add owner/repo',
          '  /plugin install name@marketplace',
        ];
      }
      return [
        'Installed plugins:',
        ...plugins.map(
          (p) =>
            `  ${p.name}@${p.marketplace}${p.version ? ` (v${p.version})` : ''}${p.description ? ` — ${p.description}` : ''}`,
        ),
      ];
    }

    case 'marketplace': {
      const [sub, ...marketArgs] = rest;
      switch (sub) {
        case 'add': {
          const ref = marketArgs[0];
          if (!ref) throw new SkyError(ErrorCode.MissingArgument, { name: 'marketplace ref (owner/repo)' });
          return manager.addMarketplace(ref);
        }
        case undefined:
        case 'list': {
          const markets = manager.listMarketplaces();
          if (markets.length === 0) return ['No marketplaces registered.'];
          return [
            'Marketplaces:',
            ...markets.map(
              (m) => `  ${m.name} (${m.source}) — ${m.plugins.length} plugin(s): ${m.plugins.map((p) => p.name).join(', ')}`,
            ),
          ];
        }
        case 'remove':
        case 'rm': {
          const name = marketArgs[0];
          if (!name) throw new SkyError(ErrorCode.MissingArgument, { name: 'marketplace name' });
          return manager.removeMarketplace(name);
        }
        default:
          throw new SkyError(ErrorCode.UnknownCommand, { name: `plugin marketplace ${sub}` });
      }
    }

    case 'install': {
      const spec = rest[0];
      if (!spec) throw new SkyError(ErrorCode.MissingArgument, { name: 'plugin@marketplace' });
      return manager.install(spec);
    }

    case 'uninstall':
    case 'remove': {
      const name = rest[0];
      if (!name) throw new SkyError(ErrorCode.MissingArgument, { name: 'plugin name' });
      return manager.uninstall(name);
    }

    default:
      throw new SkyError(ErrorCode.UnknownCommand, { name: `plugin ${action}` });
  }
}
