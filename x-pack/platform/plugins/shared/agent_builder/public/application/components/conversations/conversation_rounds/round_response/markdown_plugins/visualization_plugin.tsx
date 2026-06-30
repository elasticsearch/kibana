/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { EuiCode, EuiText } from '@elastic/eui';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { ConversationRoundStep } from '@kbn/agent-builder-common';
import {
  type EsqlResults,
  type VisualizationResult,
  ToolResultType,
} from '@kbn/agent-builder-common/tools/tool_result';
import {
  visualizationElement,
  type VisualizationElementAttributes,
} from '@kbn/agent-builder-common/tools/custom_rendering';
import {
  VisualizeESQL,
  InlineVisualization,
  type VisualizationServices,
} from '@kbn/agent-builder-visualizations';

import type { AgentBuilderStartDependencies } from '../../../../../../types';
import { createTagParser, findToolResult } from './utils';

export const visualizationTagParser = createTagParser({
  tagName: visualizationElement.tagName,
  getAttributes: (value, extractAttr) => ({
    toolResultId: extractAttr(value, visualizationElement.attributes.toolResultId),
    chartType: extractAttr(value, visualizationElement.attributes.chartType),
  }),
  createNode: (attributes, position) => ({
    type: visualizationElement.tagName,
    toolResultId: attributes.toolResultId,
    chartType: attributes.chartType,
    position,
  }),
});

export function createVisualizationRenderer({
  application,
  startDependencies,
  stepsFromCurrentRound,
  stepsFromPrevRounds,
}: {
  application: ApplicationStart;
  startDependencies: AgentBuilderStartDependencies;
  stepsFromCurrentRound: ConversationRoundStep[];
  stepsFromPrevRounds: ConversationRoundStep[];
}) {
  const services: VisualizationServices = {
    application,
    lens: startDependencies.lens,
    dataViews: startDependencies.dataViews,
    uiActions: startDependencies.uiActions,
    unifiedSearch: startDependencies.unifiedSearch,
    embeddable: startDependencies.embeddable,
  };

  return (props: VisualizationElementAttributes) => {
    const { toolResultId, chartType } = props;

    if (!toolResultId) {
      return (
        <EuiText>Visualization missing {visualizationElement.attributes.toolResultId}.</EuiText>
      );
    }

    const steps = [...stepsFromPrevRounds, ...stepsFromCurrentRound];

    const ToolResultAttribute = (
      <EuiCode>
        {visualizationElement.attributes.toolResultId}={toolResultId}
      </EuiCode>
    );

    // First, look for esql results (from execute_esql)
    let toolResult: EsqlResults | VisualizationResult | undefined = findToolResult<EsqlResults>(
      steps,
      toolResultId,
      ToolResultType.esqlResults
    );

    // If not found, look for visualization results (from create_visualization)
    if (!toolResult) {
      toolResult = findToolResult<VisualizationResult>(
        steps,
        toolResultId,
        ToolResultType.visualization
      );
    }

    if (!toolResult) {
      return <EuiText>Unable to find visualization for {ToolResultAttribute}.</EuiText>;
    }

    // Handle visualization result (pre-built Lens config or Vega spec).
    if (toolResult.type === 'visualization') {
      const { data } = toolResult;

      return (
        <InlineVisualization
          services={services}
          renderer={data.renderer}
          visualization={data.visualization}
          timeRange={data.time_range}
        />
      );
    }

    const { columns, query, time_range: resultTimeRange } = toolResult.data;

    if (!query) {
      return <EuiText>Unable to find esql query for {ToolResultAttribute}.</EuiText>;
    }

    return (
      <VisualizeESQL
        services={services}
        esqlQuery={query}
        esqlColumns={columns}
        preferredChartType={chartType}
        timeRange={resultTimeRange}
      />
    );
  };
}
