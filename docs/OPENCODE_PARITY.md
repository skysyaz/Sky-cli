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

### Phase 1 — Daemon + HTTP + SSE ✅

```
sky daemon / sky serve     → localhost HTTP API + SSE
sky attach / SKY_DAEMON_URL → client talks to daemon
default `sky`              → still in-process Ink TUI (unchanged)
```

| Method | Path | Role |
| --- | --- | --- |
| GET | `/health` | liveness + version |
| GET | `/sessions` | list sessions |
| POST | `/sessions` | create session |
| GET | `/sessions/:id` | metadata |
| POST | `/sessions/:id/message` | run turn; events on SSE |
| GET | `/sessions/:id/events` | subscribe SSE |
| POST | `/approvals/:id` | resolve permission ask |
| POST | `/sessions/:id/abort` | cancel in-flight turn |

### Phase 2 — Thin clients + multi-session ✅

- Ink TUI `--attach` / `--attach-url` / `--attach-token` consuming SSE
- Concurrent sessions in one daemon + `GET /sessions`
- Session/pid lock under `~/.sky/daemon.json` + `~/.sky/daemon.pid`

### Phase 3 — Loop upgrades ✅

- Concurrent tool settlement (`PARALLEL_SAFE_TOOLS`: read/search/forge)
- Tool `materialize` / `settle` API on `ToolRegistry`
- Interactive-style `pty` tool (pipe-based; shell denylist applies)
- Prompt caching: Anthropic `cache_control` on system; OpenAI cache hint header
- Optional SQLite via `sessions.backend: "sqlite"` (`node:sqlite`, JSON fallback)

### Phase 4 — Packaging ✅

- Logical modules under `src/{cli,server,protocol,sdk}`
- OpenAPI: `docs/openapi.json` + `src/protocol/openapi.ts`
- Typed SDK: `SkyDaemonClient` (`@sky/cli/sdk`)
- Package exports: `.`, `./sdk`, `./protocol`, `./openapi`
- **Not required:** Effect runtime, Solid.js, OpenTUI (keep Ink)

---

## Design principles (Sky)

1. **Default path stays local** — `sky` without daemon must keep working.
2. **One event schema** — `AgentEvent` is the wire format for TUI, `--json`, and SSE.
3. **127.0.0.1 + token** — same trust model as `sky dashboard`.
4. **Incremental** — daemon wraps the loop; do not fork a second agent engine.

---

## Commands

```bash
sky serve [--port N] [--register] [--yolo]
sky daemon start|status|stop
sky attach <prompt>                 # one-shot NDJSON client
sky --attach [prompt]               # Ink TUI over SSE
export SKY_DAEMON_URL=http://127.0.0.1:4096
export SKY_DAEMON_TOKEN=...
```

See `docs/USAGE.md` § Daemon.
