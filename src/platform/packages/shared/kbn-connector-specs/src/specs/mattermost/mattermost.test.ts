/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AxiosInstance } from 'axios';
import type { ActionContext } from '../../connector_spec';
import { Mattermost } from './mattermost';
import {
  CreateChannelInputSchema,
  CreateEphemeralPostInputSchema,
  CreatePostInputSchema,
  GetThreadInputSchema,
  ListPostsInputSchema,
  MattermostConfigSchema,
  SearchPostsInputSchema,
} from './types';

const BASE_URL = 'https://chat.example.com';
const CURRENT_USER_ID = 'currentuser000000000000000';
const OTHER_USER_ID = 'otheruser00000000000000000';
const TEAM_ID = 'team0000000000000000000000';
const CHANNEL_ID = 'channel00000000000000000000';
const POST_ID = 'post0000000000000000000000';
const ROOT_POST_ID = 'root0000000000000000000000';
const FILE_ID = 'file0000000000000000000000';
const EMOJI_NAME = 'white_check_mark';

const rawUser = {
  id: CURRENT_USER_ID,
  username: 'elastic-bot',
  email: 'elastic-bot@example.com',
  first_name: 'Elastic',
  last_name: 'Bot',
  nickname: 'workflow bot',
  create_at: 1,
  update_at: 2,
  delete_at: 0,
  roles: 'system_user',
  auth_data: 'must-not-leak',
  password: 'must-not-leak',
};

const rawTeam = {
  id: TEAM_ID,
  display_name: 'Security',
  name: 'security',
  description: 'Security operations',
  email: 'security@example.com',
  type: 'O',
  create_at: 3,
  update_at: 4,
  delete_at: 0,
  invite_id: 'must-not-leak',
};

const rawChannel = {
  id: CHANNEL_ID,
  team_id: TEAM_ID,
  type: 'O',
  display_name: 'Incidents',
  name: 'incidents',
  header: 'Coordinate incidents',
  purpose: 'Incident response',
  last_post_at: 8,
  total_msg_count: 10,
  create_at: 5,
  update_at: 6,
  delete_at: 0,
  creator_id: 'must-not-leak',
};

const rawPost = {
  id: POST_ID,
  create_at: 11,
  update_at: 12,
  delete_at: 0,
  edit_at: 0,
  user_id: CURRENT_USER_ID,
  channel_id: CHANNEL_ID,
  root_id: '',
  original_id: '',
  message: 'Investigating the alert',
  type: '',
  file_ids: [FILE_ID],
  reply_count: 2,
  props: { secret: 'must-not-leak' },
  metadata: { embeds: [{ url: 'must-not-leak' }] },
};

const rawPostList = {
  order: [POST_ID],
  posts: { [POST_ID]: rawPost },
  next_post_id: 'next0000000000000000000000',
  prev_post_id: 'prev0000000000000000000000',
  has_next: true,
};

const rawThreadPostList = {
  ...rawPostList,
  next_post_id: '',
  prev_post_id: '',
};

const rawChannelMember = {
  channel_id: CHANNEL_ID,
  user_id: OTHER_USER_ID,
  roles: 'channel_user',
  last_viewed_at: 13,
  msg_count: 14,
  mention_count: 2,
  mention_count_root: 1,
  urgent_mention_count: 0,
  msg_count_root: 9,
  last_update_at: 15,
  scheme_guest: false,
  scheme_user: true,
  scheme_admin: false,
  explicit_roles: '',
  notify_props: { desktop: 'all', sensitive: 'must-not-leak' },
};

const rawChannelStats = {
  channel_id: CHANNEL_ID,
  member_count: 20,
  guest_count: 2,
  pinnedpost_count: 3,
  files_count: 4,
  sensitive: 'must-not-leak',
};

const rawReaction = {
  user_id: CURRENT_USER_ID,
  post_id: POST_ID,
  emoji_name: EMOJI_NAME,
  create_at: 16,
  update_at: 17,
  delete_at: 0,
  channel_id: CHANNEL_ID,
  remote_id: 'must-not-leak',
};

