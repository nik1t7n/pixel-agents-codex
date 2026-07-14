interface ChangelogSection {
  title: string;
  items: string[];
}

interface ChangelogContributor {
  name: string;
  url: string;
  description: string;
}

interface ChangelogEntry {
  version: string;
  sections: ChangelogSection[];
  contributors: ChangelogContributor[];
}

/** Extract "major.minor" from a semver string (e.g. "1.1.1" → "1.1") */
export function toMajorMinor(version: string): string {
  const parts = version.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

export const CHANGELOG_REPO_URL = 'https://github.com/nik1t7n/pixel-agents-codex';

export const changelogEntries: ChangelogEntry[] = [
  {
    version: '0.1',
    sections: [
      {
        title: 'Codex-native world',
        items: [
          'Choose and search real Codex Desktop sessions before creating a world',
          'Persistent world, layout, and seats for each selected session',
          'Real root and subagent characters from Codex parent-thread relationships',
          'Live Hooks, bounded transcript replay, model metadata, and context usage',
          'Pixel activity signs for reading, coding, tests, browser work, communication, and compaction',
        ],
      },
    ],
    contributors: [
      {
        name: 'Pixel Agents contributors',
        url: 'https://github.com/pixel-agents-hq/pixel-agents',
        description: 'Original game renderer, sprites, editor, assets, and runtime foundation',
      },
    ],
  },
  {
    version: '1.3',
    sections: [
      {
        title: 'Features',
        items: [
          'Hooks-first session management with dual-mode architecture (hooks + heuristic fallback)',
          'Claude Code hooks for instant agent status detection',
          'External session support and Agent tool recognition',
          'Multi-root workspace agent detection across all workspace folders',
          'Load custom characters from external asset directories',
          'Tailwind CSS v4 migration for the webview UI',
        ],
      },
      {
        title: 'Fixes',
        items: [
          'Prevent duplicate restores, fix tool status reconnect, improve agent tool detection',
        ],
      },
      {
        title: 'Maintenance',
        items: [
          'Add shared/ to lint, format, and lint-staged',
          'Dependabot dev-dependency group bumps',
        ],
      },
    ],
    contributors: [
      {
        name: '@drewf',
        url: 'https://github.com/drewf',
        description: 'External session support and Agent tool recognition',
      },
      {
        name: '@Commandershadow9',
        url: 'https://github.com/Commandershadow9',
        description: 'Multi-root workspace agent detection',
      },
      {
        name: '@mitre88',
        url: 'https://github.com/mitre88',
        description: 'Duplicate restore, tool status reconnect, tool detection fixes',
      },
      {
        name: '@noam971',
        url: 'https://github.com/noam971',
        description: 'Duplicate restore, tool status reconnect, tool detection fixes',
      },
      {
        name: '@itsManeka',
        url: 'https://github.com/itsManeka',
        description: 'Custom characters from external asset directories',
      },
      {
        name: '@pablodelucca',
        url: 'https://github.com/pablodelucca',
        description: 'Claude Code hooks integration, Tailwind v4 migration',
      },
      {
        name: '@NNTin',
        url: 'https://github.com/NNTin',
        description: 'Claude Code hooks integration, Tailwind v4 migration',
      },
      {
        name: '@florintimbuc',
        url: 'https://github.com/florintimbuc',
        description: 'Hooks-first dual-mode architecture, review coordination',
      },
    ],
  },
  {
    version: '1.2',
    sections: [
      {
        title: 'Features',
        items: [
          'Bypass permissions mode — right-click "+ Agent" to skip tool approvals',
          'External asset packs — load furniture from user-defined directories',
          'Improved seating, sub-agent spawning, and background agent support',
          'Always show overlay setting for agent labels',
          'Agent connection diagnostics and JSONL parser resilience',
          'Browser preview mode for development and review',
        ],
      },
      {
        title: 'Fixes',
        items: ['Agents not appearing on Linux Mint/macOS when no folder is open'],
      },
      {
        title: 'Testing',
        items: ['Playwright e2e tests with mock Claude CLI'],
      },
      {
        title: 'Maintenance',
        items: [
          'Bump Vite 8.0, ESLint 10, and various dependency updates',
          'CI improvements for Dependabot and badge updates',
        ],
      },
    ],
    contributors: [
      {
        name: '@marctebo',
        url: 'https://github.com/marctebo',
        description: 'External asset packs support',
      },
      {
        name: '@dankadr',
        url: 'https://github.com/dankadr',
        description: 'Bypass permissions mode',
      },
      {
        name: '@d4rkd0s',
        url: 'https://github.com/d4rkd0s',
        description: 'Linux/macOS fix for no-folder workspaces',
      },
      {
        name: '@daniel-dallimore',
        url: 'https://github.com/daniel-dallimore',
        description: 'Always show overlay setting',
      },
      {
        name: '@NNTin',
        url: 'https://github.com/NNTin',
        description: 'Playwright e2e tests, browser preview mode',
      },
      {
        name: '@florintimbuc',
        url: 'https://github.com/florintimbuc',
        description: 'Agent diagnostics, JSONL resilience, CI improvements',
      },
    ],
  },
];
