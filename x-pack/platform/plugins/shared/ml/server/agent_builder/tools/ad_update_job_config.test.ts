/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { getAdminCapabilities } from '../../lib/capabilities/__mocks__/ml_capabilities';
import { createAdUpdateJobConfigTool } from './ad_update_job_config';
import { AD_UPDATE_JOB_CONFIG_TOOL_ID } from './tool_ids';

const resolveMlCapabilities = jest.fn().mockResolvedValue(getAdminCapabilities());
const adUpdateJobConfigTool = createAdUpdateJobConfigTool(resolveMlCapabilities);

const createMlMock = () => ({
  updateJob: jest.fn().mockResolvedValue({ job_id: 'my-job' }),
  updateDatafeed: jest.fn().mockResolvedValue({ datafeed_id: 'datafeed-my-job' }),
  postCalendarEvents: jest.fn().mockResolvedValue({ calendars: [] }),
});

const createContext = (mlMock = createMlMock()) =>
  ({
    esClient: { asCurrentUser: { ml: mlMock } },
    request: {},
  } as any);

describe('adUpdateJobConfigTool', () => {
  it('has the correct ID and type', () => {
    expect(adUpdateJobConfigTool.id).toBe(AD_UPDATE_JOB_CONFIG_TOOL_ID);
    expect(adUpdateJobConfigTool.type).toBe(ToolType.builtin);
  });

  describe('handler', () => {
    it('operation=update_memory_limit calls ml.updateJob with analysis_limits', async () => {
      const ml = createMlMock();
      await adUpdateJobConfigTool.handler(
        { operation: 'update_memory_limit', job_id: 'my-job', memory_limit: '512mb' },
        createContext(ml)
      );
      expect(ml.updateJob).toHaveBeenCalledWith({
        job_id: 'my-job',
        body: { analysis_limits: { model_memory_limit: '512mb' } },
      });
    });

    it('operation=update_query_delay calls ml.updateDatafeed with query_delay', async () => {
      const ml = createMlMock();
      await adUpdateJobConfigTool.handler(
        { operation: 'update_query_delay', job_id: 'my-job', query_delay: '120s' },
        createContext(ml)
      );
      expect(ml.updateDatafeed).toHaveBeenCalledWith({
        datafeed_id: 'datafeed-my-job',
        body: { query_delay: '120s' },
      });
    });

    it('operation=update_delayed_data_check calls ml.updateDatafeed with delayed_data_check_config', async () => {
      const ml = createMlMock();
      const config = { enabled: true, check_window: '2h' };
      await adUpdateJobConfigTool.handler(
        { operation: 'update_delayed_data_check', job_id: 'my-job', delayed_data_check: config },
        createContext(ml)
      );
      expect(ml.updateDatafeed).toHaveBeenCalledWith({
        datafeed_id: 'datafeed-my-job',
        body: { delayed_data_check_config: config },
      });
    });

    it('operation=create_calendar_event calls ml.postCalendarEvents with default calendar_id', async () => {
      const ml = createMlMock();
      const event = {
        start_time: '2024-01-01T00:00:00Z',
        end_time: '2024-01-02T00:00:00Z',
        description: 'holiday',
      };
      await adUpdateJobConfigTool.handler(
        { operation: 'create_calendar_event', job_id: 'my-job', calendar_event: event },
        createContext(ml)
      );
      expect(ml.postCalendarEvents).toHaveBeenCalledWith({
        calendar_id: 'calendar-my-job',
        events: [event],
      });
    });

    it('operation=create_calendar_event uses provided calendar_id', async () => {
      const ml = createMlMock();
      const event = {
        start_time: '2024-01-01T00:00:00Z',
        end_time: '2024-01-02T00:00:00Z',
        description: 'holiday',
      };
      await adUpdateJobConfigTool.handler(
        {
          operation: 'create_calendar_event',
          job_id: 'my-job',
          calendar_id: 'holiday-cal',
          calendar_event: event,
        },
        createContext(ml)
      );
      expect(ml.postCalendarEvents).toHaveBeenCalledWith({
        calendar_id: 'holiday-cal',
        events: [event],
      });
    });

    it('returns error result when ML client throws', async () => {
      const ml = createMlMock();
      ml.updateJob.mockRejectedValue(new Error('job closed'));
      const result = await adUpdateJobConfigTool.handler(
        { operation: 'update_memory_limit', job_id: 'my-job', memory_limit: '512mb' },
        createContext(ml)
      );
      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe(
        'Error executing update_memory_limit: job closed'
      );
    });
  });
});
