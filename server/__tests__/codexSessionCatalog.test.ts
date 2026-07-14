import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { CodexSessionCatalog } from '../src/providers/hook/codex/codexSessionCatalog.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixtureCodexHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-codex-catalog-fixture-'));
  tempRoots.push(root);
  return root;
}

describe('CodexSessionCatalog', () => {
  it('deduplicates the session index and keeps the newest title', () => {
    const root = fixtureCodexHome();
    fs.writeFileSync(
      path.join(root, 'session_index.jsonl'),
      [
        JSON.stringify({
          id: '019f5fcb-ca7a-7472-b593-c99784a1a248',
          thread_name: 'Old',
          updated_at: '2026-07-14T08:00:00Z',
        }),
        '{broken',
        JSON.stringify({
          id: '019f5fcb-ca7a-7472-b593-c99784a1a248',
          thread_name: 'Pixel agents',
          updated_at: '2026-07-14T09:00:00Z',
        }),
        JSON.stringify({
          id: '019f5f21-d7ab-7233-904e-bbe05b7a493c',
          thread_name: 'DAG diagnostics',
          updated_at: '2026-07-14T08:30:00Z',
        }),
      ].join('\n'),
    );

    expect(new CodexSessionCatalog(root).listSessions()).toEqual([
      {
        id: '019f5fcb-ca7a-7472-b593-c99784a1a248',
        title: 'Pixel agents',
        updatedAt: '2026-07-14T09:00:00Z',
      },
      {
        id: '019f5f21-d7ab-7233-904e-bbe05b7a493c',
        title: 'DAG diagnostics',
        updatedAt: '2026-07-14T08:30:00Z',
      },
    ]);
  });

  it('resolves a selected root transcript and its descendant agent sessions', () => {
    const root = fixtureCodexHome();
    const rootId = '019f5fcb-ca7a-7472-b593-c99784a1a248';
    fs.writeFileSync(
      path.join(root, 'session_index.jsonl'),
      JSON.stringify({
        id: rootId,
        thread_name: 'Pixel agents',
        updated_at: '2026-07-14T09:00:00Z',
      }),
    );
    const dayDir = path.join(root, 'sessions', '2026', '07', '14');
    fs.mkdirSync(dayDir, { recursive: true });
    const transcriptPath = path.join(dayDir, `rollout-2026-07-14T11-43-39-${rootId}.jsonl`);
    fs.writeFileSync(
      transcriptPath,
      `${JSON.stringify({ type: 'session_meta', payload: { id: rootId, parent_thread_id: null, cwd: '/tmp/project', originator: 'Codex Desktop' } })}\n`,
    );
    const childId = '019f5fcb-ca7a-7472-b593-c99784a1a249';
    const childPath = path.join(dayDir, `rollout-2026-07-14T11-44-39-${childId}.jsonl`);
    fs.writeFileSync(
      childPath,
      `${JSON.stringify({ type: 'session_meta', payload: { id: childId, session_id: rootId, parent_thread_id: rootId, cwd: '/tmp/project', agent_nickname: 'Tesla', agent_role: 'reviewer' } })}\n`,
    );

    expect(new CodexSessionCatalog(root).getSession(rootId)).toEqual({
      id: rootId,
      title: 'Pixel agents',
      updatedAt: '2026-07-14T09:00:00Z',
      transcriptPath,
      cwd: '/tmp/project',
      originator: 'Codex Desktop',
      children: [
        {
          id: childId,
          parentThreadId: rootId,
          transcriptPath: childPath,
          cwd: '/tmp/project',
          nickname: 'Tesla',
          role: 'reviewer',
        },
      ],
    });
  });
});
