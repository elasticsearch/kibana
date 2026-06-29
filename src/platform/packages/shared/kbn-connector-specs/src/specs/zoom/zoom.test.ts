/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext, AuthTypeDef } from '../../connector_spec';
import { generateSecretsSchemaFromSpec } from '../../lib/generate_secrets_schema_from_spec';
import { Zoom } from './zoom';

interface ZoomPaginatedResponse<T = unknown> {
  page_size?: number;
  next_page_token?: string;
  total_records?: number;
  meetings?: T[];
  participants?: T[];
  registrants?: T[];
}

interface TestResult {
  ok: boolean;
  message?: string;
}

describe('Zoom', () => {
  const mockClient = {
    get: jest.fn(),
  };

  const mockContext = {
    client: mockClient,
    log: { debug: jest.fn(), error: jest.fn() },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('auth', () => {
    it('bearer auth is hidden (not shown in picker) but retained for existing connectors', () => {
      const bearerDef = Zoom.auth?.types.find(
        (t): t is AuthTypeDef => typeof t === 'object' && t.type === 'bearer'
      );
      expect(bearerDef).toBeDefined();
      expect(bearerDef?.isLegacy).toBe(true);
    });

    it('existing connectors with bearer auth still pass schema validation', () => {
      const schema = generateSecretsSchemaFromSpec(Zoom.auth, {
        isEarsEnabled: true,
        isEarsExperimentalEnabled: true,
      });
      const result = schema.safeParse({ authType: 'bearer', token: 'some-legacy-token' });
      expect(result.success).toBe(true);
    });

    it('supports oauth_authorization_code with correct Zoom defaults', () => {
      const oauthType = (
        Zoom.auth?.types as Array<string | { type: string; defaults?: Record<string, unknown> }>
      ).find((t) => typeof t === 'object' && t.type === 'oauth_authorization_code');
      expect(oauthType).toBeDefined();
      expect(oauthType).toMatchObject({
        type: 'oauth_authorization_code',
        defaults: {
          authorizationUrl: 'https://zoom.us/oauth/authorize',
          tokenUrl: 'https://zoom.us/oauth/token',
          scope:
            'user:read:user meeting:read:meeting meeting:read:list_meetings meeting:read:past_meeting meeting:read:list_past_participants meeting:read:list_registrants cloud_recording:read:list_recording_files cloud_recording:read:list_user_recordings',
        },
      });
    });
  });

  describe('listMeetings action', () => {
    it('should list upcoming meetings with default params', async () => {
      const mockResponse = {
        data: {
          page_size: 30,
          total_records: 2,
          meetings: [
            { id: 111, topic: 'Standup', start_time: '2026-02-26T09:00:00Z' },
            { id: 222, topic: 'Retrospective', start_time: '2026-02-27T14:00:00Z' },
          ],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.listMeetings.handler(mockContext, {
        userId: 'me',
        type: 'upcoming',
      })) as ZoomPaginatedResponse;

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/users/me/meetings', {
        params: { type: 'upcoming' },
      });
      expect(result).toEqual(mockResponse.data);
      expect(result.meetings).toHaveLength(2);
    });

    it('should pass pagination params when provided', async () => {
      const mockResponse = { data: { meetings: [], total_records: 0 } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.listMeetings.handler(mockContext, {
        userId: 'user@example.com',
        type: 'scheduled',
        pageSize: 10,
        nextPageToken: 'token123',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/users/user%40example.com/meetings',
        {
          params: {
            type: 'scheduled',
            page_size: 10,
            next_page_token: 'token123',
          },
        }
      );
    });

    it('should handle empty meeting list', async () => {
      const mockResponse = { data: { meetings: [], total_records: 0 } };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.listMeetings.handler(mockContext, {
        userId: 'me',
        type: 'upcoming',
      })) as ZoomPaginatedResponse;

      expect(result.meetings).toHaveLength(0);
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Unauthorized'));

      await expect(
        Zoom.actions.listMeetings.handler(mockContext, { userId: 'me', type: 'upcoming' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('getMeetingDetails action', () => {
    it('should get details of a scheduled meeting', async () => {
      const mockResponse = {
        data: {
          uuid: 'uuid-123',
          id: 111,
          host_id: 'host-1',
          host_email: 'host@example.com',
          topic: 'Sprint Planning',
          type: 2,
          status: 'waiting',
          start_time: '2026-03-01T10:00:00Z',
          duration: 60,
          timezone: 'America/New_York',
          agenda: 'Plan the next sprint',
          created_at: '2026-02-20T08:00:00Z',
          join_url: 'https://zoom.us/j/111',
          settings: { host_video: true, participant_video: false },
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Zoom.actions.getMeetingDetails.handler(mockContext, {
        meetingId: '111',
      });

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/meetings/111');
      expect(result).toEqual({
        uuid: 'uuid-123',
        id: 111,
        host_email: 'host@example.com',
        topic: 'Sprint Planning',
        type: 2,
        status: 'waiting',
        start_time: '2026-03-01T10:00:00Z',
        duration: 60,
        timezone: 'America/New_York',
        agenda: 'Plan the next sprint',
        join_url: 'https://zoom.us/j/111',
        password: undefined,
      });
    });

    it('should double-encode a UUID that starts with /', async () => {
      const mockResponse = { data: { id: 111, topic: 'Test' } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.getMeetingDetails.handler(mockContext, {
        meetingId: '/abc+123==',
      });

      const expectedId = encodeURIComponent(encodeURIComponent('/abc+123=='));
      expect(mockClient.get).toHaveBeenCalledWith(`https://api.zoom.us/v2/meetings/${expectedId}`);
    });

    it('should strip whitespace from a meeting ID', async () => {
      const mockResponse = { data: { id: 111 } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.getMeetingDetails.handler(mockContext, {
        meetingId: '847 3703 8563',
      });

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/meetings/84737038563');
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Meeting not found'));

      await expect(
        Zoom.actions.getMeetingDetails.handler(mockContext, { meetingId: '999' })
      ).rejects.toThrow('Meeting not found');
    });
  });

  describe('getPastMeetingDetails action', () => {
    it('should get summary of a past meeting', async () => {
      const mockResponse = {
        data: {
          uuid: 'uuid-456',
          id: 222,
          host_id: 'host-1',
          type: 2,
          topic: 'Retrospective',
          start_time: '2026-02-25T14:00:00Z',
          end_time: '2026-02-25T15:00:00Z',
          duration: 58,
          total_minutes: 232,
          participants_count: 4,
          source: 'Zoom',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Zoom.actions.getPastMeetingDetails.handler(mockContext, {
        meetingId: '222',
      });

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/past_meetings/222');
      expect(result).toEqual({
        uuid: 'uuid-456',
        id: 222,
        topic: 'Retrospective',
        start_time: '2026-02-25T14:00:00Z',
        end_time: '2026-02-25T15:00:00Z',
        duration: 58,
        total_minutes: 232,
        participants_count: 4,
      });
    });

    it('should double-encode a UUID containing //', async () => {
      const mockResponse = { data: { id: 222 } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.getPastMeetingDetails.handler(mockContext, {
        meetingId: 'abc//123==',
      });

      const expectedId = encodeURIComponent(encodeURIComponent('abc//123=='));
      expect(mockClient.get).toHaveBeenCalledWith(
        `https://api.zoom.us/v2/past_meetings/${expectedId}`
      );
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Meeting does not exist'));

      await expect(
        Zoom.actions.getPastMeetingDetails.handler(mockContext, { meetingId: '999' })
      ).rejects.toThrow('Meeting does not exist');
    });
  });

  describe('getMeetingRecordings action', () => {
    it('should get recordings for a meeting', async () => {
      const mockResponse = {
        data: {
          uuid: 'abc123',
          id: 111,
          topic: 'Team Standup',
          recording_files: [
            {
              id: 'rec-1',
              recording_type: 'audio_transcript',
              file_type: 'VTT',
              download_url: 'https://zoom.us/rec/download/transcript.vtt',
              status: 'completed',
            },
            {
              id: 'rec-2',
              recording_type: 'chat_file',
              file_type: 'TXT',
              download_url: 'https://zoom.us/rec/download/chat.txt',
              status: 'completed',
            },
          ],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Zoom.actions.getMeetingRecordings.handler(mockContext, {
        meetingId: '111',
      });

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/meetings/111/recordings');
      expect(result).toEqual({
        topic: 'Team Standup',
        recording_count: undefined,
        start_time: undefined,
        duration: undefined,
        recording_files: [
          {
            id: 'rec-1',
            recording_type: 'audio_transcript',
            file_type: 'VTT',
            file_size: undefined,
            download_url: 'https://zoom.us/rec/download/transcript.vtt',
            status: 'completed',
          },
          {
            id: 'rec-2',
            recording_type: 'chat_file',
            file_type: 'TXT',
            file_size: undefined,
            download_url: 'https://zoom.us/rec/download/chat.txt',
            status: 'completed',
          },
        ],
      });
    });

    it('should strip whitespace from a meeting ID copied from Zoom UI', async () => {
      const mockResponse = { data: { recording_files: [] } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.getMeetingRecordings.handler(mockContext, {
        meetingId: '847 3703 8563',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/meetings/84737038563/recordings'
      );
    });

    it('should double-encode a UUID that starts with /', async () => {
      const mockResponse = { data: { recording_files: [] } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.getMeetingRecordings.handler(mockContext, {
        meetingId: '/abc+123==',
      });

      const expectedId = encodeURIComponent(encodeURIComponent('/abc+123=='));
      expect(mockClient.get).toHaveBeenCalledWith(
        `https://api.zoom.us/v2/meetings/${expectedId}/recordings`
      );
    });

    it('should handle meeting with no recordings', async () => {
      const mockResponse = { data: { recording_files: [] } };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.getMeetingRecordings.handler(mockContext, {
        meetingId: '111',
      })) as { recording_files: unknown[] };

      expect(result.recording_files).toHaveLength(0);
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Meeting not found'));

      await expect(
        Zoom.actions.getMeetingRecordings.handler(mockContext, { meetingId: '999' })
      ).rejects.toThrow('Meeting not found');
    });
  });

  describe('listUserRecordings action', () => {
    it('should list recordings with date range', async () => {
      const mockResponse = {
        data: {
          from: '2026-02-01',
          to: '2026-02-28',
          total_records: 1,
          meetings: [
            {
              id: 111,
              topic: 'Standup',
              recording_files: [{ id: 'rec-1', recording_type: 'audio_transcript' }],
            },
          ],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.listUserRecordings.handler(mockContext, {
        userId: 'me',
        from: '2026-02-01',
        to: '2026-02-28',
      })) as ZoomPaginatedResponse;

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/users/me/recordings', {
        params: { from: '2026-02-01', to: '2026-02-28' },
      });
      expect(result.meetings).toHaveLength(1);
    });

    it('should omit optional params when not provided', async () => {
      const mockResponse = { data: { meetings: [] } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.listUserRecordings.handler(mockContext, { userId: 'me' });

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/users/me/recordings', {
        params: {},
      });
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Rate limited'));

      await expect(
        Zoom.actions.listUserRecordings.handler(mockContext, { userId: 'me' })
      ).rejects.toThrow('Rate limited');
    });
  });

  describe('downloadRecordingFile action', () => {
    it('should download and return file content as text', async () => {
      const vttContent = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:05.000\nHello everyone.';
      const mockResponse = {
        data: Buffer.from(vttContent),
        headers: { 'content-type': 'text/vtt' },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.downloadRecordingFile.handler(mockContext, {
        downloadUrl: 'https://zoom.us/rec/download/transcript.vtt',
      })) as { contentType?: string; text: string; truncated: boolean };

      expect(mockClient.get).toHaveBeenCalledWith('https://zoom.us/rec/download/transcript.vtt', {
        responseType: 'arraybuffer',
      });
      expect(result.contentType).toBe('text/vtt');
      expect(result.text).toBe(vttContent);
      expect(result.truncated).toBe(false);
    });

    it('should handle chat log download', async () => {
      const chatContent = '10:00:01 From Matt: Hi team!\n10:00:05 From Sara: Hey!';
      const mockResponse = {
        data: Buffer.from(chatContent),
        headers: { 'content-type': 'text/plain' },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.downloadRecordingFile.handler(mockContext, {
        downloadUrl: 'https://zoom.us/rec/download/chat.txt',
      })) as { contentType?: string; text: string; truncated: boolean };

      expect(result.contentType).toBe('text/plain');
      expect(result.text).toContain('Hi team!');
      expect(result.truncated).toBe(false);
    });

    it('should handle missing content-type header', async () => {
      const mockResponse = {
        data: Buffer.from('some content'),
        headers: {},
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.downloadRecordingFile.handler(mockContext, {
        downloadUrl: 'https://zoom.us/rec/download/file',
      })) as { contentType?: string; text: string; truncated: boolean };

      expect(result.contentType).toBeUndefined();
      expect(result.text).toBe('some content');
      expect(result.truncated).toBe(false);
    });

    it('should truncate content exceeding maxChars', async () => {
      const longContent = 'A'.repeat(200);
      const mockResponse = {
        data: Buffer.from(longContent),
        headers: { 'content-type': 'text/vtt' },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.downloadRecordingFile.handler(mockContext, {
        downloadUrl: 'https://zoom.us/rec/download/long-transcript.vtt',
        maxChars: 50,
      })) as { contentType?: string; text: string; truncated: boolean };

      expect(result.text).toHaveLength(50);
      expect(result.truncated).toBe(true);
    });

    it('should not truncate content within maxChars', async () => {
      const shortContent = 'Hello world';
      const mockResponse = {
        data: Buffer.from(shortContent),
        headers: { 'content-type': 'text/plain' },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.downloadRecordingFile.handler(mockContext, {
        downloadUrl: 'https://zoom.us/rec/download/short.txt',
        maxChars: 1000,
      })) as { contentType?: string; text: string; truncated: boolean };

      expect(result.text).toBe(shortContent);
      expect(result.truncated).toBe(false);
    });

    it('should propagate download errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Forbidden'));

      await expect(
        Zoom.actions.downloadRecordingFile.handler(mockContext, {
          downloadUrl: 'https://zoom.us/rec/download/expired.vtt',
        })
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('getMeetingParticipants action', () => {
    it('should list participants of a past meeting', async () => {
      const mockResponse = {
        data: {
          total_records: 2,
          participants: [
            {
              id: 'p-1',
              name: 'Alice',
              user_email: 'alice@example.com',
              join_time: '2026-02-25T09:00:00Z',
              leave_time: '2026-02-25T09:30:00Z',
              duration: 1800,
            },
            {
              id: 'p-2',
              name: 'Bob',
              user_email: 'bob@example.com',
              join_time: '2026-02-25T09:02:00Z',
              leave_time: '2026-02-25T09:30:00Z',
              duration: 1680,
            },
          ],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.getMeetingParticipants.handler(mockContext, {
        meetingId: '111',
      })) as ZoomPaginatedResponse;

      expect(mockClient.get).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/past_meetings/111/participants',
        { params: {} }
      );
      expect(result.participants).toHaveLength(2);
      const participants = result.participants as Array<Record<string, unknown>>;
      expect(participants[0]).toEqual({
        name: 'Alice',
        user_email: 'alice@example.com',
        join_time: '2026-02-25T09:00:00Z',
        leave_time: '2026-02-25T09:30:00Z',
        duration: 1800,
      });
      expect(participants[0]).not.toHaveProperty('id');
    });

    it('should double-encode a UUID containing //', async () => {
      const mockResponse = { data: { participants: [] } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.getMeetingParticipants.handler(mockContext, {
        meetingId: 'abc//123==',
      });

      const expectedId = encodeURIComponent(encodeURIComponent('abc//123=='));
      expect(mockClient.get).toHaveBeenCalledWith(
        `https://api.zoom.us/v2/past_meetings/${expectedId}/participants`,
        { params: {} }
      );
    });

    it('should pass pagination params', async () => {
      const mockResponse = { data: { participants: [] } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.getMeetingParticipants.handler(mockContext, {
        meetingId: '111',
        pageSize: 50,
        nextPageToken: 'page2',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/past_meetings/111/participants',
        { params: { page_size: 50, next_page_token: 'page2' } }
      );
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Meeting does not exist'));

      await expect(
        Zoom.actions.getMeetingParticipants.handler(mockContext, { meetingId: '999' })
      ).rejects.toThrow('Meeting does not exist');
    });
  });

  describe('getMeetingRegistrants action', () => {
    it('should list registrants of a meeting', async () => {
      const mockResponse = {
        data: {
          total_records: 2,
          registrants: [
            {
              id: 'r-1',
              email: 'alice@example.com',
              first_name: 'Alice',
              last_name: 'Smith',
              status: 'approved',
              create_time: '2026-02-20T10:00:00Z',
            },
            {
              id: 'r-2',
              email: 'bob@example.com',
              first_name: 'Bob',
              last_name: 'Jones',
              status: 'approved',
              create_time: '2026-02-21T11:00:00Z',
            },
          ],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.getMeetingRegistrants.handler(mockContext, {
        meetingId: '111',
      })) as ZoomPaginatedResponse;

      expect(mockClient.get).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/meetings/111/registrants',
        { params: {} }
      );
      expect(result.registrants).toHaveLength(2);
      const registrants = result.registrants as Array<Record<string, unknown>>;
      expect(registrants[0]).toEqual({
        email: 'alice@example.com',
        first_name: 'Alice',
        last_name: 'Smith',
        status: 'approved',
      });
      expect(registrants[0]).not.toHaveProperty('id');
      expect(registrants[0]).not.toHaveProperty('create_time');
    });

    it('should filter by registration status', async () => {
      const mockResponse = { data: { registrants: [] } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Zoom.actions.getMeetingRegistrants.handler(mockContext, {
        meetingId: '111',
        status: 'pending',
        pageSize: 50,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/meetings/111/registrants',
        { params: { status: 'pending', page_size: 50 } }
      );
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Registration not enabled'));

      await expect(
        Zoom.actions.getMeetingRegistrants.handler(mockContext, { meetingId: '111' })
      ).rejects.toThrow('Registration not enabled');
    });
  });

  describe('whoAmI action', () => {
    it('should return a trimmed user profile', async () => {
      const mockResponse = {
        data: {
          id: 'Wk9PTV9VU0VSX0lE',
          first_name: 'Jane',
          last_name: 'Dev',
          display_name: 'Jane Dev',
          email: 'jane.dev@example.com',
          type: 2,
          role_name: 'Owner',
          pmi: 1234567890,
          use_pmi: false,
          personal_meeting_url: 'https://janedev.zoom.us/j/1234567890',
          timezone: 'America/Denver',
          verified: 1,
          dept: 'Engineering',
          created_at: '2019-04-05T15:24:32Z',
          last_login_time: '2026-02-28T22:42:47Z',
          last_client_version: '6.4.0.51205(mac)',
          pic_url: 'https://janedev.zoom.us/p/v2/pic',
          cms_user_id: '',
          jid: 'Wk9PTV9VU0VSX0lE@xmpp.zoom.us',
          group_ids: ['grp1'],
          im_group_ids: ['im-grp1'],
          account_id: 'ACCT_123',
          language: 'en-US',
          phone_country: 'US',
          phone_number: '+1 1234567890',
          status: 'active',
          job_title: 'Software Engineer',
          cost_center: 'CC-100',
          company: 'Zoom',
          location: 'Denver, CO',
          custom_attributes: [{ key: 'k1', name: 'Test', value: 'val' }],
          login_types: [1, 100],
          role_id: '0',
          account_number: 12345678,
          cluster: 'aw1',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await Zoom.actions.whoAmI.handler(mockContext, {})) as Record<
        string,
        unknown
      >;

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/users/me');
      expect(result).toEqual({
        id: 'Wk9PTV9VU0VSX0lE',
        display_name: 'Jane Dev',
        first_name: 'Jane',
        last_name: 'Dev',
        email: 'jane.dev@example.com',
        type: 2,
        role_name: 'Owner',
        status: 'active',
        timezone: 'America/Denver',
        language: 'en-US',
        pmi: 1234567890,
        personal_meeting_url: 'https://janedev.zoom.us/j/1234567890',
        dept: 'Engineering',
        job_title: 'Software Engineer',
        company: 'Zoom',
        location: 'Denver, CO',
        account_id: 'ACCT_123',
        created_at: '2019-04-05T15:24:32Z',
        last_login_time: '2026-02-28T22:42:47Z',
      });
      expect(result).not.toHaveProperty('use_pmi');
      expect(result).not.toHaveProperty('verified');
      expect(result).not.toHaveProperty('pic_url');
      expect(result).not.toHaveProperty('jid');
      expect(result).not.toHaveProperty('cms_user_id');
      expect(result).not.toHaveProperty('group_ids');
      expect(result).not.toHaveProperty('im_group_ids');
      expect(result).not.toHaveProperty('phone_country');
      expect(result).not.toHaveProperty('phone_number');
      expect(result).not.toHaveProperty('cost_center');
      expect(result).not.toHaveProperty('custom_attributes');
      expect(result).not.toHaveProperty('login_types');
      expect(result).not.toHaveProperty('role_id');
      expect(result).not.toHaveProperty('account_number');
      expect(result).not.toHaveProperty('cluster');
      expect(result).not.toHaveProperty('last_client_version');
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Invalid token'));

      await expect(Zoom.actions.whoAmI.handler(mockContext, {})).rejects.toThrow('Invalid token');
    });
  });

  describe('test handler', () => {
    it('should return success with full name', async () => {
      const mockResponse = {
        data: { first_name: 'Matt', last_name: 'Nowzari', email: 'matt@example.com' },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      if (!Zoom.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await Zoom.test.handler(mockContext)) as TestResult;

      expect(mockClient.get).toHaveBeenCalledWith('https://api.zoom.us/v2/users/me');
      expect(result.ok).toBe(true);
      expect(result.message).toBe('Successfully connected to Zoom as: Matt Nowzari');
    });

    it('should fall back to email when name is missing', async () => {
      const mockResponse = {
        data: { email: 'user@example.com' },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      if (!Zoom.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await Zoom.test.handler(mockContext)) as TestResult;

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Successfully connected to Zoom as: user@example.com');
    });

    it('should fall back to Unknown when no identity fields are present', async () => {
      const mockResponse = { data: {} };
      mockClient.get.mockResolvedValue(mockResponse);

      if (!Zoom.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await Zoom.test.handler(mockContext)) as TestResult;

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Successfully connected to Zoom as: Unknown');
    });

    it('should return failure when API is not accessible', async () => {
      mockClient.get.mockRejectedValue(new Error('Invalid credentials'));

      if (!Zoom.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await Zoom.test.handler(mockContext)) as TestResult;

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Invalid credentials');
    });

    it('should handle network errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Network timeout'));

      if (!Zoom.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await Zoom.test.handler(mockContext)) as TestResult;

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Network timeout');
    });

    it('should handle non-Error thrown values', async () => {
      mockClient.get.mockRejectedValue('unexpected string error');

      if (!Zoom.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await Zoom.test.handler(mockContext)) as TestResult;

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Unknown error');
    });
  });
});
