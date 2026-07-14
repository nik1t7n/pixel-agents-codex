# Active subagents and speech bubbles

## Goal

Keep the session world readable and playful. The lead character is always present. Subagents exist in the world only while Codex reports real work for them.

## Character lifecycle

- The selected session's root agent is always rendered, including while idle.
- A child Codex session or Task-tool subagent is rendered only while active.
- Historical or already-idle child sessions are not created when the world opens.
- When an active subagent finishes, its current movement or typing frame completes, then the existing despawn effect removes it.
- A later activity event for the same subagent creates it again with the same deterministic appearance.
- Closing the root session clears the whole world immediately, as it does now.

## Parent relationship

Every visible subagent keeps its real parent agent ID. While the subagent is visible, the canvas draws a thin, low-contrast dashed line between it and its parent. The line sits behind characters and disappears with the subagent. It is informational only and has no interaction.

## Transient speech bubbles

- A short human-readable bubble appears above a character only when its activity changes.
- It remains visible for 2.5 seconds, then fades out over at most 200 ms.
- Repeated identical activity does not restart the timer.
- A new activity replaces the old text and restarts the timer.
- Text is derived from the existing tool/status taxonomy, for example: `Читает код`, `Пишет код`, `Запускает тесты`, `Ищет в интернете`, `Общается с агентом`, `Сжимает контекст`.
- Unknown work uses the existing short provider status after trimming and length limiting; it does not invent a task.
- Permission and completion bubbles keep their existing dedicated visuals and take priority over transient activity text.

## Implementation boundary

Reuse the existing character state, subagent maps, matrix spawn/despawn effect, tool classification, and canvas renderer. No new dependency, event protocol, DAG concept, or persistent history layer is added. React only receives the same real Codex events; transient bubble timers live with the character state and advance in the existing animation loop.

## Verification

- Unit test the activity-to-text mapping and the active-only subagent lifecycle.
- Run the existing webview and server suites and production build.
- Open the real O-02 session: only the lead should remain while idle.
- Trigger a real subagent: it should spawn, show a short bubble on activity changes, remain linked to the lead, then finish its animation and despawn after completion.
