# Real subagents and waiting walk

## Decision

- Render characters only for real Codex sessions with stable session IDs.
- Do not create negative-ID characters for `spawn_agent` tool calls.
- Keep spawn and subagent tool calls in the lead's activity history.
- While the lead runs `wait_agent`, let the existing free-walk behavior move it around the office.
- Return the lead to its workstation when a new working tool starts.

## Acceptance

- O-02 contains no negative-ID characters.
- Each active child session remains clickable and linked to its parent.
- A lead waiting on agents is not typing at a desk.
