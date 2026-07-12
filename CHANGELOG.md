# Changelog

All notable changes to Sky are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
