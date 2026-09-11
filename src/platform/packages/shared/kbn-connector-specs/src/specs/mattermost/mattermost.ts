/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { AxiosError } from 'axios';
import type { ActionContext, ConnectorSpec } from '../../connector_spec';
import {
  AddUserToChannelInputSchema,
  ChannelIdInputSchema,
  CreateChannelInputSchema,
  CreateDirectChannelInputSchema,
  CreateEphemeralPostInputSchema,
  CreatePostInputSchema,
  EmptyInputSchema,
  FindUserByEmailInputSchema,
  GetThreadInputSchema,
  ListChannelMembersInputSchema,
  ListChannelsInputSchema,
  ListPostsInputSchema,
  MAX_POST_FILE_IDS,
  MattermostConfigSchema,
  PostIdInputSchema,
  ReactionInputSchema,
  SearchChannelsInputSchema,
  SearchPostsInputSchema,
  UserIdInputSchema,
} from './types';
import type {
  AddUserToChannelInput,
  ChannelIdInput,
  CreateChannelInput,
  CreateDirectChannelInput,
  CreateEphemeralPostInput,
  CreatePostInput,
  FindUserByEmailInput,
  GetThreadInput,
  ListChannelMembersInput,
  ListChannelsInput,
  ListPostsInput,
  MattermostConfig,
  PostIdInput,
  ReactionInput,
  SearchChannelsInput,
  SearchPostsInput,
  UserIdInput,
} from './types';

const DEFAULT_PER_PAGE = 60;
const MAX_LIST_ITEMS = 1000;
const MAX_ERROR_DETAIL_LENGTH = 1000;
const MAX_MATCHES_PER_POST = 50;
const MAX_MATCH_LENGTH = 2000;
const MAX_SELECTED_TEXT_LENGTH = 4096;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const truncateAtCodePoints = (value: string, maxLength: number): string => {
  let end = 0;
  let count = 0;
  for (const codePoint of value) {
    if (count === maxLength) {
      break;
    }
    end += codePoint.length;
    count += 1;
  }
  return value.slice(0, end);
};

const stringValue = (value: unknown, maxLength = MAX_SELECTED_TEXT_LENGTH): string | undefined =>
  typeof value === 'string' ? truncateAtCodePoints(value, maxLength) : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const booleanValue = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const getBaseUrl = (ctx: ActionContext): string => {
  const { serverUrl } = ctx.config as Partial<MattermostConfig>;
  if (!serverUrl) {
    throw new Error('Mattermost connector is missing the required server URL configuration');
  }
  return serverUrl.replace(/\/+$/, '');
};

const formatMattermostError = (action: string, error: unknown): Error => {
  const axiosError = error as AxiosError<unknown>;
  const data = isRecord(axiosError.response?.data) ? axiosError.response.data : undefined;
  const detail =
    stringValue(data?.message, MAX_ERROR_DETAIL_LENGTH) ??
    stringValue(axiosError.message, MAX_ERROR_DETAIL_LENGTH) ??
    'Unknown API error';
  const errorId = stringValue(data?.id, 200);
  const responseHeaders = axiosError.response?.headers as UnknownRecord | undefined;
  const requestId =
    stringValue(data?.request_id, 200) ?? stringValue(responseHeaders?.['x-request-id'], 200);
  const status = axiosError.response?.status ?? 'unknown';
  const errorIdSuffix = errorId ? ` [${errorId}]` : '';
  const requestIdSuffix = requestId ? ` (request id: ${requestId})` : '';
  return new Error(
    `Mattermost ${action} failed (status ${status}): ${detail}${errorIdSuffix}${requestIdSuffix}`
  );
};

const request = async <T>(action: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    throw formatMattermostError(action, error);
  }
};

const trimUser = (value: unknown) => {
  const user = isRecord(value) ? value : {};
  return {
    id: stringValue(user.id),
    username: stringValue(user.username),
    email: stringValue(user.email),
    firstName: stringValue(user.first_name),
    lastName: stringValue(user.last_name),
    nickname: stringValue(user.nickname),
    createAt: numberValue(user.create_at),
    updateAt: numberValue(user.update_at),
    deleteAt: numberValue(user.delete_at),
  };
};

const trimTeam = (value: unknown) => {
  const team = isRecord(value) ? value : {};
  return {
    id: stringValue(team.id),
    displayName: stringValue(team.display_name),
    name: stringValue(team.name),
    description: stringValue(team.description),
    type: stringValue(team.type),
    createAt: numberValue(team.create_at),
    updateAt: numberValue(team.update_at),
    deleteAt: numberValue(team.delete_at),
  };
};

const trimChannel = (value: unknown) => {
  const channel = isRecord(value) ? value : {};
  return {
    id: stringValue(channel.id),
    teamId: stringValue(channel.team_id),
    type: stringValue(channel.type),
    displayName: stringValue(channel.display_name),
    name: stringValue(channel.name),
    header: stringValue(channel.header),
    purpose: stringValue(channel.purpose),
    lastPostAt: numberValue(channel.last_post_at),
    totalMessageCount: numberValue(channel.total_msg_count),
    createAt: numberValue(channel.create_at),
    updateAt: numberValue(channel.update_at),
    deleteAt: numberValue(channel.delete_at),
  };
};

