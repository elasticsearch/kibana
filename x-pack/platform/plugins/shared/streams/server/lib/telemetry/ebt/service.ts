/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup } from '@kbn/core-analytics-server';
import {
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
  streamsSignificantEventsDiscoveryTriggeredEventType,
  streamsOnboardingScheduledEventType,
} from './events';
import { EbtTelemetryClient } from './client';

export class EbtTelemetryService {
  private analytics?: AnalyticsServiceSetup;

  constructor() {}

  public setup(analytics: AnalyticsServiceSetup) {
    this.analytics = analytics;
    this.analytics.registerEventType(streamsEndpointLatencyEventType);
    this.analytics.registerEventType(streamsStateErrorEventType);
    this.analytics.registerEventType(streamsDescriptionGeneratedEventType);
    this.analytics.registerEventType(streamsSignificantEventsGeneratedEventType);
    this.analytics.registerEventType(streamsProcessingPipelineSuggestedEventType);
    this.analytics.registerEventType(streamsFeaturesIdentifiedEventType);
    this.analytics.registerEventType(streamsAgentBuilderKnowledgeIndicatorCreatedEventType);
    this.analytics.registerEventType(streamsAgentToolKiIdentificationStartedEventType);
    this.analytics.registerEventType(streamsAgentToolEventCreateEventType);
    this.analytics.registerEventType(streamsAgentToolEventStatusUpdateEventType);
    this.analytics.registerEventType(streamsSignificantEventsDiscoveryTriggeredEventType);
    this.analytics.registerEventType(streamsOnboardingScheduledEventType);
  }

  public getClient() {
    if (!this.analytics) {
      throw new Error('Analytics service is not available.');
    }
    return new EbtTelemetryClient(this.analytics);
  }
}
