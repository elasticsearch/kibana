/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup } from '@kbn/core-analytics-server';
import type {
  StreamEndpointLatencyProps,
  StreamsDescriptionGeneratedProps,
  StreamsSignificantEventsQueriesGeneratedProps,
  StreamsStateErrorProps,
  StreamsProcessingPipelineSuggestedProps,
  StreamsFeaturesIdentifiedProps,
  StreamsAgentBuilderKnowledgeIndicatorCreatedProps,
  StreamsAgentToolKiIdentificationStartedProps,
  StreamsAgentToolEventCreateProps,
  StreamsAgentToolEventStatusUpdateProps,
  StreamsAgentToolEventInvestigationAttachProps,
  StreamsCodeAnalysisGroundingProps,
  StreamsSignificantEventsDiscoveryTriggeredProps,
  StreamsOnboardingScheduledProps,
} from './types';
import {
  STREAMS_ENDPOINT_LATENCY_EVENT,
  STREAMS_DESCRIPTION_GENERATED_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_QUERIES_GENERATED_EVENT_TYPE,
  STREAMS_STATE_ERROR_EVENT,
  STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE,
  STREAMS_FEATURES_IDENTIFIED_EVENT_TYPE,
  STREAMS_AGENT_BUILDER_KNOWLEDGE_INDICATOR_CREATED_EVENT_TYPE,
  STREAMS_AGENT_TOOL_KI_IDENTIFICATION_STARTED_EVENT_TYPE,
  STREAMS_AGENT_TOOL_EVENT_CREATE_EVENT_TYPE,
  STREAMS_AGENT_TOOL_EVENT_STATUS_UPDATE_EVENT_TYPE,
  STREAMS_AGENT_TOOL_EVENT_INVESTIGATION_ATTACH_EVENT_TYPE,
  STREAMS_CODE_ANALYSIS_GROUNDING_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_DISCOVERY_TRIGGERED_EVENT_TYPE,
  STREAMS_ONBOARDING_SCHEDULED_EVENT_TYPE,
} from './constants';

const LATENCY_TRACKING_ENDPOINT_ALLOW_LIST = [
  'POST /api/streams/{name}/processing/_simulate 2023-10-31',
  'POST /api/streams/{name}/processing/_suggestions 2023-10-31',
  'POST /api/streams/{name}/_fork 2023-10-31',
  'PUT /api/streams/{streamName}/attachments/{attachmentType}/{attachmentId} 2023-10-31',
  'PUT /api/streams/{name} 2023-10-31',
  'PUT /api/streams/{name}/_ingest 2023-10-31',
  'DELETE /api/streams/{name} 2023-10-31',
  'POST /api/streams/_enable 2023-10-31',
  'POST /api/streams/_disable 2023-10-31',
  'POST /api/streams/_resync 2023-10-31',
];

export class EbtTelemetryClient {
  constructor(private readonly analytics: AnalyticsServiceSetup) {}

  public startTrackingEndpointLatency(
    props: Pick<StreamEndpointLatencyProps, 'name' | 'endpoint'>
  ) {
    if (!LATENCY_TRACKING_ENDPOINT_ALLOW_LIST.includes(props.endpoint)) {
      return () => {};
    }
    const startTime = Date.now();
    return () => {
      this.analytics.reportEvent(STREAMS_ENDPOINT_LATENCY_EVENT, {
        ...props,
        duration_ms: Date.now() - startTime,
      });
    };
  }

  public reportStreamsStateError(error: Error & { statusCode: number }) {
    const errorData: StreamsStateErrorProps = {
      error: {
        name: error.name,
        message: error.message,
        stack_trace: error.stack,
      },
      status_code: error.statusCode,
    };

    this.analytics.reportEvent(STREAMS_STATE_ERROR_EVENT, errorData);
  }

  public trackDescriptionGenerated(params: StreamsDescriptionGeneratedProps) {
    this.analytics.reportEvent(STREAMS_DESCRIPTION_GENERATED_EVENT_TYPE, params);
  }

  public trackSignificantEventsQueriesGenerated(
    params: StreamsSignificantEventsQueriesGeneratedProps
  ) {
    this.analytics.reportEvent(STREAMS_SIGNIFICANT_EVENTS_QUERIES_GENERATED_EVENT_TYPE, params);
  }

  public trackProcessingPipelineSuggested(params: StreamsProcessingPipelineSuggestedProps) {
    this.analytics.reportEvent(STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE, params);
  }

  public trackFeaturesIdentified(params: StreamsFeaturesIdentifiedProps) {
    this.analytics.reportEvent(STREAMS_FEATURES_IDENTIFIED_EVENT_TYPE, params);
  }

  public trackAgentBuilderKnowledgeIndicatorCreated(
    params: StreamsAgentBuilderKnowledgeIndicatorCreatedProps
  ) {
    this.analytics.reportEvent(
      STREAMS_AGENT_BUILDER_KNOWLEDGE_INDICATOR_CREATED_EVENT_TYPE,
      params
    );
  }

  public trackAgentToolKiIdentificationStarted(
    params: StreamsAgentToolKiIdentificationStartedProps
  ) {
    this.analytics.reportEvent(STREAMS_AGENT_TOOL_KI_IDENTIFICATION_STARTED_EVENT_TYPE, params);
  }

  public trackAgentToolEventCreate(params: StreamsAgentToolEventCreateProps) {
    this.analytics.reportEvent(STREAMS_AGENT_TOOL_EVENT_CREATE_EVENT_TYPE, params);
  }

  public trackAgentToolEventStatusUpdate(params: StreamsAgentToolEventStatusUpdateProps) {
    this.analytics.reportEvent(STREAMS_AGENT_TOOL_EVENT_STATUS_UPDATE_EVENT_TYPE, params);
  }

  public trackAgentToolEventInvestigationAttach(
    params: StreamsAgentToolEventInvestigationAttachProps
  ) {
    this.analytics.reportEvent(STREAMS_AGENT_TOOL_EVENT_INVESTIGATION_ATTACH_EVENT_TYPE, params);
  }

  public trackCodeAnalysisGrounding(params: StreamsCodeAnalysisGroundingProps) {
    this.analytics.reportEvent(STREAMS_CODE_ANALYSIS_GROUNDING_EVENT_TYPE, params);
  }

  public trackSignificantEventsDiscoveryTriggered(
    params: StreamsSignificantEventsDiscoveryTriggeredProps
  ) {
    this.analytics.reportEvent(STREAMS_SIGNIFICANT_EVENTS_DISCOVERY_TRIGGERED_EVENT_TYPE, params);
  }

  public trackOnboardingScheduled(params: StreamsOnboardingScheduledProps) {
    this.analytics.reportEvent(STREAMS_ONBOARDING_SCHEDULED_EVENT_TYPE, params);
  }
}
