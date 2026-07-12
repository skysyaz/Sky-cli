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

    case 'search': {
      const query = rest.join(' ').toLowerCase();
      const results: string[] = [];
      for (const m of manager.listMarketplaces()) {
        for (const p of m.plugins) {
          const hay = `${p.name} ${p.description ?? ''}`.toLowerCase();
          if (!query || hay.includes(query)) {
            results.push(`  ${p.name}@${m.name}${p.description ? ` — ${p.description}` : ''}`);
          }
        }
      }
      if (results.length === 0) {
        return manager.listMarketplaces().length === 0
          ? ['No marketplaces registered. Add one first:', '  /plugin marketplace add owner/repo']
          : [`No plugins match "${query}".`];
      }
      return ['Matching plugins:', ...results, 'Install with: /plugin install <name>@<marketplace>'];
    }

    case 'install': {
      const spec = rest[0];
      if (!spec) throw new SkyError(ErrorCode.MissingArgument, { name: 'plugin@marketplace or owner/repo' });
      // Convenience: `install owner/repo` adds the marketplace and installs its plugins.
      if (spec.includes('/') && !spec.includes('@')) {
        const lines = await manager.addMarketplace(spec);
        const market = manager.listMarketplaces().find((m) => m.source === spec);
        if (!market) throw new SkyError(ErrorCode.InternalError, { detail: `could not resolve marketplace for ${spec}` });
        if (market.plugins.length === 0) return [...lines, 'No plugins listed in this marketplace.'];
        const out = [...lines];
        for (const p of market.plugins) out.push(...manager.install(`${p.name}@${market.name}`));
        return out;
      }
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
