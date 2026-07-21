# Sky

**A command-line AI coding agent for people who live in the terminal.**

Sky brings the interactive, AI-assisted development experience of graphical
editors to the CLI — reading, writing, editing, and searching files, running
shell and git commands, and answering questions about your codebase — all under
explicit, auditable approval. It runs on your machine, talks to the LLM provider
you choose, and never sends code anywhere you didn't ask it to.

| | |
| --- | --- |
| **Local-first** | Your code stays on your machine |
| **Consent by default** | Writes, shell, and pushes need approval |
| **Multi-provider** | OpenAI, Anthropic, Ollama, OpenRouter, Gemini, DeepSeek, Groq, and more |
| **Extensible** | Plugins, live MCP servers, and `SKILL.md` skills |
| **Auditable** | Every approval is logged under `~/.sky/audit/` |

→ Full walkthrough: **[docs/USAGE.md](./docs/USAGE.md)** · Spec: [technical PDF](./Sky_CLI_Agent_Technical_Specification.pdf)

---

## Install

Requires **Node.js 20+**.

**One-line (macOS / Linux):**

```sh
curl -fsSL https://raw.githubusercontent.com/skysyaz/Sky-cli/main/install.sh | sh
```

This clones the repo, builds it, and puts a `sky` launcher in `~/.local/bin`.
Make sure that directory is on your `PATH`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SKY_REF` | `main` | Branch or tag to install |
| `SKY_INSTALL_DIR` | `~/.sky/app` | Where the app is built |
| `SKY_BIN_DIR` | `~/.local/bin` | Where the `sky` launcher goes |

```sh
curl -fsSL https://raw.githubusercontent.com/skysyaz/Sky-cli/main/install.sh \
  | SKY_REF=main SKY_BIN_DIR=/usr/local/bin sh
```

**From source:**

```sh
git clone https://github.com/skysyaz/Sky-cli && cd Sky-cli
npm install && npm run build
node dist/cli/main.js --version   # → 1.1.0
# optional: npm link   # exposes `sky` on your PATH
```

**Update later:**

```sh
sky update          # pull + rebuild in place
sky update --check  # only check for updates
```

---

## Quick start (5 minutes)

```bash
# 1. Create ~/.sky/config.json and pick a provider
sky init

# 2. Give Sky an API key (pick one)
export OPENAI_API_KEY=sk-...          # or ANTHROPIC_API_KEY, GEMINI_API_KEY, …
#    — or start Sky and run:  /key sk-...

# 3. Sanity-check your setup
sky doctor

