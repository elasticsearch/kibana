---
navigation_title: "Slack (v2)"
type: reference
description: "Use the Slack (v2) connector to search messages, list channels, fetch channel history, look up channel and user metadata, list and look up files, send messages, create channels, and invite users to Slack channels using the Slack Web API."
applies_to:
  stack: preview 9.4
  serverless: preview
---

# Slack (v2) connector [slack-v2-action-type]

The Slack (v2) connector enables workflow-driven Slack automation: search Slack messages, list conversations the token can access, resolve channel IDs from names, send messages, create channels, and invite users to Slack channels using the Slack Web API. It authenticates using OAuth Authorization Code (Slack OAuth v2).

## Create connectors in {{kib}} [define-slack-v2-ui]

You can create connectors in **{{stack-manage-app}} > {{connectors-ui}}**.

### Connector configuration [slack-v2-connector-configuration]

Slack (v2) connectors use OAuth Authorization Code authentication. When creating the connector, you will be prompted to authorize access to your Slack workspace. No additional configuration properties are required beyond the OAuth credentials.

## Test connectors [slack-v2-action-configuration]

You can test connectors when you create or edit the connector in {{kib}}. The test verifies connectivity by calling Slack `auth.test`.

The Slack (v2) connector has the following actions:

Search messages
:   Search for messages in Slack.
    - `query` (required): Slack search query string.
    - `inChannel` (optional): Adds `in:<channel_name>` to the query.
    - `fromUser` (optional): Adds `from:<@UserID>` or `from:username` to the query.
    - `after` (optional): Adds `after:<date>` to the query (for example, `2026-02-10`).
    - `before` (optional): Adds `before:<date>` to the query (for example, `2026-02-10`).
    - `sort` (optional): Sort order, `score` or `timestamp`.
    - `sortDir` (optional): Sort direction, `asc` or `desc`.
    - `count` (optional): Results to return (1 to 20). Slack returns up to 20 results per page.
    - `cursor` (optional): Pagination cursor (use `response_metadata.next_cursor` from a previous call).
    - `includeContextMessages` (optional): Include contextual messages. Defaults to `true`.
    - `includeBots` (optional): Include bot messages. Defaults to `false`.
    - `includeMessageBlocks` (optional): Include Block Kit blocks. Defaults to `true`.
    - `raw` (optional): If `true`, returns the full raw Slack response (verbose).

List channels
:   List Slack conversations the token can see (one page per call), using Slack `conversations.list`. Use this to browse channel IDs or answer which channels exist. When the response includes `hasMore: true`, call **List channels** again with `nextCursor` from the previous response.
    - `types` (optional): Conversation types to include: `public_channel`, `private_channel`, `im`, `mpim`. Defaults to `public_channel` only. If you pass an empty array, it defaults to `public_channel`.
    - `excludeArchived` (optional): Exclude archived conversations. Defaults to `true`.
    - `cursor` (optional): Pagination cursor from a previous **List channels** response (`nextCursor`). Omit for the first page.
    - `limit` (optional): Conversations per page (1 to 1000). Defaults to `1000`.
    - `raw` (optional): If `true`, returns the full raw Slack API response instead of a compact result. Defaults to `false`.

Resolve channel ID
:   Resolve a Slack conversation ID (`C...` for public channels, `G...` for private channels) from a human channel name (for example, `#general`).
    - `name` (required): Channel name (with or without `#`).
    - `types` (optional): Conversation types to search. Defaults to `public_channel`.
    - `match` (optional): `exact` (default) or `contains`.
    - `excludeArchived` (optional): Exclude archived channels. Defaults to `true`.
    - `cursor` (optional): Pagination cursor to resume a previous scan.
    - `limit` (optional): Channels per page (1 to 1000). Defaults to `1000`.
    - `maxPages` (optional): Maximum pages to scan before giving up. Defaults to `10`.

Get conversation history
:   Fetch a page of recent messages from a Slack channel or DM using Slack `conversations.history`. Returns messages newest-first. When the response includes `hasMore: true`, call **Get conversation history** again with `nextCursor` from the previous response.
    - `channel` (required): Conversation ID (for example, `C123...` for channels, `G...` for private channels, `D...` for DMs).
    - `oldest` (optional): Only messages after this Unix timestamp (string form, for example `1234567890.123456`).
    - `latest` (optional): Only messages before this Unix timestamp (string form).
    - `inclusive` (optional): Include messages with the `oldest` or `latest` timestamps in results.
    - `limit` (optional): Messages per page (1 to 1000). Defaults to `100`.
    - `cursor` (optional): Pagination cursor from a previous response (`nextCursor`). Omit for the first page.
    - `raw` (optional): If `true`, returns the full raw Slack response. Defaults to `false`.

Get conversation info
:   Look up metadata for a single Slack channel or DM by ID using Slack `conversations.info`. Returns the channel object (name, privacy, membership, topic, purpose).
    - `channel` (required): Conversation ID.
    - `includeNumMembers` (optional): Set to `true` to include the member count in the channel object.
    - `includeLocale` (optional): Set to `true` to include the channel locale.
    - `raw` (optional): If `true`, returns the full raw Slack response instead of just the channel object. Defaults to `false`.

Look up user by email
:   Find a Slack user by email address using Slack `users.lookupByEmail`. Throws if no user has that email.
    - `email` (required): Email address of the user to look up.
    - `raw` (optional): If `true`, returns the full raw Slack response instead of just the user object. Defaults to `false`.

