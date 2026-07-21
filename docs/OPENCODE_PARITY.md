# OpenCode Parity Roadmap

Sky aims to match OpenCode’s **workflow and mechanisms** (daemon + HTTP/SSE, agent loop, tools, permissions, multi-agent modes) while keeping Sky’s existing TypeScript stack (not a full Effect/Solid/OpenTUI rewrite).

Reference: [opencode/dev](https://github.com/anomalyco/opencode/tree/dev) architecture (CLI ↔ daemon ↔ core).

---

## Already in Sky (in-process)

| OpenCode concept | Sky today |
| --- | --- |
| Agent loop + tool rounds | `AgentLoop` (`src/agent/loop.ts`) |
| Step / max iterations | `sessions.maxIterations` + soft wrap-up |
| Context compaction | `src/session/compact.ts` |
| Tools + registry | `src/tools/*` |
| Permissions / YOLO | `Policy` + `Approver` + `--yolo` / `/yolo` |
| Modes (build/plan/ask) | `agent` / `plan` / `ask` |
| Streaming events | `AgentEvent` → TUI / `--json` NDJSON |
| Providers | OpenAI-compat + Anthropic + free OpenCode Zen |
| Skills / plugins / MCP | `src/skills`, `src/plugins`, `src/mcp` |
| Local HTTP UI | `sky dashboard` (keys + forge) |

---

## Gap → phases

### Phase 1 — Daemon + HTTP + SSE (this PR) ✅ foundation

OpenCode topology without rewriting the loop/TUI:

```
sky daemon / sky serve     → localhost HTTP API + SSE
sky attach / SKY_DAEMON_URL → client talks to daemon
default `sky`              → still in-process Ink TUI (unchanged)
```

API surface (v1):

| Method | Path | Role |
| --- | --- | --- |
| GET | `/health` | liveness + version |
| POST | `/sessions` | create session |
| GET | `/sessions/:id` | metadata |
| POST | `/sessions/:id/message` | run turn; events on SSE |
| GET | `/sessions/:id/events` | subscribe SSE |
| POST | `/approvals/:id` | resolve permission ask |
| POST | `/sessions/:id/abort` | cancel in-flight turn |

Wraps existing `AgentLoop` + `Approver`; approvals park until HTTP resolve.

### Phase 2 — Thin clients + multi-session

- Ink TUI optional `--attach` path consuming SSE (same `AgentEvent` schema)
- Concurrent sessions in one daemon
- Session/pid lock under `~/.sky/daemon.json`

### Phase 3 — Loop upgrades (OpenCode mechanisms)

- Concurrent tool settlement (parallel tool calls)
- Tool materialize / settle API
- Interactive PTY tool
- Prompt caching in Anthropic/OpenAI adapters
- Optional SQLite behind `SessionStore`

### Phase 4 — Packaging (optional)

- Workspace packages: `cli` / `server` / `protocol` / `sdk` (logical split already under `src/`)
- Generated OpenAPI + typed SDK client
- **Not required:** Effect runtime, Solid.js, OpenTUI (keep Ink unless we deliberately migrate UI)

---

## Design principles (Sky)

1. **Default path stays local** — `sky` without daemon must keep working.
2. **One event schema** — `AgentEvent` is the wire format for TUI, `--json`, and SSE.
3. **127.0.0.1 + token** — same trust model as `sky dashboard`.
4. **Incremental** — daemon wraps the loop; do not fork a second agent engine.

---

## Commands (Phase 1)

```bash
sky serve [--port N] [--yolo]     # foreground API server
sky daemon start|status|stop      # background daemon (detached)
sky attach <prompt>               # one-shot client → daemon (NDJSON on stdout)
export SKY_DAEMON_URL=http://127.0.0.1:4096
```

See `docs/USAGE.md` § Daemon.
