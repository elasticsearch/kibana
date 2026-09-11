---
navigation_title: "Mattermost"
type: reference
description: "Use the Mattermost connector to manage channels, users, posts, threads, reactions, and memberships."
applies_to:
  stack: preview 9.6
  serverless: preview
---

# Mattermost connector [mattermost-action-type]

Use the Mattermost connector to find conversation context and keep incident responders informed.
In Agent Builder, search messages, read threads, and find teams, channels, and users. In Workflows,
post incident updates, add responders to channels, and archive or restore channels.

:::{note}
Workflows can use all 22 actions. Agent Builder can use the 11 read actions. Actions that change
Mattermost data are not available as Agent Builder tools.
:::

## Create connectors in {{kib}} [define-mattermost-ui]

You can create a Mattermost connector in **{{stack-manage-app}} > {{connectors-ui}}**.

### Connector configuration [mattermost-connector-configuration]

Mattermost server URL
:   The Site URL of your Mattermost server, for example `https://mattermost.example.com` or
    `https://example.com/company/mattermost` for a deployment under a subpath. Do not include
    `/api/v4`. HTTP is supported for self-hosted development environments, but HTTPS is recommended
    for production.

Bot access token
:   A bearer token for a Mattermost bot account. Add the bot to every team and channel that it must
    access and grant only the permissions required by the enabled actions. Reads can require
    `read_channel`, `read_channel_content`, `list_team_channels`, `view_members`, and `view_team`.
    Depending on enabled actions, grant `create_post`, `create_direct_channel`, `upload_file`,
    `create_public_channel`, `create_private_channel`, `join_public_channels`,
    `manage_public_channel_members`, `manage_private_channel_members`, `delete_public_channel`,
    `delete_private_channel`, `manage_team`, `sysconsole_write_user_management_channels`,
    `delete_post`, `delete_others_posts`, `add_reaction`, `remove_reaction`, `edit_other_users`, or
    `manage_system`. **Create ephemeral post** requires `create_post_ephemeral`, currently
    system-admin-only.

## Test connectors [mattermost-action-configuration]

You can test the connector while creating or editing it in {{kib}}. The test checks the connection
and access token, then shows a connection message with the account name or ID.

## Connector actions [mattermost-connector-actions]

The connector provides 22 actions: 11 to read data and 11 to change data. Creating users is not
supported.

### Team and channel discovery [mattermost-discovery-actions]

**List teams** (`listTeams`)
:   Lists teams that the connector's bot account belongs to.

**List channels** (`listChannels`)
:   Lists channels in a team that the connector's bot account can access.
    - `teamId` (required): A team ID returned by **List teams**.

**Search channels** (`searchChannels`)
:   Searches visible channels within one team. With
    `list_team_channels`, results can include all public channels in the team. Otherwise, a team
    member receives only joined channels.
    - `teamId` (required): The team ID to search.
    - `term` (required): A channel name or display-name term, up to 200 characters.

**Get channel stats** (`getChannelStats`)
:   Returns member, guest, pinned-post, and file counts. Requires `read_channel`.
    - `channelId` (required): The channel ID.

### Channel administration [mattermost-channel-administration-actions]

Use Workflows for the actions that change channels. You can also use **List channel members** in
Agent Builder. Check the channel and user IDs before making changes.

**Add user to channel** (`addUserToChannel`)
:   Adds one user to a public or private channel. Adding yourself to a public channel requires
    `join_public_channels`. Adding another user requires `manage_public_channel_members`, or
    `manage_private_channel_members` for a private channel. Direct and group message channels are
    rejected. Group-constrained channels reject users outside the linked group.
    - `channelId` (required): The public or private channel ID.
    - `userId` (required): The user ID to add.
    - `postRootId` (optional): A valid root post in the same channel.

**Create channel** (`createChannel`)
:   Creates a public or private channel. Requires `create_public_channel` or
    `create_private_channel`. Board and Space channel types are not supported.
    - `teamId` (required): The target team ID.
    - `name` (required): A unique lowercase name, up to 64 letters, numbers, hyphens, or underscores.
    - `displayName` (required): A display name, up to 64 Unicode code points.
    - `type` (required): `O` for public or `P` for private.
    - `purpose` (optional): A purpose, up to 250 Unicode code points.
    - `header` (optional): A header, up to 1,024 Unicode code points.

**Delete channel** (`deleteChannel`)
:   Archives a channel with soft deletion. It never requests permanent deletion. Public channels
    require `delete_public_channel`; private channels require `delete_private_channel`.
    `manage_system` also qualifies. Direct and group message channels cannot be archived.
    - `channelId` (required): The public or private channel ID.

**List channel members** (`listChannelMembers`)
:   Lists one page of channel members. Requires `read_channel`. Mattermost can omit another
    user's private last-viewed and last-update timestamps.
    - `channelId` (required): The channel ID.
    - `page` (optional): A zero-based page, up to 10,000. Defaults to 0.
    - `perPage` (optional): From 1 to 200 members. Defaults to 60.

**Restore channel** (`restoreChannel`)
:   Restores an archived channel. Requires `manage_team`. Some server versions also accept
    `sysconsole_write_user_management_channels`.
    - `channelId` (required): The archived channel ID.

### User actions [mattermost-user-actions]

**Find user by email** (`findUserByEmail`)
:   Finds one visible user by exact email address. Email visibility depends on server privacy
    settings.
    - `email` (required): The exact email address.

**Get user by ID** (`getUserById`)
:   Returns the user's visible profile information. Requires an active session and permission to see
    the user. Visibility can depend on `view_members` and shared team or channel context.
    - `userId` (required): The user ID.