const malformedResponse = (action: string, responseType: string): never => {
  throw new Error(`Mattermost ${action} failed: malformed ${responseType} response`);
};

const requiredResponseId = (value: unknown, action: string, responseType: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    return malformedResponse(action, responseType);
  }
  return value;
};

const optionalResponseId = (
  value: unknown,
  action: string,
  responseType: string
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length > 200) {
    return malformedResponse(action, responseType);
  }
  return value;
};

const optionalResponseString = (
  value: unknown,
  action: string,
  responseType: string,
  maxLength = MAX_SELECTED_TEXT_LENGTH
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return malformedResponse(action, responseType);
  }
  return truncateAtCodePoints(value, maxLength);
};

const optionalResponseInteger = (
  value: unknown,
  action: string,
  responseType: string
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return malformedResponse(action, responseType);
  }
  return value;
};

const optionalChannelMemberTimestamp = (value: unknown, action: string): number | undefined =>
  value === -1 ? -1 : optionalResponseInteger(value, action, 'ChannelMember');

const optionalResponseBoolean = (
  value: unknown,
  action: string,
  responseType: string
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    return malformedResponse(action, responseType);
  }
  return value;
};

const trimValidatedUser = (value: unknown, action: string) => {
  if (!isRecord(value)) {
    return malformedResponse(action, 'User');
  }
  const id = requiredResponseId(value.id, action, 'User');
  for (const key of ['username', 'email', 'first_name', 'last_name', 'nickname'] as const) {
    optionalResponseString(value[key], action, 'User');
  }
  for (const key of ['create_at', 'update_at', 'delete_at'] as const) {
    optionalResponseInteger(value[key], action, 'User');
  }
  return { ...trimUser(value), id };
};

const trimValidatedTeam = (value: unknown, action: string) => {
  if (!isRecord(value)) {
    return malformedResponse(action, 'Team');
  }
  const id = requiredResponseId(value.id, action, 'Team');
  for (const key of ['display_name', 'name', 'description', 'type'] as const) {
    optionalResponseString(value[key], action, 'Team');
  }
  for (const key of ['create_at', 'update_at', 'delete_at'] as const) {
    optionalResponseInteger(value[key], action, 'Team');
  }
  return { ...trimTeam(value), id };
};

const trimValidatedChannel = (value: unknown, action: string) => {
  if (!isRecord(value)) {
    return malformedResponse(action, 'Channel');
  }
  const id = requiredResponseId(value.id, action, 'Channel');
  optionalResponseId(value.team_id, action, 'Channel');
  for (const key of ['type', 'display_name', 'name', 'header', 'purpose'] as const) {
    optionalResponseString(value[key], action, 'Channel');
  }
  for (const key of [
    'last_post_at',
    'total_msg_count',
    'create_at',
    'update_at',
    'delete_at',
  ] as const) {
    optionalResponseInteger(value[key], action, 'Channel');
  }
  return { ...trimChannel(value), id };
};

const trimChannelMember = (value: unknown, action: string) => {
  if (!isRecord(value)) {
    return malformedResponse(action, 'ChannelMember');
  }
  const channelId = requiredResponseId(value.channel_id, action, 'ChannelMember');
  const userId = requiredResponseId(value.user_id, action, 'ChannelMember');
  return {
    channelId,
    userId,
    roles: optionalResponseString(value.roles, action, 'ChannelMember'),
    lastViewedAt: optionalChannelMemberTimestamp(value.last_viewed_at, action),
    messageCount: optionalResponseInteger(value.msg_count, action, 'ChannelMember'),
    mentionCount: optionalResponseInteger(value.mention_count, action, 'ChannelMember'),
    rootMentionCount: optionalResponseInteger(value.mention_count_root, action, 'ChannelMember'),
    urgentMentionCount: optionalResponseInteger(
      value.urgent_mention_count,
      action,
      'ChannelMember'
    ),
    rootMessageCount: optionalResponseInteger(value.msg_count_root, action, 'ChannelMember'),
    lastUpdateAt: optionalChannelMemberTimestamp(value.last_update_at, action),
    schemeGuest: optionalResponseBoolean(value.scheme_guest, action, 'ChannelMember'),
    schemeUser: optionalResponseBoolean(value.scheme_user, action, 'ChannelMember'),
    schemeAdmin: optionalResponseBoolean(value.scheme_admin, action, 'ChannelMember'),
    explicitRoles: optionalResponseString(value.explicit_roles, action, 'ChannelMember'),
  };
};

const trimChannelStats = (value: unknown, action: string) => {
  if (!isRecord(value)) {
    return malformedResponse(action, 'ChannelStats');
  }
  const channelId = requiredResponseId(value.channel_id, action, 'ChannelStats');
  const requiredCount = (key: string) => {
    const count = optionalResponseInteger(value[key], action, 'ChannelStats');
    if (count === undefined) {
      return malformedResponse(action, 'ChannelStats');
    }
    return count;
  };
  return {
    channelId,
    memberCount: requiredCount('member_count'),
    guestCount: requiredCount('guest_count'),
    pinnedPostCount: requiredCount('pinnedpost_count'),
    fileCount: requiredCount('files_count'),
  };
};

