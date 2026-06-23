/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SignificantEventsToolUsage } from '@kbn/streams-ai';
import type { SigEventStatus, StreamType } from '@kbn/streams-schema';

interface StreamEndpointLatencyProps {
  name: string;
  endpoint: string;
  duration_ms: number;
}

interface StreamsStateErrorProps {
  error: {
    name: string;
    message: string;
    stack_trace?: string;
  };
  status_code: number;
}

interface StreamsDescriptionGeneratedProps {
  input_tokens_used: number;
  output_tokens_used: number;
  stream_name: string;
  stream_type: StreamType;
}
interface StreamsSignificantEventsQueriesGeneratedProps {
  count: number;
  connector_id: string;
  input_tokens_used: number;
  output_tokens_used: number;
  cached_tokens_used: number;
  duration_ms: number;
  stream_name: string;
  stream_type: StreamType;
  tool_usage: SignificantEventsToolUsage;
}

interface StreamsProcessingPipelineSuggestedProps {
  duration_ms: number;
  steps_used: number;
  success: boolean;
  stream_name: string;
  stream_type: StreamType;
}

interface StreamsFeaturesIdentifiedProps {
  run_id: string;
  connector_id: string;
  iteration: number;
  docs_count: number;
  features_new: number;
  features_updated: number;
  total_filters: number;
  filters_capped: boolean;
  has_filtered_documents: boolean;
  input_tokens_used: number;
  output_tokens_used: number;
  total_tokens_used: number;
  cached_tokens_used: number;
  duration_ms: number;
  excluded_features_count: number;
  llm_ignored_count: number;
  code_ignored_count: number;
  stream_name: string;
  stream_type: StreamType;
  state: 'success' | 'failure' | 'canceled';
}

interface StreamsAgentBuilderKnowledgeIndicatorCreatedProps {
  ki_kind: 'feature' | 'query';
  tool_id: 'ki_feature_create' | 'ki_query_create';
  success: boolean;
  stream_name: string;
  stream_type: StreamType | 'unknown';
  error_message?: string;
}

interface StreamsAgentToolKiIdentificationStartedProps {
  success: boolean;
  stream_name: string;
  error_message?: string;
}

interface StreamsAgentToolEventCreateProps {
  success: boolean;
  stream_names: string[];
  error_message?: string;
}

interface StreamsAgentToolEventStatusUpdateProps {
  success: boolean;
  event_id: string;
  status: SigEventStatus;
  error_message?: string;
}

interface StreamsCodeAnalysisGroundingProps {
  stream_name: string;
  stream_type: string;
  /**
   * Outcome of the code_analysis computed feature: `feature` (a repository was
   * selected and a feature emitted), `no_match` (candidates existed but none
   * verified enough strings), `no_candidates`, `no_strings`, or `unavailable`
   * (SCS / Agent Builder not installed).
   */
  status: string;
  repository?: string;
  candidate_count: number;
  verified_count: number;
}

interface StreamsSignificantEventsDiscoveryTriggeredProps {
  execution_id: string;
  space_id: string;
}

interface StreamsOnboardingScheduledProps {
  stream_name: string;
  execution_id: string;
  workflow_id: string;
  space_id: string;
  skip_features: boolean;
  skip_queries: boolean;
}

export {
  type StreamEndpointLatencyProps,
  type StreamsStateErrorProps,
  type StreamsDescriptionGeneratedProps,
  type StreamsSignificantEventsQueriesGeneratedProps,
  type StreamsProcessingPipelineSuggestedProps,
  type StreamsFeaturesIdentifiedProps,
  type StreamsAgentBuilderKnowledgeIndicatorCreatedProps,
  type StreamsAgentToolKiIdentificationStartedProps,
  type StreamsAgentToolEventCreateProps,
  type StreamsAgentToolEventStatusUpdateProps,
  type StreamsCodeAnalysisGroundingProps,
  type StreamsSignificantEventsDiscoveryTriggeredProps,
  type StreamsOnboardingScheduledProps,
};
