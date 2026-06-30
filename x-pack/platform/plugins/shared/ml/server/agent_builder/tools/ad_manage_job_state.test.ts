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
});

const createContext = (mlMock = createMlMock()) =>
  ({
    esClient: { asCurrentUser: { ml: mlMock } },
    request: {},
  } as any);

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
  });
});