describe('Mattermost connector', () => {
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  const mockDelete = jest.fn();
  const mockClient = {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  } as unknown as jest.Mocked<AxiosInstance>;
  const mockContext = {
    client: mockClient,
    config: { serverUrl: BASE_URL },
    log: { debug: jest.fn(), error: jest.fn() },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('metadata and configuration', () => {
    it('has the expected metadata and supported features', () => {
      expect(Mattermost.metadata).toMatchObject({
        id: '.mattermost',
        displayName: 'Mattermost',
        minimumLicense: 'enterprise',
        isTechnicalPreview: true,
        supportedFeatureIds: ['agentBuilder', 'workflows'],
      });
    });

    it('uses bearer authentication for the bot token', () => {
      expect(Mattermost.auth?.types).toHaveLength(1);
      expect(Mattermost.auth?.types[0]).toMatchObject({ type: 'bearer', isRecommended: true });
    });

    it('exposes the complete 22-action safe contract and blocks password-based createUser', () => {
      expect(Object.keys(Mattermost.actions)).toEqual([
        'listTeams',
        'listChannels',
        'addUserToChannel',
        'createChannel',
        'deleteChannel',
        'listChannelMembers',
        'restoreChannel',
        'searchChannels',
        'getChannelStats',
        'findUserByEmail',
        'getUserById',
        'deactivateUser',
        'createDirectChannel',
        'createPost',
        'deletePost',
        'createEphemeralPost',
        'createReaction',
        'deleteReaction',
        'listReactions',
        'listPosts',
        'getThread',
        'searchPosts',
      ]);
      expect(Mattermost.actions).not.toHaveProperty('createUser');
      expect(Mattermost.skill).toContain('createUser is not supported');
      expect(Mattermost.skill).toContain(
        'Never put passwords or other per-run credentials in workflow action inputs'
      );
    });

    it('documents conditional write permissions and message-priority requirements', () => {
      const auth = JSON.stringify(Mattermost.auth);
      const createDirectChannel = Mattermost.actions.createDirectChannel.description;
      const createPost = Mattermost.actions.createPost.description;

      expect(auth).toContain('create_post');
      expect(auth).toContain('create_direct_channel');
      expect(auth).toContain('upload_file');
      expect(createDirectChannel).toContain('create_direct_channel');
      expect(createPost).toContain('create_post');
      expect(createPost).toContain('upload_file');
      expect(createPost).toContain('PostPriority');
      expect(createPost).toContain('Professional or Enterprise');
    });

    it('documents permissions and admin requirements for the expanded actions', () => {
      const connectorText = `${JSON.stringify(Mattermost.auth)}\n${Mattermost.skill}`;

      for (const permission of [
        'read_channel',
        'list_team_channels',
        'view_team',
        'create_public_channel',
        'create_private_channel',
        'join_public_channels',
        'manage_public_channel_members',
        'manage_private_channel_members',
        'delete_public_channel',
        'delete_private_channel',
        'manage_team',
        'delete_post',
        'delete_others_posts',
        'create_post_ephemeral',
        'add_reaction',
        'remove_reaction',
        'edit_other_users',
        'manage_system',
      ]) {
        expect(connectorText).toContain(permission);
      }
      expect(connectorText).toContain('system-admin-only');
      expect(Mattermost.actions.searchPosts.description).toContain('view_team');
    });

    it('validates an HTTP or HTTPS Mattermost Site URL with an optional subpath', () => {
      expect(MattermostConfigSchema.safeParse({ serverUrl: BASE_URL }).success).toBe(true);
      expect(
        MattermostConfigSchema.safeParse({ serverUrl: 'http://mattermost.internal:8065' }).success
      ).toBe(true);
      expect(
        MattermostConfigSchema.safeParse({ serverUrl: 'ftp://chat.example.com' }).success
      ).toBe(false);
      expect(
        MattermostConfigSchema.safeParse({ serverUrl: 'https://user:pass@chat.example.com' })
          .success
      ).toBe(false);
      expect(
        MattermostConfigSchema.safeParse({
          serverUrl: 'https://chat.example.com/company/mattermost',
        }).success
      ).toBe(true);
      expect(
        MattermostConfigSchema.safeParse({ serverUrl: 'https://chat.example.com/api/v4' }).success
      ).toBe(false);
    });

    it.each(['not a url', '', '://', 'http://'])(
      'rejects malformed server URL %p without throwing',
      (serverUrl) => {
        expect(() => MattermostConfigSchema.safeParse({ serverUrl })).not.toThrow();
        expect(MattermostConfigSchema.safeParse({ serverUrl }).success).toBe(false);
      }
    );

    it('marks the server URL for allowedHosts validation', () => {
      const { shape } = Mattermost.schema as unknown as {
        shape: Record<string, { meta: () => { validate?: unknown } | undefined }>;
      };
      expect(shape.serverUrl.meta()?.validate).toEqual({ allowedHosts: true });
      expect(Mattermost.validateUrls).toEqual({ fields: ['serverUrl'] });
    });

    it('exposes read actions as tools and keeps write actions workflow-only', () => {
      expect(Mattermost.actions.listTeams).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.listChannels).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.findUserByEmail).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.listPosts).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.getThread).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.searchPosts).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.listChannelMembers).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.searchChannels).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.getChannelStats).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.listReactions).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.getUserById).toMatchObject({ isTool: true, scope: 'read' });
      expect(Mattermost.actions.createDirectChannel).toMatchObject({
        isTool: false,
        scope: 'write',
      });
      expect(Mattermost.actions.createPost).toMatchObject({ isTool: false, scope: 'write' });
      expect(Mattermost.actions.addUserToChannel).toMatchObject({ isTool: false, scope: 'write' });
      expect(Mattermost.actions.createChannel).toMatchObject({ isTool: false, scope: 'write' });
      expect(Mattermost.actions.createEphemeralPost).toMatchObject({
        isTool: false,
        scope: 'write',
      });
      expect(Mattermost.actions.createReaction).toMatchObject({ isTool: false, scope: 'write' });
      expect(Mattermost.actions.deleteChannel).toMatchObject({ isTool: false, scope: 'destroy' });
      expect(Mattermost.actions.restoreChannel).toMatchObject({ isTool: false, scope: 'destroy' });
      expect(Mattermost.actions.deletePost).toMatchObject({ isTool: false, scope: 'destroy' });
      expect(Mattermost.actions.deleteReaction).toMatchObject({ isTool: false, scope: 'destroy' });
      expect(Mattermost.actions.deactivateUser).toMatchObject({ isTool: false, scope: 'destroy' });
    });
  });

  describe('input bounds', () => {
    it('uses Mattermost Unicode rune limits for channel display fields', () => {
      const validInput = {
        teamId: TEAM_ID,
        name: 'incident-room',
        displayName: '🚀'.repeat(64),
        purpose: '🚀'.repeat(250),
        header: '🚀'.repeat(1024),
        type: 'O' as const,
      };

      expect(CreateChannelInputSchema.safeParse(validInput).success).toBe(true);
      expect(
        CreateChannelInputSchema.safeParse({
          ...validInput,
          displayName: '🚀'.repeat(65),
        }).success
      ).toBe(false);
      expect(
        CreateChannelInputSchema.safeParse({
          ...validInput,
          purpose: '🚀'.repeat(251),
        }).success
      ).toBe(false);
      expect(
        CreateChannelInputSchema.safeParse({
          ...validInput,
          header: '🚀'.repeat(1025),
        }).success
      ).toBe(false);
    });

    it('uses the Mattermost Unicode rune limit for post messages', () => {
      const validMessage = '🚀'.repeat(16_383);
      const invalidMessage = '🚀'.repeat(16_384);

      expect(
        CreatePostInputSchema.safeParse({ channelId: CHANNEL_ID, message: validMessage }).success
      ).toBe(true);
      expect(
        CreateEphemeralPostInputSchema.safeParse({
          userId: OTHER_USER_ID,
          channelId: CHANNEL_ID,
          message: validMessage,
        }).success
      ).toBe(true);
      expect(
        CreatePostInputSchema.safeParse({ channelId: CHANNEL_ID, message: invalidMessage }).success
      ).toBe(false);
      expect(
        CreateEphemeralPostInputSchema.safeParse({
          userId: OTHER_USER_ID,
          channelId: CHANNEL_ID,
          message: invalidMessage,
        }).success
      ).toBe(false);
    });

    it('limits posts to the five file IDs allowed by Mattermost', () => {
      expect(
        CreatePostInputSchema.safeParse({
          channelId: CHANNEL_ID,
          message: 'message',
          fileIds: Array.from({ length: 5 }, (_, index) => `${index}`.padEnd(26, 'a')),
        }).success
      ).toBe(true);
      expect(
        CreatePostInputSchema.safeParse({
          channelId: CHANNEL_ID,
          message: 'message',
          fileIds: Array.from({ length: 6 }, (_, index) => `${index}`.padEnd(26, 'a')),
        }).success
      ).toBe(false);
    });

    it('rejects priority metadata on thread replies', () => {
      expect(
        CreatePostInputSchema.safeParse({
          channelId: CHANNEL_ID,
          message: 'reply',
          rootId: ROOT_POST_ID,
          priority: { priority: 'important', requestedAck: false },
        }).success
      ).toBe(false);
      expect(
        CreatePostInputSchema.safeParse({
          channelId: CHANNEL_ID,
          message: 'root post',
          priority: { priority: 'important', requestedAck: false },
        }).success
      ).toBe(true);
    });

    it('rejects non-JSON props without throwing', () => {
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      const unsupportedProps = [
        { value: BigInt(1) },
        cyclic,
        { callback: () => undefined },
        { missing: undefined },
        { notANumber: Number.NaN },
      ];

      for (const props of unsupportedProps) {
        const parse = () =>
          CreatePostInputSchema.safeParse({
            channelId: CHANNEL_ID,
            message: 'message',
            props,
          });
        expect(parse).not.toThrow();
        expect(parse().success).toBe(false);
      }
    });

    it('accepts bounded nested JSON props and rejects an oversized object', () => {
      expect(
        CreatePostInputSchema.safeParse({
          channelId: CHANNEL_ID,
          message: 'message',
          props: { nested: ['value', 4, true, null] },
        }).success
      ).toBe(true);
      expect(
        CreatePostInputSchema.safeParse({
          channelId: CHANNEL_ID,
          message: 'message',
          props: { value: 'x'.repeat(20_000) },
        }).success
      ).toBe(false);
    });

    it('rejects page parameters when since is supplied', () => {
      expect(
        ListPostsInputSchema.safeParse({ channelId: CHANNEL_ID, since: 1735689600000 }).success
      ).toBe(true);
      expect(
        ListPostsInputSchema.safeParse({
          channelId: CHANNEL_ID,
          since: 1735689600000,
          page: 1,
        }).success
      ).toBe(false);
      expect(
        ListPostsInputSchema.safeParse({
          channelId: CHANNEL_ID,
          since: 1735689600000,
          perPage: 100,
        }).success
      ).toBe(false);
      expect(
        ListPostsInputSchema.safeParse({
          channelId: CHANNEL_ID,
          since: 1735689600000,
          before: POST_ID,
        }).success
      ).toBe(false);
      expect(
        ListPostsInputSchema.safeParse({
          channelId: CHANNEL_ID,
          before: POST_ID,
          after: ROOT_POST_ID,
        }).success
      ).toBe(false);
    });

    it('bounds list and search page sizes at the Mattermost maximum of 200', () => {
      expect(ListPostsInputSchema.safeParse({ channelId: CHANNEL_ID, perPage: 200 }).success).toBe(
        true
      );
      expect(ListPostsInputSchema.safeParse({ channelId: CHANNEL_ID, perPage: 201 }).success).toBe(
        false
      );
      expect(
        SearchPostsInputSchema.safeParse({ teamId: TEAM_ID, terms: 'alert', perPage: 201 }).success
      ).toBe(false);
    });

    it('bounds thread pages and requires a creation timestamp with a post cursor', () => {
      expect(GetThreadInputSchema.safeParse({ postId: POST_ID, perPage: 200 }).success).toBe(true);
      expect(GetThreadInputSchema.safeParse({ postId: POST_ID, perPage: 201 }).success).toBe(false);
      expect(
        GetThreadInputSchema.safeParse({ postId: POST_ID, fromPost: ROOT_POST_ID }).success
      ).toBe(false);
      expect(GetThreadInputSchema.safeParse({ postId: POST_ID, direction: 'down' }).success).toBe(
        true
      );
      expect(GetThreadInputSchema.parse({ postId: POST_ID }).direction).toBe('down');
      expect(
        GetThreadInputSchema.safeParse({
          postId: POST_ID,
          fromPost: ROOT_POST_ID,
          fromCreateAt: 1735689600000,
        }).success
      ).toBe(true);
      expect(
        GetThreadInputSchema.safeParse({
          postId: POST_ID,
          fromCreateAt: Number.MAX_SAFE_INTEGER + 1,
        }).success
      ).toBe(false);
    });

    it('bounds channel creation and member paging inputs', () => {
      expect(
        Mattermost.actions.createChannel.input.safeParse({
          teamId: TEAM_ID,
          name: 'incident-response',
          displayName: 'Incident response',
          type: 'O',
          purpose: 'Coordinate incident response',
          header: 'Follow the response runbook',
        }).success
      ).toBe(true);
      expect(
        Mattermost.actions.createChannel.input.safeParse({
          teamId: TEAM_ID,
          name: 'Invalid Name',
          displayName: 'Incident response',
          type: 'O',
        }).success
      ).toBe(false);
      for (const name of ['-incidents', '_incidents']) {
        expect(
          Mattermost.actions.createChannel.input.safeParse({
            teamId: TEAM_ID,
            name,
            displayName: 'Incident response',
            type: 'O',
          }).success
        ).toBe(false);
      }
      expect(
        Mattermost.actions.createChannel.input.safeParse({
          teamId: TEAM_ID,
          name: 'incidents',
          displayName: 'x'.repeat(65),
          type: 'O',
        }).success
      ).toBe(false);
      expect(
        Mattermost.actions.listChannelMembers.input.safeParse({
          channelId: CHANNEL_ID,
          page: 0,
          perPage: 200,
        }).success
      ).toBe(true);
      expect(
        Mattermost.actions.listChannelMembers.input.safeParse({
          channelId: CHANNEL_ID,
          page: 0,
          perPage: 201,
        }).success
      ).toBe(false);
    });

    it('bounds ephemeral messages and validates reaction emoji names', () => {
      expect(
        Mattermost.actions.createEphemeralPost.input.safeParse({
          userId: OTHER_USER_ID,
          channelId: CHANNEL_ID,
          message: 'Transient notice',
        }).success
      ).toBe(true);
      expect(
        Mattermost.actions.createEphemeralPost.input.safeParse({
          userId: OTHER_USER_ID,
          channelId: CHANNEL_ID,
          message: 'x'.repeat(16_384),
        }).success
      ).toBe(false);
      expect(
        Mattermost.actions.createReaction.input.safeParse({
          postId: POST_ID,
          emojiName: 'Thumbs+Up',
        }).success
      ).toBe(true);
      expect(
        Mattermost.actions.createReaction.input.safeParse({
          postId: POST_ID,
          emojiName: 'not valid',
        }).success
      ).toBe(false);
      expect(
        Mattermost.actions.createReaction.input.safeParse({
          postId: POST_ID,
          emojiName: 'a'.repeat(65),
        }).success
      ).toBe(false);
      expect(
        Mattermost.actions.createReaction.input.safeParse({
          postId: POST_ID,
          emojiName: EMOJI_NAME,
          userId: OTHER_USER_ID,
        }).success
      ).toBe(false);
    });
  });

  describe('channel administration actions', () => {
    it('adds one user to a channel with an optional root post and trims the member', async () => {
      mockPost.mockResolvedValue({ data: rawChannelMember, status: 201 });

      const result = await Mattermost.actions.addUserToChannel.handler(mockContext, {
        channelId: 'channel/id',
        userId: OTHER_USER_ID,
        postRootId: ROOT_POST_ID,
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/channel%2Fid/members`, {
        user_id: OTHER_USER_ID,
        post_root_id: ROOT_POST_ID,
      });
      expect(result).toEqual({
        member: {
          channelId: CHANNEL_ID,
          userId: OTHER_USER_ID,
          roles: 'channel_user',
          lastViewedAt: 13,
          messageCount: 14,
          mentionCount: 2,
          rootMentionCount: 1,
          urgentMentionCount: 0,
          rootMessageCount: 9,
          lastUpdateAt: 15,
          schemeGuest: false,
          schemeUser: true,
          schemeAdmin: false,
          explicitRoles: '',
        },
      });
    });

    it('accepts the Mattermost -1 sentinel only for channel member view timestamps', async () => {
      const unviewedMember = { ...rawChannelMember, last_viewed_at: -1, last_update_at: -1 };
      mockPost.mockResolvedValue({ data: unviewedMember, status: 201 });

      const added = await Mattermost.actions.addUserToChannel.handler(mockContext, {
        channelId: CHANNEL_ID,
        userId: OTHER_USER_ID,
      });

      expect(added.member).toEqual(expect.objectContaining({ lastViewedAt: -1, lastUpdateAt: -1 }));

      mockGet.mockResolvedValue({ data: [unviewedMember], status: 200 });
      const listed = await Mattermost.actions.listChannelMembers.handler(mockContext, {
        channelId: CHANNEL_ID,
      });
      expect(listed.members).toEqual([
        expect.objectContaining({ lastViewedAt: -1, lastUpdateAt: -1 }),
      ]);

      mockPost.mockResolvedValue({
        data: { ...unviewedMember, msg_count: -1 },
        status: 201,
      });
      await expect(
        Mattermost.actions.addUserToChannel.handler(mockContext, {
          channelId: CHANNEL_ID,
          userId: OTHER_USER_ID,
        })
      ).rejects.toThrow('malformed ChannelMember response');
    });

    it('creates only public or private channels with exact Mattermost field names', async () => {
      mockPost.mockResolvedValue({ data: rawChannel, status: 201 });

      const result = await Mattermost.actions.createChannel.handler(mockContext, {
        teamId: TEAM_ID,
        name: 'incidents',
        displayName: 'Incidents',
        type: 'O',
        purpose: 'Incident response',
        header: 'Coordinate incidents',
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels`, {
        team_id: TEAM_ID,
        name: 'incidents',
        display_name: 'Incidents',
        type: 'O',
        purpose: 'Incident response',
        header: 'Coordinate incidents',
      });
      expect(result).toEqual({ channel: expect.objectContaining({ id: CHANNEL_ID, type: 'O' }) });
    });

    it('archives a channel without a permanent query parameter', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'OK' }, status: 200 });

      const result = await Mattermost.actions.deleteChannel.handler(mockContext, {
        channelId: 'channel/id',
      });

      expect(mockDelete).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/channel%2Fid`);
      expect(result).toEqual({ success: true, channelId: 'channel/id', permanent: false });
    });

    it('lists a bounded page of channel members with wire paging names', async () => {
      mockGet.mockResolvedValue({ data: [rawChannelMember], status: 200 });

      const result = await Mattermost.actions.listChannelMembers.handler(mockContext, {
        channelId: CHANNEL_ID,
        page: 2,
        perPage: 100,
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/${CHANNEL_ID}/members`, {
        params: { page: 2, per_page: 100 },
      });
      expect(result).toEqual({
        members: [expect.objectContaining({ channelId: CHANNEL_ID, userId: OTHER_USER_ID })],
      });
    });

    it('restores an archived channel with no request body', async () => {
      mockPost.mockResolvedValue({ data: { ...rawChannel, delete_at: 0 }, status: 200 });

      const result = await Mattermost.actions.restoreChannel.handler(mockContext, {
        channelId: 'channel/id',
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/channel%2Fid/restore`);
      expect(result).toEqual({ channel: expect.objectContaining({ id: CHANNEL_ID, deleteAt: 0 }) });
    });

    it('searches only within one encoded team and treats the POST as read', async () => {
      mockPost.mockResolvedValue({ data: [rawChannel], status: 200 });

      const result = await Mattermost.actions.searchChannels.handler(mockContext, {
        teamId: 'team/id',
        term: 'incidents',
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/teams/team%2Fid/channels/search`, {
        term: 'incidents',
      });
      expect(result).toEqual({ channels: [expect.objectContaining({ id: CHANNEL_ID })] });
    });

    it('returns validated nonnegative channel statistics', async () => {
      mockGet.mockResolvedValue({ data: rawChannelStats, status: 200 });

      const result = await Mattermost.actions.getChannelStats.handler(mockContext, {
        channelId: CHANNEL_ID,
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/${CHANNEL_ID}/stats`);
      expect(result).toEqual({
        stats: {
          channelId: CHANNEL_ID,
          memberCount: 20,
          guestCount: 2,
          pinnedPostCount: 3,
          fileCount: 4,
        },
      });
    });

    it.each([
      [
        'members',
        () => Mattermost.actions.listChannelMembers.handler(mockContext, { channelId: CHANNEL_ID }),
      ],
      [
        'search',
        () =>
          Mattermost.actions.searchChannels.handler(mockContext, {
            teamId: TEAM_ID,
            term: 'incidents',
          }),
      ],
    ])('rejects a non-array successful %s response', async (_name, execute) => {
      mockGet.mockResolvedValue({ data: { members: [rawChannelMember] }, status: 200 });
      mockPost.mockResolvedValue({ data: { channels: [rawChannel] }, status: 200 });

      await expect(execute()).rejects.toThrow('expected an array response');
    });

    it('rejects malformed successful member, status, and statistics responses', async () => {
      mockPost.mockResolvedValueOnce({
        data: { ...rawChannelMember, scheme_user: 'yes' },
        status: 201,
      });
      await expect(
        Mattermost.actions.addUserToChannel.handler(mockContext, {
          channelId: CHANNEL_ID,
          userId: OTHER_USER_ID,
        })
      ).rejects.toThrow('malformed ChannelMember response');

      mockDelete.mockResolvedValueOnce({ data: { status: 'deleted' }, status: 200 });
      await expect(
        Mattermost.actions.deleteChannel.handler(mockContext, { channelId: CHANNEL_ID })
      ).rejects.toThrow('malformed status response');

      mockDelete.mockResolvedValueOnce({ data: { status: 'ok'.repeat(10_000) }, status: 200 });
      await expect(
        Mattermost.actions.deleteChannel.handler(mockContext, { channelId: CHANNEL_ID })
      ).rejects.toThrow('malformed status response');

      mockGet.mockResolvedValueOnce({
        data: { ...rawChannelStats, member_count: -1 },
        status: 200,
      });
      await expect(
        Mattermost.actions.getChannelStats.handler(mockContext, { channelId: CHANNEL_ID })
      ).rejects.toThrow('malformed ChannelStats response');
    });
  });

  describe('listTeams', () => {
    it('resolves the current user GUID before requesting teams and trims output', async () => {
      mockGet.mockResolvedValueOnce({ data: rawUser }).mockResolvedValueOnce({ data: [rawTeam] });

      const result = await Mattermost.actions.listTeams.handler(mockContext, {});

      expect(mockGet).toHaveBeenNthCalledWith(1, `${BASE_URL}/api/v4/users/me`);
      expect(mockGet).toHaveBeenNthCalledWith(
        2,
        `${BASE_URL}/api/v4/users/${CURRENT_USER_ID}/teams`
      );
      expect(result).toEqual({
        teams: [
          {
            id: TEAM_ID,
            displayName: 'Security',
            name: 'security',
            description: 'Security operations',
            type: 'O',
            createAt: 3,
            updateAt: 4,
            deleteAt: 0,
          },
        ],
      });
    });

    it('bounds selected text fields returned by the Mattermost server', async () => {
      mockGet
        .mockResolvedValueOnce({ data: rawUser })
        .mockResolvedValueOnce({ data: [{ ...rawTeam, description: 'x'.repeat(5000) }] });

      const result = await Mattermost.actions.listTeams.handler(mockContext, {});

      expect(result.teams[0].description).toHaveLength(4096);
    });

    it('rejects a non-array successful teams response', async () => {
      mockGet
        .mockResolvedValueOnce({ data: rawUser })
        .mockResolvedValueOnce({ data: { teams: [rawTeam] }, status: 200 });

      await expect(Mattermost.actions.listTeams.handler(mockContext, {})).rejects.toThrow(
        'Mattermost listTeams failed: expected an array response'
      );
    });

    it('rejects malformed current-user and team objects on successful responses', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { ...rawUser, id: 'x'.repeat(201) }, status: 200 })
        .mockResolvedValueOnce({ data: [], status: 200 });
      await expect(Mattermost.actions.listTeams.handler(mockContext, {})).rejects.toThrow(
        'malformed User response'
      );

      mockGet.mockReset();
      mockGet
        .mockResolvedValueOnce({ data: rawUser, status: 200 })
        .mockResolvedValueOnce({ data: [{ ...rawTeam, type: 42 }], status: 200 });
      await expect(Mattermost.actions.listTeams.handler(mockContext, {})).rejects.toThrow(
        'malformed Team response'
      );
    });
  });

  describe('listChannels', () => {
    it('uses the resolved current user GUID and encodes the team ID', async () => {
      const teamId = 'team/id';
      mockGet
        .mockResolvedValueOnce({ data: rawUser })
        .mockResolvedValueOnce({ data: [rawChannel] });

      const result = await Mattermost.actions.listChannels.handler(mockContext, { teamId });

      expect(mockGet).toHaveBeenNthCalledWith(1, `${BASE_URL}/api/v4/users/me`);
      expect(mockGet).toHaveBeenNthCalledWith(
        2,
        `${BASE_URL}/api/v4/users/${CURRENT_USER_ID}/teams/team%2Fid/channels`
      );
      expect(result).toEqual({
        channels: [
          {
            id: CHANNEL_ID,
            teamId: TEAM_ID,
            type: 'O',
            displayName: 'Incidents',
            name: 'incidents',
            header: 'Coordinate incidents',
            purpose: 'Incident response',
            lastPostAt: 8,
            totalMessageCount: 10,
            createAt: 5,
            updateAt: 6,
            deleteAt: 0,
          },
        ],
      });
    });

    it('rejects a non-array successful channels response', async () => {
      mockGet
        .mockResolvedValueOnce({ data: rawUser })
        .mockResolvedValueOnce({ data: { channels: [rawChannel] }, status: 200 });

      await expect(
        Mattermost.actions.listChannels.handler(mockContext, { teamId: TEAM_ID })
      ).rejects.toThrow('Mattermost listChannels failed: expected an array response');
    });

    it('rejects a malformed channel object on a successful response', async () => {
      mockGet
        .mockResolvedValueOnce({ data: rawUser, status: 200 })
        .mockResolvedValueOnce({ data: [{ ...rawChannel, type: 42 }], status: 200 });

      await expect(
        Mattermost.actions.listChannels.handler(mockContext, { teamId: TEAM_ID })
      ).rejects.toThrow('malformed Channel response');
    });
  });

  describe('findUserByEmail', () => {
    it('encodes the email path segment once and removes sensitive profile fields', async () => {
      mockGet.mockResolvedValue({ data: rawUser });

      const result = await Mattermost.actions.findUserByEmail.handler(mockContext, {
        email: 'analyst+soc@example.com',
      });

      expect(mockGet).toHaveBeenCalledWith(
        `${BASE_URL}/api/v4/users/email/analyst%2Bsoc%40example.com`
      );
      expect(result).toEqual({
        user: {
          id: CURRENT_USER_ID,
          username: 'elastic-bot',
          email: 'elastic-bot@example.com',
          firstName: 'Elastic',
          lastName: 'Bot',
          nickname: 'workflow bot',
          createAt: 1,
          updateAt: 2,
          deleteAt: 0,
        },
      });
    });

    it('rejects a successful user response without an ID', async () => {
      mockGet.mockResolvedValue({ data: { username: 'missing-id' }, status: 200 });

      await expect(
        Mattermost.actions.findUserByEmail.handler(mockContext, {
          email: 'analyst@example.com',
        })
      ).rejects.toThrow('Mattermost findUserByEmail failed: malformed User response');
    });

    it('rejects malformed selected user fields on a successful response', async () => {
      mockGet.mockResolvedValue({ data: { ...rawUser, email: 42 }, status: 200 });

      await expect(
        Mattermost.actions.findUserByEmail.handler(mockContext, {
          email: 'analyst@example.com',
        })
      ).rejects.toThrow('malformed User response');
    });
  });

  describe('user actions', () => {
    it('gets one visible user by an encoded ID and returns selected profile fields', async () => {
      mockGet.mockResolvedValue({ data: { ...rawUser, id: OTHER_USER_ID }, status: 200 });

      const result = await Mattermost.actions.getUserById.handler(mockContext, {
        userId: 'user/id',
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/users/user%2Fid`);
      expect(result).toEqual({
        user: {
          id: OTHER_USER_ID,
          username: 'elastic-bot',
          email: 'elastic-bot@example.com',
          firstName: 'Elastic',
          lastName: 'Bot',
          nickname: 'workflow bot',
          createAt: 1,
          updateAt: 2,
          deleteAt: 0,
        },
      });
      expect(result.user).not.toHaveProperty('roles');
      expect(result.user).not.toHaveProperty('auth_data');
      expect(result.user).not.toHaveProperty('password');
    });

    it('deactivates a user without a permanent query parameter', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'OK' }, status: 200 });

      const result = await Mattermost.actions.deactivateUser.handler(mockContext, {
        userId: 'user/id',
      });

      expect(mockDelete).toHaveBeenCalledWith(`${BASE_URL}/api/v4/users/user%2Fid`);
      expect(result).toEqual({ success: true, userId: 'user/id', permanent: false });
    });

    it('rejects malformed successful user and deactivation responses', async () => {
      mockGet.mockResolvedValueOnce({ data: { ...rawUser, id: 42 }, status: 200 });
      await expect(
        Mattermost.actions.getUserById.handler(mockContext, { userId: OTHER_USER_ID })
      ).rejects.toThrow('malformed User response');

      mockDelete.mockResolvedValueOnce({ data: {}, status: 200 });
      await expect(
        Mattermost.actions.deactivateUser.handler(mockContext, { userId: OTHER_USER_ID })
      ).rejects.toThrow('malformed status response');
    });
  });

  describe('createDirectChannel', () => {
    it('posts a bare two-ID array containing the current and other users', async () => {
      mockGet.mockResolvedValue({ data: rawUser });
      mockPost.mockResolvedValue({ data: { ...rawChannel, type: 'D', team_id: '' }, status: 201 });

      const result = await Mattermost.actions.createDirectChannel.handler(mockContext, {
        userId: OTHER_USER_ID,
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/users/me`);
      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/direct`, [
        CURRENT_USER_ID,
        OTHER_USER_ID,
      ]);
      expect(result).toEqual({
        channel: expect.objectContaining({ id: CHANNEL_ID, type: 'D' }),
      });
    });

    it('rejects a successful direct-channel response without an ID', async () => {
      mockGet.mockResolvedValue({ data: rawUser });
      mockPost.mockResolvedValue({ data: { type: 'D' }, status: 201 });

      await expect(
        Mattermost.actions.createDirectChannel.handler(mockContext, { userId: OTHER_USER_ID })
      ).rejects.toThrow('Mattermost createDirectChannel failed: malformed Channel response');
    });

    it('rejects malformed selected direct-channel fields on a successful response', async () => {
      mockGet.mockResolvedValue({ data: rawUser, status: 200 });
      mockPost.mockResolvedValue({ data: { ...rawChannel, team_id: 42 }, status: 201 });

      await expect(
        Mattermost.actions.createDirectChannel.handler(mockContext, { userId: OTHER_USER_ID })
      ).rejects.toThrow('malformed Channel response');
    });
  });

  describe('createPost', () => {
    it('sends required and optional fields with Mattermost wire names', async () => {
      const responseFileIds = Array.from({ length: 6 }, (_, index) => `${index}`.padEnd(26, 'f'));
      mockPost.mockResolvedValue({
        data: { ...rawPost, file_ids: responseFileIds },
        status: 201,
      });

      const result = await Mattermost.actions.createPost.handler(mockContext, {
        channelId: CHANNEL_ID,
        message: 'Investigating the alert',
        rootId: ROOT_POST_ID,
        fileIds: [FILE_ID],
        props: { source: 'elastic', severity: 4, acknowledged: false },
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts`, {
        channel_id: CHANNEL_ID,
        message: 'Investigating the alert',
        root_id: ROOT_POST_ID,
        file_ids: [FILE_ID],
        props: { source: 'elastic', severity: 4, acknowledged: false },
      });
      expect(result).toEqual({
        post: {
          id: POST_ID,
          createAt: 11,
          updateAt: 12,
          deleteAt: 0,
          editAt: 0,
          userId: CURRENT_USER_ID,
          channelId: CHANNEL_ID,
          rootId: '',
          originalId: '',
          message: 'Investigating the alert',
          type: '',
          fileIds: responseFileIds.slice(0, 5),
          replyCount: 2,
        },
      });
    });

    it('sends priority metadata only on a root post and preserves false', async () => {
      mockPost.mockResolvedValue({ data: rawPost, status: 201 });

      await Mattermost.actions.createPost.handler(mockContext, {
        channelId: CHANNEL_ID,
        message: 'Investigating the alert',
        priority: { priority: 'urgent', requestedAck: false },
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts`, {
        channel_id: CHANNEL_ID,
        message: 'Investigating the alert',
        metadata: {
          priority: {
            priority: 'urgent',
            requested_ack: false,
          },
        },
      });
    });

    it('omits optional fields rather than sending undefined values', async () => {
      mockPost.mockResolvedValue({ data: rawPost, status: 201 });

      await Mattermost.actions.createPost.handler(mockContext, {
        channelId: CHANNEL_ID,
        message: 'Investigating',
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts`, {
        channel_id: CHANNEL_ID,
        message: 'Investigating',
      });
    });

    it('rejects a successful post response without an ID', async () => {
      mockPost.mockResolvedValue({ data: { message: 'missing id' }, status: 201 });

      await expect(
        Mattermost.actions.createPost.handler(mockContext, {
          channelId: CHANNEL_ID,
          message: 'Investigating',
        })
      ).rejects.toThrow('Mattermost createPost failed: malformed Post response');
    });

    it('rejects malformed selected post fields on a successful response', async () => {
      mockPost.mockResolvedValue({ data: { ...rawPost, channel_id: 42 }, status: 201 });

      await expect(
        Mattermost.actions.createPost.handler(mockContext, {
          channelId: CHANNEL_ID,
          message: 'Investigating',
        })
      ).rejects.toThrow('malformed Post response');
    });

    it('bounds returned post messages without splitting Unicode code points', async () => {
      mockPost.mockResolvedValue({
        data: { ...rawPost, message: '🚀'.repeat(16_384) },
        status: 201,
      });

      const result = await Mattermost.actions.createPost.handler(mockContext, {
        channelId: CHANNEL_ID,
        message: 'Investigating',
      });

      expect(result.post.message).toBe('🚀'.repeat(16_383));
    });

    it('rejects an oversized optional post ID on a successful response', async () => {
      mockPost.mockResolvedValue({
        data: { ...rawPost, root_id: 'x'.repeat(201) },
        status: 201,
      });

      await expect(
        Mattermost.actions.createPost.handler(mockContext, {
          channelId: CHANNEL_ID,
          message: 'Investigating',
        })
      ).rejects.toThrow('Mattermost createPost failed: malformed Post response');
    });
  });

  describe('post and reaction actions', () => {
    it('soft-deletes a post without a permanent query parameter', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'ok' }, status: 200 });

      const result = await Mattermost.actions.deletePost.handler(mockContext, {
        postId: 'post/id',
      });

      expect(mockDelete).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts/post%2Fid`);
      expect(result).toEqual({ success: true, postId: 'post/id', permanent: false });
    });

    it('creates a transient ephemeral post for one target user', async () => {
      mockPost.mockResolvedValue({ data: rawPost, status: 201 });

      const result = await Mattermost.actions.createEphemeralPost.handler(mockContext, {
        userId: OTHER_USER_ID,
        channelId: CHANNEL_ID,
        message: 'Transient notice',
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts/ephemeral`, {
        user_id: OTHER_USER_ID,
        post: { channel_id: CHANNEL_ID, message: 'Transient notice' },
      });
      expect(result).toEqual({
        post: expect.objectContaining({ id: POST_ID, channelId: CHANNEL_ID }),
        targetUserId: OTHER_USER_ID,
        persisted: false,
      });
      expect(result.post).not.toHaveProperty('props');
    });

    it('accepts null file IDs in a successful ephemeral post response', async () => {
      mockPost.mockResolvedValue({ data: { ...rawPost, file_ids: null }, status: 201 });

      const result = await Mattermost.actions.createEphemeralPost.handler(mockContext, {
        userId: OTHER_USER_ID,
        channelId: CHANNEL_ID,
        message: 'Transient notice',
      });

      expect(result.post).toEqual(
        expect.objectContaining({ id: POST_ID, channelId: CHANNEL_ID, fileIds: undefined })
      );
    });

    it('creates a reaction only as the authenticated connector user', async () => {
      mockGet.mockResolvedValue({ data: rawUser, status: 200 });
      mockPost.mockResolvedValue({ data: rawReaction, status: 200 });

      const result = await Mattermost.actions.createReaction.handler(mockContext, {
        postId: POST_ID,
        emojiName: 'WHITE_CHECK_MARK',
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/users/me`);
      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/reactions`, {
        user_id: CURRENT_USER_ID,
        post_id: POST_ID,
        emoji_name: EMOJI_NAME,
      });
      expect(result).toEqual({
        reaction: {
          userId: CURRENT_USER_ID,
          postId: POST_ID,
          emojiName: EMOJI_NAME,
          createAt: 16,
        },
      });
    });

    it('deletes only the authenticated connector user reaction and encodes the emoji', async () => {
      mockGet.mockResolvedValue({ data: rawUser, status: 200 });
      mockDelete.mockResolvedValue({ data: { status: 'OK' }, status: 200 });

      const result = await Mattermost.actions.deleteReaction.handler(mockContext, {
        postId: 'post/id',
        emojiName: 'Thumbs+Up',
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/users/me`);
      expect(mockDelete).toHaveBeenCalledWith(
        `${BASE_URL}/api/v4/users/${CURRENT_USER_ID}/posts/post%2Fid/reactions/thumbs%2Bup`
      );
      expect(result).toEqual({
        success: true,
        userId: CURRENT_USER_ID,
        postId: 'post/id',
        emojiName: 'thumbs+up',
      });
    });

    it('lists a bounded collection of selected reaction fields', async () => {
      mockGet.mockResolvedValue({ data: [rawReaction], status: 200 });

      const result = await Mattermost.actions.listReactions.handler(mockContext, {
        postId: 'post/id',
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts/post%2Fid/reactions`);
      expect(result).toEqual({
        reactions: [
          {
            userId: CURRENT_USER_ID,
            postId: POST_ID,
            emojiName: EMOJI_NAME,
            createAt: 16,
          },
        ],
      });
    });

    it('normalizes a null reaction collection to an empty array', async () => {
      mockGet.mockResolvedValue({ data: null, status: 200 });

      await expect(
        Mattermost.actions.listReactions.handler(mockContext, { postId: POST_ID })
      ).resolves.toEqual({ reactions: [] });
    });

    it('rejects malformed successful post, reaction, status, and collection responses', async () => {
      mockPost.mockResolvedValueOnce({ data: { ...rawPost, channel_id: 42 }, status: 201 });
      await expect(
        Mattermost.actions.createEphemeralPost.handler(mockContext, {
          userId: OTHER_USER_ID,
          channelId: CHANNEL_ID,
          message: 'Transient notice',
        })
      ).rejects.toThrow('malformed Post response');

      mockGet.mockResolvedValueOnce({ data: rawUser, status: 200 });
      mockPost.mockResolvedValueOnce({ data: { ...rawReaction, create_at: 'now' }, status: 200 });
      await expect(
        Mattermost.actions.createReaction.handler(mockContext, {
          postId: POST_ID,
          emojiName: EMOJI_NAME,
        })
      ).rejects.toThrow('malformed Reaction response');

      mockDelete.mockResolvedValueOnce({ data: { status: false }, status: 200 });
      await expect(
        Mattermost.actions.deletePost.handler(mockContext, { postId: POST_ID })
      ).rejects.toThrow('malformed status response');

      mockGet.mockResolvedValueOnce({ data: { reactions: [rawReaction] }, status: 200 });
      await expect(
        Mattermost.actions.listReactions.handler(mockContext, { postId: POST_ID })
      ).rejects.toThrow('expected an array response');
    });
  });

  describe('listPosts', () => {
    it('sends bounded page parameters and normalizes the PostList map', async () => {
      mockGet.mockResolvedValue({ data: rawPostList });

      const result = await Mattermost.actions.listPosts.handler(mockContext, {
        channelId: CHANNEL_ID,
        page: 2,
        perPage: 100,
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/${CHANNEL_ID}/posts`, {
        params: { page: 2, per_page: 100 },
      });
      expect(result).toEqual({
        posts: [expect.objectContaining({ id: POST_ID, message: 'Investigating the alert' })],
        nextPostId: 'next0000000000000000000000',
        previousPostId: 'prev0000000000000000000000',
        hasNext: true,
      });
    });

    it('sends only since when since is provided', async () => {
      mockGet.mockResolvedValue({ data: rawPostList });

      await Mattermost.actions.listPosts.handler(mockContext, {
        channelId: CHANNEL_ID,
        since: 1735689600000,
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/${CHANNEL_ID}/posts`, {
        params: { since: 1735689600000 },
      });
    });

    it('uses Mattermost page defaults when no paging input is supplied', async () => {
      mockGet.mockResolvedValue({ data: rawPostList });

      await Mattermost.actions.listPosts.handler(mockContext, { channelId: CHANNEL_ID });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/${CHANNEL_ID}/posts`, {
        params: { page: 0, per_page: 60 },
      });
    });

    it('sends a before cursor and only explicitly requested paging fields', async () => {
      mockGet.mockResolvedValue({ data: rawPostList });

      await Mattermost.actions.listPosts.handler(mockContext, {
        channelId: CHANNEL_ID,
        before: POST_ID,
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/${CHANNEL_ID}/posts`, {
        params: { before: POST_ID },
      });
    });

    it('sends an after cursor with explicit bounded paging fields', async () => {
      mockGet.mockResolvedValue({ data: rawPostList });

      await Mattermost.actions.listPosts.handler(mockContext, {
        channelId: CHANNEL_ID,
        after: POST_ID,
        page: 1,
        perPage: 20,
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/channels/${CHANNEL_ID}/posts`, {
        params: { after: POST_ID, page: 1, per_page: 20 },
      });
    });

    it('rejects a malformed successful PostList response', async () => {
      mockGet.mockResolvedValue({ data: { order: [], posts: [] }, status: 200 });

      await expect(
        Mattermost.actions.listPosts.handler(mockContext, {
          channelId: CHANNEL_ID,
          page: 0,
          perPage: 60,
        })
      ).rejects.toThrow('Mattermost listPosts failed: malformed PostList response');
    });

    it('rejects malformed selected fields in a successful PostList response', async () => {
      mockGet.mockResolvedValue({
        data: {
          ...rawPostList,
          posts: { [POST_ID]: { ...rawPost, user_id: 42 } },
        },
        status: 200,
      });

      await expect(
        Mattermost.actions.listPosts.handler(mockContext, { channelId: CHANNEL_ID })
      ).rejects.toThrow('malformed Post response');
    });

    it('rejects an oversized optional cursor in a successful PostList response', async () => {
      mockGet.mockResolvedValue({
        data: { ...rawPostList, next_post_id: 'x'.repeat(201) },
        status: 200,
      });

      await expect(
        Mattermost.actions.listPosts.handler(mockContext, { channelId: CHANNEL_ID })
      ).rejects.toThrow('Mattermost listPosts failed: malformed PostList response');
    });
  });

  describe('getThread', () => {
    it('uses bounded camelCase pagination options and encodes the post ID', async () => {
      mockGet.mockResolvedValue({ data: rawThreadPostList });

      const result = await Mattermost.actions.getThread.handler(mockContext, {
        postId: 'post/id',
        perPage: 100,
        fromPost: ROOT_POST_ID,
        fromCreateAt: 1735689600000,
        direction: 'down',
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts/post%2Fid/thread`, {
        params: {
          perPage: 100,
          fromPost: ROOT_POST_ID,
          fromCreateAt: 1735689600000,
          direction: 'down',
        },
      });
      expect(result).toEqual(
        expect.objectContaining({
          posts: [expect.objectContaining({ id: POST_ID })],
          nextPostId: '',
          previousPostId: '',
          hasNext: true,
        })
      );
    });

    it('uses a finite default thread page size', async () => {
      mockGet.mockResolvedValue({ data: rawThreadPostList });
      const input = GetThreadInputSchema.parse({ postId: POST_ID });

      await Mattermost.actions.getThread.handler(mockContext, input);

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts/${POST_ID}/thread`, {
        params: { perPage: 60, direction: 'down' },
      });
    });

    it('allows a thread direction without cursor fields', async () => {
      mockGet.mockResolvedValue({ data: rawThreadPostList });

      await Mattermost.actions.getThread.handler(mockContext, {
        postId: POST_ID,
        perPage: 20,
        direction: 'down',
      });

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/posts/${POST_ID}/thread`, {
        params: { perPage: 20, direction: 'down' },
      });
    });

    it('preserves the inaccessible-post time on an empty successful response', async () => {
      mockGet.mockResolvedValue({
        status: 200,
        data: {
          order: [],
          posts: {},
          next_post_id: '',
          prev_post_id: '',
          has_next: false,
          first_inaccessible_post_time: 1735689600000,
        },
      });

      const result = await Mattermost.actions.getThread.handler(
        mockContext,
        GetThreadInputSchema.parse({ postId: POST_ID })
      );

      expect(result).toEqual({
        posts: [],
        nextPostId: '',
        previousPostId: '',
        hasNext: false,
        firstInaccessiblePostTime: 1735689600000,
      });
    });

    it('accepts the first-inaccessible-post-time-only thread sentinel', async () => {
      mockGet.mockResolvedValue({
        status: 200,
        data: { first_inaccessible_post_time: 1735689600000 },
      });

      const result = await Mattermost.actions.getThread.handler(
        mockContext,
        GetThreadInputSchema.parse({ postId: POST_ID })
      );

      expect(result).toEqual({
        posts: [],
        firstInaccessiblePostTime: 1735689600000,
      });
    });

    it('rejects a malformed successful thread PostList response', async () => {
      mockGet.mockResolvedValue({ data: { order: 'not-an-array', posts: {} }, status: 200 });

      await expect(
        Mattermost.actions.getThread.handler(
          mockContext,
          GetThreadInputSchema.parse({ postId: POST_ID })
        )
      ).rejects.toThrow('Mattermost getThread failed: malformed PostList response');
    });

    it('rejects a negative first-inaccessible-post timestamp', async () => {
      mockGet.mockResolvedValue({
        data: { first_inaccessible_post_time: -1 },
        status: 200,
      });

      await expect(
        Mattermost.actions.getThread.handler(
          mockContext,
          GetThreadInputSchema.parse({ postId: POST_ID })
        )
      ).rejects.toThrow('Mattermost getThread failed: malformed PostList response');
    });
  });

  describe('searchPosts', () => {
    it('preserves false is_or_search and sends bounded search paging', async () => {
      mockPost.mockResolvedValue({
        data: { ...rawPostList, matches: { [POST_ID]: ['alert'] } },
      });

      const result = await Mattermost.actions.searchPosts.handler(mockContext, {
        teamId: TEAM_ID,
        terms: 'alert in:incidents',
        isOrSearch: false,
        page: 1,
        perPage: 50,
      });

      expect(mockPost).toHaveBeenCalledWith(`${BASE_URL}/api/v4/teams/${TEAM_ID}/posts/search`, {
        terms: 'alert in:incidents',
        is_or_search: false,
        page: 1,
        per_page: 50,
      });
      expect(result).toEqual(
        expect.objectContaining({
          posts: [expect.objectContaining({ id: POST_ID })],
          matches: { [POST_ID]: ['alert'] },
        })
      );
    });

    it('treats null search matches from SQL-backed Mattermost as empty', async () => {
      mockPost.mockResolvedValue({ data: { ...rawPostList, matches: null }, status: 200 });

      const result = await Mattermost.actions.searchPosts.handler(mockContext, {
        teamId: TEAM_ID,
        terms: 'alert',
      });

      expect(result).toEqual(
        expect.objectContaining({
          posts: [expect.objectContaining({ id: POST_ID })],
          matches: {},
        })
      );
    });

    it('still rejects non-null non-object search matches', async () => {
      mockPost.mockResolvedValue({ data: { ...rawPostList, matches: [] }, status: 200 });

      await expect(
        Mattermost.actions.searchPosts.handler(mockContext, {
          teamId: TEAM_ID,
          terms: 'alert',
        })
      ).rejects.toThrow('Mattermost searchPosts failed: malformed PostList response');
    });

    it('rejects a malformed successful search PostList response', async () => {
      mockPost.mockResolvedValue({ data: [], status: 200 });

      await expect(
        Mattermost.actions.searchPosts.handler(
          mockContext,
          SearchPostsInputSchema.parse({ teamId: TEAM_ID, terms: 'alert' })
        )
      ).rejects.toThrow('Mattermost searchPosts failed: malformed PostList response');
    });
  });

  describe('errors and health test', () => {
    it('surfaces bounded Mattermost error details without dumping arbitrary payload fields', async () => {
      mockGet.mockRejectedValue({
        response: {
          status: 401,
          data: {
            id: 'api.context.session_expired.app_error',
            message: 'Invalid or expired session',
            request_id: 'request-123',
            sensitive: 'must-not-leak',
          },
        },
      });

      await expect(
        Mattermost.actions.findUserByEmail.handler(mockContext, { email: 'a@b.co' })
      ).rejects.toThrow(
        'Mattermost findUserByEmail failed (status 401): Invalid or expired session [api.context.session_expired.app_error] (request id: request-123)'
      );
    });

    it('tests the connector with GET /api/v4/users/me', async () => {
      mockGet.mockResolvedValue({ data: rawUser });

      const result = await Mattermost.test?.handler(mockContext);

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/users/me`);
      expect(result).toEqual({ message: 'Connected to Mattermost as elastic-bot.' });
      expect(result).not.toHaveProperty('ok');
    });

    it('strips trailing slashes from the configured server URL', async () => {
      mockGet.mockResolvedValue({ data: rawUser });
      const context = {
        ...mockContext,
        config: { serverUrl: `${BASE_URL}///` },
      } as unknown as ActionContext;

      await Mattermost.test?.handler(context);

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/api/v4/users/me`);
    });

    it('preserves a Mattermost Site URL deployment subpath', async () => {
      mockGet.mockResolvedValue({ data: rawUser });
      const context = {
        ...mockContext,
        config: { serverUrl: `${BASE_URL}/company/mattermost/` },
      } as unknown as ActionContext;

      await Mattermost.test?.handler(context);

      expect(mockGet).toHaveBeenCalledWith(`${BASE_URL}/company/mattermost/api/v4/users/me`);
    });
  });
});
