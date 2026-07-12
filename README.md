# Sky

**A command-line AI coding agent for people who live in the terminal.**

Sky brings the interactive, AI-assisted development experience of graphical
editors to the CLI — reading, writing, editing, and searching files, running
shell and git commands, and answering questions about your codebase — all under
explicit, auditable approval. It runs entirely on your machine, talks directly
to the LLM provider of your choice, and never sends code anywhere you didn't ask
it to.

- **Local-first & user-sovereign** — your code stays on your machine.
- **Consent by default** — every file write, shell command, and push requires approval.
- **Multi-provider** — OpenAI, Anthropic, Ollama, and OpenRouter behind one interface.
- **Auditable** — every approval decision is written to an append-only audit log.
- **Modular to the bone** — typed modules with enforced boundaries (see the [spec](./Sky_CLI_Agent_Technical_Specification.pdf)).

## Install

```bash
npm install -g @sky/cli
# or run from source:
git clone https://github.com/skysyaz/sky-cli && cd sky-cli && npm install && npm run build
```

## Quick start

```bash
# 1. Create your config and choose a provider
sky init

# 2. Point Sky at your API key (env var, never stored in plaintext)
export OPENAI_API_KEY=sk-...

# 3. Start an agent session in the current directory
sky "refactor src/auth to use async/await throughout"
```

No key handy? Try the built-in offline provider:

```bash
sky --provider mock ask "what does this project do?"
```

## Modes

| Command             | Mode  | What it does                                              |
| ------------------- | ----- | -------------------------------------------------------- |
| `sky` / `sky agent` | agent | Interactive agent: reads, writes, edits — with approval  |
| `sky plan`          | plan  | Design-first: clarify and plan before any change         |
| `sky ask`           | ask   | Read-only Q&A; no tools, no mutation                     |
| `sky resume [id]`   | —     | Resume a saved session (`--view` for read-only history)  |
| `sky ls`            | —     | List sessions for the current directory                  |
| `sky config`        | —     | `get` / `set` / `list` / `validate` configuration        |
| `sky init`          | —     | Create `~/.sky/config.json` with defaults                |
| `sky mcp`           | —     | Register / list / remove / test MCP tool servers         |

### Global flags

`--model, -m` · `--provider, -p` · `--yolo` · `--force` · `--cwd` ·
`--session, -s` · `--config, -c` · `--verbose` · `--quiet` · `--no-color` ·
`--json`

## Headless / CI

```bash
# Auto-approve every tool call and stream NDJSON events for a pipeline
sky --yolo --json "fix lint errors in src/"
```

`--yolo` and `--force` never bypass the hardcoded denylist of destructive shell
commands (`rm -rf /`, `mkfs`, `dd of=/dev/*`, …) — those are always blocked.

## Safety model

Every tool call flows through: **classify → authorize → audit**.

1. **Classify** — the policy engine checks the denylist (always wins), the
   session allowlist, the config allowlist, and the tool's own predicate. Shell
   commands are additionally sorted into four risk tiers.
2. **Authorize** — auto-approved, auto-denied, or an interactive diff prompt.
3. **Audit** — the decision is appended to `~/.sky/audit/audit.log` **before** the
   tool runs.

## Architecture

Sky is a layered TypeScript app; modules depend only inward and downward
(§2.3 of the spec):

```
cli/ ─► agent/ ─► llm/  tools/  safety/  session/
                    └────► config/ ─► logging/ ─► errors/
```

| Module      | Responsibility                                            |
| ----------- | --------------------------------------------------------- |
| `errors/`   | `SkyError` taxonomy + the full `SKY-E-XXXX` code catalog  |
| `logging/`  | Structured JSON logging with secret redaction             |
| `config/`   | Zod-validated config, precedence merging, secret resolution |
| `session/`  | Atomic, versioned session persistence + index             |
| `llm/`      | `Provider` interface + OpenAI/Anthropic/Ollama/OpenRouter/mock adapters |
| `safety/`   | Policy engine, shell classification, diffs, audit log     |
| `tools/`    | `read` `write` `edit` `search` `shell` `git` + registry   |
| `agent/`    | The orchestration loop (a generator yielding typed events) |
| `cli/`      | Commander command tree + headless & interactive rendering |

## Development

```bash
npm install
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run test:coverage
npm run build        # single-file ESM bundle via tsup
npm run dev -- ask "hello"   # run from source
```

## Configuration

`~/.sky/config.json`, validated on every load. Values can be overridden by a
project-local `.skyrc`, `SKY_*` environment variables, and CLI flags — in that
order of increasing precedence. API keys are resolved at runtime from an env var
or the system keychain, never stored in plaintext. See Appendix A of the
[technical specification](./Sky_CLI_Agent_Technical_Specification.pdf) for the
full key reference.

## Status

This repository implements the core of the Sky v1 specification: the full module
architecture, error catalog, config/session subsystems, the provider
abstraction with an offline mock, the safety/approval layer, all six built-in
tools, the agent loop, and the Commander CLI with headless (`--json`) and
interactive modes. The interactive front-end is readline-based; because the
agent loop emits a provider-agnostic event stream, an Ink (React) TUI can be
layered on without touching the agent, safety, or tool modules — the decoupling
the spec's §2.4.2 is designed around.

## License

MIT — see [LICENSE](./LICENSE).
