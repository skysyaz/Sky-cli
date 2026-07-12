import type { Mode } from '../session/types.js';

/** Whether a mode grants the agent tools (§4.4–4.5). */
export function modeHasTools(mode: Mode): boolean {
  return mode === 'agent';
}

/** Build the system prompt for a mode (§2.4.1). */
export function buildSystemPrompt(mode: Mode, cwd: string): string {
  const shared = `You are Sky, a command-line AI coding agent operating in the directory ${cwd}. You are precise, safe, and concise. Prefer the smallest change that solves the problem.`;

  switch (mode) {
    case 'agent':
      return `${shared}

You have access to tools (read, write, edit, search, shell, git). Use them to inspect and modify the workspace. Every mutating action requires user approval, so explain what you intend to do. When the task is complete, summarize the changes and stop calling tools.`;
    case 'plan':
      return `${shared}

You are in PLAN mode. Do NOT modify anything. Ask clarifying questions if the request is ambiguous, then produce a clear, step-by-step implementation plan. The user will review and approve the plan before any execution begins.`;
    case 'ask':
      return `${shared}

You are in ASK mode. This is read-only. Answer the user's question about the codebase using only the context provided. Do not propose to modify files.`;
    default:
      return shared;
  }
}