const assertStatusOk = (value: unknown, action: string): void => {
  if (
    !isRecord(value) ||
    typeof value.status !== 'string' ||
    value.status.length !== 2 ||
    value.status.toLowerCase() !== 'ok'
  ) {
    return malformedResponse(action, 'status');
  }
};

const trimPost = (value: unknown) => {
  const post = isRecord(value) ? value : {};
  return {
    id: stringValue(post.id),
    createAt: numberValue(post.create_at),
    updateAt: numberValue(post.update_at),
    deleteAt: numberValue(post.delete_at),
    editAt: numberValue(post.edit_at),
    userId: stringValue(post.user_id),
    channelId: stringValue(post.channel_id),
    rootId: stringValue(post.root_id),
    originalId: stringValue(post.original_id),
    message: stringValue(post.message, 16_383),
    type: stringValue(post.type, 200),
    fileIds: Array.isArray(post.file_ids)
      ? post.file_ids
          .slice(0, MAX_POST_FILE_IDS)
          .map((fileId) => stringValue(fileId, 200))
          .filter((fileId): fileId is string => fileId !== undefined)
      : undefined,
    replyCount: numberValue(post.reply_count),
  };
};

const trimValidatedPost = (value: unknown, action: string) => {
  if (!isRecord(value)) {
    return malformedResponse(action, 'Post');
  }
  const id = requiredResponseId(value.id, action, 'Post');
  const userId = requiredResponseId(value.user_id, action, 'Post');
  const channelId = requiredResponseId(value.channel_id, action, 'Post');
  for (const key of ['root_id', 'original_id'] as const) {
    optionalResponseId(value[key], action, 'Post');
  }
  optionalResponseString(value.message, action, 'Post', 16_383);
  optionalResponseString(value.type, action, 'Post', 200);
  for (const key of ['create_at', 'update_at', 'delete_at', 'edit_at', 'reply_count'] as const) {
    optionalResponseInteger(value[key], action, 'Post');
  }
  if (value.file_ids !== undefined && value.file_ids !== null) {
    if (!Array.isArray(value.file_ids)) {
      return malformedResponse(action, 'Post');
    }
    for (const fileId of value.file_ids.slice(0, MAX_POST_FILE_IDS)) {
      requiredResponseId(fileId, action, 'Post');
    }
  }
  return { ...trimPost(value), id, userId, channelId };
};

const trimReaction = (value: unknown, action: string) => {
  if (!isRecord(value)) {
    return malformedResponse(action, 'Reaction');
  }
  const userId = requiredResponseId(value.user_id, action, 'Reaction');
  const postId = requiredResponseId(value.post_id, action, 'Reaction');
  if (
    typeof value.emoji_name !== 'string' ||
    value.emoji_name.length === 0 ||
    value.emoji_name.length > 64 ||
    !/^[A-Za-z0-9+_-]+$/.test(value.emoji_name)
  ) {
    return malformedResponse(action, 'Reaction');
  }
  const createAt = optionalResponseInteger(value.create_at, action, 'Reaction');
  if (createAt === undefined || createAt === 0) {
    return malformedResponse(action, 'Reaction');
  }
  return {
    userId,
    postId,
    emojiName: value.emoji_name,
    createAt,
  };
};

const malformedPostList = (action: string): never => {
  throw new Error(`Mattermost ${action} failed: malformed PostList response`);
};

interface TrimPostListOptions {
  includeMatches?: boolean;
  allowInaccessibleSentinel?: boolean;
}

const trimPostList = (
  value: unknown,
  action: string,
  { includeMatches = false, allowInaccessibleSentinel = false }: TrimPostListOptions = {}
) => {
  if (!isRecord(value)) {
    return malformedPostList(action);
  }

  const firstInaccessiblePostTime = optionalResponseInteger(
    value.first_inaccessible_post_time,
    action,
    'PostList'
  );

  if (value.order === undefined && value.posts === undefined) {
    if (allowInaccessibleSentinel && firstInaccessiblePostTime !== undefined) {
      return { posts: [], firstInaccessiblePostTime };
    }
    return malformedPostList(action);
  }

  if (!Array.isArray(value.order) || !isRecord(value.posts)) {
    return malformedPostList(action);
  }

  const sourceOrder = value.order;
  const postMap = value.posts;
  const order = sourceOrder.slice(0, MAX_LIST_ITEMS).map((postId) => {
    if (typeof postId !== 'string' || postId.length === 0 || postId.length > 200) {
      return malformedPostList(action);
    }
    return postId;
  });
  const posts = order.map((postId) => {
    const sourcePost = postMap[postId];
    if (!isRecord(sourcePost)) {
      return malformedPostList(action);
    }
    const post = trimValidatedPost(sourcePost, action);
    if (post.id !== postId) {
      return malformedPostList(action);
    }
    return post;
  });

  const optionalString = (key: 'next_post_id' | 'prev_post_id') => {
    const rawValue = value[key];
    return optionalResponseId(rawValue, action, 'PostList');
  };
  const nextPostId = optionalString('next_post_id');
  const previousPostId = optionalString('prev_post_id');
  const hasNext = booleanValue(value.has_next);
  if (value.has_next !== undefined && hasNext === undefined) {
    return malformedPostList(action);
  }

  if (value.matches !== undefined && value.matches !== null && !isRecord(value.matches)) {
    return malformedPostList(action);
  }
  const matchesSource = isRecord(value.matches) ? value.matches : {};
  const matches = Object.fromEntries(
    order.flatMap((postId) => {
      const rawMatches = matchesSource[postId];
      if (rawMatches !== undefined && !Array.isArray(rawMatches)) {
        return malformedPostList(action);
      }
      if (!Array.isArray(rawMatches)) {
        return [];
      }
      const postMatches = rawMatches.slice(0, MAX_MATCHES_PER_POST).map((match) => {
        const selectedMatch = stringValue(match, MAX_MATCH_LENGTH);
        if (selectedMatch === undefined) {
          return malformedPostList(action);
        }
        return selectedMatch;
      });
      return [[postId, postMatches] as const];
    })
  );

  return {
    posts,
    ...(nextPostId !== undefined ? { nextPostId } : {}),
    ...(previousPostId !== undefined ? { previousPostId } : {}),
    ...(hasNext !== undefined ? { hasNext } : {}),
    ...(firstInaccessiblePostTime !== undefined ? { firstInaccessiblePostTime } : {}),
    ...(sourceOrder.length > MAX_LIST_ITEMS ? { truncated: true } : {}),
    ...(includeMatches ? { matches } : {}),
  };
};

