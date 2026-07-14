import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempHome: string;

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tempHome };
});

const { areHooksInstalled, installHooks, uninstallHooks } =
  await import('../src/providers/hook/codex/codexHookInstaller.js');

describe('codexHookInstaller', () => {
  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-codex-hooks-fixture-'));
    fs.mkdirSync(path.join(tempHome, '.codex'), { recursive: true });
  });

  afterEach(() => fs.rmSync(tempHome, { recursive: true, force: true }));

  it('preserves existing hooks and installs one Codex hook per event', () => {
    const configPath = path.join(tempHome, '.codex', 'hooks.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'node existing-hook.js' }] }],
        },
      }),
    );

    installHooks();
    installHooks();

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    expect(config.hooks.Stop).toHaveLength(2);
    expect(config.hooks.Stop[0].hooks[0].command).toContain('existing-hook.js');
    expect(
      config.hooks.Stop.filter((entry) => entry.hooks[0].command.includes('codex-hook.js')),
    ).toHaveLength(1);
    expect(areHooksInstalled()).toBe(true);
  });

  it('uninstalls only Pixel Codex Agents entries', () => {
    const configPath = path.join(tempHome, '.codex', 'hooks.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'node existing-hook.js' }] }],
        },
      }),
    );
    installHooks();
    uninstallHooks();

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    expect(config.hooks.Stop).toHaveLength(1);
    expect(config.hooks.Stop[0].hooks[0].command).toContain('existing-hook.js');
    expect(areHooksInstalled()).toBe(false);
  });
});
