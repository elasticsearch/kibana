/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import type { ModelProvider } from '@kbn/agent-builder-server';
import { decideVisualizationApproach } from './decide_visualization_approach';

describe('decideVisualizationApproach', () => {
  let invoke: jest.Mock;
  let withStructuredOutput: jest.Mock;
  let modelProvider: ModelProvider;

  beforeEach(() => {
    invoke = jest.fn();
    withStructuredOutput = jest.fn().mockReturnValue({ invoke });
    modelProvider = {
      getDefaultModel: jest.fn().mockResolvedValue({ chatModel: { withStructuredOutput } }),
    } as unknown as ModelProvider;
  });

  it('returns the Lens renderer with the chart type chosen by the model', async () => {
    invoke.mockResolvedValue({ renderer: 'lens', chartType: SupportedChartType.XY });

    const approach = await decideVisualizationApproach(modelProvider, 'count of logs by status');

    expect(approach).toEqual({
      renderer: 'lens',
      chartType: SupportedChartType.XY,
      reasoning: undefined,
    });
  });

  it('defaults to a Lens metric when the model picks Lens without a chart type', async () => {
    invoke.mockResolvedValue({ renderer: 'lens' });

    const approach = await decideVisualizationApproach(modelProvider, 'total number of errors');

    expect(approach).toEqual({
      renderer: 'lens',
      chartType: SupportedChartType.Metric,
      reasoning: undefined,
    });
  });

  it('returns the Vega renderer without a chart type', async () => {
    invoke.mockResolvedValue({
      renderer: 'vega',
      chartType: SupportedChartType.XY,
      reasoning: 'needs small multiples',
    });

    const approach = await decideVisualizationApproach(
      modelProvider,
      'a grid of latency charts split by region'
    );

    expect(approach).toEqual({ renderer: 'vega', reasoning: 'needs small multiples' });
    expect(approach).not.toHaveProperty('chartType');
  });

  it('instructs the model to honor an explicit request for Vega', async () => {
    invoke.mockResolvedValue({ renderer: 'vega' });

    await decideVisualizationApproach(modelProvider, 'a gauge as a Vega-Lite visualization');

    const [systemMessage] = invoke.mock.calls[0][0];
    expect(systemMessage.content).toContain('explicitly asks for a Vega');
  });

  it('passes the existing chart type as context for edits', async () => {
    invoke.mockResolvedValue({ renderer: 'lens', chartType: SupportedChartType.XY });

    await decideVisualizationApproach(modelProvider, 'make it a line chart', 'pie');

    const [systemMessage] = invoke.mock.calls[0][0];
    expect(systemMessage.role).toBe('system');
    expect(systemMessage.content).toContain('pie');
  });

  it('requests structured output bound to the decision tool name', async () => {
    invoke.mockResolvedValue({ renderer: 'lens', chartType: SupportedChartType.Metric });

    await decideVisualizationApproach(modelProvider, 'anything');

    expect(withStructuredOutput).toHaveBeenCalledWith(expect.anything(), {
      name: 'decide_visualization_approach',
    });
  });
});
