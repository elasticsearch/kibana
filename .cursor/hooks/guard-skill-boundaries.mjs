#!/usr/bin/env node

/**
 * beforeShellExecution hook (Cursor) that defers to the shared analyzer in
 * `.agents/hooks/guard-skill-boundaries.mjs` and emits Cursor's native flat
 * `{ permission, user_message, agent_message }` deny shape.
 *
 * SCOPE: This hook only intercepts shell commands (`beforeShellExecution`).
 * Cursor has no per-tool hook API, so direct Read/Write/Edit calls to
 * credential or skill-instruction files bypass this hook entirely. The
 * Claude Code wrapper (`.claude/hooks/guard-skill-boundaries.mjs`) provides
 * precise tool-level blocking that this wrapper cannot replicate.
 *
 * The matcher in hooks.json limits firing to commands that reference known
 * credential paths or skill instruction locations, keeping the hook from
 * spawning on unrelated shell commands. A false match is harmless — the
 * analyzer returns allow for unrelated commands.
 *
 * @see .agents/hooks/guard-skill-boundaries.mjs  — shared analyzer
 * @see .claude/hooks/guard-skill-boundaries.mjs  — Claude Code wrapper (tool-level)
 */

import { json } from 'node:stream/consumers';
import { analyzeToolCall } from '../../.agents/hooks/guard-skill-boundaries.mjs';

let input;
try {
  input = await json(process.stdin);
} catch {
  process.exit(0);
}
if (!input || typeof input !== 'object') process.exit(0);

// `beforeShellExecution` puts the command at the top level.
// Normalise to the tool_name/tool_input shape the shared analyzer expects.
const result = analyzeToolCall({
  tool_name: 'Bash',
  tool_input: { command: input?.command ?? '' },
});
if (!result) process.exit(0);

process.stdout.write(
  JSON.stringify(
    {
      permission: 'deny',
      user_message: result.deny,
      agent_message: result.deny,
    },
    null,
    2
  )
);
