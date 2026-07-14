import * as os from 'os';
import * as path from 'path';

import type { AgentEvent, HookProvider } from '../../../../../core/src/provider.js';
import {
  areHooksInstalled as installerAreHooksInstalled,
  installHooks as installerInstallHooks,
  uninstallHooks as installerUninstallHooks,
} from './codexHookInstaller.js';
import { CODEX_TERMINAL_NAME_PREFIX } from './constants.js';

function objectInput(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function textInput(input: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof input[key] === 'string') return input[key];
  }
  return '';
}

export function formatCodexToolStatus(toolName: string, input?: unknown): string {
  const value = objectInput(input);
  const file = textInput(value, 'path', 'file_path');
  const shortFile = file ? path.basename(file) : '';

  if (toolName === 'apply_patch') return 'Editing files';
  if (toolName === 'exec_command') {
    const command = textInput(value, 'cmd', 'command').replace(/\s+/g, ' ').trim();
    return command ? `Running: ${command.slice(0, 80)}` : 'Running a command';
  }
  if (toolName === 'view_image') return shortFile ? `Viewing ${shortFile}` : 'Viewing an image';
  if (toolName === 'read_mcp_resource') return 'Reading a connected resource';
  if (toolName === 'web__run') return 'Browsing the web';
  if (toolName === 'wait' || toolName === 'wait_agent') return 'Waiting for agents';
  if (toolName.includes('spawn_agent')) return 'Starting a subagent';
  if (toolName.includes('send_message') || toolName.includes('followup_task')) {
    return 'Messaging a subagent';
  }
  if (toolName === 'exec') return 'Using Codex tools';
  return `Using ${toolName}`;
}

export function normalizeCodexHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: AgentEvent } | null {
  const eventName = raw.hook_event_name;
  const sessionId = raw.session_id;
  if (typeof eventName !== 'string' || typeof sessionId !== 'string') return null;

  switch (eventName) {
    case 'PreToolUse': {
      const input = objectInput(raw.tool_input);
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId:
            typeof raw.tool_use_id === 'string' ? raw.tool_use_id : `codex-hook-${Date.now()}`,
          toolName: typeof raw.tool_name === 'string' ? raw.tool_name : 'tool',
          input,
        },
      };
    }
    case 'PostToolUse':
      return {
        sessionId,
        event: {
          kind: 'toolEnd',
          toolId: typeof raw.tool_use_id === 'string' ? raw.tool_use_id : 'current',
        },
      };
    case 'PreCompact':
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: 'codex-context-compaction',
          toolName: 'ContextCompact',
          input: raw,
        },
      };
    case 'PostCompact':
      return {
        sessionId,
        event: { kind: 'toolEnd', toolId: 'codex-context-compaction' },
      };
    case 'SubagentStart': {
      const agentId = typeof raw.agent_id === 'string' ? raw.agent_id : `subagent-${Date.now()}`;
      return {
        sessionId,
        event: {
          kind: 'subagentStart',
          parentToolId: 'current',
          toolId: agentId,
          toolName: typeof raw.agent_type === 'string' ? raw.agent_type : 'subagent',
          input: raw,
        },
      };
    }
    case 'SubagentStop':
      return {
        sessionId,
        event: {
          kind: 'subagentEnd',
          parentToolId: 'current',
          toolId: typeof raw.agent_id === 'string' ? raw.agent_id : 'current',
        },
      };
    case 'SessionStart':
      return {
        sessionId,
        event: {
          kind: 'sessionStart',
          source: typeof raw.source === 'string' ? raw.source : undefined,
          transcriptPath: typeof raw.transcript_path === 'string' ? raw.transcript_path : undefined,
          cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
        },
      };
    case 'Stop':
      return { sessionId, event: { kind: 'turnEnd', awaitingInput: true } };
    default:
      return null;
  }
}

