/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { RELAY_AUTH_ID } from '../../auth_types/relay';
import type { ActionContext, RelayActionClient } from '../../connector_spec';
import type {
  SlackListChannelsInput,
  SlackResolveChannelIdInput,
  SlackSendMessageInput,
} from './types';

const getRelaySupportedActions = () => Object.keys(slackRelay.actions);

/** The Relay's own max page size; the Slack schemas allow far larger limits. */
const RELAY_MAX_BINDINGS_PAGE = 200;

/** Marks results as coming from the connected bindings rather than a `conversations.list` call. */
const RELAY_CHANNEL_SOURCE = 'relay-bindings' as const;

const createChannelNotConnectedError = (channel: string): Error =>
  new Error(`Channel ${channel} is not connected. Connect it in the Elastic Slack app settings.`);

export interface SlackRelayConnection {
  client: RelayActionClient;
  tenantKey: string;
}

const isRelayAuth = (ctx: ActionContext): boolean =>
  (ctx.secrets as { authType?: string } | undefined)?.authType === RELAY_AUTH_ID;

/**
 * The Relay connection for this execution, or `null` when the connector holds its own Slack token.
 *
 * Throws rather than falling back to `ctx.client`: a relay connector has no token, so a direct call
 * would fail with an opaque `invalid_auth` well after the reason was knowable.
 */
export function getRelayConnection(ctx: ActionContext): SlackRelayConnection | null {
  if (!isRelayAuth(ctx)) {
    return null;
  }

  if (!ctx.relay) {
    throw new Error('This connector uses the Elastic Slack app, which is not configured.');
  }

  const tenantKey = (ctx.secrets as { tenantKey?: string } | undefined)?.tenantKey;
  if (!tenantKey) {
    throw new Error(
      'This connector is not linked to a Slack workspace. Reconnect the Elastic Slack app.'
    );
  }

  return { client: ctx.relay, tenantKey };
}

const getStatusCode = (error: unknown): number | undefined => {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
};

/**
 * Restates the two Relay failures a rule author can act on. Anything else is a configuration or
 * upstream problem, so it passes through unchanged.
 */
function toUserFacingError(error: unknown, channel?: string): unknown {
  switch (getStatusCode(error)) {
    case 403:
      return channel
        ? createChannelNotConnectedError(channel)
        : new Error(
            'Not allowed to read the connected channels. Reconnect the Elastic Slack app.'
          );
    case 409:
      return new Error(
        'The Elastic Slack app is no longer installed in this workspace. Reconnect it.'
      );
    default:
      return error;
  }
}

/** Posts through the Relay, returning the timestamp as `ts` so callers can thread on it as usual. */
export async function relaySendMessage(
  connection: SlackRelayConnection,
  ctx: ActionContext,
  input: SlackSendMessageInput
): Promise<{ ok: true; channel: string; ts: string }> {
  if (input.unfurlLinks !== undefined || input.unfurlMedia !== undefined) {
    ctx.log.debug(
      'Slack sendMessage: unfurl options are not supported through the Elastic Slack app and were ignored'
    );
  }

  ctx.log.debug(`Slack sendMessage request through relay: channel=${input.channel}`);

  try {
    const { ref, channel } = await connection.client.trigger({
      tenantKey: connection.tenantKey,
      channel: input.channel,
      message: input.text,
      ...(input.threadTs ? { threadTs: input.threadTs } : {}),
    });

    return { ok: true, channel, ts: ref };
  } catch (error) {
    ctx.log.error(`Slack sendMessage through relay failed: ${(error as Error).message}`);
    throw toUserFacingError(error, input.channel);
  }
}

/** Shaped like a `conversations.list` entry, so callers need no relay branch. */
interface RelayChannel {
  id: string;
  name: string;
  is_private: boolean;
}

type RelayBindings = Awaited<ReturnType<RelayActionClient['listBindings']>>['bindings'];

const toChannels = (bindings: RelayBindings): RelayChannel[] =>
  bindings.flatMap(({ scope_id: id, display_name: displayName, visibility }) =>
    id
      ? [
          {
            id,
            // Bindings predating the Relay's display snapshots carry no name, and an unlabeled
            // entry in a channel picker is worse than one reading `C0123456789`.
            name: displayName ?? id,
            is_private: visibility === 'private',
          },
        ]
      : []
  );

