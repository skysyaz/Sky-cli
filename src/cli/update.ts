import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import chalk from 'chalk';
import { ErrorCode, SkyError } from '../errors/index.js';
import type { GlobalOptions } from './runtime.js';

/**
 * Ascend from `startDir` until a `package.json` for `@sky/cli` is found; that
 * directory is the installed app root (where `dist/` and `node_modules/` live).
 * Exported for testing.
 */
export function findAppRoot(startDir: string): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === '@sky/cli') return dir;
      } catch {
        // ignore malformed package.json and keep ascending
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

async function gitShortSha(cwd: string, ref = 'HEAD'): Promise<string | undefined> {
  try {
    const { stdout } = await execa('git', ['rev-parse', '--short', ref], { cwd, reject: false });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * `sky update` — pull the latest source and rebuild in place (self-update),
 * mirroring `claude update` / `opencode update`. Works for a git checkout
 * (clone-based install); for a tarball install it points the user back at the
 * installer.
 */
export async function updateCommand(
  opts: { check?: boolean; ref?: string },
  global: GlobalOptions,
): Promise<number> {
  const c = global.color === false ? plain() : chalk;
  const ref = opts.ref ?? process.env.SKY_REF ?? 'main';

  const root = findAppRoot(dirname(fileURLToPath(import.meta.url)));
  if (!root) {
    throw new SkyError(ErrorCode.InternalError, { detail: 'could not locate the Sky install directory' });
  }

  const isGit = existsSync(join(root, '.git'));
  if (!isGit) {
    process.stdout.write(
      c.yellow('This Sky install is not a git checkout, so `sky update` cannot pull in place.\n') +
        'Re-run the installer to update:\n' +
        c.bold('  curl -fsSL https://raw.githubusercontent.com/skysyaz/Sky-cli/main/install.sh | sh\n'),
    );
    return 0;
  }

  process.stdout.write(c.dim(`sky: checking for updates on ${ref}…\n`));
  const before = await gitShortSha(root);

  // Fetch the target ref and see whether we are behind.
  await execa('git', ['fetch', 'origin', ref], { cwd: root, reject: false });
  const remote = await gitShortSha(root, `origin/${ref}`);

  if (before && remote && before === remote) {
    process.stdout.write(c.green(`✓ Sky is already up to date (${before}).\n`));
    return 0;
  }

  if (opts.check) {
    process.stdout.write(
      c.yellow(`↑ An update is available: ${before ?? '?'} → ${remote ?? '?'}.\n`) +
        'Run `sky update` to install it.\n',
    );
    return 0;
  }

  // Apply the update: hard-reset the install to the remote ref, reinstall deps,
  // and rebuild the bundle.
  process.stdout.write(c.dim(`sky: updating ${before ?? '?'} → ${remote ?? '?'}…\n`));
  await execa('git', ['reset', '--hard', `origin/${ref}`], { cwd: root });

  process.stdout.write(c.dim('sky: installing dependencies…\n'));
  await run('npm', ['install', '--no-audit', '--no-fund'], root);

  process.stdout.write(c.dim('sky: building…\n'));
  await run('npm', ['run', 'build'], root);

  const after = await gitShortSha(root);
  process.stdout.write(c.green(`✓ Updated Sky to ${after ?? remote ?? 'latest'}.\n`));
  return 0;
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  const result = await execa(command, args, { cwd, reject: false });
  if (result.exitCode !== 0) {
    throw new SkyError(ErrorCode.InternalError, {
      detail: `\`${command} ${args.join(' ')}\` failed:\n${(result.stderr || result.stdout).slice(-800)}`,
    });
  }
}

function plain(): typeof chalk {
  return new Proxy({}, { get: () => (s: string) => s }) as unknown as typeof chalk;
}
