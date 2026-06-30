/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  SECURITY_ADD_ENTITIES_TO_WATCHLIST_TOOL_ID,
  SECURITY_CREATE_WATCHLIST_TOOL_ID,
  SECURITY_DELETE_WATCHLIST_TOOL_ID,
  SECURITY_LIST_WATCHLISTS_TOOL_ID,
  SECURITY_REMOVE_ENTITIES_FROM_WATCHLIST_TOOL_ID,
  SECURITY_UPDATE_WATCHLIST_TOOL_ID,
} from '../../tools';

const content = `
# Watchlist Management

This skill exposes tools to **manage** Entity Analytics watchlists in the current space — create, update, and delete watchlists; add or remove entities; and discover existing watchlists to resolve a name to an id.

## When to use this skill

Use when the user asks to **create**, **modify**, **delete** a watchlist, or **add/remove entities** to/from a watchlist. Trigger phrases: "create a watchlist", "rename the X watchlist", "change the risk modifier of Y", "delete the Z watchlist", "add these users to the X watchlist", "put host:server01 on watchlist Y", "remove this user from the Z watchlist".

Do **NOT** use this skill for:
- "What watchlists do we have?" — \`security.list_watchlists\` is also available via the entity-analytics skill; either skill can answer.
- "Which watchlists is this entity on?" — use \`security.get_entity\` (entity-analytics skill); watchlists are on the entity profile as \`entity.attributes.watchlists\`.
- "Who is on watchlist X?" — use \`security.list_watchlists\` then \`security.search_entities\` with the resolved id (entity-analytics skill).

## Available tools

### \`security.list_watchlists\`
Discover the watchlists configured in the current space. Use this to **resolve a watchlist name to its id** when the user names a watchlist to act on, before calling a mutation tool. Pass \`nameContains\` with the user's wording (verbatim phrase first; retry with a shorter distinctive token if no matches). Does **not** require confirmation.

### \`security.create_watchlist\` — **requires confirmation**
Creates a new watchlist. The tool prompts the user for confirmation before executing the change.

Arguments:
- \`name\` (required) — the watchlist name. Use the user's exact wording, e.g. user says "create a watchlist called Privileged Users" → \`name: "Privileged Users"\`.
- \`description\` (optional) — short purpose statement; include when the user supplied context.
- \`riskModifier\` (optional) — multiplier applied to risk scores of entities on this watchlist. Allowed values: \`0\`, \`0.5\`, \`1\`, \`1.5\`, or \`2\` (steps of 0.5). \`0\` = scores zeroed out, \`1\` = no change, \`2\` = doubled. Only pass when the user is explicit; default to omitting.

### \`security.update_watchlist\` — **requires confirmation**
Updates an existing watchlist (rename, change description, or change risk modifier). Resolve the watchlist id via \`security.list_watchlists\` first when the user named the watchlist. The confirmation prompt shows the current value → new value for each field that is changing.

Arguments:
- \`watchlistId\` (required) — the id of the watchlist to update.
- \`name\` (optional) — pass to rename.
- \`description\` (optional) — pass to change description; pass an empty string to clear.
- \`riskModifier\` (optional) — same allowed set as create.

Pass **only** the fields the user actually wants to change. At least one update field must be supplied. Managed watchlists may reject changes to locked fields (the service surfaces that as an error).

### \`security.delete_watchlist\` — **requires confirmation**
Permanently deletes a watchlist. Cascade-deletes any linked entity sources. Resolve the watchlist id via \`security.list_watchlists\` first when the user named the watchlist. The confirmation prompt names the watchlist and warns that the action cannot be undone. **Managed watchlists cannot be deleted via this tool** — the tool returns an error if the target is managed.

Arguments:
- \`watchlistId\` (required) — the id of the watchlist to delete.

### \`security.add_entities_to_watchlist\` — **requires confirmation**
Adds one or more entities (by EUID) to a watchlist. Returns a per-entity result (\`successful\`, \`failed\`, \`not_found\`) so partial outcomes can be reported. Resolve the watchlist id via \`security.list_watchlists\` first when the user named the watchlist.

Arguments:
- \`watchlistId\` (required) — the id of the watchlist to add to.
- \`entityIds\` (required) — array of EUIDs to add, e.g. \`["user:jsmith123", "host:server01"]\`. Up to 100 per call. Gather these either verbatim from the user, or by running \`security.search_entities\` and using each result's \`entity.id\`. For larger sets, direct the user to the CSV upload in the UI.

### \`security.remove_entities_from_watchlist\` — **requires confirmation**
Removes one or more entities (by EUID) from a watchlist's **manual assignments**. Entities that came in via an entity source will be reported as \`not_found\` in the result with the message "Entity not manually assigned to this watchlist" — those must be removed by reconfiguring or deleting the entity source in the UI. Resolve the watchlist id via \`security.list_watchlists\` first when the user named the watchlist.

Arguments:
- \`watchlistId\` (required) — the id of the watchlist to remove from.
- \`entityIds\` (required) — array of EUIDs to remove. Up to 100 per call.

## Example flows

### Create
User: "Create a watchlist called Compromised Accounts for users we suspect have been compromised."

1. Call \`security.create_watchlist\` with \`{ name: "Compromised Accounts", description: "Users suspected to be compromised" }\`.
2. The tool handles user confirmation. On accept, it returns the created watchlist. Summarize: "Created watchlist 'Compromised Accounts' (id: \`<id>\`)."
3. On reject, state that the watchlist was not created.

### Update
User: "Rename the Privileged Users watchlist to 'Senior Privileged Users'."

1. Call \`security.list_watchlists\` with \`nameContains: "Privileged Users"\` to resolve the id.
2. Call \`security.update_watchlist\` with \`{ watchlistId: "<id>", name: "Senior Privileged Users" }\`.
3. On accept, summarize the rename. On reject, state that no change was made.

### Delete
User: "Delete the Compromised Accounts watchlist."

1. Call \`security.list_watchlists\` with \`nameContains: "Compromised Accounts"\` to resolve the id.
2. Call \`security.delete_watchlist\` with \`{ watchlistId: "<id>" }\`. The tool shows a confirmation naming the watchlist and warning that the action cannot be undone.
3. On accept, summarize the deletion. On reject, state that the watchlist was not deleted.

### Create and populate (headline flow)
User: "Create a watchlist called Compromised Accounts and add users user:jsmith123 and user:rjones456."

1. Call \`security.create_watchlist\` with \`{ name: "Compromised Accounts" }\`. Confirm and create.
2. With the new watchlist's id from step 1, call \`security.add_entities_to_watchlist\` with \`{ watchlistId: "<id from step 1>", entityIds: ["user:jsmith123", "user:rjones456"] }\`. Confirm and add.
3. Summarize both outcomes: the watchlist was created and N of M entities were added (mention \`not_found\` or \`failed\` items if any).

### Query-then-add flow
User: "Add all critical-risk users to the Privileged Users watchlist."

1. Call \`security.list_watchlists\` with \`nameContains: "Privileged Users"\` to resolve the id.
2. Call \`security.search_entities\` with \`{ entityTypes: ["user"], riskLevels: ["Critical"] }\` to find the candidate entities. Collect each result's \`entity.id\` field.
3. Call \`security.add_entities_to_watchlist\` with \`{ watchlistId: "<id from step 1>", entityIds: <ids from step 2> }\`. Confirm; the prompt names the watchlist and shows the entity-id preview.
4. Summarize: how many entities were added, how many failed, how many were not found. Note: this is a one-time add. To keep the watchlist in sync with the query going forward, direct the user to configure an entity source in the UI (out of scope for this tool).

### Remove
User: "Remove user:jsmith123 from the Privileged Users watchlist."

1. Call \`security.list_watchlists\` with \`nameContains: "Privileged Users"\` to resolve the id.
2. Call \`security.remove_entities_from_watchlist\` with \`{ watchlistId: "<id>", entityIds: ["user:jsmith123"] }\`. Confirm.
3. On accept, report the result. If the entity is reported as \`not_found\` with the "Entity not manually assigned" message, explain that the entity is on the watchlist via an entity source and direct the user to the UI to reconfigure that source.
`;

export const manageWatchlistsSkill = defineSkillType({
  id: 'manage-watchlists',
  name: 'manage-watchlists',
  basePath: 'skills/security/watchlists',
  description:
    'Manage Entity Analytics watchlists: create, update, delete, and add/remove entity membership. Discovers existing watchlists via list_watchlists to resolve names to ids. All mutating actions in this skill require explicit user confirmation before executing. Do NOT use for read-only questions about which watchlists exist (the entity-analytics skill also covers those) or for which watchlists a specific entity belongs to.',
  content,
  getRegistryTools: () => [
    SECURITY_LIST_WATCHLISTS_TOOL_ID,
    SECURITY_CREATE_WATCHLIST_TOOL_ID,
    SECURITY_UPDATE_WATCHLIST_TOOL_ID,
    SECURITY_DELETE_WATCHLIST_TOOL_ID,
    SECURITY_ADD_ENTITIES_TO_WATCHLIST_TOOL_ID,
    SECURITY_REMOVE_ENTITIES_FROM_WATCHLIST_TOOL_ID,
  ],
});
