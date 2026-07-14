import { useMemo, useState } from 'react';

import type { CodexSessionSummary } from '../../../core/src/messages.js';
import { Button } from './ui/Button.js';

interface SessionPickerProps {
  sessions: CodexSessionSummary[];
  openingSessionId: string | null;
  error: string | null;
  onOpen: (sessionId: string) => void;
  onRefresh: () => void;
}

function sessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function SessionPicker({
  sessions,
  openingSessionId,
  error,
  onOpen,
  onRefresh,
}: SessionPickerProps) {
  const [query, setQuery] = useState('');
  const visibleSessions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized
      ? sessions.filter(
          (session) =>
            session.title.toLocaleLowerCase().includes(normalized) ||
            session.id.toLocaleLowerCase().includes(normalized),
        )
      : sessions;
    return matches.slice(0, 100);
  }, [query, sessions]);

  return (
    <main className="min-h-full bg-bg-dark p-20 overflow-auto">
      <div className="mx-auto max-w-760">
        <header className="mb-18 flex items-end justify-between gap-16">
          <div>
            <h1 className="m-0 text-3xl text-text">Pixel Codex Agents</h1>
            <p className="mt-6 mb-0 text-sm text-text-muted">
              Choose a Codex session to build or reopen its world.
            </p>
          </div>
          <Button onClick={onRefresh} size="md">
            Refresh
          </Button>
        </header>

        {error && (
          <div className="mb-12 border-2 border-danger bg-bg px-12 py-8 text-sm text-reset-text shadow-pixel">
            {error}
          </div>
        )}

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions"
          aria-label="Search sessions"
          className="mb-10 w-full border-2 border-border bg-bg px-12 py-8 text-base text-text outline-none shadow-pixel placeholder:text-text-muted focus:border-accent"
        />

        <section className="pixel-panel overflow-hidden" aria-label="Codex sessions">
          {visibleSessions.length === 0 ? (
            <div className="px-16 py-24 text-center text-text-muted">
              {sessions.length === 0
                ? 'No Codex sessions found in ~/.codex/session_index.jsonl'
                : 'No matching Codex sessions'}
            </div>
          ) : (
            visibleSessions.map((session) => {
              const isOpening = openingSessionId === session.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  disabled={openingSessionId !== null}
                  onClick={() => onOpen(session.id)}
                  className="group flex w-full cursor-pointer items-center justify-between gap-16 border-0 border-b-2 border-border bg-bg px-16 py-12 text-left text-text last:border-b-0 hover:bg-btn-hover disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-lg">{session.title}</span>
                    <span className="mt-2 block truncate text-2xs text-text-muted">
                      {session.id}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-text-muted group-hover:text-text">
                    {isOpening ? 'Opening...' : sessionTime(session.updatedAt)}
                  </span>
                </button>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
