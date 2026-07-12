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
- **Multi-provider** — OpenAI, Anthropic, Ollama (local), Ollama Cloud, OpenRouter, and ZenMux behind one interface.
- **Auditable** — every approval decision is written to an append-only audit log.
- **Modular to the bone** — typed modules with enforced boundaries (see the [spec](./Sky_CLI_Agent_Technical_Specification.pdf)).

## Install

**macOS / Linux — one-line install** (requires Node.js 20+):

```sh
curl -fsSL https://raw.githubusercontent.com/skysyaz/Sky-cli/main/install.sh | sh
```

This fetches the repo, builds it, and installs a `sky` launcher into
`~/.local/bin`. Customize with environment variables — `SKY_REF` (branch/tag),
`SKY_INSTALL_DIR`, or `SKY_BIN_DIR`:

```sh
# Install a specific branch into a custom location
curl -fsSL https://raw.githubusercontent.com/skysyaz/Sky-cli/main/install.sh \
  | SKY_REF=main SKY_BIN_DIR=/usr/local/bin sh
```

**Update an existing install:**

```sh
sky update          # pull the latest and rebuild in place
sky update --check  # just check whether an update is available
```

**From source:**

```sh
git clone https://github.com/skysyaz/Sky-cli && cd Sky-cli
npm install && npm run build
node dist/cli/main.js --version
```

> The `curl | sh` command reads `install.sh` from the `main` branch. Until this
> work is merged, install from this branch by passing
> `SKY_REF=claude/app-cli-pdf-specs-9km7tq` (and use the branch URL for the
> script itself).

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
| `sky update`        | —     | Update Sky to the latest version (pull + rebuild)        |
| `sky plugin`        | —     | Add marketplaces, install/list/uninstall plugins         |

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

## Plugins

Sky can extend itself with plugins from git-hosted marketplaces (Claude Code
marketplace format). Installed plugins are **auto-loaded on every `sky` start** —
their slash commands appear in the palette and their MCP servers are registered.

```sh
# from the CLI
sky plugin marketplace add DietrichGebert/ponytail
sky plugin install ponytail@ponytail
sky plugin list

# or, identically, from inside the TUI
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

A marketplace is any git repo with a `.claude-plugin/marketplace.json` listing
its plugins; each plugin may contribute `commands/*.md` (slash commands) and a
`.mcp.json` (MCP servers). Marketplaces are cloned under `~/.sky/plugins/`.

Convenience shortcuts:

```sh
/plugin install owner/repo   # add the marketplace AND install its plugin(s)
/plugin search worktree      # search installed marketplaces
```

Inside the TUI, installing a plugin **reloads its commands immediately** — no
restart needed.

### Setting a provider / API key from the CLI

You don't have to juggle environment variables. Inside the TUI:

```sh
/provider zenmux             # switch provider (arrow-selectable)
/key sk-ai-v1-...            # save the key for the current provider and reload live
```

`/key` writes the key to `~/.sky/config.json` for the active provider and rebuilds
the provider on the spot, so your next message works without restarting.

> Note: the base spec (§1.5) lists a plugin marketplace as a non-goal; this is an
> explicit opt-in extension layered on top.

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
| `llm/`      | `Provider` interface + OpenAI/Anthropic/Ollama/Ollama-Cloud/OpenRouter/ZenMux/mock adapters |
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
