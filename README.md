# Pixel Codex Agents

Pixel Codex Agents turns one selected Codex Desktop session into a persistent pixel-art world. The root Codex agent and its real subagents become animated characters that walk, work at desks, read, code, test, browse, communicate, compact context, and wait.

This project is a Codex-native fork of [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents). It keeps the original canvas game, editor, sprites, furniture, floors, walls, and MIT license while replacing the default Claude workflow with real Codex sessions, transcripts, and Hooks.

![Pixel Agents office](webview-ui/public/Screenshot.jpg)

## Product behavior

- The first screen lists real sessions from `~/.codex/session_index.jsonl`.
- No world is built until a session is selected.
- Each session gets its own saved layout, seats, and character world.
- The selected root transcript and its real `parent_thread_id` descendants form the roster.
- Long-running sessions show the latest 24 subagents, keeping the room readable.
- Newly active descendants join the open world through Codex Hooks.
- Reopening reads only a bounded transcript tail instead of replaying huge JSONL files.
- Clicking a character shows role, action, model, effort, multi-agent version, and real context usage when Codex provides them.
- `/goal`, DAG workflows, plans, and other methods are ordinary session content. The visualization does not depend on any one orchestration style.

## Requirements

- macOS, Linux, or Windows
- Node.js 20 or newer
- Codex Desktop or Codex CLI with sessions under `~/.codex`

## Run from source

```bash
git clone https://github.com/nik1t7n/pixel-agents-codex.git
cd pixel-agents-codex
npm ci
npm run build
node dist/cli.js
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100), search for a Codex session, and click it.

The server binds to localhost. On startup it merges its entries into `~/.codex/hooks.json` and installs a small event sender at `~/.pixel-agents/hooks/codex-hook.js`. Existing hook entries are preserved. The integration can be disabled under **Settings → Live Codex Events**.

Options:

```text
pixel-agents-codex --port 3100 --host 127.0.0.1
```

## Development

```bash
npm run check-types
npm run lint
npm test
npm run build
```

The repository is an npm workspace:

- `core/` — AsyncAPI protocol and provider contracts.
- `server/` — Codex catalog, transcript parser, hook integration, runtime, HTTP and WebSocket server.
- `webview-ui/` — React, Canvas 2D game loop, layout editor, characters, and pixel rendering.
- `adapters/vscode/` — inherited upstream adapter; the standalone Codex application is the primary surface of this fork.

## Real Codex sources

Pixel Codex Agents reads only local Codex state:

- `~/.codex/session_index.jsonl` for the lightweight session picker;
- `~/.codex/sessions/**/rollout-*.jsonl` and `~/.codex/archived_sessions/**/rollout-*.jsonl` after selection;
- `~/.codex/hooks.json` for live events.

Supported live events include session start, tool start/end, context compaction, subagent start/stop, and turn completion. Transcript parsing additionally recovers current model metadata, context-window usage, nested tool calls, and subagent lineage.

## Persistence

Global settings live under `~/.pixel-agents/`. A selected session's world lives under:

```text
~/.pixel-agents/codex-worlds/<session-id>/
```

Opening another session switches persistence scope. Merely listing or searching sessions does not create these folders.

## Assets and attribution

The office assets remain open source under `webview-ui/public/assets/`. Character sprites are based on [JIK-A-4's Metro City free top-down character pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

The original Pixel Agents project and contributors created the game renderer, layout editor, asset system, and initial agent runtime. This fork retains their copyright notices and is distributed under the repository's [MIT License](LICENSE).

## Current boundary

The application observes and visualizes Codex. It does not pretend to change the model of an already-running Codex Desktop task because Codex exposes no supported external command for that operation. Model changes made in Codex are detected from subsequent real turn metadata and reflected in the character card.
