/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';
import { getConnectorSpec } from '../../..';
import { Slack } from './slack';
import {
  SlackGetConversationHistoryInputSchema,
  SlackGetFileInfoInputSchema,
  SlackListChannelsInputSchema,
  SlackListFilesInputSchema,
  SlackListUserConversationsInputSchema,
  SlackListUsersInputSchema,
  SlackResolveChannelIdInputSchema,
  SlackWhoAmIInputSchema,
} from './types';

describe('Slack', () => {
  const mockClient = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const mockContext = {
    client: mockClient,
    log: { debug: jest.fn(), error: jest.fn() },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(Slack).toBeDefined();
  });

  it('should be discoverable via getConnectorSpec (all_specs wiring)', () => {
    const spec = getConnectorSpec('.slack2');
    expect(spec).toBe(Slack);
    expect(spec?.actions.listChannels).toBeDefined();
    expect(spec?.actions.listChannels.isTool).toBe(true);
  });

  it('should have correct metadata', () => {
    expect(Slack.metadata.id).toBe('.slack2');
    expect(Slack.metadata.displayName).toBe('Slack (v2)');
    expect(Slack.metadata.minimumLicense).toBe('enterprise');
    expect(Slack.metadata.supportedFeatureIds).toContain('workflows');
  });

  it('should use oauth_authorization_code auth type', () => {
    expect(Slack.auth).toBeDefined();
    expect(Slack.auth?.types.length).toBeGreaterThanOrEqual(1);
    const types = (Slack.auth?.types as Array<string | { type: string }>).map((t) =>
      typeof t === 'string' ? t : t.type
    );
    expect(types).toContain('oauth_authorization_code');
    expect(types).not.toContain('bearer');
  });

  it('supports oauth_authorization_code with correct Slack defaults', () => {
    const oauthType = (
      Slack.auth?.types as Array<string | { type: string; defaults?: Record<string, unknown> }>
    ).find((t) => typeof t === 'object' && t.type === 'oauth_authorization_code');
    expect(oauthType).toBeDefined();
    expect(oauthType).toMatchObject({
      type: 'oauth_authorization_code',
      defaults: {
        authorizationUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scope:
          'channels:read channels:history chat:write files:read groups:read groups:history im:read im:history mpim:read mpim:history search:read.files search:read.im search:read.mpim search:read.private search:read.public users:read users:read.email',
      },
    });
  });

  it('supports ears auth type with correct Slack defaults and overrides', () => {
    const types = Slack.auth?.types as Array<
      | string
      | {
          type: string;
          defaults?: Record<string, unknown>;
          overrides?: Record<string, unknown>;
        }
    >;
    expect(types.map((t) => (typeof t === 'string' ? t : t.type))).toContain('ears');

    const earsType = types.find((t) => typeof t === 'object' && t.type === 'ears');
    expect(earsType).toMatchObject({
      type: 'ears',
      defaults: {
        provider: 'slack',
        scope:
          'channels:read channels:history chat:write files:read groups:read groups:history im:read im:history mpim:read mpim:history search:read.files search:read.im search:read.mpim search:read.private search:read.public users:read users:read.email',
      },
      overrides: {
        meta: { scope: { disabled: true } },
      },
    });
  });

  describe('searchMessages action', () => {
    it('should search messages with required query', async () => {
      const mockResponse = {
        data: {
          ok: true,
          results: { messages: [] },
          response_metadata: { next_cursor: '' },
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await Slack.actions.searchMessages.handler(mockContext, { query: 'hello' });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://slack.com/api/assistant.search.context',
        expect.objectContaining({
          query: 'hello',
          content_types: ['messages'],
        }),
        expect.any(Object)
      );
      expect(result).toEqual({
        ok: true,
        query: 'hello',
        total: 0,
        response_metadata: { next_cursor: '' },
        matches: [],
      });
    });

    it('should include optional parameters', async () => {
      const mockResponse = {
        data: {
          ok: true,
          results: { messages: [] },
          response_metadata: { next_cursor: '' },
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await Slack.actions.searchMessages.handler(mockContext, {
        query: 'test',
        sort: 'timestamp',
        sortDir: 'desc',
        count: 20,
        cursor: 'abc',
        includeContextMessages: true,
        includeBots: false,
        includeMessageBlocks: true,
        inChannel: 'general',
        fromUser: '@U123',
        after: '2026-01-01',
        before: '2026-02-01',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://slack.com/api/assistant.search.context',
        expect.objectContaining({
          query: 'test in:general from:@U123 after:2026-01-01 before:2026-02-01',
          sort: 'timestamp',
          sort_dir: 'desc',
          cursor: 'abc',
          include_context_messages: true,
          include_bots: false,
          include_message_blocks: true,
        }),
        expect.any(Object)
      );
    });

    it('should return raw Slack response when raw=true', async () => {
      const mockResponse = {
        data: {
          ok: true,
          results: { messages: [{ content: 'hi' }] },
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await Slack.actions.searchMessages.handler(mockContext, {
        query: 'hello',
        raw: true,
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('should throw error when Slack API returns error', async () => {
      const mockResponse = { data: { ok: false, error: 'invalid_auth' } };
      mockClient.post.mockResolvedValue(mockResponse);

      await expect(
        Slack.actions.searchMessages.handler(mockContext, { query: 'test' })
      ).rejects.toThrow('Slack searchMessages error: invalid_auth');
    });
  });

  describe('resolveChannelId action', () => {
    it('should resolve a channel id by exact name match', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channels: [
            { id: 'C1', name: 'general', is_archived: false },
            { id: 'C2', name: 'random', is_archived: false },
          ],
          response_metadata: { next_cursor: 'next123' },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.resolveChannelId.handler(
        mockContext,
        SlackResolveChannelIdInputSchema.parse({ name: '#general' })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/conversations.list', {
        params: {
          types: 'public_channel',
          exclude_archived: true,
          limit: 1000,
        },
      });
      expect(result).toEqual({
        ok: true,
        found: true,
        id: 'C1',
        name: 'general',
        source: 'conversations.list',
        pagesFetched: 1,
        nextCursor: 'next123',
      });
    });

    it('should paginate until found (contains match)', async () => {
      mockClient.get
        .mockResolvedValueOnce({
          data: {
            ok: true,
            channels: [{ id: 'C9', name: 'zzz' }],
            response_metadata: { next_cursor: 'c2' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            ok: true,
            channels: [{ id: 'C7', name: 'alerts-prod' }],
            response_metadata: { next_cursor: '' },
          },
        });

      const result = await Slack.actions.resolveChannelId.handler(
        mockContext,
        SlackResolveChannelIdInputSchema.parse({
          name: 'alerts',
          match: 'contains',
          maxPages: 5,
        })
      );

      expect(mockClient.get).toHaveBeenCalledTimes(2);
      expect(mockClient.get).toHaveBeenNthCalledWith(
        1,
        'https://slack.com/api/conversations.list',
        {
          params: { types: 'public_channel', exclude_archived: true, limit: 1000 },
        }
      );
      expect(mockClient.get).toHaveBeenNthCalledWith(
        2,
        'https://slack.com/api/conversations.list',
        {
          params: { types: 'public_channel', exclude_archived: true, limit: 1000, cursor: 'c2' },
        }
      );
      expect(result).toMatchObject({
        ok: true,
        found: true,
        id: 'C7',
        source: 'conversations.list',
        pagesFetched: 2,
      });
    });
  });

  describe('listChannels action', () => {
    it('should be exposed as a tool', () => {
      expect(Slack.actions.listChannels.isTool).toBe(true);
    });

    it('should list channels with default params', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channels: [
            {
              id: 'C1',
              name: 'general',
              is_private: false,
              is_archived: false,
              is_member: true,
            },
            {
              id: 'C2',
              name: 'random',
              is_private: false,
              is_archived: false,
              is_member: false,
            },
          ],
          response_metadata: { next_cursor: 'page2cursor' },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.listChannels.handler(
        mockContext,
        SlackListChannelsInputSchema.parse({})
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/conversations.list', {
        params: {
          types: 'public_channel',
          exclude_archived: true,
          limit: 1000,
        },
      });
      expect(result).toEqual({
        ok: true,
        source: 'conversations.list',
        channels: [
          {
            id: 'C1',
            name: 'general',
            is_private: false,
            is_archived: false,
            is_member: true,
          },
          {
            id: 'C2',
            name: 'random',
            is_private: false,
            is_archived: false,
            is_member: false,
          },
        ],
        nextCursor: 'page2cursor',
        hasMore: true,
      });
    });

    it('should pass cursor, limit, types, and excludeArchived when provided', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channels: [{ id: 'G1', name: 'private-inc', is_private: true, is_archived: false }],
          response_metadata: { next_cursor: '' },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      await Slack.actions.listChannels.handler(
        mockContext,
        SlackListChannelsInputSchema.parse({
          cursor: 'prev-cursor',
          limit: 200,
          types: ['private_channel'],
          excludeArchived: false,
        })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/conversations.list', {
        params: {
          types: 'private_channel',
          exclude_archived: false,
          limit: 200,
          cursor: 'prev-cursor',
        },
      });
    });

    it('should set hasMore false and omit nextCursor when there is no next page', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channels: [{ id: 'C9', name: 'only-page', is_private: false }],
          response_metadata: { next_cursor: '' },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.listChannels.handler(
        mockContext,
        SlackListChannelsInputSchema.parse({})
      );

      expect(result).toEqual({
        ok: true,
        source: 'conversations.list',
        channels: [
          {
            id: 'C9',
            name: 'only-page',
            is_private: false,
            is_archived: undefined,
            is_member: undefined,
          },
        ],
        nextCursor: undefined,
        hasMore: false,
      });
    });

    it('should return raw Slack response when raw=true', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channels: [{ id: 'C1', name: 'general' }],
          response_metadata: { next_cursor: '' },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.listChannels.handler(
        mockContext,
        SlackListChannelsInputSchema.parse({ raw: true })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should throw when Slack API returns error', async () => {
      const mockResponse = { data: { ok: false, error: 'missing_scope' } };
      mockClient.get.mockResolvedValue(mockResponse);

      await expect(
        Slack.actions.listChannels.handler(mockContext, SlackListChannelsInputSchema.parse({}))
      ).rejects.toThrow('Slack listChannels error: missing_scope');
    });
  });

  describe('createConversation action', () => {
    it('should create a public channel', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channel: {
            id: 'C123ABC',
            name: 'incident-123',
            is_private: false,
          },
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await Slack.actions.createConversation.handler(mockContext, {
        name: 'incident-123',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://slack.com/api/conversations.create',
        {
          name: 'incident-123',
          is_private: false,
        },
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should create a private channel', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channel: {
            id: 'G456DEF',
            name: 'incident-456',
            is_private: true,
          },
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await Slack.actions.createConversation.handler(mockContext, {
        name: 'incident-456',
        isPrivate: true,
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://slack.com/api/conversations.create',
        {
          name: 'incident-456',
          is_private: true,
        },
        expect.any(Object)
      );
    });

    it('should throw error when Slack API returns error', async () => {
      const mockResponse = {
        data: {
          ok: false,
          error: 'name_taken',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await expect(
        Slack.actions.createConversation.handler(mockContext, {
          name: 'existing-channel',
        })
      ).rejects.toThrow('Slack createConversation error: name_taken');
    });
  });

  describe('inviteToConversation action', () => {
    it('should invite users to a channel', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channel: {
            id: 'C123ABC',
            name: 'incident-123',
          },
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await Slack.actions.inviteToConversation.handler(mockContext, {
        channel: 'C123ABC',
        users: 'U01PWE77HD2,U02ABC1234',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://slack.com/api/conversations.invite',
        {
          channel: 'C123ABC',
          users: 'U01PWE77HD2,U02ABC1234',
        },
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should throw error when Slack API returns error', async () => {
      const mockResponse = {
        data: {
          ok: false,
          error: 'channel_not_found',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await expect(
        Slack.actions.inviteToConversation.handler(mockContext, {
          channel: 'INVALID',
          users: 'U01PWE77HD2',
        })
      ).rejects.toThrow('Slack inviteToConversation error: channel_not_found');
    });
  });

  describe('getConversationHistory action', () => {
    it('should fetch history with defaults', async () => {
      const mockResponse = {
        data: {
          ok: true,
          messages: [
            { type: 'message', user: 'U1', text: 'hi', ts: '1.1' },
            { type: 'message', user: 'U2', text: 'bye', ts: '2.2' },
          ],
          has_more: false,
          response_metadata: { next_cursor: '' },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.getConversationHistory.handler(
        mockContext,
        SlackGetConversationHistoryInputSchema.parse({ channel: 'C123' })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/conversations.history', {
        params: { channel: 'C123', limit: 100 },
      });
      expect(result).toEqual({
        ok: true,
        channel: 'C123',
        messages: [
          {
            ts: '1.1',
            type: 'message',
            subtype: undefined,
            user: 'U1',
            bot_id: undefined,
            username: undefined,
            text: 'hi',
            thread_ts: undefined,
            reply_count: undefined,
            blocks: undefined,
            attachments: undefined,
            files: undefined,
          },
          {
            ts: '2.2',
            type: 'message',
            subtype: undefined,
            user: 'U2',
            bot_id: undefined,
            username: undefined,
            text: 'bye',
            thread_ts: undefined,
            reply_count: undefined,
            blocks: undefined,
            attachments: undefined,
            files: undefined,
          },
        ],
        nextCursor: undefined,
        hasMore: false,
      });
    });

    it('should fall back to attachment text/fallback when message text is empty (bot posts)', async () => {
      mockClient.get.mockResolvedValue({
        data: {
          ok: true,
          messages: [
            {
              type: 'message',
              bot_id: 'B1',
              username: 'alertbot',
              text: '',
              ts: '3.3',
              attachments: [
                { fallback: 'Alert: prod CPU high', text: 'CPU at 95%', title: 'CPU alert' },
              ],
            },
          ],
          has_more: false,
          response_metadata: { next_cursor: '' },
        },
      });

      const result = await Slack.actions.getConversationHistory.handler(
        mockContext,
        SlackGetConversationHistoryInputSchema.parse({ channel: 'C1' })
      );

      expect(result.messages?.[0]?.text).toBe('Alert: prod CPU high');
      expect(result.messages?.[0]?.attachments).toEqual([
        { fallback: 'Alert: prod CPU high', text: 'CPU at 95%', title: 'CPU alert' },
      ]);
      expect(result.messages?.[0]?.username).toBe('alertbot');
    });

    it('should pass oldest, latest, inclusive, cursor', async () => {
      mockClient.get.mockResolvedValue({
        data: { ok: true, messages: [], has_more: true, response_metadata: { next_cursor: 'n1' } },
      });

      await Slack.actions.getConversationHistory.handler(
        mockContext,
        SlackGetConversationHistoryInputSchema.parse({
          channel: 'C123',
          oldest: '1000.0',
          latest: '2000.0',
          inclusive: true,
          cursor: 'prev',
          limit: 50,
        })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/conversations.history', {
        params: {
          channel: 'C123',
          limit: 50,
          oldest: '1000.0',
          latest: '2000.0',
          inclusive: true,
          cursor: 'prev',
        },
      });
    });

    it('should set hasMore true and surface nextCursor', async () => {
      mockClient.get.mockResolvedValue({
        data: {
          ok: true,
          messages: [{ type: 'message', text: 'a', ts: '1.0' }],
          has_more: true,
          response_metadata: { next_cursor: 'next-page' },
        },
      });

      const result = await Slack.actions.getConversationHistory.handler(
        mockContext,
        SlackGetConversationHistoryInputSchema.parse({ channel: 'C1' })
      );

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('next-page');
    });

    it('should return raw response when raw=true', async () => {
      const mockResponse = { data: { ok: true, messages: [{ ts: '1.0' }] } };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.getConversationHistory.handler(
        mockContext,
        SlackGetConversationHistoryInputSchema.parse({ channel: 'C1', raw: true })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should throw when Slack API returns error', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: false, error: 'channel_not_found' } });

      await expect(
        Slack.actions.getConversationHistory.handler(
          mockContext,
          SlackGetConversationHistoryInputSchema.parse({ channel: 'BAD' })
        )
      ).rejects.toThrow('Slack getConversationHistory error: channel_not_found');
    });
  });

  describe('getConversationInfo action', () => {
    it('should return just the channel object by default', async () => {
      const channel = { id: 'C1', name: 'general', is_private: false };
      mockClient.get.mockResolvedValue({ data: { ok: true, channel } });

      const result = await Slack.actions.getConversationInfo.handler(mockContext, {
        channel: 'C1',
      });

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/conversations.info', {
        params: { channel: 'C1' },
      });
      expect(result).toEqual(channel);
    });

    it('should return the full response when raw=true', async () => {
      const mockResponse = {
        data: { ok: true, channel: { id: 'C1', name: 'general' } },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.getConversationInfo.handler(mockContext, {
        channel: 'C1',
        raw: true,
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('should forward include_num_members and include_locale', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: true, channel: { id: 'C1' } } });

      await Slack.actions.getConversationInfo.handler(mockContext, {
        channel: 'C1',
        includeNumMembers: true,
        includeLocale: true,
      });

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/conversations.info', {
        params: { channel: 'C1', include_num_members: true, include_locale: true },
      });
    });

    it('should throw when Slack API returns error', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: false, error: 'channel_not_found' } });

      await expect(
        Slack.actions.getConversationInfo.handler(mockContext, { channel: 'BAD' })
      ).rejects.toThrow('Slack getConversationInfo error: channel_not_found');
    });
  });

  describe('lookupUserByEmail action', () => {
    it('should return just the user object by default', async () => {
      const user = { id: 'U1', name: 'kir', profile: { email: 'kir@elastic.co' } };
      mockClient.get.mockResolvedValue({ data: { ok: true, user } });

      const result = await Slack.actions.lookupUserByEmail.handler(mockContext, {
        email: 'kir@elastic.co',
      });

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/users.lookupByEmail', {
        params: { email: 'kir@elastic.co' },
      });
      expect(result).toEqual(user);
    });

    it('should return the full response when raw=true', async () => {
      const mockResponse = {
        data: { ok: true, user: { id: 'U1', name: 'kir' } },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.lookupUserByEmail.handler(mockContext, {
        email: 'kir@elastic.co',
        raw: true,
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('should throw when no user has that email', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: false, error: 'users_not_found' } });

      await expect(
        Slack.actions.lookupUserByEmail.handler(mockContext, { email: 'nope@elastic.co' })
      ).rejects.toThrow('Slack lookupUserByEmail error: users_not_found');
    });
  });

  describe('listUsers action', () => {
    it('should list users with defaults', async () => {
      const mockResponse = {
        data: {
          ok: true,
          members: [
            { id: 'U1', name: 'a' },
            { id: 'U2', name: 'b' },
          ],
          response_metadata: { next_cursor: 'next' },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.listUsers.handler(
        mockContext,
        SlackListUsersInputSchema.parse({})
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/users.list', {
        params: { limit: 200 },
      });
      expect(result).toEqual({
        ok: true,
        members: [
          {
            id: 'U1',
            name: 'a',
            real_name: undefined,
            is_bot: undefined,
            is_admin: undefined,
            is_owner: undefined,
            deleted: undefined,
            profile: undefined,
          },
          {
            id: 'U2',
            name: 'b',
            real_name: undefined,
            is_bot: undefined,
            is_admin: undefined,
            is_owner: undefined,
            deleted: undefined,
            profile: undefined,
          },
        ],
        nextCursor: 'next',
        hasMore: true,
      });
    });

    it('should project members to compact shape, stripping heavy fields', async () => {
      mockClient.get.mockResolvedValue({
        data: {
          ok: true,
          members: [
            {
              id: 'U1',
              team_id: 'T1',
              name: 'alice',
              real_name: 'Alice Smith',
              is_bot: false,
              is_admin: true,
              is_owner: false,
              deleted: false,
              tz: 'America/New_York',
              tz_label: 'Eastern Daylight Time',
              tz_offset: -14400,
              updated: 1234567890,
              is_app_user: false,
              profile: {
                email: 'alice@example.com',
                display_name: 'alice',
                real_name: 'Alice Smith',
                title: 'Engineer',
                phone: '555-0100',
                skype: '',
                image_24: 'https://example.com/24.png',
                image_32: 'https://example.com/32.png',
                image_48: 'https://example.com/48.png',
                image_72: 'https://example.com/72.png',
                image_192: 'https://example.com/192.png',
                image_512: 'https://example.com/512.png',
              },
            },
          ],
          response_metadata: { next_cursor: '' },
        },
      });

      const result = await Slack.actions.listUsers.handler(
        mockContext,
        SlackListUsersInputSchema.parse({})
      );

      expect(result).toEqual({
        ok: true,
        members: [
          {
            id: 'U1',
            name: 'alice',
            real_name: 'Alice Smith',
            is_bot: false,
            is_admin: true,
            is_owner: false,
            deleted: false,
            profile: {
              email: 'alice@example.com',
              display_name: 'alice',
              real_name: 'Alice Smith',
              title: 'Engineer',
            },
          },
        ],
        nextCursor: undefined,
        hasMore: false,
      });

      const member = (result as { members: Array<Record<string, unknown>> }).members[0];
      expect(member).not.toHaveProperty('team_id');
      expect(member).not.toHaveProperty('tz');
      expect(member).not.toHaveProperty('tz_offset');
      expect(member.profile).not.toHaveProperty('image_24');
      expect(member.profile).not.toHaveProperty('image_512');
      expect(member.profile).not.toHaveProperty('phone');
    });

    it('should pass cursor, limit, includeLocale', async () => {
      mockClient.get.mockResolvedValue({
        data: { ok: true, members: [], response_metadata: { next_cursor: '' } },
      });

      await Slack.actions.listUsers.handler(
        mockContext,
        SlackListUsersInputSchema.parse({
          cursor: 'prev',
          limit: 50,
          includeLocale: true,
        })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/users.list', {
        params: { limit: 50, cursor: 'prev', include_locale: true },
      });
    });

    it('should return raw response when raw=true', async () => {
      const mockResponse = { data: { ok: true, members: [{ id: 'U1' }] } };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.listUsers.handler(
        mockContext,
        SlackListUsersInputSchema.parse({ raw: true })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should throw when Slack API returns error', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: false, error: 'missing_scope' } });

      await expect(
        Slack.actions.listUsers.handler(mockContext, SlackListUsersInputSchema.parse({}))
      ).rejects.toThrow('Slack listUsers error: missing_scope');
    });
  });

  describe('listUserConversations action', () => {
    it('should list conversations for a user with defaults', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channels: [
            { id: 'C1', name: 'general', is_private: false, is_archived: false, is_member: true },
          ],
          response_metadata: { next_cursor: '' },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.listUserConversations.handler(
        mockContext,
        SlackListUserConversationsInputSchema.parse({ user: 'U123' })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/users.conversations', {
        params: {
          types: 'public_channel,private_channel,im,mpim',
          exclude_archived: true,
          limit: 1000,
          user: 'U123',
        },
      });
      expect(result).toEqual({
        ok: true,
        source: 'users.conversations',
        channels: [
          { id: 'C1', name: 'general', is_private: false, is_archived: false, is_member: true },
        ],
        nextCursor: undefined,
        hasMore: false,
      });
    });

    it('should omit user when not provided (lists for authenticated user)', async () => {
      mockClient.get.mockResolvedValue({
        data: { ok: true, channels: [], response_metadata: { next_cursor: '' } },
      });

      await Slack.actions.listUserConversations.handler(
        mockContext,
        SlackListUserConversationsInputSchema.parse({})
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/users.conversations', {
        params: {
          types: 'public_channel,private_channel,im,mpim',
          exclude_archived: true,
          limit: 1000,
        },
      });
    });

    it('should pass cursor, types, excludeArchived', async () => {
      mockClient.get.mockResolvedValue({
        data: { ok: true, channels: [], response_metadata: { next_cursor: 'n' } },
      });

      const result = await Slack.actions.listUserConversations.handler(
        mockContext,
        SlackListUserConversationsInputSchema.parse({
          user: 'U1',
          cursor: 'prev',
          types: ['private_channel', 'im'],
          excludeArchived: false,
          limit: 100,
        })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/users.conversations', {
        params: {
          types: 'private_channel,im',
          exclude_archived: false,
          limit: 100,
          user: 'U1',
          cursor: 'prev',
        },
      });
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('n');
    });

    it('should throw when Slack API returns error', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: false, error: 'user_not_found' } });

      await expect(
        Slack.actions.listUserConversations.handler(
          mockContext,
          SlackListUserConversationsInputSchema.parse({ user: 'UNKNOWN' })
        )
      ).rejects.toThrow('Slack listUserConversations error: user_not_found');
    });
  });

  describe('whoAmI action', () => {
    it('should return compact identity by default', async () => {
      mockClient.get.mockResolvedValue({
        data: {
          ok: true,
          url: 'https://elastic.slack.com/',
          team: 'Elastic',
          user: 'claude',
          team_id: 'T0CUZ52US',
          user_id: 'U09E1LQM6RY',
          enterprise_id: 'E0123',
          is_enterprise_install: false,
          response_metadata: { scopes: ['users:read'] },
        },
      });

      const result = await Slack.actions.whoAmI.handler(
        mockContext,
        SlackWhoAmIInputSchema.parse({})
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/auth.test');
      expect(result).toEqual({
        ok: true,
        url: 'https://elastic.slack.com/',
        team: 'Elastic',
        user: 'claude',
        team_id: 'T0CUZ52US',
        user_id: 'U09E1LQM6RY',
        bot_id: undefined,
        enterprise_id: 'E0123',
        is_enterprise_install: false,
      });
      expect(result).not.toHaveProperty('response_metadata');
    });

    it('should return raw response when raw=true', async () => {
      const mockResponse = {
        data: { ok: true, url: 'x', team: 'T', user: 'u', response_metadata: { scopes: [] } },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.whoAmI.handler(
        mockContext,
        SlackWhoAmIInputSchema.parse({ raw: true })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should throw when Slack API returns error', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: false, error: 'invalid_auth' } });

      await expect(
        Slack.actions.whoAmI.handler(mockContext, SlackWhoAmIInputSchema.parse({}))
      ).rejects.toThrow('Slack whoAmI error: invalid_auth');
    });
  });

  describe('getFileInfo action', () => {
    it('should return just the file object by default', async () => {
      const file = {
        id: 'F123',
        name: 'screenshot.png',
        mimetype: 'image/png',
        size: 12345,
        permalink: 'https://example.com/f',
      };
      mockClient.get.mockResolvedValue({ data: { ok: true, file } });

      const result = await Slack.actions.getFileInfo.handler(
        mockContext,
        SlackGetFileInfoInputSchema.parse({ file: 'F123' })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/files.info', {
        params: { file: 'F123' },
      });
      expect(result).toEqual(file);
    });

    it('should return the full response when raw=true', async () => {
      const mockResponse = {
        data: {
          ok: true,
          file: { id: 'F123' },
          response_metadata: { scopes: ['files:read'] },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.getFileInfo.handler(
        mockContext,
        SlackGetFileInfoInputSchema.parse({ file: 'F123', raw: true })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should throw when Slack API returns error', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: false, error: 'file_not_found' } });

      await expect(
        Slack.actions.getFileInfo.handler(
          mockContext,
          SlackGetFileInfoInputSchema.parse({ file: 'F404' })
        )
      ).rejects.toThrow('Slack getFileInfo error: file_not_found');
    });
  });

  describe('listFiles action', () => {
    it('should project files to a compact shape, strip heavy fields, and surface paging.next via nextPage', async () => {
      mockClient.get.mockResolvedValue({
        data: {
          ok: true,
          files: [
            {
              id: 'F1',
              name: 'a.png',
              title: 'A',
              mimetype: 'image/png',
              filetype: 'png',
              pretty_type: 'PNG',
              user: 'U1',
              size: 100,
              created: 1700000000,
              url_private: 'https://example.com/a',
              url_private_download: 'https://example.com/a?dl=1',
              permalink: 'https://example.com/p/a',
              permalink_public: 'https://example.com/pub/a',
              channels: ['C1'],
              groups: [],
              ims: [],
              thumb_64: 'https://example.com/t64',
              thumb_360: 'https://example.com/t360',
              thumb_480: 'https://example.com/t480',
              original_w: 1024,
              original_h: 768,
            },
          ],
          // Slack files.list is classic-paginated — `paging`, not `response_metadata`.
          paging: { count: 100, total: 250, page: 1, pages: 3 },
        },
      });

      const result = await Slack.actions.listFiles.handler(
        mockContext,
        SlackListFilesInputSchema.parse({})
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/files.list', {
        params: { count: 100, page: 1 },
      });
      expect(result).toEqual({
        ok: true,
        files: [
          {
            id: 'F1',
            name: 'a.png',
            title: 'A',
            mimetype: 'image/png',
            filetype: 'png',
            user: 'U1',
            size: 100,
            created: 1700000000,
            url_private: 'https://example.com/a',
            permalink: 'https://example.com/p/a',
            channels: ['C1'],
          },
        ],
        page: 1,
        pages: 3,
        total: 250,
        nextPage: 2,
        hasMore: true,
      });

      const f = (result as { files: Array<Record<string, unknown>> }).files[0];
      expect(f).not.toHaveProperty('thumb_64');
      expect(f).not.toHaveProperty('thumb_480');
      expect(f).not.toHaveProperty('original_w');
      expect(f).not.toHaveProperty('permalink_public');
      expect(f).not.toHaveProperty('url_private_download');
    });

    it('should pass channel, user, ts range, types, count, page', async () => {
      mockClient.get.mockResolvedValue({
        data: { ok: true, files: [], paging: { count: 25, total: 0, page: 2, pages: 2 } },
      });

      await Slack.actions.listFiles.handler(
        mockContext,
        SlackListFilesInputSchema.parse({
          channel: 'C1',
          user: 'U1',
          tsFrom: '1700000000',
          tsTo: '1700100000',
          types: 'images,pdfs',
          count: 25,
          page: 2,
        })
      );

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/files.list', {
        params: {
          count: 25,
          page: 2,
          channel: 'C1',
          user: 'U1',
          ts_from: '1700000000',
          ts_to: '1700100000',
          types: 'images,pdfs',
        },
      });
    });

    it('should set hasMore false and omit nextPage on the last page', async () => {
      mockClient.get.mockResolvedValue({
        data: { ok: true, files: [], paging: { count: 100, total: 5, page: 1, pages: 1 } },
      });

      const result = await Slack.actions.listFiles.handler(
        mockContext,
        SlackListFilesInputSchema.parse({})
      );

      expect(result).toEqual({
        ok: true,
        files: [],
        page: 1,
        pages: 1,
        total: 5,
        nextPage: undefined,
        hasMore: false,
      });
    });

    it('should treat a missing paging block as a single-page result', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: true, files: [{ id: 'F1' }] } });

      const result = await Slack.actions.listFiles.handler(
        mockContext,
        SlackListFilesInputSchema.parse({ page: 3 })
      );

      expect(result).toMatchObject({
        page: 3,
        pages: 3,
        nextPage: undefined,
        hasMore: false,
      });
    });

    it('should return raw response when raw=true', async () => {
      const mockResponse = {
        data: {
          ok: true,
          files: [{ id: 'F1' }],
          paging: { count: 100, total: 1, page: 1, pages: 1 },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Slack.actions.listFiles.handler(
        mockContext,
        SlackListFilesInputSchema.parse({ raw: true })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should throw when Slack API returns error', async () => {
      mockClient.get.mockResolvedValue({ data: { ok: false, error: 'missing_scope' } });

      await expect(
        Slack.actions.listFiles.handler(mockContext, SlackListFilesInputSchema.parse({}))
      ).rejects.toThrow('Slack listFiles error: missing_scope');
    });
  });

  describe('sendMessage action', () => {
    it('should send message with required parameters', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channel: 'C123',
          ts: '1234567890.123456',
          message: {
            text: 'Hello from Kibana',
            user: 'U123',
            type: 'message',
          },
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await Slack.actions.sendMessage.handler(mockContext, {
        channel: 'C123',
        text: 'Hello from Kibana',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        {
          channel: 'C123',
          text: 'Hello from Kibana',
        },
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should send threaded reply', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channel: 'C123',
          ts: '1234567890.123457',
          message: {
            text: 'Reply message',
            thread_ts: '1234567890.123456',
          },
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await Slack.actions.sendMessage.handler(mockContext, {
        channel: 'C123',
        text: 'Reply message',
        threadTs: '1234567890.123456',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        {
          channel: 'C123',
          text: 'Reply message',
          thread_ts: '1234567890.123456',
        },
        expect.any(Object)
      );
    });

    it('should include unfurl options', async () => {
      const mockResponse = {
        data: {
          ok: true,
          channel: 'C123',
          ts: '1234567890.123456',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await Slack.actions.sendMessage.handler(mockContext, {
        channel: 'C123',
        text: 'Check out https://example.com',
        unfurlLinks: true,
        unfurlMedia: false,
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        {
          channel: 'C123',
          text: 'Check out https://example.com',
          unfurl_links: true,
          unfurl_media: false,
        },
        expect.any(Object)
      );
    });

    it('should throw error when Slack API returns error', async () => {
      const mockResponse = {
        data: {
          ok: false,
          error: 'channel_not_found',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await expect(
        Slack.actions.sendMessage.handler(mockContext, {
          channel: 'invalid-channel',
          text: 'Hello',
        })
      ).rejects.toThrow('Slack sendMessage error: channel_not_found');
    });
  });

  describe('test handler', () => {
    it('should return success when API is accessible', async () => {
      const mockResponse = {
        data: {
          ok: true,
          url: 'https://myteam.slack.com/',
          team: 'My Team',
          user: 'testbot',
          team_id: 'T123',
          user_id: 'U123',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      if (!Slack.test) {
        throw new Error('Test handler not defined');
      }
      const result = await Slack.test.handler(mockContext);

      expect(mockClient.get).toHaveBeenCalledWith('https://slack.com/api/auth.test');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('My Team');
    });

    it('should return failure when Slack API returns error', async () => {
      const mockResponse = {
        data: {
          ok: false,
          error: 'invalid_auth',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      if (!Slack.test) {
        throw new Error('Test handler not defined');
      }
      const result = await Slack.test.handler(mockContext);

      expect(result.ok).toBe(false);
      expect(result.message).toContain('invalid_auth');
    });

    it('should return failure on network error', async () => {
      mockClient.get.mockRejectedValue(new Error('Network timeout'));

      if (!Slack.test) {
        throw new Error('Test handler not defined');
      }
      const result = await Slack.test.handler(mockContext);

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Network timeout');
    });
  });
});
