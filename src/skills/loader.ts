import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { skyHome } from '../config/paths.js';
import type { Skill } from './types.js';

export type { Skill } from './types.js';

/**
 * Parse a SKILL.md (or any markdown skill file) with optional YAML-ish frontmatter:
 *
 * ```
 * ---
 * name: my-skill
 * description: What it does
 * ---
 * Body…
 * ```
 */
export function parseSkillMarkdown(raw: string, fallbackName: string, source: string): Skill {
  let name = fallbackName;
  let description = '';
  let body = raw.trim();

  // Require a closing `---` on its own line so `----` / values with dashes
  // don't truncate frontmatter early.
  const fm = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fm) {
    const front = fm[1] ?? '';
    body = raw.slice(fm[0].length).trim();
    for (const line of front.split('\n')) {
      const m = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      const value = m[2]!.trim().replace(/^['"]|['"]$/g, '');
      if (key === 'name' && value) name = value;
      if (key === 'description' && value) description = value;
    }
  }

  if (!description) {
    // First non-empty paragraph as description.
    const first = body.split(/\n\n+/)[0]?.replace(/^#+\s*/, '').trim() ?? '';
    description = first.slice(0, 160) || `Skill: ${name}`;
  }

  return { name, description, body, source };
}

function loadSkillsFromDir(dir: string): Skill[] {
  if (!existsSync(dir)) return [];
  const skills: Skill[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const skillFile = join(full, 'SKILL.md');
      if (existsSync(skillFile)) {
        try {
          skills.push(parseSkillMarkdown(readFileSync(skillFile, 'utf8'), entry, skillFile));
        } catch {
          /* skip */
        }
      }
    } else if (entry.endsWith('.md')) {
      try {
        skills.push(parseSkillMarkdown(readFileSync(full, 'utf8'), basename(entry, '.md'), full));
      } catch {
        /* skip */
      }
    }
  }
  return skills;
}

/**
 * Load skills from user + project directories (and optional plugin paths).
 * Precedence: project `.sky/skills` overrides `~/.sky/skills` of the same name.
 */
export function loadSkills(options: { cwd?: string; extraDirs?: string[] } = {}): Skill[] {
  const dirs = [
    join(skyHome(), 'skills'),
    ...(options.cwd ? [join(options.cwd, '.sky', 'skills'), join(options.cwd, 'skills')] : []),
    ...(options.extraDirs ?? []),
  ];
  const byName = new Map<string, Skill>();
  for (const dir of dirs) {
    for (const skill of loadSkillsFromDir(dir)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()];
}
