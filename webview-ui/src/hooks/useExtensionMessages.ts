import { useEffect, useRef, useState } from 'react';

import type { CodexSessionSummary, OpenedCodexSession } from '../../../core/src/messages.js';
import { playDoneSound, playPermissionSound, setSoundEnabled } from '../notificationSound.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { setFloorSprites } from '../office/floorTiles.js';
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js';
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js';
import { setPetTemplates } from '../office/sprites/petSpriteData.js';
import { setCharacterTemplates } from '../office/sprites/spriteData.js';
import { getLoadedCharacterCount } from '../office/sprites/spriteData.js';
import {
  extractToolName,
  setProviderCapabilities,
  stableAgentAppearance,
} from '../office/toolUtils.js';
import type { OfficeLayout, ToolActivity } from '../office/types.js';
import { setWallSprites } from '../office/wallTiles.js';
import { isE2E } from '../runtime.js';
import { transport } from '../transport/index.js';

export interface SubagentCharacter {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
}

interface HiddenTeammate {
  parentAgentId: number;
  palette?: number;
  hueShift?: number;
  folderName?: string;
  agentName?: string;
  teamName?: string;
}

interface FurnitureAsset {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface WorkspaceFolder {
  name: string;
  path: string;
}

interface ExtensionMessageState {
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  layoutReady: boolean;
  layoutWasReset: boolean;
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
  workspaceFolders: WorkspaceFolder[];
  externalAssetDirectories: string[];
  lastSeenVersion: string;
  extensionVersion: string;
  watchAllSessions: boolean;
  setWatchAllSessions: (v: boolean) => void;
  alwaysShowLabels: boolean;
  hooksEnabled: boolean;
  setHooksEnabled: (v: boolean) => void;
  hooksInfoShown: boolean;
  sessions: CodexSessionSummary[];
  openedSession: OpenedCodexSession | null;
  sessionError: string | null;
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {};
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue;
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId };
  }
  transport.send({ type: 'saveAgentSeats', seats });
}

