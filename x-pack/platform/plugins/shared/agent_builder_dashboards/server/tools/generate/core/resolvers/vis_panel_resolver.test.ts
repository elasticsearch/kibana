/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildVisualizationConfig } from '@kbn/agent-builder-tools-base';
import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { createVisPanelResolver } from './vis_panel_resolver';

jest.mock('@kbn/agent-builder-tools-base', () => ({
  buildVisualizationConfig: jest.fn(),
}));

const mockedBuildVisualizationConfig = jest.mocked(buildVisualizationConfig);

const createMockLogger = (): Logger =>
  ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger);

describe('createVisPanelResolver', () => {
  const logger = createMockLogger();
  const modelProvider = {} as ModelProvider;
  const events = {} as ToolEventEmitter;
  const esClient = {} as IScopedClusterClient;
  const createBuildVisualizationConfigResult = (
    validatedConfig: Record<string, unknown>
  ): Awaited<ReturnType<typeof buildVisualizationConfig>> =>
    ({
      validatedConfig,
      selectedChartType: 'metric',
      esqlQuery: 'FROM logs-* | STATS count = COUNT(*)',
    } as Awaited<ReturnType<typeof buildVisualizationConfig>>);

  beforeEach(() => {
    mockedBuildVisualizationConfig.mockReset();
  });

  it('creates Lens panel content for create requests', async () => {
    mockedBuildVisualizationConfig.mockResolvedValue(
      createBuildVisualizationConfigResult({ type: 'metric' })
    );

    const resolveVisPanel = createVisPanelResolver({
      logger,
      modelProvider,
      events,
      esClient,
    });

    const result = await resolveVisPanel({
      type: 'vis',
      operationType: 'add_panels',
      identifier: 'show total requests',
      nlQuery: 'show total requests',
      index: 'logs-*',
    });

    expect(result).toEqual({
      type: 'success',
      panelContent: {
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
      },
    });
    expect(mockedBuildVisualizationConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        includeTimeRange: false,
      })
    );
  });

  it('passes the existing Lens config when editing a Lens panel', async () => {
    mockedBuildVisualizationConfig.mockResolvedValue(
      createBuildVisualizationConfigResult({ type: 'line' })
    );

    const resolveVisPanel = createVisPanelResolver({
      logger,
      modelProvider,
      events,
      esClient,
    });

    await resolveVisPanel({
      type: 'vis',
      operationType: 'edit_panels',
      identifier: 'panel-1',
      nlQuery: 'turn this into a line chart',
      existingPanel: {
        id: 'panel-1',
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'bar' },
        grid: { w: 24, h: 12, x: 0, y: 0 },
      },
    });

    expect(mockedBuildVisualizationConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        existingConfig: JSON.stringify({ type: 'bar' }),
        parsedExistingConfig: { type: 'bar' },
      })
    );
  });

  it('returns a failure when editing a non-Lens panel', async () => {
    const resolveVisPanel = createVisPanelResolver({
      logger,
      modelProvider,
      events,
      esClient,
    });

    const result = await resolveVisPanel({
      type: 'vis',
      operationType: 'edit_panels',
      identifier: 'panel-1',
      nlQuery: 'refine this analysis',
      existingPanel: {
        id: 'panel-1',
        type: 'aiOpsLogRateAnalysis',
        config: { seriesType: 'log_rate' },
        grid: { w: 24, h: 12, x: 0, y: 0 },
      },
    });

    expect(result).toEqual({
      type: 'failure',
      failure: {
        type: 'edit_panels',
        identifier: 'panel-1',
        error:
          'Panel "panel-1" with type "aiOpsLogRateAnalysis" is not supported for inline visualization editing.',
      },
    });
    expect(mockedBuildVisualizationConfig).not.toHaveBeenCalled();
  });
});
