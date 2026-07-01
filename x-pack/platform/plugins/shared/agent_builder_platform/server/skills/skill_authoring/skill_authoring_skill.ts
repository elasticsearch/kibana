/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import dedent from 'dedent';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { createProposeSkillTool } from './propose_skill';
import { createPatchSkillTool } from './patch_skill';
import { createListToolsTool } from './list_tools';

const SKILL_AUTHORING_REFERENCE_NAME = 'skill-authoring-examples';

/**
 * Built-in skill that teaches the agent how to author Agent Builder skills
 * conversationally.
 */
export const skillAuthoringSkill = defineSkillType({
  id: 'skill-authoring',
  name: 'skill-authoring',
  basePath: 'skills/platform/agent-builder',
  description:
    'Author a new Agent Builder skill from a chat description. Use when the user asks to create, build, generate, or design a skill, capability, or expertise area for an agent.',
  content: dedent(`
## When to Use This Skill

Use this skill when:
- The user asks to "create / build / make / design / scaffold a skill" for an agent.
- The user describes a recurring task they want an agent to handle and the right answer is a reusable skill.
- The user wants to teach the agent something they expect to reuse in future conversations.

Do **not** use this skill when:
- The user only wants a one-off answer (just answer it).
- The user wants to edit an already-persisted skill — direct them to the skill editor at /manage/skills.
- The user wants to author a tool, plugin, or agent (different entity types, not yet supported in chat).

## Available Tools

This skill exposes the following tools:

- **list_tools** — Enumerate registered tools. Call this before \`propose_skill\`, and again before any \`patch_skill\` that changes \`tool_ids\`.
- **propose_skill** — Submit the first draft. Returns \`attachment_id\` needed for \`<render_attachment>\`.
- **patch_skill** — Refine an existing draft. Prefer this over re-calling \`propose_skill\`.

## Authoring Workflow

1. **Clarify intent before drafting.**
   - If the request is vague, ask before writing anything. You need enough to write a specific, useful skill — not just a rough one.
   - Useful things to establish:
     - What task should the skill handle? What does a successful outcome look like?
     - When should the agent use it? What would a user say to trigger it?
     - Are there tools the user has in mind? Any workflows or APIs it should call?
     - What should the skill *not* handle — are there adjacent cases to explicitly exclude?
   - Don't turn this into an interrogation. If the user gave enough context to answer most of these, fill gaps yourself or make a reasonable call and note it in the draft.
   - If the user already gave enough detail, skip ahead.

2. **Pick an id and name.**
   - \`id\`: lowercase slug, hyphens or underscores allowed, must start and end with a letter or number, max 64 chars. Example: \`incident-triage\`.
   - \`name\`: use the same value as \`id\`. Max 64 chars.
   - The pair \`(basePath, name)\` must be unique within the system; if the user gives an id that already exists, suggest a variant.

3. **Write the description — this is the triggering mechanism.**
   - The description is how the orchestrating agent decides whether to invoke this skill at runtime. A skill with a weak description may never fire even if the content is excellent. This step matters more than it appears.
   - Lead with **when** to use it, and cover **intent**, not just keywords. Users won't always use the words you expect — think about all the ways someone would describe needing this skill, including indirect or casual phrasing.
   - Be specific about the trigger context. Vague descriptions either over-fire or go unnoticed.
   - **Weak:** \`"Helps with production issues."\` — too broad, competes with everything.
   - **Strong:** \`"Use when a user reports an active production incident, mentions error rates, latency spikes, failed deployments, or paging alerts — even if they don't use the word 'incident'. Also use when they ask to investigate a service that is behaving unexpectedly."\` — covers intent-based triggers across different phrasings.
   - Max 1024 chars. A few focused sentences beat one sentence trying to cover everything.

4. **Draft the SKILL.md content.**
   - The content is markdown only. Do **not** include YAML front matter (\`---\`); the runtime injects \`name\` / \`description\` automatically.
   - SKILL.md is always loaded into context when the skill is active, so length has a direct cost on every invocation. Keep it under ~400 lines. Push long code samples, templates, and detailed examples into referenced files (step 6).
   - **Recommended sections:**
     - A "When to use / Do not use" section — lets the agent self-check at runtime.
     - If the skill has \`tool_ids\`, a section listing each tool and how it fits *in this specific context*, not just what it does generically.
     - A workflow or numbered steps — this is the core of the skill.
     - Examples are worth including when the workflow has non-obvious parts. Skip the section if the steps are self-explanatory; a forced example adds noise, not clarity.
   - **What makes good content:**
     - Explain the *why* behind instructions, not just the *what*. Agents generalize better from rationale than from mandates. "Call \`get_index_mapping\` before running queries to catch missing fields early, not after a failed run" beats "always call \`get_index_mapping\` first."
     - Be concrete and specific. "Add a \`@timestamp >= NOW() - 24h\` filter to avoid full-retention scans" beats "add a time filter."
     - Don't instruct behavior the agent would do naturally. Focus on non-obvious constraints and failure modes.
     - Omit sections that don't apply to this skill — not every skill needs every section.

5. **Pick the registry tools the skill needs.**
   - Always call \`list_tools\` first and use the results as the single source of truth for the list of available tools.
   - Pick ids verbatim from the \`list_tools\` results. Use the \`description\` field to match the user's intent.
   - Keep the list focused on tools the skill genuinely requires — don't add tools the agent would use anyway without the skill
   - If the user mentions a tool that isn't in the registry, say so and either suggest a similar one or offer to proceed without it.

6. **(Optional) Add referenced files for long examples or reference material.**
   - Use referenced files for long code samples, templates, or reference content the agent should look up rather than memorize — keeps SKILL.md lean.
   - \`relativePath\` must start with \`./\`. Use \`./\` for the skill root, \`./examples\` for a subfolder.
   - The name \`skill\` at \`./\` is reserved (collides with \`SKILL.md\`).

7. **Call \`propose_skill\`, then render the draft inline.**
   - On success, immediately emit \`<render_attachment id="ATTACHMENT_ID" />\` so the user sees the draft card. Keep your prose short — summarize what you proposed and prompt them to review.
   - **On an "Unknown tool_ids" error:** pick replacements from \`available_tools\` in the second result and call \`patch_skill\` with corrected \`tool_ids\`. No need to re-call \`list_tools\` unless the user added a new requirement.

8. **Iterate on feedback via \`patch_skill\`.**
   - Prefer search-replace patches over full rewrites; it's cheaper and easier for the user to follow.
   - After each patch, re-render the attachment so the card refreshes in place.

9. **When the user approves the draft, direct them to the create button on the card.**
   - The card handles submission — you do not need to call any API endpoint yourself.

## Examples

See the referenced file \`${SKILL_AUTHORING_REFERENCE_NAME}.md\` for a complete worked example (initial draft + a follow-up patch).
  `),
  referencedContent: [
    {
      relativePath: './examples',
      name: SKILL_AUTHORING_REFERENCE_NAME,
      content: dedent(`
# Skill Authoring Examples

## Example 1: full first-draft flow (list → propose → render)

User said: "Build me a skill that helps investigate slow ES|QL queries on logs indices."

**Step 1.** Call \`list_tools\` to see what is actually registered. The result (truncated) includes:

\`\`\`json
{
  "tools": [
    { "id": "platform.core.execute_esql", "description": "Run an ES|QL query and return rows + timings." },
    { "id": "platform.core.get_index_mapping", "description": "Return the field mapping for an index pattern." },
    { "id": "platform.core.generate_esql", "description": "Convert natural language into an ES|QL query." }
  ],
  "total": 47
}
\`\`\`

**Important:** the ids above are illustrative. In a real call, copy ids verbatim from the actual \`list_tools\` response — different deployments expose different tool sets, and the names are not guessable.

**Step 2.** Call \`propose_skill\`, picking ids that appeared in the list above:

\`\`\`json
{
  "id": "esql-query-debug",
  "name": "esql-query-debug",
  "description": "Use when a user reports that an ES|QL query against a logs-* index is slow, returning unexpected rows, or erroring. Walks through the standard debug checklist using execute_esql and the index mapping tools.",
  "content": "## When to Use This Skill\\n\\nUse this skill when:\\n- A user shares an ES|QL query that runs slowly on a logs-* index.\\n- A user reports that an ES|QL query returns wrong row counts or unexpected nulls.\\n- A user wants help interpreting an ES|QL error message against a known index.\\n\\nDo not use this skill when:\\n- The user wants a *new* visualization (use visualization-creation).\\n- The user wants to schedule a query (use workflows).\\n\\n## Available Tools\\n\\n- **platform.core.execute_esql**: Run a candidate query and inspect the result shape and timings.\\n- **platform.core.get_index_mapping**: Confirm field names and types when the model isn't sure they exist.\\n- **platform.core.generate_esql**: Rewrite a natural-language description into ES|QL when the user shares prose, not query.\\n\\n## Workflow\\n\\n1. Read the user's query (or generate one with platform.core.generate_esql).\\n2. Confirm the target index exists and grab its mapping with platform.core.get_index_mapping. Flag any missing fields immediately.\\n3. Run a LIMIT 100 version of the query with platform.core.execute_esql to see the result shape and runtime.\\n4. If slow, suggest specific changes: add a time filter, drop large fields with KEEP, replace MV functions with simpler equivalents.\\n5. Re-run after each suggested change and report the runtime delta.\\n\\n## Examples\\n\\n- 'Why is this query slow?' on logs-app-*: confirmed mapping had keyword 'host.name' (not text), suggested adding @timestamp >= NOW() - 24h, runtime dropped from 8s to 600ms.\\n",
  "tool_ids": [
    "platform.core.execute_esql",
    "platform.core.get_index_mapping",
    "platform.core.generate_esql"
  ]
}
\`\`\`

Tool result (truncated):

\`\`\`json
{
  "attachment_id": "att-abc123",
  "version": 1,
  "skill_id": "esql-query-debug",
  "referenced_files": 0,
  "tool_ids": ["platform.core.execute_esql", "platform.core.get_index_mapping", "platform.core.generate_esql"]
}
\`\`\`

Assistant reply (one short paragraph + render tag):

\`\`\`xml
I drafted a skill called esql-query-debug with three associated tools. Review the card below — when you're happy, click Create.

<render_attachment id="att-abc123" />
\`\`\`

## Example 2: follow-up patch

User said: "Drop the generate_esql tool and add a section about histogram() pitfalls."

This patch removes an existing tool and edits content — no new tools are introduced, so there is no need to re-call \`list_tools\` (you would only re-list if the user asked to *add* a tool you didn't already have in the draft).

\`patch_skill\` payload:

\`\`\`json
{
  "attachment_id": "att-abc123",
  "tool_ids": [
    "platform.core.execute_esql",
    "platform.core.get_index_mapping"
  ],
  "content_patches": [
    {
      "find": "## Examples\\n",
      "replace": "## Histogram Pitfalls\\n\\n- BUCKET() with millisecond span on @timestamp can blow up cardinality; prefer per-hour or per-minute spans for production logs.\\n- Combine BUCKET() with FROM ... | WHERE @timestamp >= ... to avoid scanning the full retention window.\\n\\n## Examples\\n"
    }
  ]
}
\`\`\`

Tool result:

\`\`\`json
{
  "attachment_id": "att-abc123",
  "version": 2,
  "skill_id": "esql-query-debug",
  "referenced_files": 0,
  "tool_ids": ["platform.core.execute_esql", "platform.core.get_index_mapping"]
}
\`\`\`

Assistant reply:

\`\`\`xml
Dropped generate_esql and added a Histogram Pitfalls section. Updated card:

<render_attachment id="att-abc123" />
\`\`\`

## Example 3: Add a referenced file

If the skill includes long, copy-pasteable templates (a 60-line ES|QL query template, a JSON config snippet, a prompt fragment), put them in \`referenced_content\` instead of inline:

\`\`\`json
{
  "referenced_content": [
    {
      "name": "slow-query-checklist",
      "relativePath": "./examples",
      "content": "# Slow Query Checklist\\n\\n1. ..."
    }
  ]
}
\`\`\`
`),
    },
  ],
  getInlineTools: () => [createListToolsTool(), createProposeSkillTool(), createPatchSkillTool()],
});
