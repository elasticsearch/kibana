/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { getAdminCapabilities } from '../../lib/capabilities/__mocks__/ml_capabilities';
import { createAdCreateJobTool } from './ad_create_job';
import { AD_CREATE_JOB_TOOL_ID } from './tool_ids';

const resolveMlCapabilities = jest.fn().mockResolvedValue(getAdminCapabilities());
const adCreateJobTool = createAdCreateJobTool(resolveMlCapabilities);

const createMlMock = () => ({
  validate: jest.fn().mockResolvedValue({ valid: true }),
  estimateModelMemory: jest.fn().mockResolvedValue({ model_memory_estimate: '100mb' }),
  putJob: jest.fn().mockResolvedValue({ job_id: 'test-job' }),
  putDatafeed: jest.fn().mockResolvedValue({ datafeed_id: 'datafeed-test-job' }),
});

const createContext = (mlMock = createMlMock()) =>
  ({
    esClient: { asCurrentUser: { ml: mlMock } },
    request: {},
  } as any);

describe('adCreateJobTool', () => {
  it('has the correct ID and type', () => {
    expect(adCreateJobTool.id).toBe(AD_CREATE_JOB_TOOL_ID);
    expect(adCreateJobTool.type).toBe(ToolType.builtin);
  });

  describe('handler', () => {
    it('operation=validate_spec calls ml.validate', async () => {
      const ml = createMlMock();
      const jobConfig = { analysis_config: { detectors: [{ function: 'rare' }] } };

      const result = await adCreateJobTool.handler(
        { operation: 'validate_spec', job_config: jobConfig },
        createContext(ml)
      );

      expect(ml.validate).toHaveBeenCalledWith({ body: jobConfig });
      expect((result as { results: Array<{ type: string }> }).results[0].type).toBe(
        ToolResultType.other
      );
    });

    it('operation=validate_spec without job_config returns error', async () => {
      const result = await adCreateJobTool.handler({ operation: 'validate_spec' }, createContext());

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe(
        'job_config is required for validate_spec'
      );
    });

    it('operation=estimate_memory calls ml.estimateModelMemory', async () => {
      const ml = createMlMock();
      const jobConfig = { analysis_config: {} };

      await adCreateJobTool.handler(
        { operation: 'estimate_memory', job_config: jobConfig },
        createContext(ml)
      );

      expect(ml.estimateModelMemory).toHaveBeenCalledWith({ body: jobConfig });
    });

    it('operation=estimate_memory without job_config returns error', async () => {
      const result = await adCreateJobTool.handler(
        { operation: 'estimate_memory' },
        createContext()
      );

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe(
        'job_config is required for estimate_memory'
      );
    });

    it('operation=create_job calls ml.putJob with job_id and config', async () => {
      const ml = createMlMock();
      const jobConfig = { analysis_config: {} };

      await adCreateJobTool.handler(
        { operation: 'create_job', job_id: 'my-job', job_config: jobConfig },
        createContext(ml)
      );

      expect(ml.putJob).toHaveBeenCalledWith({ job_id: 'my-job', body: jobConfig });
    });

    it('operation=create_job without job_id returns error', async () => {
      const result = await adCreateJobTool.handler(
        { operation: 'create_job', job_config: {} },
        createContext()
      );

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe(
        'job_id and job_config are required for create_job'
      );
    });

    it('operation=create_datafeed uses datafeed-{job_id} as datafeed ID', async () => {
      const ml = createMlMock();
      const datafeedConfig = { indices: ['logs-*'] };

      await adCreateJobTool.handler(
        { operation: 'create_datafeed', job_id: 'my-job', datafeed_config: datafeedConfig },
        createContext(ml)
      );

      expect(ml.putDatafeed).toHaveBeenCalledWith({
        datafeed_id: 'datafeed-my-job',
        body: datafeedConfig,
      });
    });

    it('returns error result when ML client throws', async () => {
      const ml = createMlMock();
      ml.validate.mockRejectedValue(new Error('invalid spec'));
      const result = await adCreateJobTool.handler(
        { operation: 'validate_spec', job_config: { analysis_config: {} } },
        createContext(ml)
      );

      const standardResult = result as {
        results: Array<{ type: string; data: { message: string } }>;
      };
      expect(standardResult.results[0].type).toBe(ToolResultType.error);
      expect(standardResult.results[0].data.message).toBe(
        'Error executing validate_spec: invalid spec'
      );
    });
  });
});