# 4. Chat in the current directory
sky "explain how auth works in this repo"
```

No API key? Use the offline mock provider:

```bash
sky --provider mock ask "what does this project do?"
```

---

## How to use

### Modes

| Command | Mode | Tools | Best for |
| --- | --- | --- | --- |
| `sky` / `sky agent [prompt]` | **agent** | read, write, edit, search, shell, git, MCP | Implementing changes (with approval) |
| `sky plan [prompt]` | **plan** | read, search | Design a plan before coding |
| `sky ask [prompt]` | **ask** | read, search | Codebase Q&A (no mutations) |

```bash
sky ask "where is the session store defined?"
sky plan "add retry with backoff to the OpenAI adapter"
sky "fix the failing test in test/agent.test.ts"
```

### Interactive TUI

When stdin is a TTY, Sky opens an Ink TUI:

- Type a request and press **Enter**
- Type **`/`** for the slash-command palette (↑/↓, Tab/Enter)
- Approvals show an inline diff — **[y]**es / **[n]**o / **[a]**lways
- **Ctrl+C** cancels a running turn; on an empty prompt it quits
- **Ctrl+D** quits and saves the session

#### Slash commands

| Command | What it does |
| --- | --- |
| `/help` | Keybindings and command list |
| `/status` | Session, provider, tools, plugins, skills, MCP |
| `/mode agent\|plan\|ask` | Switch mode live |
| `/model <name>` | Switch model |
| `/provider <name>` | Switch provider (palette lists all) |
| `/key <api-key>` | Save key to `~/.sky/secrets.json` (mode `0600`) and reload |
| `/key clear` | Remove the stored key for the current provider |
| `/keys` | API key dashboard — list / set / clear / use |
| `/provider free` | Keyless OpenCode free models |
| `/cost` | Session usage; `/cost on\|off\|toggle` for status-bar cost |
| `/diff` | Files edited this session |
| `/compact` | Trim older messages to reclaim context |
| `/plugin …` | Marketplace / install / list / search |
| `/clear` | Clear the screen (keeps history) |
| `/exit` | Save and quit |

Plugin slash commands (e.g. `/ponytail`, `/ponytail-review`, or namespaced `/ponytail:ponytail`) appear in the same palette. Sky loads `commands/*.md` and Claude-style `commands/*.toml`.

### Sessions

```bash
sky ls                      # sessions in this directory
sky ls --all                # all directories
sky ls --since 7d           # last 7 days (also: 24h, 30m)
sky resume                  # most recent in this cwd
sky resume abc12            # by id prefix
sky resume abc12 --view     # print history only
sky -s abc12 "continue…"    # attach to a session on start
```

### Providers & API keys

| Provider | Env var (common) | Notes |
| --- | --- | --- |
| `openai` | `OPENAI_API_KEY` | Default |
| `anthropic` | `ANTHROPIC_API_KEY` | Needs `@anthropic-ai/sdk` |
| `ollama` | _(none)_ | Local `http://localhost:11434/v1` |
| `ollama-cloud` | `OLLAMA_API_KEY` | Hosted Ollama |
| `openrouter` | `OPENROUTER_API_KEY` | |
| `zenmux` | `ZENMUX_API_KEY` | |
| `opencode` | _(optional)_ `OPENCODE_API_KEY` | **Keyless free models** (guest token). Paid Zen models need a key. |
| `gemini` | `GEMINI_API_KEY` | Google OpenAI-compat endpoint |
| `deepseek` | `DEEPSEEK_API_KEY` | |
| `groq` | `GROQ_API_KEY` | |
| `qwen-web` | `DASHSCOPE_API_KEY` | Official DashScope API — **needs a free-tier key** (not chat.qwen.ai cookies) |
| `zai-web` | `ZAI_API_KEY` | Official Z.AI API — **needs a free-tier key** (not chat.z.ai cookies) |
| `kimi-web` | `MOONSHOT_API_KEY` | Official Moonshot API — **needs a free-tier key** (not kimi.com cookies) |
| `custom` | `/key` or `SKY_CUSTOM_API_KEY` | Your OpenAI-compatible `providers.custom.baseUrl` |
| `mock` | _(none)_ | Offline / tests |

**Keyless free?** Use `/provider free` or `/keys use free` — no API key.
Manage keys in the TUI with `/keys`, from the shell with `sky keys`, or in the
**browser dashboard** with `sky dashboard` (local `127.0.0.1` only).
`qwen-web` / `zai-web` / `kimi-web` need a free-tier API key (not website cookies).

### Browser dashboard & GitHub / Gitea

```bash
sky dashboard                 # opens http://127.0.0.1:<port>/  (keys + forges)
sky dashboard --no-open      # print URL only
sky forge list
sky forge add github --type github --url https://github.com --token ghp_…
sky forge add work --type gitea --url https://gitea.example.com --username me --token …
sky forge token work --token …
```

Forge tokens live in `~/.sky/secrets.json` as `forge:<id>`. When the agent runs
`git push` / `pull` / `fetch`, Sky matches the remote host to a forge and uses
HTTPS token auth **without rewriting** your remotes. Self-hosted Gitea is
supported the same way as GitHub.

```bash
sky -p anthropic -m claude-3-5-sonnet "…"
sky -p gemini "…"
sky -p ollama -m llama3.1 ask "summarize README.md"
```

Inside the TUI:

```text
/provider gemini
/key AIza…
/status
```

Keys resolve in this order:

1. `providers.<name>.apiKey` in config _(discouraged)_
2. Env named by `providers.<name>.apiKeyEnv`
3. **`~/.sky/secrets.json`** (written by `/key`, mode `0600`)
4. `SKY_PROVIDERS_<NAME>_API_KEY`
5. Well-known env (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …)

Any provider entry with a custom `baseUrl` is treated as OpenAI-compatible.

### Diagnose setup

```bash
sky doctor          # alias: sky status
```

Checks Node version, config, API key for the default provider, optional SDKs,
plugins, skills, and live MCP connectivity.

### Config

```bash
sky init
sky config list
sky config get defaultModel
sky config set defaultProvider gemini
sky config set defaultModel gemini-2.0-flash
sky config validate
```

Precedence (lowest → highest): schema defaults → `~/.sky/config.json` →
project `.skyrc` → `SKY_*` env → CLI flags (`-p`, `-m`, `-c`, …).

Override home / config paths:

```bash
export SKY_HOME=~/.sky-dev
export SKY_CONFIG=~/.sky-dev/config.json
```

### Headless / CI

```bash
sky --yolo --json "fix lint errors in src/"
sky --force --quiet -p mock ask "ping"
```

| Flag | Meaning |
| --- | --- |
| `--yolo` | Auto-approve every tool call (implies `--force`) |
| `--force` | Skip prompts but still obey the hard denylist |
| `--json` | Stream NDJSON agent events on stdout |
| `--quiet` | Suppress non-error stderr |
| `--cwd <path>` | Run as if started in that directory |

`--yolo` / `--force` **never** bypass the hardcoded denylist (`rm -rf /`,
`rm --recursive --force /`, `curl … \| sh`, `mkfs`, `dd of=/dev/…`, …).

---

## Plugins

Claude Code–style marketplaces. Installed plugins auto-load on every `sky`
start — slash commands join the palette; `.mcp.json` servers are registered.

```sh
sky plugin marketplace add DietrichGebert/ponytail
sky plugin install ponytail@ponytail
sky plugin list
sky plugin uninstall ponytail

# shortcuts inside the TUI
/plugin install owner/repo
/plugin search worktree
```

Marketplaces live under `~/.sky/plugins/`. After `/plugin install`, commands
reload immediately — no restart.

---

## MCP servers

Register a stdio MCP server; Sky connects on session start and exposes tools as
`mcp__<server>__<tool>`.

```bash
sky mcp add filesystem \
  --command npx \
  --args "-y @modelcontextprotocol/server-filesystem /tmp/demo" \
  --approval manual

sky mcp list
sky mcp test filesystem    # live handshake + tool list
sky mcp remove filesystem
```

| Approval mode | Behaviour |
| --- | --- |
| `manual` (default) | Prompt before each MCP tool call |
| `auto` | Auto-approve that server's tools |
| `deny` | Skip connecting the server |

Plugins may also ship `.mcp.json`; those servers are merged into config on load.

---

## Skills

Drop a `SKILL.md` into:

- `~/.sky/skills/<name>/SKILL.md` — global
- `.sky/skills/<name>/SKILL.md` — project (wins on name clash)
- `<plugin>/skills/` — from installed plugins

```md
---
name: testing
description: How this repo likes tests written
---
Prefer vitest. Colocate `*.test.ts` next to the module under test.
Always run `npm test` before claiming done.
```

Skills are injected into the system prompt every turn (same idea as
Claude / Cursor skills). Confirm with `/status` or `sky doctor`.

---

## Safety model

Every tool call: **classify → authorize → audit**.

1. **Classify** — hard denylist (always wins) → session allowlist → config
   allowlist → tool predicate. Shell commands get risk tiers 1–4.
2. **Authorize** — allow, deny, or interactive diff prompt (`[y]` / `[n]` / `[a]`).
3. **Audit** — decision appended to `~/.sky/audit/audit.log` **before** execute.

Sandbox: `read` / `write` / `edit` / `search` refuse paths outside the session
cwd (unless `tools.write.allowOutsideCwd` is enabled). Secret globs
(`.env*`, `*.pem`, …) stay on the read denylist.

---

## Command reference

| Command | Description |
| --- | --- |
| `sky [prompt]` | Agent mode (default) |
| `sky agent [prompt]` | Same as above |
| `sky plan [prompt]` | Plan mode (read/search only) |
| `sky ask [prompt]` | Ask mode (read/search only) |
| `sky doctor` / `sky status` | Diagnose environment |
| `sky resume [id] [followUp]` | Resume a session (`--view` to print only) |
| `sky ls` | List sessions (`--since`, `--all`) |
| `sky init` | Create `~/.sky/config.json` |
| `sky config [get\|set\|list\|validate]` | Manage config |
| `sky mcp [add\|list\|remove\|test]` | Manage MCP servers |
| `sky plugin …` | Marketplaces & plugins |
| `sky update` / `sky upgrade` | Self-update (`--check`, `--ref`) |

**Global flags:** `-m/--model` · `-p/--provider` · `--yolo` · `--force` ·
`--cwd` · `-s/--session` · `-c/--config` · `--verbose` · `--quiet` ·
`--no-color` · `--json`

---

## Architecture

```
cli/ / tui/ ─► agent/ ─► llm/  tools/  safety/  session/  mcp/  skills/  plugins/
                              └────► config/ ─► logging/ ─► errors/
```

| Module | Responsibility |
| --- | --- |
| `errors/` | `SkyError` + `SKY-E-XXXX` catalog |
| `logging/` | Structured JSON logs with secret redaction |
| `config/` | Zod schema, precedence merge, secrets file |
| `session/` | Atomic, versioned session persistence |
| `llm/` | Provider adapters (OpenAI-compat + Anthropic + mock) |
| `safety/` | Policy, denylist, diffs, audit log |
| `tools/` | Built-in tools + registry |
| `mcp/` | Live stdio MCP client |
| `skills/` | `SKILL.md` loader |
| `plugins/` | Marketplace clone / install / load |
| `agent/` | Evented orchestration loop |
| `cli/` / `tui/` | Commander + Ink front-end |

## Development

```bash
npm install
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run dev -- ask "hello"
```

## Status

**v1.1** — core spec + production hardening: cwd sandbox for all file tools,
structured shell denylist, live MCP, skills, secure `/key`, `sky doctor`,
ask/plan read tools, and the Ink TUI as the primary interactive UI.

See [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT — see [LICENSE](./LICENSE).