function sessionAppearance(sessionId: string | undefined): { palette?: number; hueShift?: number } {
  if (!sessionId) return {};
  return stableAgentAppearance(sessionId, getLoadedCharacterCount());
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({});
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({});
  const [subagentTools, setSubagentTools] = useState<
    Record<number, Record<string, ToolActivity[]>>
  >({});
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [layoutWasReset, setLayoutWasReset] = useState(false);
  const [loadedAssets, setLoadedAssets] = useState<
    { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  >();
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [externalAssetDirectories, setExternalAssetDirectories] = useState<string[]>([]);
  const [lastSeenVersion, setLastSeenVersion] = useState('');
  const [extensionVersion, setExtensionVersion] = useState('');
  const [watchAllSessions, setWatchAllSessions] = useState(false);
  const [alwaysShowLabels, setAlwaysShowLabels] = useState(false);
  const [hooksEnabled, setHooksEnabled] = useState(true);
  const [hooksInfoShown, setHooksInfoShown] = useState(true);
  const [sessions, setSessions] = useState<CodexSessionSummary[]>([]);
  const [openedSession, setOpenedSession] = useState<OpenedCodexSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false);

  useEffect(() => {
    const hiddenTeammates = new Map<number, HiddenTeammate>();
    const activeAgentIds = new Set<number>();
    // Buffer agents from existingAgents until layout is loaded
    let pendingAgents: Array<{
      id: number;
      palette?: number;
      hueShift?: number;
      seatId?: string;
      folderName?: string;
      sessionId?: string;
    }> = [];

    const showTeammate = (id: number, os: OfficeState): void => {
      const meta = hiddenTeammates.get(id);
      if (!meta) return;
      const parent = os.characters.get(meta.parentAgentId);
      os.addAgent(
        id,
        meta.palette ?? parent?.palette,
        meta.hueShift ?? parent?.hueShift,
        undefined,
        undefined,
        meta.folderName ?? parent?.folderName,
      );
      const ch = os.characters.get(id);
      if (ch) {
        ch.leadAgentId = meta.parentAgentId;
        ch.teamName = meta.teamName ?? parent?.teamName;
        ch.agentName = meta.agentName ?? 'subagent';
      }
      setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]));
    };

    const hideTeammate = (id: number, os: OfficeState): void => {
      if (!hiddenTeammates.has(id)) return;
      os.setAgentTool(id, null);
      os.setAgentActive(id, false);
      os.removeAgent(id);
      setAgents((prev) => prev.filter((agentId) => agentId !== id));
      setSelectedAgent((prev) => (prev === id ? null : prev));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (msg: any) => {
      const os = getOfficeState();
      // CI / e2e diagnostic: record every received transport message on the
      // window-side log. The fixture reads window.__pixelAgentsTestHooks.
      // messageLog and attaches as JSON so CI failures can see the exact
      // sequence of messages the webview actually processed. Gated on the e2e
      // harness flag so this unbounded log never grows in a real session.
      if (isE2E && typeof window !== 'undefined') {
        if (!window.__pixelAgentsTestHooks) window.__pixelAgentsTestHooks = {};
        if (!window.__pixelAgentsTestHooks.messageLog) {
          window.__pixelAgentsTestHooks.messageLog = [];
        }
        window.__pixelAgentsTestHooks.messageLog.push({
          at: Date.now(),
          type: msg.type,
          id: msg.id,
          toolName: msg.toolName,
          status: msg.status,
          toolId: msg.toolId,
          parentToolId: msg.parentToolId,
        });
      }

      if (msg.type === 'providerCapabilities') {
        setProviderCapabilities({
          readingTools: msg.readingTools,
          subagentToolNames: msg.subagentToolNames,
        });
        return;
      }

      if (msg.type === 'sessionCatalog') {
        setSessions(msg.sessions);
        setOpenedSession(msg.selectedSession ?? null);
        setSessionError(null);
        if (!msg.selectedSession) {
          os.clearAgents();
          hiddenTeammates.clear();
          activeAgentIds.clear();
          pendingAgents = [];
          setAgents([]);
          setSelectedAgent(null);
          setAgentTools({});
          setAgentStatuses({});
          setSubagentTools({});
          setSubagentCharacters([]);
        }
        return;
      }

      if (msg.type === 'sessionOpened') {
        setOpenedSession(msg.session);
        setSessionError(null);
        return;
      }

      if (msg.type === 'sessionOpenFailed') {
        setSessionError(msg.message);
        return;
      }

      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (layoutReadyRef.current && isEditDirty?.()) {
          console.log('[Webview] Skipping external layout update — editor has unsaved changes');
          return;
        }
        const rawLayout = msg.layout as OfficeLayout | null;
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null;
        if (layout) {
          os.rebuildFromLayout(layout);
          onLayoutLoaded?.(layout);
        } else {
          // Default layout — snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout());
        }
        // Add buffered agents now that layout (and seats) are correct
        for (const p of pendingAgents) {
          os.addAgent(p.id, p.palette, p.hueShift, p.seatId, true, p.folderName);
        }
        pendingAgents = [];
        layoutReadyRef.current = true;
        setLayoutReady(true);
        if (msg.wasReset) {
          setLayoutWasReset(true);
        }
        if (os.characters.size > 0) {
          saveAgentSeats(os);
        }
      } else if (msg.type === 'agentCreated') {
        const id = msg.id as number;
        const { palette, hueShift } = sessionAppearance(msg.sessionId as string | undefined);
        const folderName = msg.folderName as string | undefined;
        const isTeammate = msg.isTeammate as boolean | undefined;
        const teammateName = msg.teammateName as string | undefined;
        const teammateParentId = msg.parentAgentId as number | undefined;
        const teamName = msg.teamName as string | undefined;
        if (isTeammate && teammateParentId !== undefined) {
          hiddenTeammates.set(id, {
            parentAgentId: teammateParentId,
            palette,
            hueShift,
            folderName,
            agentName: teammateName,
            teamName,
          });
          return;
        }
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]));
        // Don't auto-select teammates (keep focus on lead)
        if (!isTeammate) {
          setSelectedAgent(id);
        }
        os.addAgent(id, palette, hueShift, undefined, undefined, folderName);
        saveAgentSeats(os);
      } else if (msg.type === 'agentClosed') {
        const id = msg.id as number;
        hiddenTeammates.delete(id);
        activeAgentIds.delete(id);
        setAgents((prev) => prev.filter((a) => a !== id));
        setSelectedAgent((prev) => (prev === id ? null : prev));
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id);
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        os.removeAgent(id);
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[];
        const meta = (msg.agentMeta || {}) as Record<
          number,
          { palette?: number; hueShift?: number; seatId?: string }
        >;
        const folderNames = (msg.folderNames || {}) as Record<number, string>;
        const sessionIds = (msg.sessionIds || {}) as Record<number, string>;
        const parentAgentIds = (msg.parentAgentIds || {}) as Record<number, number>;
        const agentNames = (msg.agentNames || {}) as Record<number, string>;
        const activeIncoming = new Set((msg.activeAgentIds || []) as number[]);
        // Buffer agents — they'll be added in layoutLoaded after seats are built
        for (const id of incoming) {
          const m = meta[id];
          const parentAgentId = parentAgentIds[id];
          if (parentAgentId !== undefined) {
            const appearance = sessionAppearance(sessionIds[id]);
            hiddenTeammates.set(id, {
              parentAgentId,
              palette: appearance.palette ?? m?.palette,
              hueShift: appearance.hueShift ?? m?.hueShift,
              folderName: folderNames[id],
              agentName: agentNames[id],
            });
            if (activeIncoming.has(id)) {
              activeAgentIds.add(id);
              showTeammate(id, os);
              os.setAgentActive(id, true);
            }
            continue;
          }
          const appearance = sessionAppearance(sessionIds[id]);
          const pendingAgent = {
            id,
            palette: appearance.palette ?? m?.palette,
            hueShift: appearance.hueShift ?? m?.hueShift,
            seatId: m?.seatId,
            folderName: folderNames[id],
            sessionId: sessionIds[id],
          };
          if (layoutReadyRef.current) {
            os.addAgent(
              pendingAgent.id,
              pendingAgent.palette,
              pendingAgent.hueShift,
              pendingAgent.seatId,
              true,
              pendingAgent.folderName,
            );
          } else {
            pendingAgents.push(pendingAgent);
          }
        }
        setAgents((prev) => {
          const ids = new Set(prev);
          const merged = [...prev];
          for (const id of incoming) {
            if (parentAgentIds[id] !== undefined) continue;
            if (!ids.has(id)) {
              merged.push(id);
            }
          }
          return merged.sort((a, b) => a - b);
        });
        if (layoutReadyRef.current && incoming.length > 0) saveAgentSeats(os);
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        const permissionActive = msg.permissionActive as boolean | undefined;
        activeAgentIds.add(id);
        showTeammate(id, os);
        setAgentTools((prev) => {
          const list = prev[id] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return {
            ...prev,
            [id]: [
              ...list,
              { toolId, status, done: false, permissionWait: permissionActive || false },
            ],
          };
        });
        const toolName = (msg.toolName as string | undefined) ?? extractToolName(status);
        os.setAgentTool(id, toolName, status);
        if (toolName === 'ContextCompact') {
          os.setAgentContextCompacting(id);
        } else if (toolName === 'wait_agent' || toolName === 'wait') {
          os.setAgentWaitingForAgents(id);
        } else {
          os.setAgentActive(id, true);
        }
        // Don't clear the permission bubble if the hook already confirmed permission is needed
        if (!permissionActive) {
          os.clearPermissionBubble(id);
        }
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        if (toolId === 'codex-context-compaction') os.setAgentActive(id, true);
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          };
        });
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id as number;
        activeAgentIds.delete(id);
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent.
        // Exception: team leads with inline teammates -- their sub-agents represent
        // real teammates and should only be removed by SubagentStop/subagentClear.
        const clearCh = os.characters.get(id);
        const hasInlineTeammates =
          clearCh?.teamName && clearCh?.isTeamLead && !clearCh?.teamUsesTmux;
        if (!hasInlineTeammates) {
          os.removeAllSubagents(id);
          setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        }
        hideTeammate(id, os);
        os.setAgentTool(id, null);
        os.clearPermissionBubble(id);
      } else if (msg.type === 'agentSelected') {
        const id = msg.id as number;
        setSelectedAgent(id);
      } else if (msg.type === 'agentStatus') {
        const id = msg.id as number;
        const status = msg.status as string;
        if (status === 'active') {
          activeAgentIds.add(id);
          showTeammate(id, os);
        } else {
          activeAgentIds.delete(id);
        }
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: status };
        });
        os.setAgentActive(id, status === 'active');
        if (status === 'waiting') {
          os.showWaitingBubble(id, msg.awaitingInput === true);
          playDoneSound();
          hideTeammate(id, os);
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          };
        });
        os.showPermissionBubble(id);
        playPermissionSound();
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId);
        if (subId !== null) {
          os.showPermissionBubble(subId);
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          const hasPermission = list.some((t) => t.permissionWait);
          if (!hasPermission) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          };
        });
        os.clearPermissionBubble(id);
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId);
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {};
          const list = agentSubs[parentToolId] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] },
          };
        });
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs) return prev;
          const list = agentSubs[parentToolId];
          if (!list) return prev;
          return {
            ...prev,
            [id]: {
              ...agentSubs,
              [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
            },
          };
        });
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs || !(parentToolId in agentSubs)) return prev;
          const next = { ...agentSubs };
          delete next[parentToolId];
          if (Object.keys(next).length === 0) {
            const outer = { ...prev };
            delete outer[id];
            return outer;
          }
          return { ...prev, [id]: next };
        });
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = msg.characters as Array<{
          down: string[][][];
          up: string[][][];
          right: string[][][];
        }>;
        console.log(`[Webview] Received ${characters.length} pre-colored character sprites`);
        setCharacterTemplates(characters);
      } else if (msg.type === 'petSpritesLoaded') {
        const pets = msg.pets;
        if (!Array.isArray(pets)) {
          return;
        }
        const petNames = Array.isArray(msg.petNames) ? (msg.petNames as string[]) : undefined;
        console.log(`[Webview] Received ${pets.length} pet sprites`);
        setPetTemplates(
          pets as Array<{
            walkDown: string[][][];
            idleDown: string[][][];
            walkUp: string[][][];
            idleUp: string[][][];
            walkRight: string[][][];
          }>,
          petNames,
        );
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = msg.sprites as string[][][];
        console.log(`[Webview] Received ${sprites.length} floor tile patterns`);
        setFloorSprites(sprites);
      } else if (msg.type === 'wallTilesLoaded') {
        const sets = msg.sets as string[][][][];
        console.log(`[Webview] Received ${sets.length} wall tile set(s)`);
        setWallSprites(sets);
      } else if (msg.type === 'workspaceFolders') {
        const folders = msg.folders as WorkspaceFolder[];
        setWorkspaceFolders(folders);
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = msg.soundEnabled as boolean;
        setSoundEnabled(soundOn);
        if (typeof msg.watchAllSessions === 'boolean') {
          setWatchAllSessions(msg.watchAllSessions as boolean);
        }
        if (typeof msg.alwaysShowLabels === 'boolean') {
          setAlwaysShowLabels(msg.alwaysShowLabels as boolean);
        }
        if (typeof msg.hooksEnabled === 'boolean') {
          setHooksEnabled(msg.hooksEnabled as boolean);
        }
        if (typeof msg.hooksInfoShown === 'boolean') {
          setHooksInfoShown(msg.hooksInfoShown as boolean);
        }
        if (Array.isArray(msg.externalAssetDirectories)) {
          setExternalAssetDirectories(msg.externalAssetDirectories as string[]);
        }
        if (typeof msg.lastSeenVersion === 'string') {
          setLastSeenVersion(msg.lastSeenVersion as string);
        }
        if (typeof msg.extensionVersion === 'string') {
          setExtensionVersion(msg.extensionVersion as string);
        }
      } else if (msg.type === 'externalAssetDirectoriesUpdated') {
        if (Array.isArray(msg.dirs)) {
          setExternalAssetDirectories(msg.dirs as string[]);
        }
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = msg.catalog as FurnitureAsset[];
          const sprites = msg.sprites as Record<string, string[][]>;
          console.log(`📦 Webview: Loaded ${catalog.length} furniture assets`);
          // Build dynamic catalog immediately so getCatalogEntry() works when layoutLoaded arrives next
          buildDynamicCatalog({ catalog, sprites });
          setLoadedAssets({ catalog, sprites });
        } catch (err) {
          console.error(`❌ Webview: Error processing furnitureAssetsLoaded:`, err);
        }
      } else if (msg.type === 'agentTeamInfo') {
        const id = msg.id as number;
        const leadAgentId = msg.leadAgentId as number | undefined;
        const appearance = sessionAppearance(msg.sessionId as string | undefined);
        const character = os.characters.get(id);
        if (character && appearance.palette !== undefined) {
          character.palette = appearance.palette;
          character.hueShift = appearance.hueShift ?? character.hueShift;
        }
        if (leadAgentId !== undefined) {
          const current = hiddenTeammates.get(id);
          hiddenTeammates.set(id, {
            parentAgentId: leadAgentId,
            palette: appearance.palette ?? current?.palette,
            hueShift: appearance.hueShift ?? current?.hueShift,
            folderName: (msg.folderName as string | undefined) ?? current?.folderName,
            agentName: (msg.agentName as string | undefined) ?? current?.agentName,
            teamName: (msg.teamName as string | undefined) ?? current?.teamName,
          });
          if (!activeAgentIds.has(id)) {
            hideTeammate(id, os);
          }
        }
        os.setTeamInfo(
          id,
          msg.teamName as string | undefined,
          msg.agentName as string | undefined,
          msg.isTeamLead as boolean | undefined,
          leadAgentId,
          msg.teamUsesTmux as boolean | undefined,
          msg.folderName as string | undefined,
        );
      } else if (msg.type === 'agentThought') {
        const id = msg.id as number;
        const text = msg.text as string;
        activeAgentIds.add(id);
        showTeammate(id, os);
        os.setAgentActive(id, true);
        os.setAgentThought(id, text);
      } else if (msg.type === 'agentTokenUsage') {
        const id = msg.id as number;
        os.setAgentTokens(id, msg.inputTokens as number, msg.outputTokens as number, {
          model: msg.model,
          contextWindow: msg.contextWindow,
          effort: msg.effort,
          multiAgentVersion: msg.multiAgentVersion,
        });
      }
    };
    const unsubscribe = transport.onMessage(handler);
    transport.send({ type: 'webviewReady' });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOfficeState]);

  return {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
    hooksEnabled,
    setHooksEnabled,
    hooksInfoShown,
    sessions,
    openedSession,
    sessionError,
  };
}
