/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { getAdminCapabilities } from '../../lib/capabilities/__mocks__/ml_capabilities';
import { createAdGetJobInfoTool } from './ad_get_job_info';
import { AD_GET_JOB_INFO_TOOL_ID } from './tool_ids';

const resolveMlCapabilities = jest.fn().mockResolvedValue(getAdminCapabilities());
const adGetJobInfoTool = createAdGetJobInfoTool(resolveMlCapabilities);

const createMlMock = () => ({
  getJobs: jest.fn().mockResolvedValue({ jobs: [] }),
  getDatafeeds: jest.fn().mockResolvedValue({ datafeeds: [] }),
  getModelSnapshots: jest.fn().mockResolvedValue({ model_snapshots: [] }),
  getCalendars: jest.fn().mockResolvedValue({ calendars: [] }),
  getCalendarEvents: jest.fn().mockResolvedValue({ events: [] }),
  info: jest.fn().mockResolvedValue({ version: '8.0.0' }),
});

const createEsClientMock = (mlMock = createMlMock()) => ({
  asCurrentUser: {
    ml: mlMock,
    search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
    indices: { exists: jest.fn().mockResolvedValue(true) },
  },
});

const createContext = (esClient = createEsClientMock()) =>
  ({
    esClient,
    request: {},
  } as any);

