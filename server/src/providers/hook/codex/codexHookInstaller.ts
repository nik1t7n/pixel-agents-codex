import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HOOK_SCRIPTS_DIR } from '../../../constants.js';
import { CODEX_HOOK_EVENTS, CODEX_HOOK_SCRIPT_NAME } from './constants.js';

interface CodexHookEntry {
  matcher?: string;
  hooks: Array<{
    type: 'command' | string;
    command: string;
    timeout?: number;
  }>;
}

interface CodexHooksConfig {
  hooks?: Record<string, CodexHookEntry[]>;
  [key: string]: unknown;
}

function getHooksConfigPath(): string {
  return path.join(os.homedir(), '.codex', 'hooks.json');
}

function getHookScriptPath(): string {
  return path.join(os.homedir(), HOOK_SCRIPTS_DIR, CODEX_HOOK_SCRIPT_NAME);
}

function readConfig(): CodexHooksConfig {
  const configPath = getHooksConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as CodexHooksConfig;
    }
  } catch (error) {
    throw new Error(`Cannot read ${configPath}: ${error instanceof Error ? error.message : error}`);
  }
  return {};
}

function writeConfig(config: CodexHooksConfig): void {
  const configPath = getHooksConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tempPath = `${configPath}.pixel-agents-tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tempPath, configPath);
}

function isOurEntry(entry: CodexHookEntry): boolean {
  return entry.hooks.some((hook) => hook.command.includes(CODEX_HOOK_SCRIPT_NAME));
}

function makeEntry(): CodexHookEntry {
  return {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `node "${getHookScriptPath()}"`,
        timeout: 5,
      },
    ],
  };
}

export function areHooksInstalled(): boolean {
  const config = readConfig();
  return CODEX_HOOK_EVENTS.every((event) => config.hooks?.[event]?.some(isOurEntry));
}

export function installHooks(): void {
  const config = readConfig();
  config.hooks ??= {};

  for (const event of CODEX_HOOK_EVENTS) {
    const existing = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    config.hooks[event] = [...existing.filter((entry) => !isOurEntry(entry)), makeEntry()];
  }
  writeConfig(config);
}

export function uninstallHooks(): void {
  const config = readConfig();
  if (!config.hooks) return;

  for (const event of Object.keys(config.hooks)) {
    config.hooks[event] = config.hooks[event].filter((entry) => !isOurEntry(entry));
    if (config.hooks[event].length === 0) delete config.hooks[event];
  }
  if (Object.keys(config.hooks).length === 0) delete config.hooks;
  writeConfig(config);
}

export function copyHookScript(distRoot: string): void {
  const source = path.join(distRoot, 'hooks', CODEX_HOOK_SCRIPT_NAME);
  const destination = getHookScriptPath();
  if (!fs.existsSync(source)) throw new Error(`Codex hook script is missing: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, 0o700);
}
