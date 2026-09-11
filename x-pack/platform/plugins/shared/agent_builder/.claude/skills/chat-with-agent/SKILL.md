---
name: chat-with-agent
description: Sends a message to an Agent Builder agent and displays the response including reasoning and tool calls. Use when asked to chat with, test, or talk to a Kibana agent.
allowed-tools: Bash, Read, Glob, Grep
argument-hint: "[agent-id-or-name]"
---

# Chat with an Agent Builder Agent

This skill sends a message to an Agent Builder agent via the async chat API and displays the full response including reasoning steps, tool calls, and the final answer. The user wants to chat with **$ARGUMENTS**.

## Step 1: Resolve the Agent

Run the list script to find available agents:

```bash
x-pack/platform/plugins/shared/agent_builder/.claude/skills/create-agent/scripts/list_agents.sh
```

If the script reports that it cannot detect a running Kibana instance, stop and tell the user:
> Kibana does not appear to be running. Please start Elasticsearch and Kibana first, then re-run this skill.

Match `$ARGUMENTS` to an agent ID. If there's no exact match, try matching by name (case-insensitive). If the argument clearly contains a chat message rather than an agent name (e.g., it's a full sentence), ask the user which agent to use.

## Step 2: Determine the Prompt

If the user provided a specific message or question (either as part of `$ARGUMENTS` or in the conversation), use that as the prompt.

Otherwise, use the default prompt:
> Summarize the data available to you through your tools.

## Step 3: Send the Message

Run the chat script. If the agent uses OAuth connectors or you need to act as a
browser user (see "Session Auth" below), prefix with `KIBANA_USE_SESSION=true`:

```bash
KIBANA_USE_SESSION=true x-pack/platform/plugins/shared/agent_builder/.claude/skills/chat-with-agent/scripts/chat.sh \
  --agent-id "<agent_id>" \
  --prompt "<message>"
```

If you're unsure whether session auth is needed, it's safe to always include it.

This will stream SSE events from the agent and print formatted output showing:
- `[Reasoning]` — the agent's thinking process
- `[Tool Call]` — tools invoked with their parameters
- `[Tool Result]` — results returned by tools (may be truncated)
- `[Response]` — the agent's final answer

**Note:** This command may take 30-60 seconds as the agent reasons and calls tools. Use a longer timeout (e.g., 120s or 180s) when running via Bash.

## Step 4: Present the Results

Relay the agent's response to the user. Highlight:
- Which tools the agent used and what data it accessed
- The agent's final answer/summary
- Any issues (errors, empty results, timeouts)

## Important Notes

- **Always starts a new conversation** — each invocation creates a fresh conversation
- **Auto-detection** tries http/https on localhost:5601 with standard/serverless auth
- **The agent must already exist** — use `/create-agent` first if needed
- **Data source tools must be activated** — use `/activate-data-source` first if the agent needs data source access
- To override auto-detection, pass `--kibana-url` to the chat script

## Session Auth (Acting as a Browser User)

By default, `kibana_api_common.sh` authenticates via HTTP Basic auth, which uses the `__http__` auth provider. 
This is a different auth realm than the browser, which uses the `basic` provider.
Any per-user state tied to a browser session (e.g. OAuth tokens, user-specific settings) will not be visible to API calls made with HTTP Basic auth.

To authenticate in the same auth realm as a browser user, set `KIBANA_USE_SESSION=true` before sourcing `kibana_api_common.sh`.
This logs in via the `basic` auth provider and uses a session cookie for all subsequent `kibana_curl` calls:

```bash
export KIBANA_USE_SESSION=true
source "$REPO_ROOT/scripts/kibana_api_common.sh"
```

Any script that sources `kibana_api_common.sh` with this variable set will automatically use session auth — no changes needed in downstream scripts.
