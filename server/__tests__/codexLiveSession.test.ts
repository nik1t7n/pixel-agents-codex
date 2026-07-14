import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { findReplayTailOffset } from '../src/fileWatcher.js';
import { codexProvider } from '../src/providers/hook/codex/codex.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function transcript(dir: string, id: string, parentThreadId: string | null): string {
  const filePath = path.join(dir, `rollout-${id}.jsonl`);
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({
      type: 'session_meta',
      payload: {
        id,
        parent_thread_id: parentThreadId,
        cwd: dir,
        agent_nickname: parentThreadId ? 'Tesla' : undefined,
      },
    })}\n`,
  );
  return filePath;
}

describe('Codex selected-session live roster', () => {
  it('starts bounded replay at a complete JSONL record', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-codex-replay-fixture-'));
    tempRoots.push(dir);
    const filePath = path.join(dir, 'session.jsonl');
    fs.writeFileSync(filePath, 'first\nsecond-record\nthird\n');

    const size = fs.statSync(filePath).size;
    const offset = findReplayTailOffset(filePath, size, 16);
    expect(fs.readFileSync(filePath).subarray(offset).toString()).toBe('third\n');
  });

  it('admits a newly active child and rejects an unrelated session', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-codex-live-fixture-'));
    tempRoots.push(dir);
    const rootId = '019f5fcb-ca7a-7472-b593-c99784a1a248';
    const childId = '019f5fcb-ca7a-7472-b593-c99784a1a249';
    const unrelatedId = '019f5fcb-ca7a-7472-b593-c99784a1a250';
    const store = new AgentStateStore();
    const runtime = new AgentRuntime(store, codexProvider);

    runtime.openSelectedSession({ id: rootId, transcriptPath: transcript(dir, rootId, null) });
    const leadId = [...store.values()].find((agent) => agent.sessionId === rootId)?.id;
    const childPath = transcript(dir, childId, rootId);
    const unrelatedPath = transcript(dir, unrelatedId, unrelatedId);

    for (const [sessionId, transcriptPath] of [
      [childId, childPath],
      [unrelatedId, unrelatedPath],
    ]) {
      runtime.handleHookEvent('codex', {
        hook_event_name: 'SessionStart',
        session_id: sessionId,
        transcript_path: transcriptPath,
        cwd: dir,
      });
      runtime.handleHookEvent('codex', {
        hook_event_name: 'PreToolUse',
        session_id: sessionId,
        tool_use_id: `tool-${sessionId}`,
        tool_name: 'exec_command',
        tool_input: { cmd: 'npm test' },
      });
    }

    const child = [...store.values()].find((agent) => agent.sessionId === childId);
    expect(child).toMatchObject({ leadAgentId: leadId, agentName: 'Tesla' });
    expect([...store.values()].some((agent) => agent.sessionId === unrelatedId)).toBe(false);
    runtime.dispose();
  });
});