describe('adGetJobInfoTool', () => {
  it('has the correct ID and type', () => {
    expect(adGetJobInfoTool.id).toBe(AD_GET_JOB_INFO_TOOL_ID);
    expect(adGetJobInfoTool.type).toBe(ToolType.builtin);
  });

  it('has a non-empty description', () => {
    expect(adGetJobInfoTool.description).toBeTruthy();
  });

  describe('handler', () => {
    it('operation=get_jobs calls ml.getJobs and returns json result', async () => {
      const ml = createMlMock();
      const context = createContext(createEsClientMock(ml));

      const result = await adGetJobInfoTool.handler({ operation: 'get_jobs' }, context);

      expect(ml.getJobs).toHaveBeenCalledWith({});
      expect(result).toEqual({ results: [{ type: ToolResultType.other, data: { jobs: [] } }] });
    });

    it('operation=get_jobs with job_id scopes the call', async () => {
      const ml = createMlMock();
      const context = createContext(createEsClientMock(ml));

      await adGetJobInfoTool.handler({ operation: 'get_jobs', job_id: 'my-job' }, context);

      expect(ml.getJobs).toHaveBeenCalledWith({ job_id: 'my-job' });
    });

    it('operation=get_datafeed_config calls ml.getDatafeeds', async () => {
      const ml = createMlMock();
      const context = createContext(createEsClientMock(ml));

      await adGetJobInfoTool.handler(
        { operation: 'get_datafeed_config', job_id: 'my-job' },
        context
      );

      expect(ml.getDatafeeds).toHaveBeenCalledWith({ datafeed_id: 'datafeed-my-job' });
    });

    it('operation=get_datafeed_config returns error when job_id is missing', async () => {
      const context = createContext();

      const result = await adGetJobInfoTool.handler({ operation: 'get_datafeed_config' }, context);

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe(
        'job_id is required for get_datafeed_config'
      );
    });

    it('operation=get_job_messages returns error when job_id is missing', async () => {
      const context = createContext();

      const result = await adGetJobInfoTool.handler({ operation: 'get_job_messages' }, context);

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe(
        'job_id is required for get_job_messages'
      );
    });

    it('operation=get_job_messages searches .ml-notifications-* with job filter', async () => {
      const esClient = createEsClientMock();
      const context = createContext(esClient);

      const result = await adGetJobInfoTool.handler(
        { operation: 'get_job_messages', job_id: 'my-job' },
        context
      );

      expect(esClient.asCurrentUser.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: '.ml-notifications-*',
          query: { term: { job_id: 'my-job' } },
        })
      );
      expect((result as { results: Array<{ type: string }> }).results[0].type).toBe(
        ToolResultType.other
      );
    });

    it('operation=get_calendar_events returns error when job_id is missing', async () => {
      const context = createContext();

      const result = await adGetJobInfoTool.handler({ operation: 'get_calendar_events' }, context);

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe(
        'job_id is required for get_calendar_events'
      );
    });

    it('operation=get_calendar_events looks up calendars associated with the job', async () => {
      const ml = createMlMock();
      ml.getJobs.mockResolvedValue({ jobs: [{ job_id: 'my-job', groups: ['ops-group'] }] });
      ml.getCalendars.mockResolvedValue({
        calendars: [
          { calendar_id: 'holiday-cal', job_ids: ['other-job'] },
          { calendar_id: 'ops-cal', job_ids: ['ops-group'] },
          { calendar_id: 'direct-cal', job_ids: ['my-job'] },
          { calendar_id: 'global-cal', job_ids: ['_all'] },
        ],
      });
      ml.getCalendarEvents.mockImplementation(async ({ calendar_id: calendarId }) => ({
        events: [{ calendar_id: calendarId, description: `${calendarId}-event` }],
      }));
      const context = createContext(createEsClientMock(ml));

      const result = await adGetJobInfoTool.handler(
        { operation: 'get_calendar_events', job_id: 'my-job' },
        context
      );

      expect(ml.getCalendars).toHaveBeenCalledWith({ page: { from: 0, size: 10000 } });
      expect(ml.getCalendarEvents).toHaveBeenCalledTimes(3);
      expect(ml.getCalendarEvents).toHaveBeenCalledWith({ calendar_id: 'ops-cal' });
      expect(ml.getCalendarEvents).toHaveBeenCalledWith({ calendar_id: 'direct-cal' });
      expect(ml.getCalendarEvents).toHaveBeenCalledWith({ calendar_id: 'global-cal' });
      expect(result).toEqual({
        results: [
          {
            type: ToolResultType.other,
            data: {
              calendars: [
                {
                  calendar_id: 'ops-cal',
                  job_ids: ['ops-group'],
                  events: [{ calendar_id: 'ops-cal', description: 'ops-cal-event' }],
                },
                {
                  calendar_id: 'direct-cal',
                  job_ids: ['my-job'],
                  events: [{ calendar_id: 'direct-cal', description: 'direct-cal-event' }],
                },
                {
                  calendar_id: 'global-cal',
                  job_ids: ['_all'],
                  events: [{ calendar_id: 'global-cal', description: 'global-cal-event' }],
                },
              ],
            },
          },
        ],
      });
    });

    it('operation=get_calendar_events returns error when job is not found', async () => {
      const ml = createMlMock();
      ml.getJobs.mockResolvedValue({ jobs: [] });
      const context = createContext(createEsClientMock(ml));

      const result = await adGetJobInfoTool.handler(
        { operation: 'get_calendar_events', job_id: 'missing-job' },
        context
      );

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe('Job not found: missing-job');
    });

    it('operation=get_model_snapshots calls ml.getModelSnapshots', async () => {
      const ml = createMlMock();
      const context = createContext(createEsClientMock(ml));

      await adGetJobInfoTool.handler(
        { operation: 'get_model_snapshots', job_id: 'my-job' },
        context
      );

      expect(ml.getModelSnapshots).toHaveBeenCalledWith({ job_id: 'my-job' });
    });

    it('operation=validate_permissions calls ml.info and indices.exists', async () => {
      const ml = createMlMock();
      const esClient = createEsClientMock(ml);
      const context = createContext(esClient);

      const result = await adGetJobInfoTool.handler({ operation: 'validate_permissions' }, context);

      expect(ml.info).toHaveBeenCalled();
      expect(esClient.asCurrentUser.indices.exists).toHaveBeenCalled();
      expect((result as { results: Array<{ type: string }> }).results[0].type).toBe(
        ToolResultType.other
      );
    });

    it('returns error result when ML client throws', async () => {
      const ml = createMlMock();
      ml.getJobs.mockRejectedValue(new Error('unauthorized'));
      const context = createContext(createEsClientMock(ml));

      const result = await adGetJobInfoTool.handler({ operation: 'get_jobs' }, context);

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe('Error executing get_jobs: unauthorized');
    });
  });
});
