import { describe, expect, it } from 'vitest';

import {
  codexProvider,
  formatCodexToolStatus,
  normalizeCodexHookEvent,
  parseCodexTranscriptLine,
} from '../src/providers/hook/codex/codex.js';

describe('codexProvider', () => {
  it('declares Codex identity and capabilities', () => {
    expect(codexProvider.id).toBe('codex');
    expect(codexProvider.displayName).toBe('Codex');
    expect(codexProvider.subagentToolNames.has('multi_agent_v1__spawn_agent')).toBe(true);
    expect(codexProvider.readingTools.has('read_mcp_resource')).toBe(true);
  });

  it('normalizes tool lifecycle with a stable hook tool id', () => {
    const start = normalizeCodexHookEvent({
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      tool_use_id: 'call-1',
      tool_name: 'exec_command',
      tool_input: { cmd: 'npm test' },
    });
    const end = normalizeCodexHookEvent({
      hook_event_name: 'PostToolUse',
      session_id: 'session-1',
      tool_use_id: 'call-1',
    });

    expect(start).toEqual({
      sessionId: 'session-1',
      event: {
        kind: 'toolStart',
        toolId: 'call-1',
        toolName: 'exec_command',
        input: { cmd: 'npm test' },
      },
    });
    expect(end).toEqual({
      sessionId: 'session-1',
      event: { kind: 'toolEnd', toolId: 'call-1' },
    });
  });

  it('normalizes real Codex subagent hook fields', () => {
    const start = normalizeCodexHookEvent({
      hook_event_name: 'SubagentStart',
      session_id: 'parent-session',
      turn_id: 'turn-1',
      agent_id: 'agent-1',
      agent_type: 'code-reviewer',
      permission_mode: 'bypassPermissions',
    });
    expect(start?.event.kind).toBe('subagentStart');
    if (start?.event.kind === 'subagentStart') {
      expect(start.event.toolId).toBe('agent-1');
      expect(start.event.toolName).toBe('code-reviewer');
    }
  });

  it('uses a compacting-paper action for context compaction', () => {
    expect(
      normalizeCodexHookEvent({
        hook_event_name: 'PreCompact',
        session_id: 'session-1',
        trigger: 'auto',
      })?.event,
    ).toMatchObject({ kind: 'toolStart', toolName: 'ContextCompact' });
    expect(
      normalizeCodexHookEvent({
        hook_event_name: 'PostCompact',
        session_id: 'session-1',
      })?.event,
    ).toEqual({ kind: 'toolEnd', toolId: 'codex-context-compaction' });
  });

  it('formats common Codex actions without exposing full command text', () => {
    expect(formatCodexToolStatus('apply_patch')).toBe('Editing files');
    expect(formatCodexToolStatus('exec_command', { cmd: 'npm test' })).toBe('Running: npm test');
    expect(formatCodexToolStatus('view_image', { path: '/tmp/frame.png' })).toBe(
      'Viewing frame.png',
    );
  });

  it('parses current nested-tool rollout records', () => {
    const event = parseCodexTranscriptLine(
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'custom_tool_call',
          call_id: 'call-1',
          name: 'exec',
          input: 'const r = await tools.multi_agent_v1__spawn_agent({agent_type:"reviewer"});',
        },
      }),
    );
    expect(event).toMatchObject({
      kind: 'toolStart',
      toolId: 'call-1',
      toolName: 'multi_agent_v1__spawn_agent',
    });
  });

  it('parses Codex token totals for replay', () => {
    const event = parseCodexTranscriptLine(
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 1200, output_tokens: 90 },
          },
        },
      }),
    );
    expect(event).toEqual({
      kind: 'progress',
      toolId: 'token-usage',
      data: {
        type: 'tokenUsage',
        inputTokens: 1200,
        outputTokens: 90,
        contextWindow: undefined,
      },
    });
  });

  it('uses the current context usage instead of lifetime session tokens', () => {
    const event = parseCodexTranscriptLine(
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 6_300_000, output_tokens: 13_000 },
            last_token_usage: { input_tokens: 124_000, output_tokens: 900 },
            model_context_window: 258_400,
          },
        },
      }),
    );
    expect(event).toMatchObject({
      data: { inputTokens: 124_000, outputTokens: 900, contextWindow: 258_400 },
    });
  });

  it('treats a user-aborted Codex turn as a finished turn', () => {
    expect(
      parseCodexTranscriptLine(
        JSON.stringify({ type: 'event_msg', payload: { type: 'turn_aborted' } }),
      ),
    ).toEqual({ kind: 'turnEnd', awaitingInput: true });
  });

  it('parses the model and multi-agent mode used by a Codex turn', () => {
    expect(
      parseCodexTranscriptLine(
        JSON.stringify({
          type: 'turn_context',
          payload: {
            model: 'gpt-5.6-sol',
            effort: 'high',
            multi_agent_version: 'v2',
          },
        }),
      ),
    ).toMatchObject({
      kind: 'progress',
      data: {
        type: 'agentMetadata',
        model: 'gpt-5.6-sol',
        effort: 'high',
        multiAgentVersion: 'v2',
      },
    });
  });

  it('consumes non-visual Codex records without falling through to another provider parser', () => {
    expect(
      parseCodexTranscriptLine(
        JSON.stringify({ type: 'world_state', payload: { checkpoint: 'opaque' } }),
      ),
    ).toMatchObject({
      kind: 'progress',
      data: { type: 'ignoredCodexRecord', recordType: 'world_state' },
    });
  });
});