**Deactivate user** (`deactivateUser`)
:   Archives a user and revokes their sessions. It never requests permanent deletion. The caller
    must be that user or have `edit_other_users`. Deactivating a system administrator also requires
    `manage_system`. Self-deactivation can be disabled unless the caller has `manage_system`.
    - `userId` (required): The user ID to deactivate.

### Message actions [mattermost-message-actions]

**Create direct channel** (`createDirectChannel`)
:   Creates or returns a direct-message channel between the connector's bot account and one
    other user. Requires `create_direct_channel`.
    - `userId` (required): The other user's ID.

**Create post** (`createPost`)
:   Creates a channel post or thread reply. Requires `create_post`.
    - `channelId` (required): The destination channel ID.
    - `message` (required): Mattermost Markdown, up to 16,383 Unicode code points.
    - `rootId` (optional): The root post ID for a thread reply.
    - `fileIds` (optional): Up to five IDs for existing Mattermost files. Requires `upload_file`.
      Upload the files to Mattermost before using them in a post. The connector does not upload files.
    - `props` (optional): JSON with at most 50 keys and a serialized limit of 20,000 characters.
    - `priority` (optional): `important` or `urgent` metadata for a root post. It requires
      `PostPriority`; `requestedAck` also requires an eligible Professional or Enterprise plan.
      Omit priority whenever `rootId` is present.

**Delete post** (`deletePost`)
:   Soft-deletes a post and never requests permanent deletion. Deleting your own post requires
    `delete_post`; deleting another user's post requires `delete_others_posts`.
    - `postId` (required): The post ID.

**Create ephemeral post** (`createEphemeralPost`)
:   Sends a temporary post to one user. The post is not saved and cannot be retrieved later.
    Requires `create_post_ephemeral`, which current Mattermost servers grant only to system
    administrators.
    - `userId` (required): The target user ID.
    - `channelId` (required): The channel where the post appears.
    - `message` (required): Mattermost Markdown, up to 16,383 Unicode code points.

**List posts** (`listPosts`)
:   Lists posts in the order returned by Mattermost.
    - `channelId` (required): The channel ID.
    - `page` (optional): A zero-based page, up to 10,000.
    - `perPage` (optional): From 1 to 200 posts. Defaults to 60 outside cursor and `since` modes.
    - `before` or `after` (optional): Mutually exclusive post ID cursors.
    - `since` (optional): Unix milliseconds. It cannot be combined with paging fields or cursors
      and can return up to 1,000 modified posts.

**Get thread** (`getThread`)
:   Gets one page of a post thread.
    - `postId` (required): A root post or reply ID.
    - `perPage` (optional): From 1 to 200 posts. Defaults to 60.
    - `fromPost` and `fromCreateAt` (optional): A post cursor and its Unix creation timestamp.
    - `direction` (optional): `up` or `down`. Defaults to `down`.

    When `hasNext` is `true`, request the next page. Set `fromPost` to the last returned reply's
    `id` and `fromCreateAt` to its `createAt` value.

**Search posts** (`searchPosts`)
:   Searches visible posts within a team. Requires `view_team`. Terms support modifiers such as
    `from:username` and `in:channel-name`. Search paging requires Mattermost Elasticsearch search.
    - `teamId` (required): The team ID.
    - `terms` (required): Search terms, up to 2,000 characters.
    - `isOrSearch` (optional): OR semantics when `true`; defaults to AND.
    - `page` (optional): A zero-based page, up to 10,000. Defaults to 0.
    - `perPage` (optional): From 1 to 200 posts. Defaults to 60.

### Reaction actions [mattermost-reaction-actions]

**Create reaction** (`createReaction`)
:   Adds a reaction as the connector's bot account. You cannot add a reaction as another user.
    Requires `add_reaction`.
    - `postId` (required): The post ID.
    - `emojiName` (required): An emoji name without colons, up to 64 permitted characters.

**Delete reaction** (`deleteReaction`)
:   Removes a reaction added by the connector's bot account. Requires `remove_reaction`.
    - `postId` (required): The post ID.
    - `emojiName` (required): The emoji name without colons.

**List reactions** (`listReactions`)
:   Lists selected fields for reactions on a post. Requires permission to read the post and channel
    content.
    - `postId` (required): The post ID.

## Connector networking configuration [mattermost-connector-networking-configuration]

Use the [Action configuration settings](/reference/configuration-reference/alerting-settings.md#action-settings)
to configure proxies, certificates, or TLS. If you use `xpack.actions.allowedHosts`, add the
Mattermost host.

## Get API credentials [mattermost-api-credentials]

Ask a Mattermost system administrator to create a bot account and access token. Add it to the
required teams and channels and use a least-privilege role. Reads can require `read_channel`,
`read_channel_content`, `list_team_channels`, `view_members`, and `view_team`. Depending on enabled
actions, grant `create_post`, `create_direct_channel`, `upload_file`, `create_public_channel`,
`create_private_channel`, `join_public_channels`, `manage_public_channel_members`,
`manage_private_channel_members`, `delete_public_channel`, `delete_private_channel`, `manage_team`,
`sysconsole_write_user_management_channels`, `delete_post`, `delete_others_posts`, `add_reaction`,
`remove_reaction`, `edit_other_users`, or `manage_system`. **Create ephemeral post** requires
`create_post_ephemeral`, currently system-admin-only.

Store the token in **Bot access token**. {{kib}} stores it as a connector secret. Do not put
passwords or other credentials in workflow action inputs.
