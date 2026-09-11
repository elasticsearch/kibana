/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { getAdminCapabilities } from '../../lib/capabilities/__mocks__/ml_capabilities';
import { createAdManageJobStateTool } from './ad_manage_job_state';
import { AD_MANAGE_JOB_STATE_TOOL_ID } from './tool_ids';

const resolveMlCapabilities = jest.fn().mockResolvedValue(getAdminCapabilities());
const adManageJobStateTool = createAdManageJobStateTool(resolveMlCapabilities);

const createMlMock = () => ({
  openJob: jest.fn().mockResolvedValue({ opened: true }),
  closeJob: jest.fn().mockResolvedValue({ closed: true }),
  startDatafeed: jest.fn().mockResolvedValue({ started: true }),
  stopDatafeed: jest.fn().mockResolvedValue({ stopped: true }),
  revertModelSnapshot: jest.fn().mockResolvedValue({ model: {} }),
  previewDatafeed: jest.fn().mockResolvedValue([]),
  getJobs: jest.fn().mockResolvedValue({ jobs: [{ groups: ['ml-agent-scratch'] }] }),
  deleteDatafeed: jest.fn().mockResolvedValue({ acknowledged: true }),
  deleteJob: jest.fn().mockResolvedValue({ acknowledged: true }),
  getDatafeedStats: jest.fn().mockResolvedValue({ datafeeds: [{ state: 'stopped' }] }),
  getJobStats: jest.fn().mockResolvedValue({
    jobs: [{ state: 'opened', data_counts: { latest_record_timestamp: 100 } }],
  }),
});

const createContext = (
  mlMock = createMlMock(),
  events = { reportProgress: jest.fn(), sendUiEvent: jest.fn() }
) =>
  ({
    esClient: { asCurrentUser: { ml: mlMock } },
    request: {},
    events,
  } as any);

const getResultData = (result: unknown) =>
  (result as { results: Array<{ type: string; data: Record<string, unknown> }> }).results[0];

