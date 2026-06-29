/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type { ConnectorSpec } from '../../connector_spec';
import {
  SearchEventsInputSchema,
  GetEventInputSchema,
  ListCalendarsInputSchema,
  ListEventsInputSchema,
  FreeBusyInputSchema,
} from './types';
import type {
  SearchEventsInput,
  GetEventInput,
  ListCalendarsInput,
  ListEventsInput,
  FreeBusyInput,
} from './types';
// Google Calendar API constants
const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_MAX_RESULTS = 50;
const MAX_RESULTS_LIMIT = 2500;

function rethrowGoogleCalendarError(error: unknown): void {
  const axiosError = error as {
    response?: { data?: { error?: { message?: string; code?: number } } };
  };
  const googleError = axiosError.response?.data?.error;
  if (googleError) {
    throw new Error(`Google Calendar API error (${googleError.code}): ${googleError.message}`);
  }
}

export const GoogleCalendar: ConnectorSpec = {
  metadata: {
    id: '.google_calendar',
    displayName: 'Google Calendar',
    description: i18n.translate('core.kibanaConnectorSpecs.googleCalendar.metadata.description', {
      defaultMessage: 'Search and access events and calendars in Google Calendar',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [
      {
        type: 'ears',
        isRecommended: true,
        isExperimental: true,
        overrides: {
          meta: { scope: { disabled: true } },
        },
        defaults: {
          provider: 'google',
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
        },
      },
      {
        type: 'oauth_authorization_code',
        overrides: {
          meta: {
            authorizationUrl: { hidden: true },
            tokenUrl: { hidden: true },
            scope: { hidden: true },
          },
        },
        defaults: {
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
        },
      },
      { type: 'bearer', isLegacy: true, defaults: {} },
    ],
    headers: {
      Accept: 'application/json',
    },
  },

  actions: {
    searchEvents: {
      isTool: true,
      description:
        'Search for events in Google Calendar by keywords. Matches against event summary, description, location, and attendee names. Results include high-level metadata like title, time, location, and attendees.',
      input: SearchEventsInputSchema,
      handler: async (ctx, input: SearchEventsInput) => {
        const calendarId = encodeURIComponent(input.calendarId || 'primary');
        const params: Record<string, string | number | boolean> = {
          q: input.query,
          maxResults: Math.min(input.maxResults || DEFAULT_MAX_RESULTS, MAX_RESULTS_LIMIT),
          singleEvents: true,
          orderBy: input.orderBy || 'startTime',
          timeMin: input.timeMin || new Date().toISOString(),
        };

        if (input.timeMax) {
          params.timeMax = input.timeMax;
        }

        try {
          const response = await ctx.client.get(
            `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events`,
            { params }
          );

          return response.data;
        } catch (error: unknown) {
          rethrowGoogleCalendarError(error);
          throw error;
        }
      },
    },

    getEvent: {
      isTool: true,
      description:
        'Retrieve full details of a specific Google Calendar event by its ID. Returns comprehensive metadata including summary, description, location, start/end times, organizer, attendees with response status, recurrence info, conference/hangout links, and attachments.',
      input: GetEventInputSchema,
      handler: async (ctx, input: GetEventInput) => {
        const calendarId = encodeURIComponent(input.calendarId || 'primary');
        const eventId = encodeURIComponent(input.eventId);

        try {
          const response = await ctx.client.get(
            `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events/${eventId}`
          );

          return response.data;
        } catch (error: unknown) {
          rethrowGoogleCalendarError(error);
          throw error;
        }
      },
    },

    listCalendars: {
      isTool: true,
      description:
        'List all calendars accessible to the user. Returns calendar ID, name, description, whether it is the primary calendar, access role, and time zone. Use this to discover available calendars before searching or listing events.',
      input: ListCalendarsInputSchema,
      handler: async (ctx, input: ListCalendarsInput) => {
        const params: Record<string, string> = {};
        if (input.pageToken) {
          params.pageToken = input.pageToken;
        }

        try {
          const response = await ctx.client.get(
            `${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`,
            { params }
          );

          return response.data;
        } catch (error: unknown) {
          rethrowGoogleCalendarError(error);
          throw error;
        }
      },
    },

    listEvents: {
      isTool: true,
      description:
        'List events from a Google Calendar, optionally filtered by time range. Returns events in chronological order with high-level metadata. Use this to browse upcoming or past events without a specific search query.',
      input: ListEventsInputSchema,
      handler: async (ctx, input: ListEventsInput) => {
        const calendarId = encodeURIComponent(input.calendarId || 'primary');
        const params: Record<string, string | number | boolean> = {
          maxResults: Math.min(input.maxResults || DEFAULT_MAX_RESULTS, MAX_RESULTS_LIMIT),
          singleEvents: true,
          orderBy: input.orderBy || 'startTime',
        };

        if (input.timeMin) {
          params.timeMin = input.timeMin;
        }
        if (input.timeMax) {
          params.timeMax = input.timeMax;
        }
        if (input.pageToken) {
          params.pageToken = input.pageToken;
        }

        try {
          const response = await ctx.client.get(
            `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events`,
            { params }
          );

          return response.data;
        } catch (error: unknown) {
          rethrowGoogleCalendarError(error);
          throw error;
        }
      },
    },

    freeBusy: {
      isTool: true,
      description:
        "Check free/busy availability for one or more people or calendars over a time range. Returns busy time slots for each requested calendar. More token-efficient than listing full events when you only need to know if someone is available. Use a person's email address as their calendar ID.",
      input: FreeBusyInputSchema,
      handler: async (ctx, input: FreeBusyInput) => {
        const body: Record<string, unknown> = {
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          items: input.calendarIds.map((id) => ({ id })),
        };

        if (input.timeZone) {
          body.timeZone = input.timeZone;
        }

        try {
          const response = await ctx.client.post(`${GOOGLE_CALENDAR_API_BASE}/freeBusy`, body);

          return response.data;
        } catch (error: unknown) {
          rethrowGoogleCalendarError(error);
          throw error;
        }
      },
    },
  },

  skill: [
    'Use Google Calendar to discover, browse, search, and check availability for calendar events.',
    '',
    'Discovery: Call listCalendars first to find available calendars and their IDs.',
    'Use "primary" as the calendarId for the authenticated user\'s main calendar.',
    '',
    'Availability: Prefer freeBusy over listEvents when you only need to know whether someone is free or busy — it is more token-efficient.',
  ].join('\n'),

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.googleCalendar.test.description', {
      defaultMessage: 'Verifies Google Calendar connection by fetching calendar list',
    }),
    handler: async (ctx) => {
      try {
        const response = await ctx.client.get(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`, {
          params: {
            maxResults: 1,
          },
        });

        if (response.status !== 200) {
          return { ok: false, message: 'Failed to connect to Google Calendar API' };
        }

        return {
          ok: true,
          message: 'Successfully connected to Google Calendar API',
        };
      } catch (error) {
        return {
          ok: false,
          message: `Failed to connect to Google Calendar API: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        };
      }
    },
  },
};
