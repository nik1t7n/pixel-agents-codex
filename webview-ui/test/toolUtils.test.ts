import { describe, expect, it } from 'vitest';

import { agentActivityKind, setProviderCapabilities } from '../src/office/toolUtils.js';

describe('Codex activity kinds', () => {
  it('maps real tool events to compact pixel states', () => {
    setProviderCapabilities({
      readingTools: ['read_mcp_resource'],
      subagentToolNames: ['spawn_agent'],
    });

    expect(agentActivityKind('read_mcp_resource')).toBe('reading');
    expect(agentActivityKind('apply_patch')).toBe('coding');
    expect(agentActivityKind('exec_command', 'Running: npm test')).toBe('testing');
    expect(agentActivityKind('web__run')).toBe('browser');
    expect(agentActivityKind('spawn_agent')).toBe('communication');
    expect(agentActivityKind('ContextCompact')).toBe('compacting');
  });
});
