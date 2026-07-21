/**
 * Wire protocol helpers for the Sky daemon (OpenCode-style HTTP + SSE).
 * Reuses {@link AgentEvent} as the primary SSE payload.
 */

import { z } from 'zod';

export const createSessionBodySchema = z.object({
  mode: z.enum(['agent', 'plan', 'ask']).default('agent'),
  cwd: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;

export const postMessageBodySchema = z.object({
  prompt: z.string().min(1),
  yolo: z.boolean().optional(),
  force: z.boolean().optional(),
});
export type PostMessageBody = z.infer<typeof postMessageBodySchema>;

export const resolveApprovalBodySchema = z.object({
  answer: z.enum(['yes', 'no', 'always', 'edit']),
});
export type ResolveApprovalBody = z.infer<typeof resolveApprovalBodySchema>;

/** SSE frame: `event: <type>\ndata: <json>\n\n` */
export function formatSse(event: string, data: unknown): string {
  const payload = JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}
