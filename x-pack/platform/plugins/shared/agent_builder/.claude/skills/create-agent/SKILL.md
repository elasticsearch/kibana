---
name: create-agent
description: Creates an Agent Builder agent in a running Kibana instance, wired to data source tools. Use when asked to create, set up, or configure an AI agent in Kibana.
allowed-tools: Bash, Read, Glob, Grep
argument-hint: "[agent-name]"
---

# Create an Agent Builder Agent in Kibana

This skill creates an Agent Builder agent in a running Kibana instance and wires it up to available tools. The user wants to create an agent named **$ARGUMENTS**.

## Step 1: List Available Tools

Run the helper script to see what tools are available in Agent Builder. This script auto-detects whether Kibana is running on http/https and with standard/serverless auth.

```bash
x-pack/platform/plugins/shared/agent_builder/.claude/skills/create-agent/scripts/list_tools.sh
```

If the script reports that it cannot detect a running Kibana instance, stop and tell the user:
> Kibana does not appear to be running. Please start Elasticsearch and Kibana first:
> ```
> yarn es snapshot   # in one terminal
> yarn start         # in another terminal
> ```
> Then re-run this skill.

Note the two groups:
- **Platform tools** — built-in tools (e.g., `search`, `index_data`)
- **Data source tools** — tools registered by activated data sources (tagged `data-source`)

## Step 2: List Existing Agents

Run the helper script to see what agents already exist:

```bash
x-pack/platform/plugins/shared/agent_builder/.claude/skills/create-agent/scripts/list_agents.sh
```

This helps avoid name conflicts and shows what's already configured.

## Step 3: Gather Agent Details

Using `$ARGUMENTS` as the default name, confirm or collect from the user:

1. **Name** (required) — The agent's display name. Default: `$ARGUMENTS`
2. **Description** (optional) — Brief description of what the agent does. Default: same as name.
3. **System instructions** (optional) — Custom instructions/system prompt for the agent. Default: none.

## Step 4: Select Tools

Present the available tools from Step 1 and ask the user which ones to include. Suggest a reasonable default:
- All **data source tools** (these are likely why the user is creating the agent)
- Core platform tools that complement the data source tools (e.g., `search`)

Let the user add or remove tools from the suggested list.

## Step 5: Create the Agent

Run the creation script with the gathered details:

```bash
x-pack/platform/plugins/shared/agent_builder/.claude/skills/create-agent/scripts/create_agent.sh \
  --name "<agent_name>" \
  --description "<description>" \
  --instructions "<system_instructions>" \
  --tool-ids "<tool_id_1>,<tool_id_2>,<tool_id_3>"
```

Where:
- `--name` is required
- `--tool-ids` is a comma-separated list of tool IDs from Step 4
- `--description` defaults to the name if omitted
- `--instructions` can be omitted if the user didn't provide any
- `--color` and `--symbol` are optional avatar customization

## Step 6: Verify Creation

Run the list script again to confirm:

```bash
x-pack/platform/plugins/shared/agent_builder/.claude/skills/create-agent/scripts/list_agents.sh
```

Show the user the newly created agent entry. If it appears, report success. If not, show any error output from Step 5.

## Important Notes

- **This skill requires Kibana to be running** — it makes live API calls
- **Auto-detection** tries http/https on localhost:5601 with both `elastic:changeme` (standard) and `elastic_serverless:changeme` (serverless) credentials
- **Data source tools** are created by the `activate-data-source` skill — if no data source tools appear, the user may need to activate a data source first
- To override auto-detection, set `KIBANA_URL` and/or `KIBANA_AUTH` environment variables, or pass `--kibana-url` to the scripts
