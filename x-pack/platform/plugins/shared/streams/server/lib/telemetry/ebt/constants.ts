/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const STREAMS_ENDPOINT_LATENCY_EVENT = 'streams-endpoint-latency';
const STREAMS_STATE_ERROR_EVENT = 'streams-state-error';
const STREAMS_DESCRIPTION_GENERATED_EVENT_TYPE = 'streams-description-generated';
const STREAMS_SIGNIFICANT_EVENTS_QUERIES_GENERATED_EVENT_TYPE =
  'streams-significant-events-queries-generated';
const STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE = 'streams-processing-pipeline-suggested';
const STREAMS_FEATURES_IDENTIFIED_EVENT_TYPE = 'streams-features-identified';
const STREAMS_AGENT_BUILDER_KNOWLEDGE_INDICATOR_CREATED_EVENT_TYPE =
  'streams-agent-builder-knowledge-indicator-created';
const STREAMS_AGENT_TOOL_KI_IDENTIFICATION_STARTED_EVENT_TYPE =
  'streams-agent-tool-ki-identification-started';
const STREAMS_AGENT_TOOL_EVENT_CREATE_EVENT_TYPE = 'streams-agent-tool-event-create';
const STREAMS_AGENT_TOOL_EVENT_STATUS_UPDATE_EVENT_TYPE = 'streams-agent-tool-event-status-update';
const STREAMS_CODE_ANALYSIS_GROUNDING_EVENT_TYPE = 'streams-code-analysis-grounding';
const STREAMS_SIGNIFICANT_EVENTS_DISCOVERY_TRIGGERED_EVENT_TYPE =
  'streams-significant-events-discovery-triggered';
const STREAMS_ONBOARDING_SCHEDULED_EVENT_TYPE = 'streams-onboarding-scheduled';

export {
  STREAMS_DESCRIPTION_GENERATED_EVENT_TYPE,
  STREAMS_ENDPOINT_LATENCY_EVENT,
  STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_QUERIES_GENERATED_EVENT_TYPE,
  STREAMS_STATE_ERROR_EVENT,
  STREAMS_FEATURES_IDENTIFIED_EVENT_TYPE,
  STREAMS_AGENT_BUILDER_KNOWLEDGE_INDICATOR_CREATED_EVENT_TYPE,
  STREAMS_AGENT_TOOL_KI_IDENTIFICATION_STARTED_EVENT_TYPE,
  STREAMS_AGENT_TOOL_EVENT_CREATE_EVENT_TYPE,
  STREAMS_AGENT_TOOL_EVENT_STATUS_UPDATE_EVENT_TYPE,
  STREAMS_CODE_ANALYSIS_GROUNDING_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_DISCOVERY_TRIGGERED_EVENT_TYPE,
  STREAMS_ONBOARDING_SCHEDULED_EVENT_TYPE,
};
