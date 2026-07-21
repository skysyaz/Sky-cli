# Changelog

All notable changes to Sky are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-21

### Added
- **MCP runtime** — live stdio JSON-RPC client; tools register as `mcp__<server>__<tool>`; `sky mcp test` probes connectivity.
- **Skills** — load `SKILL.md` from `~/.sky/skills`, `.sky/skills`, and plugin `skills/` into the system prompt.
- **Providers** — Gemini, DeepSeek, and Groq (OpenAI-compatible); custom `baseUrl` providers supported.
- **`sky doctor`** (`sky status`) — diagnoses Node, config, API keys, SDKs, plugins, skills, and MCP.
- **`/status`** slash command — session, tools, plugins, skills, MCP overview in the TUI.
- **Secure `/key`** — writes to `~/.sky/secrets.json` (mode `0600`) instead of plaintext `config.json`.
- Ask/plan modes now get **read + search** tools for codebase Q&A and planning.
- **docs/USAGE.md** — end-to-end how-to guide (setup, TUI, providers, MCP, skills, CI, troubleshooting).

### Fixed
- **`edit` sandbox** — refused writes outside cwd (same as `write`).
- **`search` / `read` sandbox** — absolute/`..` paths no longer auto-scrape the host filesystem.
- **Write/edit preview** — no longer leaks outside-cwd file contents into the approval UI.
- **Shell denylist** — blocks `rm --recursive --force /`, pipe-to-shell, `mkfs`/`dd of=/dev/`; no longer false-positives `rm -rf /tmp`.
- **Approval `[e]dit`** — no longer silently granted without edited content.
- **Anthropic tool results** — consecutive tool results merge into one user message (role alternation).
- **OpenCode** — hosted gateway correctly requires an API key.
- **Invalid `--since`** — errors instead of silently returning empty `sky ls` results.
- **Streaming abort** — OpenAI adapter passes `AbortSignal` into the HTTP request.
- Config files written with mode `0600`.

### Changed
- In-cwd `read` is auto-approved by default (secret denylist still wins).
- `/compact` actually trims session history; auto-compact uses **current** history size (not lifetime tokens) and preserves recent tool results to avoid explore→forget loops.
- Provider fallback (`providers.*.fallback`) rebuilds the provider adapter (not just the model name).
- Provider fallback (`providers.*.fallback`) is consulted after repeated stream failures.
- Version bumped to **1.1.0**.

### Fixed
- Session allowlist "always" for cwd-root files (e.g. `README.md`).
- Secret read denylist now covers subdirectories (`**/.env*`, etc.).
- Edit tool reports replaced occurrence count accurately.
- Pipe-to-shell hard deny covers `| /bin/sh` and `| /usr/bin/bash`.
- Cost estimates cover palette models (Claude 4.5, GPT-4.1, Gemini, DeepSeek, Groq).
- Dashboard forge writes no longer persist project `.skyrc` into global config; `DELETE /api/forge/default` clears the default pointer.
- Empty Enter on approval prompts denies (safer default).
- Skill frontmatter closing fence requires a line of exactly `---`.
- Git `log` ignores non-numeric `-n` args.

## [1.0.0] - 2026-07-12

### Added

- **Core architecture** — layered TypeScript modules (`errors`, `logging`,
  `config`, `session`, `llm`, `safety`, `tools`, `agent`, `cli`) with the
  inward/downward dependency ordering from the technical specification (§2.3).
- **Error taxonomy** — `SkyError` with the complete `SKY-E-XXXX` catalog
  (Appendix B), each carrying a stable code, retryable flag, and BSD exit code.
- **Configuration** — Zod-validated schema (Appendix A), five-level precedence
  merging (defaults → config.json → `.skyrc` → `SKY_*` → CLI flags), and runtime
  secret resolution that never stores API keys in plaintext.
- **Sessions** — atomic (temp-file + rename) persistence, an append-only index,
  lifecycle states, versioned schema with a migration pipeline, and crash
  recovery via the `lastTurnInterrupted` flag.
- **LLM integration** — a small `Provider` interface with OpenAI, Anthropic,
  Ollama, and OpenRouter adapters, an offline `MockProvider`, exponential-backoff
  retry, priority-based context-window trimming, token counting, and cost
  estimation.
- **Safety** — a policy engine (denylist → session allowlist → config allowlist →
  tool predicate), four-tier shell classification, unified-diff generation for
  approvals, an append-only audit log, and `--force` / `--yolo` semantics that
  never bypass the hardcoded destructive denylist.
- **Tools** — `read`, `write`, `edit`, `search`, `shell`, and `git`, each with a
  Zod-validated interface and registry.
- **Agent loop** — a generator that yields typed events (`text-delta`,
  `tool-call`, `approval-*`, `tool-result`, `usage`, `error`, …) consumed
  identically by the interactive and headless renderers.
- **CLI** — `sky`, `agent`, `plan`, `ask`, `resume`, `ls`, `config`, `init`, and
  `mcp` via Commander, with the full global-flag set, NDJSON headless output, and
  a readline-based interactive TUI with slash commands.
- **Tests** — 78 unit/integration tests across errors, config, session, safety,
  tools, llm, and the agent loop.
