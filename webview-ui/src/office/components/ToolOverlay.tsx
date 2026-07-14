import { useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/Button.js';
import {
  BUBBLE_FADE_DURATION_SEC,
  CHARACTER_SITTING_OFFSET_PX,
  FUEL_COLOR_CRITICAL,
  FUEL_COLOR_DANGER,
  FUEL_COLOR_OK,
  FUEL_COLOR_WARN,
  MAX_CONTEXT_TOKENS,
  TEAM_LEAD_COLOR,
  TEAM_ROLE_COLOR,
  TOKEN_CRITICAL_THRESHOLD,
  TOKEN_DANGER_THRESHOLD,
  TOKEN_WARN_THRESHOLD,
  TOOL_OVERLAY_VERTICAL_OFFSET,
} from '../../constants.js';
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js';
import type { OfficeState } from '../engine/officeState.js';
import type { ToolActivity } from '../types.js';
import { CharacterState, TILE_SIZE } from '../types.js';

// Both turn-end states show the green checkmark bubble. A finished turn (Stop)
// shows ONLY the checkmark (the label falls through to its normal idle text);
// going idle waiting on the user (Notification(idle_prompt)) additionally
// surfaces this label. Driven by Character.waitingAwaitingInput.
const WAITING_INPUT_ACTIVITY_TEXT = 'Waiting for input';

interface ToolOverlayProps {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentCharacters: SubagentCharacter[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onDismissAgentInfo: () => void;
  alwaysShowOverlay: boolean;
}

interface AgentDetail {
  title: string;
  role: string;
  folder?: string;
  model?: string;
  effort?: string;
  tools: ToolActivity[];
}

function AgentDetailDialog({ detail, onClose }: { detail: AgentDetail; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="pixel-agent-dialog pixel-panel m-auto max-h-[70dvh] w-[min(520px,calc(100dvw-32px))] overflow-hidden p-0 text-text"
      aria-labelledby="agent-detail-title"
    >
      <div className="flex items-start justify-between gap-16 border-b-2 border-border px-16 py-12">
        <div className="min-w-0">
          <div className="text-2xs text-text-muted">{detail.role}</div>
          <h2 id="agent-detail-title" className="mt-4 text-lg leading-tight text-pretty">
            {detail.title}
          </h2>
          {(detail.folder || detail.model) && (
            <div className="mt-6 truncate text-2xs text-text-muted">
              {[detail.folder, detail.model, detail.effort].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => ref.current?.close()}
          aria-label="Close agent details"
          className="size-24 shrink-0 text-sm"
        >
          ×
        </Button>
      </div>
      <div className="max-h-[45dvh] overflow-y-auto overscroll-contain px-16 py-12">
        <div className="mb-8 text-2xs text-text-muted">Recent actions</div>
        {detail.tools.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-8 p-0">
            {detail.tools.slice(-10).map((tool) => (
              <li key={tool.toolId} className="flex items-start gap-8 text-sm leading-tight">
                <span className="mt-2 shrink-0 text-text-muted">{tool.done ? '✓' : '›'}</span>
                <span className={tool.done ? 'text-text-muted' : 'text-text'}>{tool.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-text-muted">No tool calls in this step yet.</p>
        )}
      </div>
    </dialog>
  );
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
  bubbleType: 'permission' | 'waiting' | null,
  waitingAwaitingInput: boolean,
): string {
  if (bubbleType === 'permission') return 'Needs approval';
  // Only the idle case ("Waiting for input") gets a dedicated label. A finished
  // turn (Stop, waitingAwaitingInput=false) falls through so the checkmark alone
  // signals "done", same as the original behavior.
  if (bubbleType === 'waiting' && waitingAwaitingInput) return WAITING_INPUT_ACTIVITY_TEXT;

  const tools = agentTools[agentId];
  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval';
      return activeTool.status;
    }
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (isActive) {
      const lastTool = tools[tools.length - 1];
      if (lastTool) return lastTool.status;
    }
  }

  return 'Idle';
}

function getFuelColor(ratio: number): string {
  if (ratio >= TOKEN_CRITICAL_THRESHOLD) return FUEL_COLOR_CRITICAL;
  if (ratio >= TOKEN_DANGER_THRESHOLD) return FUEL_COLOR_DANGER;
  if (ratio >= TOKEN_WARN_THRESHOLD) return FUEL_COLOR_WARN;
  return FUEL_COLOR_OK;
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onDismissAgentInfo,
  alwaysShowOverlay,
}: ToolOverlayProps) {
  const [, setTick] = useState(0);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const selectedId = officeState.selectedAgentId;
  const hoveredId = officeState.hoveredAgentId;

  // All character IDs
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)];

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch?.thoughtText || ch.thoughtTimer <= 0 || ch.bubbleType) return null;
        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY =
          (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr;
        const role = ch.isTeamLead
          ? 'LEAD'
          : ch.agentName || (ch.isSubagent ? 'SUBAGENT' : 'AGENT');
        return (
          <button
            key={`${id}:${ch.thoughtText}`}
            type="button"
            className="agent-thought-bubble absolute z-30 flex max-w-260 -translate-x-1/2 items-center border-2 border-border bg-bg px-10 py-6 text-left text-2xs leading-tight text-text shadow-pixel"
            style={{
              left: screenX,
              top: screenY - 42,
              opacity: Math.min(1, ch.thoughtTimer / BUBBLE_FADE_DURATION_SEC),
            }}
            onClick={() =>
              setDetail({
                title: ch.thoughtText!,
                role,
                folder: ch.folderName,
                model: ch.model,
                effort: ch.effort,
                tools: agentTools[id] ?? [],
              })
            }
            title={ch.thoughtText}
            aria-label={`Open agent details: ${ch.thoughtText}`}
          >
            <span className="min-w-0 truncate">{ch.thoughtText}</span>
          </button>
        );
      })}
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;

        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        const isSub = ch.isSubagent;

        // Only show for hovered or selected agents (unless always-show is on)
        if (!alwaysShowOverlay && !isSelected && !isHovered) return null;

        // Position above character
        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY =
          (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr;

        // A "Done" agent (finished turn: waiting bubble without awaitingInput)
        // shows ONLY its floating green checkmark bubble, never the label panel
        // (the panel would cover the bubble). Render an empty positioned marker
        // so overlay counts stay stable and hover/select can still bring the
        // panel back. When always-show is off, the early return above already
        // keeps the panel hidden for idle agents.
        const isDone = ch.bubbleType === 'waiting' && !ch.waitingAwaitingInput;
        if (isDone && !isSelected && !isHovered) {
          return (
            <div
              key={id}
              className="absolute"
              style={{ left: screenX, top: screenY, pointerEvents: 'none' }}
              data-testid="agent-overlay"
              data-agent-id={id}
            />
          );
        }

        // Get activity text
        const hasWaitingBubble = ch.bubbleType === 'waiting';
        const subHasPermission = isSub && ch.bubbleType === 'permission';
        let activityText: string;
        if (hasWaitingBubble && ch.waitingAwaitingInput) {
          // Idle, waiting on the user -> dedicated label. A finished turn (Stop)
          // shows only the checkmark and falls through to the normal idle text.
          activityText = WAITING_INPUT_ACTIVITY_TEXT;
        } else if (isSub) {
          if (subHasPermission) {
            activityText = 'Needs approval';
          } else {
            const sub = subagentCharacters.find((s) => s.id === id);
            activityText = sub ? sub.label : 'Subtask';
          }
        } else {
          activityText = getActivityText(
            id,
            agentTools,
            ch.isActive,
            ch.bubbleType,
            ch.waitingAwaitingInput ?? false,
          );
        }

        // Determine dot color
        const tools = agentTools[id];
        const hasPermission = subHasPermission || tools?.some((t) => t.permissionWait && !t.done);
        const hasActiveTools = tools?.some((t) => !t.done);
        const isActive = ch.isActive;
        const hasWaiting = ch.bubbleType === 'waiting';

        let dotColor: string | null = null;
        if (hasPermission || hasWaiting) {
          dotColor = 'var(--color-status-permission)';
        } else if (isActive && hasActiveTools) {
          dotColor = 'var(--color-status-active)';
        }

        // Team info
        const teamRoleLabel = ch.isTeamLead ? 'LEAD' : ch.agentName || null;
        const totalTokens = ch.inputTokens + ch.outputTokens;
        const contextWindow = ch.contextWindow ?? MAX_CONTEXT_TOKENS;
        const tokenRatio = totalTokens / contextWindow;
        const hasExtraLines = !!(ch.folderName || teamRoleLabel || ch.model);

        return (
          <div
            key={id}
            className="absolute flex flex-col items-center -translate-x-1/2"
            style={{
              left: screenX,
              top: screenY - (hasExtraLines ? 34 : 28),
              pointerEvents: isSelected ? 'auto' : 'none',
              opacity: alwaysShowOverlay && !isSelected && !isHovered ? (isSub ? 0.5 : 0.75) : 1,
              zIndex: isSelected ? 42 : 41,
            }}
            data-testid="agent-overlay"
            data-agent-id={id}
          >
            <div className="flex max-w-192 items-center gap-4 whitespace-nowrap border-border px-6 py-4 pixel-panel">
              {dotColor && (
                <span
                  className={`w-6 h-6 rounded-full shrink-0 ${isActive && !hasPermission && !hasWaiting ? 'pixel-pulse' : ''}`}
                  style={{ background: dotColor }}
                />
              )}
              <div className="min-w-0 overflow-hidden">
                <div className="flex items-baseline gap-4 overflow-hidden leading-none">
                  {teamRoleLabel && (
                    <span
                      className="shrink-0"
                      style={{
                        fontSize: '16px',
                        color: ch.isTeamLead ? TEAM_LEAD_COLOR : TEAM_ROLE_COLOR,
                        fontWeight: ch.isTeamLead ? 'bold' : undefined,
                      }}
                    >
                      {teamRoleLabel}
                    </span>
                  )}
                  <span className="truncate" style={{ fontSize: '18px' }}>
                    {activityText}
                  </span>
                </div>
                {(ch.folderName || (isSelected && ch.model) || totalTokens > 0) && (
                  <div
                    className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden leading-none text-text-muted"
                    style={{ fontSize: '13px', opacity: 0.65 }}
                  >
                    {ch.folderName && <span className="truncate">{ch.folderName}</span>}
                    {isSelected && ch.model && (
                      <span className="shrink-0">
                        {ch.folderName ? '· ' : ''}
                        {ch.model}
                        {ch.effort ? ` · ${ch.effort}` : ''}
                        {ch.multiAgentVersion ? ` · ${ch.multiAgentVersion}` : ''}
                      </span>
                    )}
                    {totalTokens > 0 && (
                      <span
                        className="shrink-0 tabular-nums"
                        style={{ color: getFuelColor(tokenRatio) }}
                        title={`${Math.round(tokenRatio * 100)}% context used (${(totalTokens / 1000).toFixed(0)}k / ${(contextWindow / 1000).toFixed(0)}k tokens)`}
                      >
                        · ctx {Math.round(tokenRatio * 100)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
              {isSelected && !isSub && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissAgentInfo();
                  }}
                  title="Close agent info"
                  aria-label="Close agent info"
                  className="ml-1 size-14 shrink-0 border-0 text-sm leading-none opacity-50 hover:opacity-100"
                >
                  ×
                </Button>
              )}
            </div>
          </div>
        );
      })}
      {detail && <AgentDetailDialog detail={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