List users
:   List Slack workspace users (one page per call) using Slack `users.list`. When the response includes `hasMore: true`, call **List users** again with `nextCursor` from the previous response.
    - `limit` (optional): Users per page (1 to 1000). Defaults to `200`.
    - `cursor` (optional): Pagination cursor from a previous response.
    - `includeLocale` (optional): Set to `true` to include the user locale.
    - `raw` (optional): If `true`, returns the full raw Slack response.

Who am I
:   Return the identity the connector is currently authenticated as, using Slack `auth.test`. Useful before a write action to confirm the workspace/user, or to resolve "me" to a concrete `user_id`.
    - `raw` (optional): If `true`, returns the full raw Slack response. Defaults to `false`.

Get file info
:   Look up a single Slack file by ID using Slack `files.info`. Returns the file metadata (name, mimetype, size, URLs, sharing channels).
    - `file` (required): Slack file ID (for example, `F0123ABCDE`).
    - `raw` (optional): If `true`, returns the full raw Slack response instead of the file object. Defaults to `false`.

List files
:   List Slack files (one page per call) using Slack `files.list`. Filter by channel, user, time range, or types. Slack `files.list` is classic-paginated, so this action uses `page`/`pages` rather than cursors.
    - `channel` (optional): Restrict results to a single channel/DM ID.
    - `user` (optional): Restrict results to files uploaded by a single user ID.
    - `tsFrom` (optional): Only include files created after this Unix timestamp (string form).
    - `tsTo` (optional): Only include files created before this Unix timestamp (string form).
    - `types` (optional): Comma-separated Slack file type filter (for example, `images,pdfs`).
    - `count` (optional): Files per page (1 to 200). Defaults to `100`.
    - `page` (optional): 1-indexed page number. Defaults to `1`. Use `nextPage` from the previous response to walk pages.
    - `raw` (optional): If `true`, returns the full raw Slack response.

List user conversations
:   List the channels a Slack user is a member of (one page per call) using Slack `users.conversations`. Omit `user` to list for the authenticated user.
    - `user` (optional): User ID (for example, `U...`) whose conversations to list.
    - `types` (optional): Conversation types to list (`public_channel`, `private_channel`, `im`, `mpim`). Defaults to all four — DMs and private channels are usually the more interesting answer for a per-user query.
    - `excludeArchived` (optional): Exclude archived channels. Defaults to `true`.
    - `limit` (optional): Channels per page (1 to 1000). Defaults to `1000`.
    - `cursor` (optional): Pagination cursor from a previous response.
    - `raw` (optional): If `true`, returns the full raw Slack response.

Create conversation
:   Create a new Slack channel (public or private).
    - `name` (required): Channel name. Must contain only lowercase letters, numbers, hyphens, and underscores (80 characters or fewer).
    - `isPrivate` (optional): Whether to create a private channel. Defaults to `false`.

Invite to conversation
:   Invite users to a Slack channel.
    - `channel` (required): The channel ID to invite users to (for example, `C123...` or `G456...`).
    - `users` (required): Comma-separated list of user IDs to invite (for example, `U01PWE77HD2,U02ABC1234`).

Send message
:   Send a message to a Slack conversation ID.
    - `channel` (required): Conversation ID (for example, `C123...`). Use **List channels** to browse IDs, or **Resolve channel ID** if you know the channel name.
    - `text` (required): Message text.
    - `threadTs` (optional): Reply in a thread (timestamp of the parent message).
    - `unfurlLinks` (optional): Turn on unfurling of primarily text-based content.
    - `unfurlMedia` (optional): Turn on unfurling of media content.

## Connector networking configuration [slack-v2-connector-networking-configuration]

Use the [Action configuration settings](/reference/configuration-reference/alerting-settings.md#action-settings) to customize connector networking, such as proxies, certificates, or TLS settings. If you use [`xpack.actions.allowedHosts`](/reference/configuration-reference/alerting-settings.md#action-settings), include `slack.com` in the list.

## Get API credentials [slack-v2-api-credentials]

To use the Slack (v2) connector, you need a Slack app configured for OAuth.

1. Go to [Slack API: Your Apps](https://api.slack.com/apps) and select **Create New App**.
2. Choose **From scratch**, give it a name (for example, "Kibana Slack Connector"), and select your workspace.
3. Under **OAuth & Permissions**, add the following **User Token Scopes**:
   - `channels:read` — list and resolve public channel IDs
   - `channels:history` — read public channel history (for **Get conversation history**)
   - `chat:write` — send messages
   - `files:read` — access shared files (for **Get file info**, **List files**)
   - `groups:read` — list private channels (including for **List channels** when `types` includes `private_channel`)
   - `groups:history` — read private channel history (for **Get conversation history** on private channels)
   - `im:read` — list direct messages (when `types` includes `im`)
   - `im:history` — read DM history (for **Get conversation history** on DMs)
   - `mpim:read` — list group direct messages (when `types` includes `mpim`)
   - `mpim:history` — read group DM history (for **Get conversation history** on group DMs)
   - `search:read.files` — search files
   - `search:read.im` — search direct messages
   - `search:read.mpim` — search group direct messages
   - `search:read.private` — search private channels
   - `search:read.public` — search public channels
   - `users:read` — look up user information (for **List users**, **List user conversations**)
   - `users:read.email` — look up users by email (for **Look up user by email**)
4. Set the **Redirect URL** to your Kibana OAuth redirect URI.
5. Under **Basic Information**, copy the **Client ID** and **Client Secret**.
6. In {{kib}}, enter the Client ID and Client Secret when creating the Slack (v2) connector. You will be redirected to Slack to authorize access to your workspace.

::::{note}
Additional scopes may be required for certain actions. For example, `groups:write` is needed to create private channels or invite users. Add scopes as needed under **User Token Scopes** in your Slack app configuration.
::::
