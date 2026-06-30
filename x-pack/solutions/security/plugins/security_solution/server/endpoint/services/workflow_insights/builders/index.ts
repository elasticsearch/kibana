/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import type {
  DefendInsight,
  SecurityWorkflowInsight,
} from '../../../../../common/endpoint/types/workflow_insights';
import type { EndpointMetadataService } from '../../metadata';
import { WorkflowInsightType } from '../../../../../common/endpoint/types/workflow_insights';
import { buildIncompatibleAntivirusWorkflowInsights } from './incompatible_antivirus';
import { buildCustomWorkflowInsights } from './custom';

export interface BuildWorkflowInsightParams {
  defendInsights: DefendInsight[];
  endpointMetadataService: EndpointMetadataService;
  esClient: ElasticsearchClient;
  ccsEnabled: boolean;
  options: {
    insightType: WorkflowInsightType;
    endpointIds: string[];
    connectorId?: string;
    model?: string;
  };
}

export function buildWorkflowInsights(
  params: BuildWorkflowInsightParams
): Promise<SecurityWorkflowInsight[]> {
  switch (params.options.insightType) {
    case WorkflowInsightType.enum.incompatible_antivirus:
      return buildIncompatibleAntivirusWorkflowInsights(params);
    case WorkflowInsightType.enum.policy_response_failure:
      return buildCustomWorkflowInsights(params);
    case WorkflowInsightType.enum.custom:
      return buildCustomWorkflowInsights(params);
    default:
      throw new Error('Invalid insight type');
  }
}
