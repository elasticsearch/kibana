/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  STREAMS_ENDPOINT_LATENCY_EVENT,
  STREAMS_STATE_ERROR_EVENT,
  STREAMS_DESCRIPTION_GENERATED_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_QUERIES_GENERATED_EVENT_TYPE,
  STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE,
  STREAMS_FEATURES_IDENTIFIED_EVENT_TYPE,
  STREAMS_AGENT_BUILDER_KNOWLEDGE_INDICATOR_CREATED_EVENT_TYPE,
  STREAMS_AGENT_TOOL_KI_IDENTIFICATION_STARTED_EVENT_TYPE,
  STREAMS_AGENT_TOOL_EVENT_CREATE_EVENT_TYPE,
  STREAMS_AGENT_TOOL_EVENT_STATUS_UPDATE_EVENT_TYPE,
  STREAMS_CODE_ANALYSIS_GROUNDING_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_DISCOVERY_TRIGGERED_EVENT_TYPE,
  STREAMS_ONBOARDING_SCHEDULED_EVENT_TYPE,
} from './constants';
import {
  streamsEndpointLatencySchema,
  streamsStateErrorSchema,
  streamsDescriptionGeneratedSchema,
  streamsSignificantEventsQueriesGeneratedSchema,
  streamsProcessingPipelineSuggestedSchema,
  streamsFeaturesIdentifiedSchema,
  streamsAgentBuilderKnowledgeIndicatorCreatedSchema,
  streamsAgentToolKiIdentificationStartedSchema,
  streamsAgentToolEventCreateSchema,
  streamsAgentToolEventStatusUpdateSchema,
  streamsCodeAnalysisGroundingSchema,
  streamsSignificantEventsDiscoveryTriggeredSchema,
  streamsOnboardingScheduledSchema,
} from './schemas';

const streamsEndpointLatencyEventType = {
  eventType: STREAMS_ENDPOINT_LATENCY_EVENT,
  schema: streamsEndpointLatencySchema,
};

const streamsStateErrorEventType = {
  eventType: STREAMS_STATE_ERROR_EVENT,
  schema: streamsStateErrorSchema,
};

const streamsDescriptionGeneratedEventType = {
  eventType: STREAMS_DESCRIPTION_GENERATED_EVENT_TYPE,
  schema: streamsDescriptionGeneratedSchema,
};
const streamsSignificantEventsGeneratedEventType = {
  eventType: STREAMS_SIGNIFICANT_EVENTS_QUERIES_GENERATED_EVENT_TYPE,
  schema: streamsSignificantEventsQueriesGeneratedSchema,
};
const streamsProcessingPipelineSuggestedEventType = {
  eventType: STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE,
  schema: streamsProcessingPipelineSuggestedSchema,
};

const streamsFeaturesIdentifiedEventType = {
  eventType: STREAMS_FEATURES_IDENTIFIED_EVENT_TYPE,
  schema: streamsFeaturesIdentifiedSchema,
};

const streamsAgentBuilderKnowledgeIndicatorCreatedEventType = {
  eventType: STREAMS_AGENT_BUILDER_KNOWLEDGE_INDICATOR_CREATED_EVENT_TYPE,
  schema: streamsAgentBuilderKnowledgeIndicatorCreatedSchema,
};

const streamsAgentToolKiIdentificationStartedEventType = {
  eventType: STREAMS_AGENT_TOOL_KI_IDENTIFICATION_STARTED_EVENT_TYPE,
  schema: streamsAgentToolKiIdentificationStartedSchema,
};

const streamsAgentToolEventCreateEventType = {
  eventType: STREAMS_AGENT_TOOL_EVENT_CREATE_EVENT_TYPE,
  schema: streamsAgentToolEventCreateSchema,
};

const streamsAgentToolEventStatusUpdateEventType = {
  eventType: STREAMS_AGENT_TOOL_EVENT_STATUS_UPDATE_EVENT_TYPE,
  schema: streamsAgentToolEventStatusUpdateSchema,
};

const streamsCodeAnalysisGroundingEventType = {
  eventType: STREAMS_CODE_ANALYSIS_GROUNDING_EVENT_TYPE,
  schema: streamsCodeAnalysisGroundingSchema,
};

const streamsSignificantEventsDiscoveryTriggeredEventType = {
  eventType: STREAMS_SIGNIFICANT_EVENTS_DISCOVERY_TRIGGERED_EVENT_TYPE,
  schema: streamsSignificantEventsDiscoveryTriggeredSchema,
};

const streamsOnboardingScheduledEventType = {
  eventType: STREAMS_ONBOARDING_SCHEDULED_EVENT_TYPE,
  schema: streamsOnboardingScheduledSchema,
};

export {
  streamsEndpointLatencyEventType,
  streamsStateErrorEventType,
  streamsDescriptionGeneratedEventType,
  streamsSignificantEventsGeneratedEventType,
  streamsProcessingPipelineSuggestedEventType,
  streamsFeaturesIdentifiedEventType,
  streamsAgentBuilderKnowledgeIndicatorCreatedEventType,
  streamsAgentToolKiIdentificationStartedEventType,
  streamsAgentToolEventCreateEventType,
  streamsAgentToolEventStatusUpdateEventType,
  streamsCodeAnalysisGroundingEventType,
  streamsSignificantEventsDiscoveryTriggeredEventType,
  streamsOnboardingScheduledEventType,
};