function nestedToolName(source: string): string | null {
  const match = source.match(
    /tools\.(multi_agent_v1__(?:spawn_agent|wait_agent|send_input|close_agent|resume_agent)|(?:spawn_agent|wait_agent|followup_task|send_message|interrupt_agent)|exec_command|write_stdin|apply_patch|view_image|web__run)\s*\(/,
  );
  return match?.[1] ?? null;
}

export function parseCodexTranscriptLine(line: string): AgentEvent | null {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  const payload = objectInput(record.payload);

  if (record.type === 'turn_context') {
    return {
      kind: 'progress',
      toolId: 'agent-metadata',
      data: {
        type: 'agentMetadata',
        model: typeof payload.model === 'string' ? payload.model : undefined,
        effort: typeof payload.effort === 'string' ? payload.effort : undefined,
        multiAgentVersion:
          typeof payload.multi_agent_version === 'string' ? payload.multi_agent_version : undefined,
      },
    };
  }

  if (record.type === 'event_msg' && payload.type === 'task_started') {
    return {
      kind: 'progress',
      toolId: 'agent-metadata',
      data: {
        type: 'agentMetadata',
        contextWindow:
          typeof payload.model_context_window === 'number'
            ? payload.model_context_window
            : undefined,
      },
    };
  }
  if (record.type === 'session_meta') {
    return {
      kind: 'sessionStart',
      source: typeof payload.thread_source === 'string' ? payload.thread_source : undefined,
      cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
    };
  }

  if (record.type === 'response_item') {
    const payloadType = payload.type;
    if (payloadType === 'custom_tool_call' || payloadType === 'function_call') {
      const callId = textInput(payload, 'call_id', 'id') || `codex-jsonl-${Date.now()}`;
      const rawInput = payload.input;
      const source = typeof rawInput === 'string' ? rawInput : '';
      const directName = textInput(payload, 'name') || 'tool';
      return {
        kind: 'toolStart',
        toolId: callId,
        toolName: nestedToolName(source) ?? directName,
        input: typeof rawInput === 'string' ? { source } : objectInput(rawInput),
      };
    }
    if (payloadType === 'custom_tool_call_output' || payloadType === 'function_call_output') {
      const callId = textInput(payload, 'call_id', 'id');
      return callId ? { kind: 'toolEnd', toolId: callId } : null;
    }
  }

  if (record.type === 'event_msg' && payload.type === 'token_count') {
    const info = objectInput(payload.info);
    const latestUsage = objectInput(info.last_token_usage);
    const usage = Object.keys(latestUsage).length
      ? latestUsage
      : objectInput(info.total_token_usage);
    return {
      kind: 'progress',
      toolId: 'token-usage',
      data: {
        type: 'tokenUsage',
        inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
        outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
        contextWindow:
          typeof info.model_context_window === 'number' ? info.model_context_window : undefined,
      },
    };
  }

  if (
    record.type === 'event_msg' &&
    (payload.type === 'task_complete' || payload.type === 'turn_aborted')
  ) {
    return { kind: 'turnEnd', awaitingInput: true };
  }

  return {
    kind: 'progress',
    toolId: 'codex-record',
    data: { type: 'ignoredCodexRecord', recordType: record.type },
  };
}

function buildLaunchCommand(
  _sessionId: string,
  cwd: string,
  opts?: { bypassPermissions?: boolean },
): { command: string; args: string[]; env?: Record<string, string> } {
  const args = ['-C', cwd];
  if (opts?.bypassPermissions) args.push('--dangerously-bypass-approvals-and-sandbox');
  return { command: 'codex', args };
}

export const codexProvider: HookProvider = {
  kind: 'hook',
  id: 'codex',
  displayName: 'Codex',
  protocolVersion: 1,
  normalizeHookEvent: normalizeCodexHookEvent,
  installHooks: async () => installerInstallHooks(),
  uninstallHooks: async () => installerUninstallHooks(),
  areHooksInstalled: async () => installerAreHooksInstalled(),
  formatToolStatus: formatCodexToolStatus,
  permissionExemptTools: new Set(),
  subagentToolNames: new Set(['spawn_agent', 'agents.spawn_agent', 'multi_agent_v1__spawn_agent']),
  readingTools: new Set([
    'read_mcp_resource',
    'list_mcp_resources',
    'list_mcp_resource_templates',
    'view_image',
    'web__run',
  ]),
  terminalNamePrefix: CODEX_TERMINAL_NAME_PREFIX,
  getAllSessionRoots: () => [
    path.join(os.homedir(), '.codex', 'sessions'),
    path.join(os.homedir(), '.codex', 'archived_sessions'),
  ],
  sessionFilePattern: '*.jsonl',
  parseTranscriptLine: parseCodexTranscriptLine,
  buildLaunchCommand,
};
