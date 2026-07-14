export const CODEX_HOOK_SCRIPT_NAME = 'codex-hook.js';

export const CODEX_HOOK_EVENTS = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'SubagentStart',
  'SubagentStop',
  'Stop',
] as const;

export const CODEX_TERMINAL_NAME_PREFIX = 'Codex Agent';