const getCurrentUser = async (ctx: ActionContext, action: string) => {
  const response = await request(action, () =>
    ctx.client.get(`${getBaseUrl(ctx)}/api/v4/users/me`)
  );
  return trimValidatedUser(response.data, action);
};

const trimCollection = <T extends { id?: string }>(
  value: unknown,
  trim: (item: unknown) => T,
  key: string,
  action: string
) => {
  if (!Array.isArray(value)) {
    throw new Error(`Mattermost ${action} failed: expected an array response`);
  }
  const items = value;
  const selectedItems = items.slice(0, MAX_LIST_ITEMS).map((item) => {
    if (!isRecord(item)) {
      throw new Error(`Mattermost ${action} failed: response item did not include an ID`);
    }
    const selectedItem = trim(item);
    if (!selectedItem.id) {
      throw new Error(`Mattermost ${action} failed: response item did not include an ID`);
    }
    return selectedItem;
  });
  return {
    [key]: selectedItems,
    ...(items.length > MAX_LIST_ITEMS ? { truncated: true } : {}),
  };
};

export const Mattermost: ConnectorSpec = {
  metadata: {
    id: '.mattermost',
    displayName: 'Mattermost',
    description: i18n.translate('core.kibanaConnectorSpecs.mattermost.metadata.description', {
      defaultMessage:
        'Browse Mattermost content and manage channels, memberships, posts, reactions, and users',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['agentBuilder', 'workflows'],
  },

  auth: {
    types: [
      {
        type: 'bearer',
        isRecommended: true,
        defaults: {},
        overrides: {
          label: i18n.translate('core.kibanaConnectorSpecs.mattermost.auth.bearer.label', {
            defaultMessage: 'Bot access token',
          }),
          meta: {
            token: {
              label: i18n.translate(
                'core.kibanaConnectorSpecs.mattermost.auth.bearer.token.label',
                { defaultMessage: 'Bot access token' }
              ),
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.mattermost.auth.bearer.token.helpText',
                {
                  defaultMessage:
                    'A Mattermost bot account access token. Add the bot to every required team and channel. Reads can require read_channel, read_channel_content, list_team_channels, view_members, and view_team. Grant create_post, create_direct_channel, upload_file, create_public_channel or create_private_channel, join_public_channels or manage_public_channel_members or manage_private_channel_members, delete_public_channel or delete_private_channel, manage_team or sysconsole_write_user_management_channels, delete_post or delete_others_posts, add_reaction, remove_reaction, and edit_other_users only for the actions you enable. createEphemeralPost requires create_post_ephemeral, currently system-admin-only. Deactivating a system administrator and some channel operations also require manage_system.',
                }
              ),
            },
          },
        },
      },
    ],
    headers: {
      Accept: 'application/json',
    },
  },

  schema: MattermostConfigSchema,

  validateUrls: {
    fields: ['serverUrl'],
  },

  skill: `Mattermost is a collaboration platform organized into teams, channels, users, posts, threads, and reactions.

Available read tools:
- listTeams and listChannels discover destinations visible to the connector user.
- findUserByEmail and getUserById resolve selected, non-secret user fields.
- listChannelMembers, searchChannels, and getChannelStats inspect channel membership and state.
- listPosts, getThread, searchPosts, and listReactions gather conversation context.

Workflow-only state changes:
- createDirectChannel, createChannel, addUserToChannel, createPost, createEphemeralPost, and createReaction use write scope.
- deleteChannel, restoreChannel, deletePost, deleteReaction, and deactivateUser use destroy scope.
- deleteChannel, deletePost, and deactivateUser always use Mattermost soft deletion. They never expose permanent deletion.

Recommended flows:
1. Use listTeams, then listChannels or searchChannels, to resolve a channel ID.
2. Use listPosts, getThread, searchPosts, listReactions, or getChannelStats to gather context.
3. In a reviewed workflow, use createPost for a channel message or reply. To message a person directly, use findUserByEmail, createDirectChannel, then createPost.
4. For channel administration, createChannel first, then addUserToChannel. Use deleteChannel only to archive and restoreChannel only for an archived channel.

Search and pagination:
- searchPosts requires view_team and supports Mattermost modifiers such as from:username and in:channel-name. Its pagination needs Mattermost Elasticsearch search.
- searchChannels uses the team-scoped endpoint. Without list_team_channels, a team member sees only joined channels.
- listPosts since mode cannot be combined with page, perPage, before, or after and may return up to 1000 modified posts.
- getThread normally returns empty nextPostId and previousPostId values. When hasNext is true, continue with the last returned reply's id as fromPost and its createAt as fromCreateAt.

Permissions and safety:
- Confirm every target and payload before a workflow-only action. createEphemeralPost is transient, not queryable, and requires create_post_ephemeral, currently system-admin-only.
- Reads can require read_channel, read_channel_content, list_team_channels, view_members, or view_team depending on the resource and caller membership.
- addUserToChannel needs join_public_channels for self-join, manage_public_channel_members for another public-channel user, or manage_private_channel_members for a private channel. Direct and group message channels are rejected.
- createChannel needs create_public_channel or create_private_channel. deleteChannel needs delete_public_channel, delete_private_channel, or manage_system. restoreChannel needs manage_team on the documented REST contract; current handlers can also allow sysconsole_write_user_management_channels.
- createPost needs create_post. Existing fileIds also need upload_file. Priority is root-post-only and needs PostPriority; requestedAck also needs an eligible Professional or Enterprise plan.
- createReaction and deleteReaction always derive the authenticated connector user to prevent reaction impersonation. They need add_reaction and remove_reaction respectively.
- deactivateUser needs self access or edit_other_users; deactivating a system administrator also needs manage_system and revokes sessions.
- createUser is not supported. Never put passwords or other per-run credentials in workflow action inputs.`,

  actions: {
    listTeams: {
      isTool: true,
      scope: 'read',
      description:
        'List teams that the authenticated bot belongs to. Resolves the bot user ID first because the teams endpoint requires a user GUID. Returns selected team identity and timestamp fields.',
      input: EmptyInputSchema,
      handler: async (ctx) => {
        const currentUser = await getCurrentUser(ctx, 'listTeams');
        const response = await request('listTeams', () =>
          ctx.client.get(
            `${getBaseUrl(ctx)}/api/v4/users/${encodeURIComponent(currentUser.id)}/teams`
          )
        );
        return trimCollection(
          response.data,
          (team) => trimValidatedTeam(team, 'listTeams'),
          'teams',
          'listTeams'
        );
      },
    },

    listChannels: {
      isTool: true,
      scope: 'read',
      description:
        'List channels in a team that the authenticated bot can access. Use listTeams first to resolve teamId. Returns selected channel identity, purpose, message count, and timestamp fields.',
      input: ListChannelsInputSchema,
      handler: async (ctx, input: ListChannelsInput) => {
        const currentUser = await getCurrentUser(ctx, 'listChannels');
        const response = await request('listChannels', () =>
          ctx.client.get(
            `${getBaseUrl(ctx)}/api/v4/users/${encodeURIComponent(
              currentUser.id
            )}/teams/${encodeURIComponent(input.teamId)}/channels`
          )
        );
        return trimCollection(
          response.data,
          (channel) => trimValidatedChannel(channel, 'listChannels'),
          'channels',
          'listChannels'
        );
      },
    },

    addUserToChannel: {
      isTool: false,
      scope: 'write',
      description:
        'Add one user to a public or private channel. Adding yourself to a public channel requires join_public_channels; adding another user requires manage_public_channel_members, or manage_private_channel_members for a private channel. Direct and group message channels are not supported. Returns selected membership fields. Workflow-only write action.',
      input: AddUserToChannelInputSchema,
      handler: async (ctx, input: AddUserToChannelInput) => {
        const response = await request('addUserToChannel', () =>
          ctx.client.post(
            `${getBaseUrl(ctx)}/api/v4/channels/${encodeURIComponent(input.channelId)}/members`,
            {
              user_id: input.userId,
              ...(input.postRootId !== undefined ? { post_root_id: input.postRootId } : {}),
            }
          )
        );
        return { member: trimChannelMember(response.data, 'addUserToChannel') };
      },
    },

    createChannel: {
      isTool: false,
      scope: 'write',
      description:
        'Create a public or private channel in one team. Requires create_public_channel or create_private_channel for the target team. Board and Space channel types are not accepted. Returns selected channel fields. Workflow-only write action.',
      input: CreateChannelInputSchema,
      handler: async (ctx, input: CreateChannelInput) => {
        const response = await request('createChannel', () =>
          ctx.client.post(`${getBaseUrl(ctx)}/api/v4/channels`, {
            team_id: input.teamId,
            name: input.name,
            display_name: input.displayName,
            type: input.type,
            ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
            ...(input.header !== undefined ? { header: input.header } : {}),
          })
        );
        return { channel: trimValidatedChannel(response.data, 'createChannel') };
      },
    },

    deleteChannel: {
      isTool: false,
      scope: 'destroy',
      description:
        'Archive a public or private channel with Mattermost soft deletion. This action never requests permanent deletion. Requires delete_public_channel, delete_private_channel, or manage_system. Direct and group message channels cannot be archived. Returns a success marker with the channel ID and permanent false. Workflow-only destructive action.',
      input: ChannelIdInputSchema,
      handler: async (ctx, input: ChannelIdInput) => {
        const response = await request('deleteChannel', () =>
          ctx.client.delete(
            `${getBaseUrl(ctx)}/api/v4/channels/${encodeURIComponent(input.channelId)}`
          )
        );
        assertStatusOk(response.data, 'deleteChannel');
        return { success: true, channelId: input.channelId, permanent: false };
      },
    },

    listChannelMembers: {
      isTool: true,
      scope: 'read',
      description:
        'List one bounded page of members in a channel. Requires read_channel. Mattermost may omit private last-viewed and last-update timestamps for other users.',
      input: ListChannelMembersInputSchema,
      handler: async (ctx, input: ListChannelMembersInput) => {
        const response = await request('listChannelMembers', () =>
          ctx.client.get(
            `${getBaseUrl(ctx)}/api/v4/channels/${encodeURIComponent(input.channelId)}/members`,
            {
              params: {
                page: input.page ?? 0,
                per_page: input.perPage ?? DEFAULT_PER_PAGE,
              },
            }
          )
        );
        if (!Array.isArray(response.data)) {
          throw new Error('Mattermost listChannelMembers failed: expected an array response');
        }
        const members = response.data
          .slice(0, MAX_LIST_ITEMS)
          .map((member) => trimChannelMember(member, 'listChannelMembers'));
        return {
          members,
          ...(response.data.length > MAX_LIST_ITEMS ? { truncated: true } : {}),
        };
      },
    },

    restoreChannel: {
      isTool: false,
      scope: 'destroy',
      description:
        'Restore an archived channel. Requires manage_team according to the REST contract; current servers may also allow sysconsole_write_user_management_channels. Returns selected channel fields. Workflow-only state-changing action.',
      input: ChannelIdInputSchema,
      handler: async (ctx, input: ChannelIdInput) => {
        const response = await request('restoreChannel', () =>
          ctx.client.post(
            `${getBaseUrl(ctx)}/api/v4/channels/${encodeURIComponent(input.channelId)}/restore`
          )
        );
        return { channel: trimValidatedChannel(response.data, 'restoreChannel') };
      },
    },

    searchChannels: {
      isTool: true,
      scope: 'read',
      description:
        'Search visible channels within one team. With list_team_channels, results can include all public team channels; otherwise a team member receives only joined channels. This read action uses the team-scoped POST search endpoint.',
      input: SearchChannelsInputSchema,
      handler: async (ctx, input: SearchChannelsInput) => {
        const response = await request('searchChannels', () =>
          ctx.client.post(
            `${getBaseUrl(ctx)}/api/v4/teams/${encodeURIComponent(input.teamId)}/channels/search`,
            { term: input.term }
          )
        );
        return trimCollection(
          response.data,
          (channel) => trimValidatedChannel(channel, 'searchChannels'),
          'channels',
          'searchChannels'
        );
      },
    },

    getChannelStats: {
      isTool: true,
      scope: 'read',
      description:
        'Get validated member, guest, pinned-post, and file counts for a channel. Requires read_channel.',
      input: ChannelIdInputSchema,
      handler: async (ctx, input: ChannelIdInput) => {
        const response = await request('getChannelStats', () =>
          ctx.client.get(
            `${getBaseUrl(ctx)}/api/v4/channels/${encodeURIComponent(input.channelId)}/stats`
          )
        );
        return { stats: trimChannelStats(response.data, 'getChannelStats') };
      },
    },

    findUserByEmail: {
      isTool: true,
      scope: 'read',
      description:
        'Find one visible Mattermost user by exact email address. Use the returned user ID with createDirectChannel. Availability depends on server email privacy settings.',
      input: FindUserByEmailInputSchema,
      handler: async (ctx, input: FindUserByEmailInput) => {
        const response = await request('findUserByEmail', () =>
          ctx.client.get(`${getBaseUrl(ctx)}/api/v4/users/email/${encodeURIComponent(input.email)}`)
        );
        return { user: trimValidatedUser(response.data, 'findUserByEmail') };
      },
    },

    getUserById: {
      isTool: true,
      scope: 'read',
      description:
        'Get selected fields for one Mattermost user by ID. Requires an active session and permission to see that user; visibility may depend on view_members and team or channel membership. Sensitive authentication fields are never returned.',
      input: UserIdInputSchema,
      handler: async (ctx, input: UserIdInput) => {
        const response = await request('getUserById', () =>
          ctx.client.get(`${getBaseUrl(ctx)}/api/v4/users/${encodeURIComponent(input.userId)}`)
        );
        return { user: trimValidatedUser(response.data, 'getUserById') };
      },
    },

    deactivateUser: {
      isTool: false,
      scope: 'destroy',
      description:
        'Archive a Mattermost user and revoke their sessions. This action never requests permanent deletion. The caller must be that user or have edit_other_users; deactivating a system administrator also requires manage_system. Returns a success marker with the user ID and permanent false. Workflow-only destructive action.',
      input: UserIdInputSchema,
      handler: async (ctx, input: UserIdInput) => {
        const response = await request('deactivateUser', () =>
          ctx.client.delete(`${getBaseUrl(ctx)}/api/v4/users/${encodeURIComponent(input.userId)}`)
        );
        assertStatusOk(response.data, 'deactivateUser');
        return { success: true, userId: input.userId, permanent: false };
      },
    },

    createDirectChannel: {
      isTool: false,
      scope: 'write',
      description:
        'Create or return a direct-message channel between the authenticated bot and one other Mattermost user. The request always contains exactly those two user IDs and requires create_direct_channel. Returns selected channel fields. Workflow-only write action.',
      input: CreateDirectChannelInputSchema,
      handler: async (ctx, input: CreateDirectChannelInput) => {
        const currentUser = await getCurrentUser(ctx, 'createDirectChannel');
        if (currentUser.id === input.userId) {
          throw new Error('Mattermost createDirectChannel requires a user other than the bot');
        }
        const response = await request('createDirectChannel', () =>
          ctx.client.post(`${getBaseUrl(ctx)}/api/v4/channels/direct`, [
            currentUser.id,
            input.userId,
          ])
        );
        return { channel: trimValidatedChannel(response.data, 'createDirectChannel') };
      },
    },

    createPost: {
      isTool: false,
      scope: 'write',
      description:
        'Create a Mattermost root post or thread reply with valid bounded JSON props. Requires create_post; attaching existing fileIds also requires upload_file. Important or urgent priority is available only for root posts with PostPriority enabled, and requestedAck also requires an eligible Professional or Enterprise plan. Supports Mattermost Markdown. Returns selected post fields. Workflow-only write action.',
      input: CreatePostInputSchema,
      handler: async (ctx, input: CreatePostInput) => {
        const body = {
          channel_id: input.channelId,
          message: input.message,
          ...(input.rootId !== undefined ? { root_id: input.rootId } : {}),
          ...(input.fileIds !== undefined ? { file_ids: input.fileIds } : {}),
          ...(input.props !== undefined ? { props: input.props } : {}),
          ...(input.priority !== undefined
            ? {
                metadata: {
                  priority: {
                    priority: input.priority.priority,
                    ...(input.priority.requestedAck !== undefined
                      ? { requested_ack: input.priority.requestedAck }
                      : {}),
                  },
                },
              }
            : {}),
        };
        const response = await request('createPost', () =>
          ctx.client.post(`${getBaseUrl(ctx)}/api/v4/posts`, body)
        );
        return { post: trimValidatedPost(response.data, 'createPost') };
      },
    },

    deletePost: {
      isTool: false,
      scope: 'destroy',
      description:
        "Soft-delete a Mattermost post. This action never requests permanent deletion. Deleting the connector user's own post requires delete_post; deleting another user's post requires delete_others_posts. Returns a success marker with the post ID and permanent false. Workflow-only destructive action.",
      input: PostIdInputSchema,
      handler: async (ctx, input: PostIdInput) => {
        const response = await request('deletePost', () =>
          ctx.client.delete(`${getBaseUrl(ctx)}/api/v4/posts/${encodeURIComponent(input.postId)}`)
        );
        assertStatusOk(response.data, 'deletePost');
        return { success: true, postId: input.postId, permanent: false };
      },
    },

    createEphemeralPost: {
      isTool: false,
      scope: 'write',
      description:
        'Deliver a transient Mattermost post to one user in one channel. The post is sent over WebSocket and is not persisted or queryable. Requires create_post_ephemeral, which current Mattermost servers grant only to system administrators. Returns selected post fields, the target user ID, and persisted false. Workflow-only high-privilege write action.',
      input: CreateEphemeralPostInputSchema,
      handler: async (ctx, input: CreateEphemeralPostInput) => {
        const response = await request('createEphemeralPost', () =>
          ctx.client.post(`${getBaseUrl(ctx)}/api/v4/posts/ephemeral`, {
            user_id: input.userId,
            post: {
              channel_id: input.channelId,
              message: input.message,
            },
          })
        );
        return {
          post: trimValidatedPost(response.data, 'createEphemeralPost'),
          targetUserId: input.userId,
          persisted: false,
        };
      },
    },

    createReaction: {
      isTool: false,
      scope: 'write',
      description:
        'Add a reaction to a post as the authenticated connector user. The user ID is resolved internally because Mattermost forbids reaction impersonation. Requires add_reaction on the post channel. Returns selected reaction fields. Workflow-only write action.',
      input: ReactionInputSchema,
      handler: async (ctx, input: ReactionInput) => {
        const currentUser = await getCurrentUser(ctx, 'createReaction');
        const emojiName = input.emojiName.toLowerCase();
        const response = await request('createReaction', () =>
          ctx.client.post(`${getBaseUrl(ctx)}/api/v4/reactions`, {
            user_id: currentUser.id,
            post_id: input.postId,
            emoji_name: emojiName,
          })
        );
        return { reaction: trimReaction(response.data, 'createReaction') };
      },
    },

    deleteReaction: {
      isTool: false,
      scope: 'destroy',
      description:
        'Remove a reaction made by the authenticated connector user. The user ID is resolved internally, so this action never removes another user reaction. Requires remove_reaction on the post channel. Returns a success marker with the connector user ID, post ID, and emoji name. Workflow-only destructive action.',
      input: ReactionInputSchema,
      handler: async (ctx, input: ReactionInput) => {
        const currentUser = await getCurrentUser(ctx, 'deleteReaction');
        const emojiName = input.emojiName.toLowerCase();
        const response = await request('deleteReaction', () =>
          ctx.client.delete(
            `${getBaseUrl(ctx)}/api/v4/users/${encodeURIComponent(
              currentUser.id
            )}/posts/${encodeURIComponent(input.postId)}/reactions/${encodeURIComponent(emojiName)}`
          )
        );
        assertStatusOk(response.data, 'deleteReaction');
        return {
          success: true,
          userId: currentUser.id,
          postId: input.postId,
          emojiName,
        };
      },
    },

    listReactions: {
      isTool: true,
      scope: 'read',
      description:
        'List selected fields for reactions on a post. Requires permission to read the post and its channel content.',
      input: PostIdInputSchema,
      handler: async (ctx, input: PostIdInput) => {
        const response = await request('listReactions', () =>
          ctx.client.get(
            `${getBaseUrl(ctx)}/api/v4/posts/${encodeURIComponent(input.postId)}/reactions`
          )
        );
        const reactionData = response.data === null ? [] : response.data;
        if (!Array.isArray(reactionData)) {
          throw new Error('Mattermost listReactions failed: expected an array response');
        }
        const reactions = reactionData
          .slice(0, MAX_LIST_ITEMS)
          .map((reaction) => trimReaction(reaction, 'listReactions'));
        return {
          reactions,
          ...(reactionData.length > MAX_LIST_ITEMS ? { truncated: true } : {}),
        };
      },
    },

    listPosts: {
      isTool: true,
      scope: 'read',
      description:
        'List posts in a channel as a selected ordered array. Use page and perPage for bounded pagination, before or after as a post cursor, or since alone for posts modified after a Unix-millisecond timestamp. Since mode may return up to 1000 posts.',
      input: ListPostsInputSchema,
      handler: async (ctx, input: ListPostsInput) => {
        let params: Record<string, number | string>;
        if (input.since !== undefined) {
          params = { since: input.since };
        } else if (input.before !== undefined || input.after !== undefined) {
          params = {
            ...(input.before !== undefined ? { before: input.before } : {}),
            ...(input.after !== undefined ? { after: input.after } : {}),
            ...(input.page !== undefined ? { page: input.page } : {}),
            ...(input.perPage !== undefined ? { per_page: input.perPage } : {}),
          };
        } else {
          params = { page: input.page ?? 0, per_page: input.perPage ?? DEFAULT_PER_PAGE };
        }
        const response = await request('listPosts', () =>
          ctx.client.get(
            `${getBaseUrl(ctx)}/api/v4/channels/${encodeURIComponent(input.channelId)}/posts`,
            { params }
          )
        );
        return trimPostList(response.data, 'listPosts');
      },
    },

    getThread: {
      isTool: true,
      scope: 'read',
      description:
        'Get a bounded page of a Mattermost post thread. When hasNext is true, continue with the last returned reply ID as fromPost and its createAt as fromCreateAt; nextPostId and previousPostId are normally empty. Direction defaults to down.',
      input: GetThreadInputSchema,
      handler: async (ctx, input: GetThreadInput) => {
        const params = {
          perPage: input.perPage ?? DEFAULT_PER_PAGE,
          direction: input.direction ?? 'down',
          ...(input.fromPost !== undefined ? { fromPost: input.fromPost } : {}),
          ...(input.fromCreateAt !== undefined ? { fromCreateAt: input.fromCreateAt } : {}),
        };
        const response = await request('getThread', () =>
          ctx.client.get(
            `${getBaseUrl(ctx)}/api/v4/posts/${encodeURIComponent(input.postId)}/thread`,
            { params }
          )
        );
        return trimPostList(response.data, 'getThread', { allowInaccessibleSentinel: true });
      },
    },

    searchPosts: {
      isTool: true,
      scope: 'read',
      description:
        'Search posts visible to the bot within a team. Requires view_team. Supports Mattermost search modifiers such as from:username and in:channel-name. Page and perPage only take effect when Mattermost Elasticsearch search is configured.',
      input: SearchPostsInputSchema,
      handler: async (ctx, input: SearchPostsInput) => {
        const response = await request('searchPosts', () =>
          ctx.client.post(
            `${getBaseUrl(ctx)}/api/v4/teams/${encodeURIComponent(input.teamId)}/posts/search`,
            {
              terms: input.terms,
              is_or_search: input.isOrSearch ?? false,
              page: input.page ?? 0,
              per_page: input.perPage ?? DEFAULT_PER_PAGE,
            }
          )
        );
        return trimPostList(response.data, 'searchPosts', { includeMatches: true });
      },
    },
  },

  test: {
    enabled: true,
    description: i18n.translate('core.kibanaConnectorSpecs.mattermost.test.description', {
      defaultMessage: 'Verifies the Mattermost connection by retrieving the authenticated bot user',
    }),
    handler: async (ctx) => {
      const currentUser = await getCurrentUser(ctx, 'connection test');
      const identity = currentUser.username ?? currentUser.id;
      return { message: `Connected to Mattermost as ${identity}.` };
    },
  },
};
