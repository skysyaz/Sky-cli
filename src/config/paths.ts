import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Canonical locations under `~/.sky/` (§7.1). The base directory can be
 * overridden with `SKY_HOME`, which is what the test-suite uses to sandbox the
 * filesystem without touching a real home directory.
 */
export function skyHome(): string {
  return process.env.SKY_HOME ?? join(homedir(), '.sky');
}

export function configPath(): string {
  return process.env.SKY_CONFIG ?? join(skyHome(), 'config.json');
}

export function configSchemaPath(): string {
  return join(skyHome(), 'config.schema.json');
}

export function sessionsDir(): string {
  return join(skyHome(), 'sessions');
}

export function sessionsIndexPath(): string {
  return join(skyHome(), 'sessions.index');
}

export function logsDir(): string {
  return join(skyHome(), 'logs');
}

export function logFilePath(): string {
  return join(logsDir(), 'sky.log');
}

export function auditDir(): string {
  return join(skyHome(), 'audit');
}

export function auditLogPath(): string {
  return join(auditDir(), 'audit.log');
}

/** Plugin storage roots (§ plugin marketplace extension). */
export function pluginsDir(): string {
  return join(skyHome(), 'plugins');
}

export function marketplacesDir(): string {
  return join(pluginsDir(), 'marketplaces');
}

export function installedPluginsDir(): string {
  return join(pluginsDir(), 'installed');
}

export function pluginsStatePath(): string {
  return join(pluginsDir(), 'plugins.json');
}
