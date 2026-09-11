---
name: activate-connector
description: Creates a connector instance in a running Kibana. Use when asked to activate, connect, enable, or instantiate a connector in Kibana.
allowed-tools: Bash, Read, Glob, Grep
argument-hint: "[connector-type]"
---

# Activate a Connector in Kibana

This skill creates a live connector instance in a running Kibana by calling the Actions API. The user wants to activate a **$ARGUMENTS** connector.

When `agentBuilder:experimentalFeatures` is enabled, creating a connector automatically indexes it into the Semantic Metadata Layer (SML), making its sub-actions discoverable by AI agents.

**CRITICAL: Never read, log, or display the contents of any credentials file. Credentials must only flow through the bundled scripts.**

## Step 1: List Available Connector Types

Run the helper script to see what connector types are registered. This script auto-detects whether Kibana is running on http/https and with standard/serverless auth — no manual configuration needed.

```bash
src/platform/packages/shared/kbn-connector-specs/.claude/skills/activate-connector/scripts/list_connector_types.sh
```

If the script reports that it cannot detect a running Kibana instance, stop and tell the user:
> Kibana does not appear to be running. Please start Elasticsearch and Kibana first:
> ```
> yarn es snapshot   # in one terminal
> yarn start         # in another terminal
> ```
> Then re-run this skill.

Match the user's argument (`$ARGUMENTS`) to one of the listed type IDs. If no exact match, show the user the available types and ask them to pick one.

## Step 2: Check for Existing Connectors

Run the helper script to see what's already created:

```bash
src/platform/packages/shared/kbn-connector-specs/.claude/skills/activate-connector/scripts/list_connectors.sh
```

If a connector of the same type already exists, inform the user and ask if they want to create another one or stop.

## Step 3: Collect Credentials Securely

First, determine what credential the user needs to provide. Use the **Credential Reference** section below and the connector spec's auth type to identify the correct format.

Then ask the user to write their credentials to a temporary file. Use the AskUserQuestion tool to present this request clearly, **including the specific credential type and format they need**.

For example, if activating a GitHub connector (bearer token):

> To activate the GitHub connector, I need a **GitHub personal access token** (starts with `ghp_` or `github_pat_`).
>
> For security, please write it to a temporary file — I will **not** read this file. The creation script will read it and immediately delete it.
>
> Please run this in your terminal:
> ```
> echo -n 'ghp_your_token_here' > /tmp/connector_credentials
> ```
>
> Then let me know when the file is ready.

**Important:**
- NEVER read `/tmp/connector_credentials` or any credentials file the user creates
- NEVER use the Read tool on the credentials file
- NEVER `cat` or otherwise inspect the credentials file
- The `create_connector.sh` script handles reading and deleting it

## Credential Reference

Use this table to tell the user what credential to provide. Look up the connector spec's auth type in `src/platform/packages/shared/kbn-connector-specs/src/specs/` to confirm.

### Common auth types

| Auth Type | Credential Format | Example |
|-----------|-------------------|---------|
| `bearer` | A bearer/access token string | `ghp_abc123...` |
| `api_key_header` | An API key string | `sk-abc123...` |
| `basic` | `username:password` | `admin:secretpass` |

### Known connectors

| Connector | Type ID | Auth Type | Credential to Provide |
|-----------|---------|-----------|----------------------|
| **GitHub** | `.github` | Bearer | GitHub personal access token (`ghp_...` or `github_pat_...`) |
| **Notion** | `.notion` | Bearer | Notion API integration token (starts with `secret_` or `ntn_`) |
| **Google Drive** | `.google_drive` | Bearer | Google OAuth 2.0 access token (`ya29....`) |
| **Slack** | `.slack2` | Bearer | Slack Bot User OAuth Token (`xoxb-...`) |
| **Jira Cloud** | `.jira-cloud` | Basic | `your_email@example.com:your_api_token` |
| **Zendesk** | `.zendesk` | Basic | `your_email@example.com/token:your_api_token` |
| **SharePoint Online** | `.sharepoint-online` | OAuth | Requires OAuth client credentials (clientId, clientSecret, tenantId). May need UI-based setup. |

### For unknown / newly added connectors

If the connector type isn't listed above:
1. Check the connector spec: `grep -r "auth:" src/platform/packages/shared/kbn-connector-specs/src/specs/<name>/`
2. Look for `types: ['bearer']`, `types: ['api_key_header']`, or `types: ['oauth_client_credentials']`
3. If bearer: the credential is a token string
4. If api_key_header: the credential is an API key string
5. If oauth_client_credentials: warn the user this may need UI-based setup

## Step 4: Create the Connector

Once the user confirms the credentials file is ready, run:

```bash
src/platform/packages/shared/kbn-connector-specs/.claude/skills/activate-connector/scripts/create_connector.sh \
  --type "<connector_type_id>" \
  --name "<display_name>" \
  --auth-type "<auth_type>" \
  --credentials-file /tmp/connector_credentials
```

Where:
- `<connector_type_id>` is the type ID from Step 1 (e.g., `.github`, `.notion`)
- `<display_name>` is a human-readable name for the connector instance
- `<auth_type>` is `bearer`, `api_key_header`, or `basic` — look up the connector spec's auth type from Step 3's Credential Reference. If omitted, the script auto-detects (colon in credential → basic, else bearer), but **always pass it explicitly for `api_key_header` connectors** since auto-detection can't distinguish them from bearer tokens.

For `api_key_header` connectors, you **must also pass `--header-field`** with the header field name from the connector spec's `auth.types[].defaults.headerField`:
```bash
  --auth-type api_key_header --header-field "X-Api-Key"
```

If the connector requires additional config (e.g., `serverUrl` for MCP-native connectors), add:
```bash
  --config '{"serverUrl":"https://mcp.example.com/mcp/"}'
```

The script will auto-detect the Kibana URL and auth, read the credentials, delete the file, and make the API call.

## Step 5: Verify Activation

Run the list script again to confirm:

```bash
src/platform/packages/shared/kbn-connector-specs/.claude/skills/activate-connector/scripts/list_connectors.sh
```

Show the user the newly created connector entry. If it appears, report success. If not, show any error output from Step 4.

## Important Notes

- **This skill requires Kibana to be running** — it makes live API calls
- **Auto-detection** tries http/https on localhost:5601 with both `elastic:changeme` (standard) and `elastic_serverless:changeme` (serverless) credentials
- **Credentials are never seen by Claude** — they flow through the file -> script -> API pipeline only
- **The credentials file is deleted immediately** after the script reads it
- **Connector sub-actions become available to agents** when `agentBuilder:experimentalFeatures` is true in Kibana settings
- To override auto-detection, set `KIBANA_URL` and/or `KIBANA_AUTH` environment variables, or pass `--kibana-url` to the scripts
