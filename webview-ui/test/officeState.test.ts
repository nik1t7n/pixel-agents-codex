import assert from 'node:assert/strict';

import { test } from 'vitest';

import { OfficeState } from '../src/office/engine/officeState.js';
import { CharacterState, type OfficeLayout } from '../src/office/types.js';

test('waiting for agents sends the lead away from the workstation until work resumes', () => {
  const office = new OfficeState();
  office.addAgent(1, 0, 0, undefined, true);
  office.setAgentActive(1, true);

  const lead = office.characters.get(1)!;
  lead.state = CharacterState.TYPE;
  lead.path = [{ col: lead.tileCol + 1, row: lead.tileRow }];

  office.setAgentWaitingForAgents(1);

  assert.equal(lead.isActive, false);
  assert.equal(lead.state, CharacterState.IDLE);
  assert.deepEqual(lead.path, []);
  assert.equal(lead.wanderTimer, 0);
  assert.equal(lead.wanderLimit, Number.MAX_SAFE_INTEGER);

  office.setAgentActive(1, true);
  assert.equal(lead.isActive, true);
});

test('context compaction sends an agent toward the sofa with an explicit thought', async () => {
  const layout = await import('../public/assets/default-layout-1.json');
  const office = new OfficeState(layout.default as OfficeLayout);
  office.addAgent(1, 0, 0, undefined, true);
  office.setAgentActive(1, true);

  const lead = office.characters.get(1)!;
  office.setAgentContextCompacting(1);

  assert.equal(lead.isActive, false);
  assert.equal(lead.thoughtText, 'Сжимаю контекст…');
  assert.equal(lead.state, CharacterState.WALK);
  assert.ok(lead.path.length > 0);
});
