# Sky CLI — How to use

Practical guide for day-to-day use of **Sky v1.1**. For install and a short
overview, see the [README](../README.md).

---

## 1. First-time setup

```bash
# Install (see README) then:
sky init                 # interactive provider pick → ~/.sky/config.json
sky doctor               # verify Node, config, key, SDKs, MCP
```

`sky init` asks which provider to use and writes defaults. Example result:

```json
{
  "schemaVersion": 1,
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "providers": {
    "openai": { "apiKeyEnv": "OPENAI_API_KEY", "defaultModel": "gpt-4o" }
  }
}
```

### Add an API key

**Option A — environment variable** (good for shells / CI):

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
```

**Option B — `/key` in the TUI** (persists securely):

```text
sky
› /provider gemini
› /key AIza-your-key
› /status
```

That writes `~/.sky/secrets.json` with mode `0600`. It does **not** put the key
in `config.json`.

**Option C — config env binding** (no literal secret in the file):

```bash
sky config set providers.openai.apiKeyEnv OPENAI_API_KEY
```

---

## 2. Everyday workflow

### Agent mode (default) — change the codebase

```bash
cd ~/my-project
sky "add input validation to the signup form"
# or
sky agent "rename FooService to BarService and update imports"
```

Sky may call `read` / `search` / `edit` / `write` / `shell` / `git` / MCP tools.
Mutating calls show an approval modal with a diff:

| Key | Action |
| --- | --- |
| `y` / Enter | Approve once |
| `n` / Esc | Deny |
| `a` | Always allow similar calls this session |

### Ask mode — explore without changing anything

```bash
sky ask "how does session persistence work?"
sky ask "where are API keys resolved?"
```

Ask mode can use **`read`** and **`search`** only. Writes, shell, and git are
blocked even if the model tries to call them.

### Plan mode — design first

```bash
sky plan "migrate the CLI from Commander to a custom router"
```

Same read-only tools as ask. Produce a step-by-step plan; switch to agent when
you are ready to implement:

```text
/mode agent
```

### Resume where you left off

```bash
sky ls
sky resume              # newest in this directory
sky resume a1b2c        # id prefix
sky resume a1b2c --view # transcript only
```

---

## 3. The interactive TUI

Started automatically when your terminal is interactive (not `--json`).

```
╭──────────────────────────────────────────╮
│ › Ask, build, or type / for commands█    │
╰──────────────────────────────────────────╯
⬢ agent · openai:gpt-4o · 12.4% · 2 files · a1b2c
```

### Keyboard

| Input | Action |
| --- | --- |
| Text + Enter | Send a turn |
| `/` | Open command palette |
| ↑ / ↓ | Move in palette |
| Tab / Enter | Accept suggestion |
| Esc | Clear input (or deny approval) |
| Ctrl+C (while busy) | Abort the current turn |
| Ctrl+C (idle, empty) | Quit |
| Ctrl+D | Quit and save |

### Useful slash commands

```text
/help
/status                          # health snapshot
/mode plan
/model gpt-4o-mini
/provider anthropic
/key sk-ant-...
/key clear
/cost                            # show tokens + $ once
/cost on                         # always show ~$cost in the status bar
/cost off                        # hide status-bar cost
/cost toggle
/compact                         # drop old turns
/plugin marketplace add owner/repo
/plugin install name@marketplace
/plugin list
/clear
/exit
```

---

## 4. Choosing a provider

```bash
sky -p anthropic -m claude-3-5-sonnet "…"
sky -p ollama -m llama3.1 ask "summarize package.json"
sky -p openrouter -m openai/gpt-4o "…"
sky -p gemini "…"
sky -p deepseek "…"
sky -p groq -m llama-3.3-70b-versatile "…"
sky -p opencode "…"   # free models (e.g. deepseek-v4-flash-free) need no key
sky -p qwen-web -m qwen-plus "…"
sky -p zai-web -m glm-4.5-flash "…"
sky -p kimi-web -m kimi-k2.5 "…"
sky -p mock ask "offline smoke test"
```

OpenCode Zen free models (`deepseek-v4-flash-free`, `mimo-v2.5-free`, …) use a
public guest token automatically. For **paid** Zen models, set
`OPENCODE_API_KEY` or run `/key <value>` after signing in at
[opencode.ai/auth](https://opencode.ai/auth).

**Qwen / Z.AI / Kimi (`*-web`)** are official OpenAI-compatible APIs. They need a
**free-tier API key** from the vendor — they do **not** log into the website chat
(no cookies). Qwen’s own browser OAuth free tier was discontinued in 2026.

```text
/provider qwen-web
# → shows signup URL if no key
/key sk-…
/model qwen-plus
```

| Provider | Key env | Signup |
| --- | --- | --- |
| `qwen-web` | `DASHSCOPE_API_KEY` | https://modelstudio.console.alibabacloud.com/ |
| `zai-web` | `ZAI_API_KEY` | https://z.ai/ |
| `kimi-web` | `MOONSHOT_API_KEY` | https://platform.moonshot.ai/ |

### API keys dashboard

```text
/keys                         # list every provider · which have keys · active
/keys set qwen-web sk-…       # save a key without switching first
/keys clear qwen-web
/keys use free                # switch to keyless OpenCode
```

Same from the shell (lightweight — no web UI):

```bash
sky keys
sky keys set openai sk-…
sky keys clear openai
```

Keys live in `~/.sky/secrets.json` (mode `0600`). If you open Sky on a
provider with no key (e.g. leftover `qwen-web`), it auto-switches to
**opencode** so you can chat immediately.

Or switch live:

```text
/provider groq
/model llama-3.3-70b-versatile
```

### Custom OpenAI-compatible endpoint

**Option A — built-in `custom` provider**

```bash
sky config set providers.custom.baseUrl https://llm.example.com/v1
sky config set providers.custom.defaultModel my-model
# then in TUI:
# /provider custom
# /key <api-key>
```

**Option B — any name with a `baseUrl`**

```bash
sky config set providers.myllm.baseUrl https://llm.example.com/v1
sky config set providers.myllm.apiKeyEnv MYLLM_API_KEY
sky config set providers.myllm.defaultModel my-model
sky config set defaultProvider myllm
export MYLLM_API_KEY=...
sky "hello"
```

Named customs with a `baseUrl` also appear in the `/provider` palette.

---

## 5. Plugins

Plugins use the Claude Code marketplace layout
(`.claude-plugin/marketplace.json`, `commands/*.md`, optional `.mcp.json`).

```bash
# CLI
sky plugin marketplace add owner/repo
sky plugin install myplugin@marketplace
sky plugin list
sky plugin uninstall myplugin

# TUI (same verbs)
/plugin marketplace add owner/repo
/plugin install owner/repo          # add marketplace + install
/plugin search keyword
```

After install, plugin slash commands appear in the palette and the status bar
shows `pl:<name>` (yellow briefly after reload). While the AI runs a plugin
command or a plugin MCP tool, that segment turns **cyan** with `pl:<name>●`.

Sky loads both Claude-style forms:
- `commands/*.md` → `/plugin:name` (and short `/name` when safe)
- `commands/*.toml` → same (e.g. ponytail’s `/ponytail`, `/ponytail-review`)

Examples after installing ponytail:

```text
/ponytail              # activate full lazy mode (or /ponytail lite|ultra|off)
/ponytail-review
/ponytail-help
/ponytail:ponytail     # namespaced form also works
```

If you type a bare plugin name that only has namespaced children, Sky lists
those commands instead of erroring.

---

## 6. MCP tools

### Register

```bash
sky mcp add github \
  --command npx \
  --args "-y @modelcontextprotocol/server-github" \
  --env GITHUB_PERSONAL_ACCESS_TOKEN=ghp_... \
  --approval manual

sky mcp list
sky mcp test github
```

On the next `sky` session, Sky spawns the process, completes the MCP handshake,
and registers tools named like:

```text
mcp__github__list_issues
mcp__github__create_pull_request
```

### Approval modes

| Mode | Behaviour |
| --- | --- |
| `manual` | Prompt each call (default) |
| `auto` | Auto-approve that server |
| `deny` | Do not connect |

```bash
sky mcp add safe-docs --command … --approval auto
sky mcp remove github
```

---

## 7. Skills

Teach Sky project conventions without pasting them every turn.

**Global skill** — `~/.sky/skills/testing/SKILL.md`:

```md
---
name: testing
description: Repo test conventions
---
Use vitest. Prefer `*.test.ts` next to source. Run `npm test` before finishing.
```

**Project skill** — `.sky/skills/api/SKILL.md` (overrides global on same name):

```md
---
name: api
description: HTTP API style for this service
---
All handlers return `{ ok, data?, error? }`. Prefer Zod at the boundary.
```

Confirm load:

```bash
sky doctor          # shows skill count
# or in TUI:
/status
```

---

## 8. Configuration cheat sheet

```bash
sky config list
sky config get defaultProvider
sky config set defaultModel gpt-4o-mini
sky config set tools.read.deny '[".env*","*.pem","credentials*"]'
sky config validate
```

### Important paths

| Path | Purpose |
| --- | --- |
| `~/.sky/config.json` | Main config (mode `0600`) |
| `~/.sky/secrets.json` | API keys from `/key` (mode `0600`) |
| `~/.sky/sessions/` | Saved conversations |
| `~/.sky/sessions.index` | Session index |
| `~/.sky/audit/audit.log` | Approval audit trail |
| `~/.sky/logs/sky.log` | App logs |
| `~/.sky/plugins/` | Marketplaces + installed plugins |
| `~/.sky/skills/` | Global skills |
| `.skyrc` | Per-project config override |
| `.sky/skills/` | Per-project skills |

### Environment overrides

| Variable | Effect |
| --- | --- |
| `SKY_HOME` | Replace `~/.sky` |
| `SKY_CONFIG` | Alternate config path |
| `SKY_SECRETS` | Alternate secrets path |
| `SKY_DEFAULT_PROVIDER` | Override default provider |
| `SKY_DEFAULT_MODEL` | Override default model |
| `SKY_LOG_LEVEL` | `trace`…`error` |
| `NO_COLOR` / `SKY_NO_COLOR` | Disable ANSI color |

---

## 9. CI / scripts

```bash
# Non-interactive one-shot with NDJSON events
sky --yolo --json --quiet "run the linter and fix safe auto-fixes" \
  | jq -c 'select(.type=="tool-result")'

# Read-only check in a pipeline
sky --provider mock --json ask "list top-level packages"
```

Never use `--yolo` on untrusted prompts against a production machine. The hard
denylist blocks the worst shell patterns, but auto-approval still allows many
mutating commands inside the project cwd.

---

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `SKY-E-1000` Config not found | `sky init` |
| `SKY-E-1002` No API key | `export …_API_KEY=…` or `/key …` then `/status` |
| Provider SDK missing | `npm install openai` or `npm install @anthropic-ai/sdk` |
| MCP test fails | Check `command`/`args` on PATH; run `sky mcp test <name>` |
| TUI falls back to readline | Ink failed to load; check `npm install` / Node 20+ |
| Updates wanted | `sky update` or re-run `install.sh` |
| Full diagnosis | `sky doctor` |

```bash
sky doctor
sky --verbose ask "ping"     # debug logs to stderr + log file
```

---

## 11. Safety reminders

- File tools stay inside the session **cwd** by default.
- Reads of `.env*`, `*.pem`, `*.key`, etc. are denied by default.
- Destructive shell patterns are hard-denied even under `--yolo`.
- Approvals are audited to `~/.sky/audit/audit.log` before execution.
- Prefer `/key` or env vars over literals in `config.json`.

---

## See also

- [README.md](../README.md) — install, feature overview, architecture
- [CHANGELOG.md](../CHANGELOG.md) — what changed in each release
- [Sky_CLI_Agent_Technical_Specification.pdf](../Sky_CLI_Agent_Technical_Specification.pdf) — full design spec