describe('adManageJobStateTool', () => {
  it('has the correct ID and type', () => {
    expect(adManageJobStateTool.id).toBe(AD_MANAGE_JOB_STATE_TOOL_ID);
    expect(adManageJobStateTool.type).toBe(ToolType.builtin);
  });

  describe('handler', () => {
    it('operation=open_job calls ml.openJob', async () => {
      const ml = createMlMock();
      await adManageJobStateTool.handler(
        { operation: 'open_job', job_id: 'my-job' },
        createContext(ml)
      );
      expect(ml.openJob).toHaveBeenCalledWith({ job_id: 'my-job' });
    });

    it('operation=close_job calls ml.closeJob', async () => {
      const ml = createMlMock();
      await adManageJobStateTool.handler(
        { operation: 'close_job', job_id: 'my-job' },
        createContext(ml)
      );
      expect(ml.closeJob).toHaveBeenCalledWith({ job_id: 'my-job' });
    });

    it('operation=start_datafeed calls ml.startDatafeed with datafeed-{job_id}', async () => {
      const ml = createMlMock();
      await adManageJobStateTool.handler(
        { operation: 'start_datafeed', job_id: 'my-job' },
        createContext(ml)
      );
      expect(ml.startDatafeed).toHaveBeenCalledWith({ datafeed_id: 'datafeed-my-job', body: {} });
    });

    it('operation=start_datafeed passes start and end when provided', async () => {
      const ml = createMlMock();
      await adManageJobStateTool.handler(
        {
          operation: 'start_datafeed',
          job_id: 'my-job',
          start: '2024-01-01T00:00:00Z',
          end: '2024-02-01T00:00:00Z',
        },
        createContext(ml)
      );
      expect(ml.startDatafeed).toHaveBeenCalledWith({
        datafeed_id: 'datafeed-my-job',
        body: { start: '2024-01-01T00:00:00Z', end: '2024-02-01T00:00:00Z' },
      });
    });

    it('operation=stop_datafeed calls ml.stopDatafeed', async () => {
      const ml = createMlMock();
      await adManageJobStateTool.handler(
        { operation: 'stop_datafeed', job_id: 'my-job' },
        createContext(ml)
      );
      expect(ml.stopDatafeed).toHaveBeenCalledWith({ datafeed_id: 'datafeed-my-job' });
    });

    it('operation=revert_model_snapshot calls ml.revertModelSnapshot', async () => {
      const ml = createMlMock();
      await adManageJobStateTool.handler(
        { operation: 'revert_model_snapshot', job_id: 'my-job', snapshot_id: 'snap-1' },
        createContext(ml)
      );
      expect(ml.revertModelSnapshot).toHaveBeenCalledWith({
        job_id: 'my-job',
        snapshot_id: 'snap-1',
      });
    });

    it('operation=revert_model_snapshot without snapshot_id returns error', async () => {
      const result = await adManageJobStateTool.handler(
        { operation: 'revert_model_snapshot', job_id: 'my-job' },
        createContext()
      );
      expect(
        (result as { results: Array<{ type: string; data: { message: string } }> }).results[0].type
      ).toBe(ToolResultType.error);
      expect(
        (result as { results: Array<{ type: string; data: { message: string } }> }).results[0].data
          .message
      ).toMatch('snapshot_id is required');
    });

    it('operation=preview_datafeed calls ml.previewDatafeed', async () => {
      const ml = createMlMock();
      await adManageJobStateTool.handler(
        { operation: 'preview_datafeed', job_id: 'my-job' },
        createContext(ml)
      );
      expect(ml.previewDatafeed).toHaveBeenCalledWith({ datafeed_id: 'datafeed-my-job' });
    });

    it('returns error result when ML client throws', async () => {
      const ml = createMlMock();
      ml.openJob.mockRejectedValue(new Error('already open'));
      const result = await adManageJobStateTool.handler(
        { operation: 'open_job', job_id: 'my-job' },
        createContext(ml)
      );
      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe('Error executing open_job: already open');
    });

    it('operation=await_batch_completion returns completed when the datafeed has stopped', async () => {
      const ml = createMlMock();
      const events = { reportProgress: jest.fn(), sendUiEvent: jest.fn() };
      const result = await adManageJobStateTool.handler(
        {
          operation: 'await_batch_completion',
          job_id: 'my-job',
          datafeed_start_ms: 0,
          datafeed_end_ms: 200,
        },
        createContext(ml, events)
      );

      expect(ml.getDatafeedStats).toHaveBeenCalledWith({ datafeed_id: 'datafeed-my-job' });
      expect(ml.getJobStats).toHaveBeenCalledWith({ job_id: 'my-job' });
      const resultData = getResultData(result);
      expect(resultData.type).toBe(ToolResultType.other);
      expect(resultData.data).toMatchObject({
        status: 'completed',
        job_id: 'my-job',
        datafeed_id: 'datafeed-my-job',
        datafeed_state: 'stopped',
        progress_pct: 100,
      });
      expect(events.reportProgress).toHaveBeenCalled();
    });

    it('operation=await_batch_completion returns timed_out when the datafeed is still running', async () => {
      const ml = createMlMock();
      ml.getDatafeedStats.mockResolvedValue({ datafeeds: [{ state: 'started' }] });
      ml.getJobStats.mockResolvedValue({
        jobs: [{ state: 'opened', data_counts: { latest_record_timestamp: 50 } }],
      });

      const result = await adManageJobStateTool.handler(
        {
          operation: 'await_batch_completion',
          job_id: 'my-job',
          max_wait_seconds: 0,
          datafeed_start_ms: 0,
          datafeed_end_ms: 200,
        },
        createContext(ml)
      );

      const resultData = getResultData(result);
      expect(resultData.type).toBe(ToolResultType.other);
      expect(resultData.data).toMatchObject({
        status: 'timed_out',
        datafeed_state: 'started',
        progress_pct: 25,
      });
      expect(String(resultData.data.message)).toMatch('Call await_batch_completion again');
    });

    it('operation=await_batch_completion polls until the datafeed stops', async () => {
      jest.useFakeTimers();
      try {
        const ml = createMlMock();
        ml.getDatafeedStats
          .mockResolvedValueOnce({ datafeeds: [{ state: 'started' }] })
          .mockResolvedValue({ datafeeds: [{ state: 'stopped' }] });
        ml.getJobStats.mockResolvedValue({
          jobs: [{ state: 'opened', data_counts: { latest_record_timestamp: 50 } }],
        });

        const resultPromise = adManageJobStateTool.handler(
          {
            operation: 'await_batch_completion',
            job_id: 'my-job',
            max_wait_seconds: 30,
            datafeed_start_ms: 0,
            datafeed_end_ms: 100,
          },
          createContext(ml)
        );

        await jest.runAllTimersAsync();
        const resultData = getResultData(await resultPromise);
        expect(ml.getDatafeedStats.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(resultData.data).toMatchObject({
          status: 'completed',
          datafeed_state: 'stopped',
          progress_pct: 100,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('operation=await_batch_completion returns failed when the job is failed', async () => {
      const ml = createMlMock();
      ml.getDatafeedStats.mockResolvedValue({ datafeeds: [{ state: 'started' }] });
      ml.getJobStats.mockResolvedValue({
        jobs: [{ state: 'failed', data_counts: {} }],
      });

      const result = await adManageJobStateTool.handler(
        { operation: 'await_batch_completion', job_id: 'my-job', max_wait_seconds: 0 },
        createContext(ml)
      );

      expect(getResultData(result).data).toMatchObject({
        status: 'failed',
        job_state: 'failed',
      });
    });

    it('operation=delete_job uses the current-user ML client when mlClient is unavailable', async () => {
      const ml = createMlMock();
      await adManageJobStateTool.handler(
        { operation: 'delete_job', job_id: 'scratch-job' },
        createContext(ml)
      );

      expect(ml.getJobs).toHaveBeenCalledWith({ job_id: 'scratch-job' });
      expect(ml.stopDatafeed).toHaveBeenCalledWith({
        datafeed_id: 'datafeed-scratch-job',
        body: { force: true },
      });
      expect(ml.deleteDatafeed).toHaveBeenCalledWith({ datafeed_id: 'datafeed-scratch-job' });
      expect(ml.deleteJob).toHaveBeenCalledWith({
        job_id: 'scratch-job',
        delete_user_annotations: true,
      });
    });

    it('operation=delete_job refuses jobs that are not in the scratch group', async () => {
      const ml = createMlMock();
      ml.getJobs.mockResolvedValue({ jobs: [{ groups: ['production'] }] });
      const result = await adManageJobStateTool.handler(
        { operation: 'delete_job', job_id: 'prod-job' },
        createContext(ml)
      );

      expect(ml.deleteJob).not.toHaveBeenCalled();
      expect(getResultData(result).type).toBe(ToolResultType.error);
      expect(String(getResultData(result).data.message)).toMatch('ml-agent-scratch');
    });

    it('operation=delete_job routes through mlClient when the factory is provided', async () => {
      const currentUserMl = createMlMock();
      const mlClient = createMlMock();
      const tool = createAdManageJobStateTool(
        resolveMlCapabilities,
        undefined,
        undefined,
        undefined,
        () => mlClient as any
      );

      await tool.handler(
        { operation: 'delete_job', job_id: 'scratch-job' },
        createContext(currentUserMl)
      );

      expect(mlClient.getJobs).toHaveBeenCalledWith({ job_id: 'scratch-job' });
      expect(mlClient.stopDatafeed).toHaveBeenCalledWith({
        datafeed_id: 'datafeed-scratch-job',
        body: { force: true },
      });
      expect(mlClient.deleteDatafeed).toHaveBeenCalledWith({
        datafeed_id: 'datafeed-scratch-job',
      });
      expect(mlClient.deleteJob).toHaveBeenCalledWith({
        job_id: 'scratch-job',
        delete_user_annotations: true,
      });
      expect(currentUserMl.getJobs).not.toHaveBeenCalled();
      expect(currentUserMl.deleteJob).not.toHaveBeenCalled();
    });
  });
});
