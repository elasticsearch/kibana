/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScopedModel, ToolHandlerResult } from '@kbn/agent-builder-server';
import { StateGraph, Annotation } from '@langchain/langgraph';
import { z } from '@kbn/zod/v4';
import { ToolResultType } from '@kbn/agent-builder-common/tools';

import {
  WorkflowInsightType,
  type DefendInsights,
} from '../../../../../../common/endpoint/types/workflow_insights';
import { securityWorkflowInsightsService } from '../../../../../endpoint/services';
import { getDefendInsightsOutputSchema } from './schemas';
import { getPrompts } from './prompts';

const CATEGORIZE_INSIGHT_TYPE_NODE_NAME = 'categorizeInsightType';
const GENERATE_INSIGHT_NODE_NAME = 'generateInsights';
const CREATE_WORKFLOW_INSIGHTS_NODE_NAME = 'createWorkflowInsights';

const StateAnnotation = Annotation.Root({
  insightType: Annotation<WorkflowInsightType>(),
  insights: Annotation<DefendInsights>(),
  error: Annotation<string>(),
  results: Annotation<ToolHandlerResult[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type StateType = typeof StateAnnotation.State;

export const createGenerateInsightGraph = ({
  model,
  problemDescription,
  remediation,
  endpointIds,
  data,
  spaceId,
}: {
  model: ScopedModel;
  problemDescription: string;
  remediation: string;
  endpointIds: string[];
  data: unknown[];
  spaceId: string;
}) => {
  async function categorizeInsightType(): Promise<{ insightType: WorkflowInsightType }> {
    const output = await model.chatModel.withStructuredOutput(
      z.object({ insightType: WorkflowInsightType.default(WorkflowInsightType.enum.custom) })
    ).invoke(`
Categorize the following problem description into one of the following Defend Insight Types: ${WorkflowInsightType.options.join(
      ', '
    )}. If no good match exists, use 'custom'.

## Problem Description:
${problemDescription}
    `);
    return { insightType: output.insightType || WorkflowInsightType.enum.custom };
  }

  async function generateInsights({ insightType }: StateType): Promise<{
    insights: DefendInsights;
  }> {
    const { insights } = await model.chatModel.withStructuredOutput(
      getDefendInsightsOutputSchema({ type: insightType })
    ).invoke(`
${getPrompts(insightType).DEFAULT}

## Problem Description:
${problemDescription}

## Remediation:
${remediation}

## Endpoint IDs:
${endpointIds.join(', ')}

## Data:
${JSON.stringify(data, null, 2)}

Provide a concise and actionable insight for each group of events that can help address the problem described.
    `);

    return {
      insights: insights.filter((insight) => insight.events && insight.events.length),
    };
  }

  async function createWorkflowInsights({ insights, insightType }: StateType) {
    if (insights.length === 0) {
      return {
        results: [],
      };
    }

    const workflowInsights = await securityWorkflowInsightsService.createFromDefendInsights(
      insights,
      endpointIds,
      insightType,
      model.connector.connectorId,
      model.chatModel.name,
      spaceId
    );

    const results: ToolHandlerResult[] = [
      {
        type: ToolResultType.other,
        data: {
          workflowInsights,
        },
      },
    ];

    return { results };
  }

  return new StateGraph(StateAnnotation)
    .addNode(CATEGORIZE_INSIGHT_TYPE_NODE_NAME, categorizeInsightType)
    .addNode(GENERATE_INSIGHT_NODE_NAME, generateInsights)
    .addNode(CREATE_WORKFLOW_INSIGHTS_NODE_NAME, createWorkflowInsights)
    .addEdge('__start__', CATEGORIZE_INSIGHT_TYPE_NODE_NAME)
    .addEdge(CATEGORIZE_INSIGHT_TYPE_NODE_NAME, GENERATE_INSIGHT_NODE_NAME)
    .addEdge(GENERATE_INSIGHT_NODE_NAME, CREATE_WORKFLOW_INSIGHTS_NODE_NAME)
    .addEdge(CREATE_WORKFLOW_INSIGHTS_NODE_NAME, '__end__')
    .compile();
};
