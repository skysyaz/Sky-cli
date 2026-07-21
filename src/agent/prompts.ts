import type { Mode } from '../session/types.js';
import type { Skill } from '../skills/types.js';

/** Tools available in each mode (§4.4–4.5). Ask/plan get read-only tools. */
export function toolsForMode(mode: Mode): 'all' | 'readonly' | 'none' {
  switch (mode) {
    case 'agent':
      return 'all';
    case 'plan':
    case 'ask':
      return 'readonly';
    default:
      return 'none';
  }
}

/** Whether a mode grants any tools. */
export function modeHasTools(mode: Mode): boolean {
  return toolsForMode(mode) !== 'none';
}

const READONLY_TOOLS = new Set(['read', 'search', 'forge']);

/** Filter tool definitions for the active mode. */
export function filterToolsForMode<T extends { name: string }>(mode: Mode, tools: T[]): T[] {
  const access = toolsForMode(mode);
  if (access === 'all') return tools;
  if (access === 'none') return [];
  return tools.filter((t) => READONLY_TOOLS.has(t.name));
}

/** Build the system prompt for a mode (§2.4.1). */
export function buildSystemPrompt(mode: Mode, cwd: string, skills: Skill[] = []): string {
  const shared = `You are Sky, a command-line AI coding agent operating in the directory ${cwd}. You are precise, safe, and concise. Prefer the smallest change that solves the problem.`;

  let modeBlock: string;
  switch (mode) {
    case 'agent':
      modeBlock = `${shared}

You have access to tools (read, write, edit, search, shell, git, forge, and any MCP tools). Use them to inspect and modify the workspace. Every mutating action requires user approval, so explain what you intend to do. When the task is complete, summarize the changes and stop calling tools.

Prefer targeted reads/searches over re-listing the whole repo. If history was compacted or a tool result shows \`[tool result trimmed]\`, do not restart exploration from scratch — ask a clarifying question or re-read only the files you still need. Cap exploration: a few high-signal files beat reading every module. When iterating, stop and summarize once you have enough evidence.

When the user asks to list or inspect GitHub/Gitea repositories, use the \`forge\` tool (\`repos\`, \`whoami\`, \`repo\`) — it uses the token from \`sky dashboard\` / \`sky forge\`. Do not invent clone URLs. Local \`git\` is for the current working tree only.`;
      break;
    case 'plan':
      modeBlock = `${shared}

You are in PLAN mode. You may use read-only tools (read, search, forge) to inspect the codebase and connected GitHub/Gitea forges. Do NOT modify files, run shell commands, or write. Ask clarifying questions if the request is ambiguous, then produce a clear, step-by-step implementation plan.`;
      break;
    case 'ask':
      modeBlock = `${shared}

You are in ASK mode. This is read-only. Use read/search/forge tools to inspect the codebase (and list GitHub/Gitea repos when connected) and answer the user's question. Do not propose to modify files or run mutating commands.`;
      break;
    default:
      modeBlock = shared;
  }

  if (skills.length === 0) return modeBlock;

  const skillLines = skills
    .map((s) => `- **${s.name}**: ${s.description}${s.body ? `\n\n${s.body}` : ''}`)
    .join('\n\n');
  return `${modeBlock}

# Available skills
When relevant, follow these skill instructions:

${skillLines}`;
}
