import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CodexSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface CodexSessionDetails extends CodexSessionSummary {
  transcriptPath: string;
  cwd?: string;
  originator?: string;
  children: CodexChildSession[];
}

export interface CodexChildSession {
  id: string;
  parentThreadId: string;
  transcriptPath: string;
  cwd?: string;
  nickname?: string;
  role?: string;
}

export interface OpenedCodexSession {
  id: string;
  title: string;
  updatedAt: string;
  cwd?: string;
  originator?: string;
}

interface SessionIndexRecord {
  id?: unknown;
  thread_name?: unknown;
  updated_at?: unknown;
}

export function publicSessionDetails(session: CodexSessionDetails): OpenedCodexSession {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    cwd: session.cwd,
    originator: session.originator,
  };
}

interface SessionMetaRecord {
  type?: unknown;
  payload?: {
    id?: unknown;
    parent_thread_id?: unknown;
    cwd?: unknown;
    originator?: unknown;
    agent_nickname?: unknown;
    agent_role?: unknown;
  };
}

const SESSION_ID_PATTERN = /^[0-9a-f-]{20,}$/i;
const MAX_VISIBLE_CHILDREN = 24;

export class CodexSessionCatalog {
  constructor(private readonly codexHome = path.join(os.homedir(), '.codex')) {}

  listSessions(limit = 100): CodexSessionSummary[] {
    if (!Number.isInteger(limit) || limit < 1) return [];

    const latestById = new Map<string, CodexSessionSummary>();
    const indexPath = path.join(this.codexHome, 'session_index.jsonl');
    let contents: string;
    try {
      contents = fs.readFileSync(indexPath, 'utf-8');
    } catch {
      return [];
    }

    for (const line of contents.split('\n')) {
      if (!line.trim()) continue;
      let record: SessionIndexRecord;
      try {
        record = JSON.parse(line) as SessionIndexRecord;
      } catch {
        continue;
      }
      if (
        typeof record.id !== 'string' ||
        !SESSION_ID_PATTERN.test(record.id) ||
        typeof record.thread_name !== 'string' ||
        typeof record.updated_at !== 'string'
      ) {
        continue;
      }

      const candidate = {
        id: record.id,
        title: record.thread_name.trim() || 'Untitled Codex session',
        updatedAt: record.updated_at,
      };
      const current = latestById.get(record.id);
      if (!current || candidate.updatedAt >= current.updatedAt) {
        latestById.set(record.id, candidate);
      }
    }

    return [...latestById.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  getSession(id: string): CodexSessionDetails | null {
    if (!SESSION_ID_PATTERN.test(id)) return null;
    const summary = this.listSessions(Number.MAX_SAFE_INTEGER).find((item) => item.id === id);
    if (!summary) return null;

    const transcriptPath = this.findTranscript(id);
    if (!transcriptPath) return null;
    const meta = readCodexSessionMeta(transcriptPath);
    if (!meta || meta.id !== id || meta.parentThreadId) return null;

    return {
      ...summary,
      transcriptPath,
      cwd: meta.cwd,
      originator: meta.originator,
      children: this.findChildren(id),
    };
  }

  private findChildren(rootId: string): CodexChildSession[] {
    const candidates: CodexChildSession[] = [];
    for (const root of [
      path.join(this.codexHome, 'sessions'),
      path.join(this.codexHome, 'archived_sessions'),
    ]) {
      for (const filePath of listJsonlFiles(root)) {
        const meta = readCodexSessionMeta(filePath);
        if (!meta?.parentThreadId) continue;
        candidates.push({
          id: meta.id,
          parentThreadId: meta.parentThreadId,
          transcriptPath: filePath,
          cwd: meta.cwd,
          nickname: meta.nickname,
          role: meta.role,
        });
      }
    }

    const descendants: CodexChildSession[] = [];
    const acceptedParents = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const child of candidates) {
        if (acceptedParents.has(child.id) || !acceptedParents.has(child.parentThreadId)) continue;
        acceptedParents.add(child.id);
        descendants.push(child);
        changed = true;
      }
    }
    return descendants
      .sort((a, b) => fileModifiedAt(b.transcriptPath) - fileModifiedAt(a.transcriptPath))
      .slice(0, MAX_VISIBLE_CHILDREN)
      .reverse();
  }

  private findTranscript(id: string): string | null {
    const suffix = `-${id}.jsonl`;
    const roots = [
      path.join(this.codexHome, 'sessions'),
      path.join(this.codexHome, 'archived_sessions'),
    ];

    for (const root of roots) {
      const match = findFileBySuffix(root, suffix);
      if (match) return match;
    }
    return null;
  }
}

function fileModifiedAt(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function listJsonlFiles(root: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listJsonlFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath);
  }
  return files;
}

function findFileBySuffix(root: string, suffix: string): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith(suffix)) return fullPath;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = findFileBySuffix(path.join(root, entry.name), suffix);
    if (match) return match;
  }
  return null;
}

export function readCodexSessionMeta(filePath: string): {
  id: string;
  parentThreadId?: string;
  cwd?: string;
  originator?: string;
  nickname?: string;
  role?: string;
} | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(64 * 1024);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const firstLine = buffer.toString('utf-8', 0, bytesRead).split('\n')[0];
    const record = JSON.parse(firstLine) as SessionMetaRecord;
    if (record.type !== 'session_meta' || typeof record.payload?.id !== 'string') return null;
    return {
      id: record.payload.id,
      parentThreadId:
        typeof record.payload.parent_thread_id === 'string'
          ? record.payload.parent_thread_id
          : undefined,
      cwd: typeof record.payload.cwd === 'string' ? record.payload.cwd : undefined,
      originator:
        typeof record.payload.originator === 'string' ? record.payload.originator : undefined,
      nickname:
        typeof record.payload.agent_nickname === 'string'
          ? record.payload.agent_nickname
          : undefined,
      role: typeof record.payload.agent_role === 'string' ? record.payload.agent_role : undefined,
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** True when the transcript's latest turn has started but has not finished. */
export function isCodexSessionActive(filePath: string): boolean {
  let fd: number | undefined;
  try {
    const stat = fs.statSync(filePath);
    fd = fs.openSync(filePath, 'r');
    let position = stat.size;
    let leadingPartial = '';
    while (position > 0) {
      const bytes = Math.min(position, 256 * 1024);
      position -= bytes;
      const buffer = Buffer.alloc(bytes);
      fs.readSync(fd, buffer, 0, bytes, position);
      const lines = `${buffer.toString('utf-8')}${leadingPartial}`.split('\n');
      leadingPartial = lines.shift() ?? '';
      for (let index = lines.length - 1; index >= 0; index--) {
        try {
          const record = JSON.parse(lines[index]!) as {
            type?: unknown;
            payload?: { type?: unknown };
          };
          if (record.type !== 'event_msg') continue;
          const type = record.payload?.type;
          if (type === 'task_started') return true;
          if (type === 'task_complete' || type === 'turn_aborted') return false;
        } catch {
          // The newest block can end in a partially written record.
        }
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
