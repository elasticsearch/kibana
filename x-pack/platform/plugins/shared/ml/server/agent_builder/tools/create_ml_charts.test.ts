/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';
import { anomalyChartsEmbeddableStateSchema } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { getAdminCapabilities } from '../../lib/capabilities/__mocks__/ml_capabilities';
import { CREATE_ML_CHARTS_TOOL_ID } from './tool_ids';
import { buildAnomalyChartsThresholds, createMlChartsTool } from './create_ml_charts';

describe('buildAnomalyChartsThresholds', () => {
  it('maps any 0–100 floor to a single open-ended threshold', () => {
    expect(buildAnomalyChartsThresholds(30)).toEqual([{ min: 30 }]);
    expect(buildAnomalyChartsThresholds(0)).toEqual([{ min: 0 }]);
    expect(buildAnomalyChartsThresholds(100)).toEqual([{ min: 100 }]);
  });

  it('keeps documented band boundaries as the same open-ended floor', () => {
    expect(buildAnomalyChartsThresholds(ML_ANOMALY_THRESHOLD.MINOR)).toEqual([
      { min: ML_ANOMALY_THRESHOLD.MINOR },
    ]);
    expect(buildAnomalyChartsThresholds(ML_ANOMALY_THRESHOLD.MAJOR)).toEqual([
      { min: ML_ANOMALY_THRESHOLD.MAJOR },
    ]);
    expect(buildAnomalyChartsThresholds(ML_ANOMALY_THRESHOLD.CRITICAL)).toEqual([
      { min: ML_ANOMALY_THRESHOLD.CRITICAL },
    ]);
  });

  it('produces embeddable-valid state for in-between scores', () => {
    expect(() =>
      anomalyChartsEmbeddableStateSchema.parse({
        job_ids: ['job-1'],
        severity_threshold: buildAnomalyChartsThresholds(30),
      })
    ).not.toThrow();
  });
});

describe('createMlChartsTool', () => {
  const resolveMlCapabilities = jest.fn().mockResolvedValue(getAdminCapabilities());
  const mlLicense = { isFullLicense: () => true } as any;
  const createMlChartsToolInstance = createMlChartsTool(
    resolveMlCapabilities,
    undefined,
    mlLicense
  );

  const createContext = (attachmentsAdd = jest.fn(), getJobs = jest.fn()) =>
    ({
      esClient: { asCurrentUser: { ml: { getJobs } } },
      request: {},
      logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
      attachments: {
        add: attachmentsAdd.mockResolvedValue({ id: 'att-1', current_version: 1 }),
      },
    } as any);

  it('has the correct ID and type', () => {
    expect(createMlChartsToolInstance.id).toBe(CREATE_ML_CHARTS_TOOL_ID);
    expect(createMlChartsToolInstance.type).toBe(ToolType.builtin);
  });

  it('stores anomaly_charts severity_threshold as an open-ended floor', async () => {
    const attachmentsAdd = jest.fn().mockResolvedValue({ id: 'att-1', current_version: 1 });
    const result = await createMlChartsToolInstance.handler(
      {
        chart_type: 'anomaly_charts',
        job_ids: ['job-1'],
        severity_threshold: 30,
      },
      createContext(attachmentsAdd)
    );

    expect(attachmentsAdd).toHaveBeenCalledWith({
      type: expect.any(String),
      data: expect.objectContaining({
        job_ids: ['job-1'],
        severity_threshold: [{ min: 30 }],
      }),
      description: expect.any(String),
    });
    expect((result as { results: Array<{ type: string }> }).results[0].type).toBe(
      ToolResultType.other
    );
  });

  it('looks up detector config as the current user, not the internal user', async () => {
    const getJobs = jest.fn().mockResolvedValue({
      jobs: [
        {
          analysis_config: {
            detectors: [{ partition_field_name: 'host.name' }],
          },
        },
      ],
    });
    const asInternalUser = { ml: { getJobs: jest.fn() } };
    const attachmentsAdd = jest.fn().mockResolvedValue({ id: 'att-1', current_version: 1 });
    const context = {
      ...createContext(attachmentsAdd, getJobs),
      esClient: {
        asCurrentUser: { ml: { getJobs } },
        asInternalUser,
      },
    };

    const result = await createMlChartsToolInstance.handler(
      {
        chart_type: 'single_metric_viewer',
        job_ids: ['job-1'],
        selected_entities: { 'host.name': 'web-01' },
      },
      context
    );

    expect(getJobs).toHaveBeenCalledWith({ job_id: 'job-1' });
    expect(asInternalUser.ml.getJobs).not.toHaveBeenCalled();
    expect((result as { results: Array<{ type: string }> }).results[0].type).toBe(
      ToolResultType.other
    );
  });

  it('looks up detector config via mlClient when the factory is provided', async () => {
    const mlClient = { getJobs: jest.fn().mockResolvedValue({ jobs: [{ analysis_config: {} }] }) };
    const asCurrentUserGetJobs = jest.fn();
    const tool = createMlChartsTool(
      resolveMlCapabilities,
      undefined,
      mlLicense,
      undefined,
      () => mlClient as any
    );
    const attachmentsAdd = jest.fn().mockResolvedValue({ id: 'att-1', current_version: 1 });

    await tool.handler(
      { chart_type: 'single_metric_viewer', job_ids: ['job-1'] },
      {
        ...createContext(attachmentsAdd, asCurrentUserGetJobs),
      }
    );

    expect(mlClient.getJobs).toHaveBeenCalledWith({ job_id: 'job-1' });
    expect(asCurrentUserGetJobs).not.toHaveBeenCalled();
  });
});