const fetchBindingsPage = async (
  { client, tenantKey }: SlackRelayConnection,
  ctx: ActionContext,
  { cursor, limit }: { cursor?: string; limit: number }
) => {
  try {
    return await client.listBindings(tenantKey, {
      limit: Math.min(limit, RELAY_MAX_BINDINGS_PAGE),
      ...(cursor ? { cursor } : {}),
    });
  } catch (error) {
    ctx.log.error(`Slack bindings lookup through relay failed: ${(error as Error).message}`);
    throw toUserFacingError(error);
  }
};

/**
 * Lists the channels connected to the Elastic Slack app rather than the whole workspace — the only
 * ones this connector could post to anyway.
 *
 * `types` and `excludeArchived` are ignored: the bindings are already an admin-built allow-list, and
 * the schema's `public_channel`-only default would drop every connected private channel from callers
 * that pass no input at all, such as the alerting rule form's channel selector.
 */
export async function relayListChannels(
  connection: SlackRelayConnection,
  ctx: ActionContext,
  input: SlackListChannelsInput
) {
  ctx.log.debug('Slack listChannels request through relay');

  const page = await fetchBindingsPage(connection, ctx, {
    cursor: input.cursor,
    limit: input.limit,
  });

  // `raw` is ignored: there is no Slack API body to pass through.
  return {
    ok: true as const,
    source: RELAY_CHANNEL_SOURCE,
    channels: toChannels(page.bindings),
    nextCursor: page.nextCursor,
    hasMore: Boolean(page.nextCursor),
  };
}

/** Resolves a name against the connected channels only. */
export async function relayResolveChannelId(
  connection: SlackRelayConnection,
  ctx: ActionContext,
  input: SlackResolveChannelIdInput
) {
  const nameNorm = input.name.trim().replace(/^#/, '').toLowerCase();

  let cursor = input.cursor;
  let pagesFetched = 0;

  while (pagesFetched < input.maxPages) {
    ctx.log.debug(`Slack connected-channel scan through relay (page ${pagesFetched + 1})`);
    const page = await fetchBindingsPage(connection, ctx, { cursor, limit: input.limit });

    const found = toChannels(page.bindings).find(({ name }) => {
      const candidate = name.toLowerCase();
      return input.match === 'exact' ? candidate === nameNorm : candidate.includes(nameNorm);
    });

    pagesFetched += 1;

    if (found) {
      return {
        ok: true,
        found: true as const,
        id: found.id,
        name: found.name,
        source: RELAY_CHANNEL_SOURCE,
        pagesFetched,
        nextCursor: page.nextCursor,
      };
    }

    if (!page.nextCursor) {
      cursor = undefined;
      break;
    }
    cursor = page.nextCursor;
  }

  return {
    ok: true,
    found: false as const,
    id: undefined,
    name: nameNorm,
    source: RELAY_CHANNEL_SOURCE,
    pagesFetched,
    nextCursor: cursor,
  };
}

/**
 * Replaces `auth.test`, which needs a token this connector does not have. Reading one binding proves
 * the Relay accepts our identity and the workspace is still installed — the two ways this connector
 * breaks without any local change.
 */
export async function relayTest(
  connection: SlackRelayConnection,
  ctx: ActionContext
): Promise<Record<string, never>> {
  ctx.log.debug('Slack test through relay');
  await fetchBindingsPage(connection, ctx, { limit: 1 });
  return {};
}

const assertNotSupported = (ctx: ActionContext, action: string): void => {
  if (!isRelayAuth(ctx)) {
    return;
  }

  throw new Error(
    `${action} is not available through the Elastic Slack app. Supported actions: ${getRelaySupportedActions().join(
      ', '
    )}.`
  );
};

export const slackRelay = {
  getConnection: getRelayConnection,
  assertNotSupported,
  test: relayTest,
  actions: {
    sendMessage: relaySendMessage,
    listChannels: relayListChannels,
    resolveChannelId: relayResolveChannelId,
  },
};
