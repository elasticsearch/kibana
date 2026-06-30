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
import { GoogleCalendar } from './google_calendar';

const API_BASE = 'https://www.googleapis.com/calendar/v3';

describe('GoogleCalendar', () => {
  const mockClient = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const mockContext = {
    client: mockClient,
    config: {},
    log: { debug: jest.fn() },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have the correct metadata', () => {
    expect(GoogleCalendar.metadata.id).toBe('.google_calendar');
    expect(GoogleCalendar.metadata.displayName).toBe('Google Calendar');
    expect(GoogleCalendar.metadata.minimumLicense).toBe('enterprise');
    expect(GoogleCalendar.metadata.supportedFeatureIds).toContain('workflows');
  });

  it('should support ears auth type as first visible option', () => {
    const visibleTypes = GoogleCalendar.auth?.types.filter(
      (t) => typeof t === 'string' || !(t as AuthTypeDef).isLegacy
    );
    expect(visibleTypes?.[0]).toEqual(expect.objectContaining({ type: 'ears' }));
  });

  it('bearer auth is hidden (not shown in picker) but retained for existing connectors', () => {
    const bearerDef = GoogleCalendar.auth?.types.find(
      (t): t is AuthTypeDef => typeof t === 'object' && t.type === 'bearer'
    );
    expect(bearerDef).toBeDefined();
    expect(bearerDef?.isLegacy).toBe(true);
  });

  it('existing connectors with bearer auth still pass schema validation', () => {
    const schema = generateSecretsSchemaFromSpec(GoogleCalendar.auth, {
      isEarsEnabled: true,
      isEarsExperimentalEnabled: true,
    });
    const result = schema.safeParse({ authType: 'bearer', token: 'some-legacy-token' });
    expect(result.success).toBe(true);
  });

  it('should support oauth_authorization_code with correct Google defaults', () => {
    const oauthType = GoogleCalendar.auth?.types.find(
      (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
    );
    expect(oauthType).toBeDefined();
    expect(oauthType).toMatchObject({
      type: 'oauth_authorization_code',
      defaults: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
      },
    });
  });

  it('should support ears auth type with correct Google defaults and overrides', () => {
    const types = GoogleCalendar.auth?.types as Array<
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
        provider: 'google',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
      },
      overrides: {
        meta: { scope: { disabled: true } },
      },
    });
  });

  it('should define all five actions as tools', () => {
    expect(GoogleCalendar.actions.searchEvents.isTool).toBe(true);
    expect(GoogleCalendar.actions.getEvent.isTool).toBe(true);
    expect(GoogleCalendar.actions.listCalendars.isTool).toBe(true);
    expect(GoogleCalendar.actions.listEvents.isTool).toBe(true);
    expect(GoogleCalendar.actions.freeBusy.isTool).toBe(true);
  });

  it('should have a test handler', () => {
    expect(GoogleCalendar.test?.handler).toBeInstanceOf(Function);
  });

  describe('searchEvents action', () => {
    const mockEvent = {
      id: 'evt1',
      summary: 'Team standup',
      description: 'Daily sync',
      location: 'Room A',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      end: { dateTime: '2024-01-15T10:30:00Z' },
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=evt1',
      organizer: { email: 'organizer@example.com' },
      attendees: [{ email: 'user@example.com', responseStatus: 'accepted' }],
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-10T00:00:00Z',
    };

    it('should call the events list API with the correct params', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [mockEvent] } });

      await GoogleCalendar.actions.searchEvents.handler(mockContext, {
        query: 'team standup',
        calendarId: 'primary',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${API_BASE}/calendars/primary/events`,
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'team standup',
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 50,
          }),
        })
      );
    });

    it('should default timeMin to now when not provided', async () => {
      const before = new Date().toISOString();
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.searchEvents.handler(mockContext, {
        query: 'standup',
        calendarId: 'primary',
      });

      const after = new Date().toISOString();
      const usedTimeMin = mockClient.get.mock.calls[0][1].params.timeMin as string;
      expect(usedTimeMin >= before).toBe(true);
      expect(usedTimeMin <= after).toBe(true);
    });

    it('should use provided orderBy value', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.searchEvents.handler(mockContext, {
        query: 'standup',
        calendarId: 'primary',
        orderBy: 'updated',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ orderBy: 'updated' }) })
      );
    });

    it('should pass timeMin and timeMax when provided', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.searchEvents.handler(mockContext, {
        query: 'planning',
        calendarId: 'primary',
        timeMin: '2024-01-01T00:00:00Z',
        timeMax: '2024-12-31T23:59:59Z',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            timeMin: '2024-01-01T00:00:00Z',
            timeMax: '2024-12-31T23:59:59Z',
          }),
        })
      );
    });

    it('should URL-encode the calendarId', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.searchEvents.handler(mockContext, {
        query: 'meeting',
        calendarId: 'user@example.com',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${API_BASE}/calendars/user%40example.com/events`,
        expect.anything()
      );
    });

    it('should return raw API response data', async () => {
      const rawResponse = { items: [mockEvent], nextPageToken: 'token123' };
      mockClient.get.mockResolvedValue({ data: rawResponse });

      const result = await GoogleCalendar.actions.searchEvents.handler(mockContext, {
        query: 'standup',
        calendarId: 'primary',
      });

      expect(result).toEqual(rawResponse);
    });

    it('should cap maxResults at 2500', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.searchEvents.handler(mockContext, {
        query: 'all events',
        calendarId: 'primary',
        maxResults: 9999,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ maxResults: 2500 }) })
      );
    });
  });

  describe('getEvent action', () => {
    it('should call the get event API with encoded IDs', async () => {
      const mockEventData = { id: 'evt1', summary: 'Meeting' };
      mockClient.get.mockResolvedValue({ data: mockEventData });

      await GoogleCalendar.actions.getEvent.handler(mockContext, {
        eventId: 'evt1',
        calendarId: 'primary',
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${API_BASE}/calendars/primary/events/evt1`);
    });
  });

  describe('listCalendars action', () => {
    it('should call the calendarList API', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.listCalendars.handler(mockContext, {});

      expect(mockClient.get).toHaveBeenCalledWith(
        `${API_BASE}/users/me/calendarList`,
        expect.anything()
      );
    });

    it('should pass pageToken when provided', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.listCalendars.handler(mockContext, {
        pageToken: 'page2',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { pageToken: 'page2' } })
      );
    });
  });

  describe('listEvents action', () => {
    it('should call the events list API without a query param', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.listEvents.handler(mockContext, {
        calendarId: 'primary',
      });

      const call = mockClient.get.mock.calls[0];
      expect(call[0]).toBe(`${API_BASE}/calendars/primary/events`);
      expect(call[1].params).not.toHaveProperty('q');
    });

    it('should use provided orderBy value', async () => {
      mockClient.get.mockResolvedValue({ data: { items: [] } });

      await GoogleCalendar.actions.listEvents.handler(mockContext, {
        calendarId: 'primary',
        orderBy: 'updated',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ orderBy: 'updated' }) })
      );
    });
  });

  describe('freeBusy action', () => {
    it('should call the freeBusy API with correct body', async () => {
      const mockResponse = {
        kind: 'calendar#freeBusy',
        timeMin: '2024-01-15T09:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        calendars: {
          primary: { busy: [{ start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z' }] },
        },
      };
      mockClient.post.mockResolvedValue({ data: mockResponse });

      await GoogleCalendar.actions.freeBusy.handler(mockContext, {
        timeMin: '2024-01-15T09:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        calendarIds: ['primary', 'colleague@example.com'],
      });

      expect(mockClient.post).toHaveBeenCalledWith(`${API_BASE}/freeBusy`, {
        timeMin: '2024-01-15T09:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        items: [{ id: 'primary' }, { id: 'colleague@example.com' }],
      });
    });

    it('should include timeZone when provided', async () => {
      mockClient.post.mockResolvedValue({ data: { calendars: {} } });

      await GoogleCalendar.actions.freeBusy.handler(mockContext, {
        timeMin: '2024-01-15T09:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        calendarIds: ['primary'],
        timeZone: 'America/New_York',
      });

      expect(mockClient.post).toHaveBeenCalledWith(`${API_BASE}/freeBusy`, {
        timeMin: '2024-01-15T09:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        items: [{ id: 'primary' }],
        timeZone: 'America/New_York',
      });
    });

    it('should return raw API response data', async () => {
      const mockResponse = {
        kind: 'calendar#freeBusy',
        calendars: {
          'user@example.com': {
            busy: [{ start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z' }],
          },
        },
      };
      mockClient.post.mockResolvedValue({ data: mockResponse });

      const result = await GoogleCalendar.actions.freeBusy.handler(mockContext, {
        timeMin: '2024-01-15T09:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        calendarIds: ['user@example.com'],
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Google API error handling', () => {
    it('should surface a formatted Google API error from a handler', async () => {
      mockClient.get.mockRejectedValue({
        response: { data: { error: { code: 403, message: 'Forbidden' } } },
      });

      await expect(
        GoogleCalendar.actions.searchEvents.handler(mockContext, {
          query: 'test',
          calendarId: 'primary',
        })
      ).rejects.toThrow('Google Calendar API error (403): Forbidden');
    });

    it('should re-throw the original error when there is no Google API error body', async () => {
      const networkError = new Error('network error');
      mockClient.get.mockRejectedValue(networkError);

      await expect(
        GoogleCalendar.actions.searchEvents.handler(mockContext, {
          query: 'test',
          calendarId: 'primary',
        })
      ).rejects.toThrow('network error');
    });
  });

  describe('test handler', () => {
    it('should return ok: true on successful connection', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { items: [] } });

      const result = await GoogleCalendar.test?.handler(mockContext);

      expect(result).toEqual({
        ok: true,
        message: 'Successfully connected to Google Calendar API',
      });
    });

    it('should return ok: false on error', async () => {
      mockClient.get.mockRejectedValue(new Error('Unauthorized'));

      const result = await GoogleCalendar.test?.handler(mockContext);

      expect(result).toMatchObject({ ok: false });
      expect((result as { message: string }).message).toContain('Unauthorized');
    });
  });
});
