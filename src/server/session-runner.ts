/**
 * Runs AgentLoop turns for daemon sessions and fans events out over SSE.
 */

import { AgentLoop } from '../agent/loop.js';
import type { AgentEvent } from '../agent/events.js';
import type { Session } from '../session/types.js';
import { Policy } from '../safety/policy.js';
import { AuditLog } from '../safety/audit.js';
import { Approver } from '../safety/approver.js';
import type { Runtime, GlobalOptions } from '../cli/runtime.js';
import { makeProvider } from '../cli/runtime.js';
import type { SessionHub } from './session-hub.js';

export interface RunTurnOptions {
  runtime: Runtime;
  global: GlobalOptions;
  session: Session;
  hub: SessionHub;
  prompt: string;
  yolo?: boolean;
  force?: boolean;
}

export async function runDaemonTurn(options: RunTurnOptions): Promise<void> {
  const { runtime, session, hub, prompt } = options;
  if (hub.busy) {
    throw new Error('session already has an in-flight turn');
  }
  hub.busy = true;
  const signal = hub.startAbort();
  const yolo = Boolean(options.yolo ?? options.global.yolo);
  const force = Boolean(options.force ?? options.global.force) || yolo;

  try {
    const provider = makeProvider(runtime, {
      ...options.global,
      provider: options.global.provider ?? session.provider,
      model: options.global.model ?? session.model,
    });
    const policy = new Policy(runtime.config, session.sessionAllowlist);
    const approver = new Approver({
      policy,
      audit: new AuditLog({ logger: runtime.logger }),
      prompter: yolo || force ? undefined : hub.bridge.createPrompter(),
      logger: runtime.logger,
      force,
      yolo,
    });

    const loop = new AgentLoop({
      provider,
      registry: runtime.registry,
      approver,
      policy,
      session,
      store: runtime.store,
      config: runtime.config,
      logger: runtime.logger,
      signal,
      skills: runtime.skills,
    });

    for await (const event of loop.run(prompt)) {
      if (signal.aborted) break;
      // Enrich approval-request from the loop with note that wire approvals
      // use approvalId events from the bridge (published when prompter runs).
      hub.publish(event as AgentEvent);
      if (event.type === 'approval-resolved' && event.autoApproved === false && event.granted) {
        // allowlist may have been updated
        runtime.store.save(session);
      }
    }
  } finally {
    hub.busy = false;
    runtime.store.save(session);
  }
}
