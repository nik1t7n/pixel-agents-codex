import type { AgentRuntime } from './agentRuntime.js';
import type { AgentStateStore } from './agentStateStore.js';
import {
  CodexSessionCatalog,
  type CodexSessionDetails,
  type CodexSessionSummary,
  type OpenedCodexSession,
  publicSessionDetails,
} from './providers/hook/codex/codexSessionCatalog.js';

export class CodexSessionController {
  private selected: CodexSessionDetails | null = null;
  private readonly refreshTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly runtime: AgentRuntime,
    private readonly store: AgentStateStore,
    private readonly catalog = new CodexSessionCatalog(),
  ) {
    this.refreshTimer = setInterval(() => this.refreshSelected(), 1000);
    this.refreshTimer.unref();
  }

  listSessions(): CodexSessionSummary[] {
    return this.catalog.listSessions(1000);
  }

  selectedSession(): OpenedCodexSession | null {
    return this.selected ? publicSessionDetails(this.selected) : null;
  }

  open(sessionId: string): { session: OpenedCodexSession; agentId: number } {
    const session = this.catalog.getSession(sessionId);
    if (!session) throw new Error('Codex session transcript was not found');

    this.setPersistenceScope(session.id);
    const agentId = this.runtime.openSelectedSession(session);
    if (agentId === null || !this.store.has(agentId)) {
      this.runtime.closeSelectedSession();
      this.setPersistenceScope(null);
      throw new Error('Codex session could not be opened');
    }
    this.selected = session;
    return { session: publicSessionDetails(session), agentId };
  }

  close(): void {
    this.runtime.closeSelectedSession();
    this.selected = null;
    this.setPersistenceScope(null);
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
  }

  private refreshSelected(): void {
    if (!this.selected) return;
    const current = this.catalog.getSession(this.selected.id);
    if (!current) return;
    this.selected = current;
    this.runtime.syncSelectedSession(current);
  }

  private setPersistenceScope(sessionId: string | null): void {
    const adapter = this.store.getAdapter() as
      | { setSessionScope?: (scope: string | null) => void }
      | undefined;
    adapter?.setSessionScope?.(sessionId);
  }
}
