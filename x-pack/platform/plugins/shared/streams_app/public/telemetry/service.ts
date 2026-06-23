/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup } from '@kbn/core-analytics-browser';
import {
  streamsAIGrokSuggestionAcceptedEventType,
  streamsAIDissectSuggestionAcceptedEventType,
  streamsAttachmentClickEventType,
  streamsAttachmentCountEventType,
  streamsAttachmentLinkedEventType,
  streamsAttachmentUnlinkedEventType,
  streamsAttachmentFlyoutOpenedEventType,
  streamsAttachmentFlyoutActionEventType,
  streamsChildStreamCreatedEventType,
  streamsProcessingSavedEventType,
  streamsRetentionChangedEventType,
  streamsSchemaUpdatedEventType,
  streamsSignificantEventsCreatedEventType,
  streamsSignificantEventsSuggestionsGeneratedEventType,
  wiredStreamsStatusChangedEventType,
  streamsFeatureIdentificationSavedEventType,
  streamsFeatureIdentificationDeletedEventType,
  streamsTabVisitedEventType,
} from './events';
import { StreamsTelemetryClient } from './client';

export class StreamsTelemetryService {
  private analytics?: AnalyticsServiceSetup;

  constructor() {}

  public setup(analytics: AnalyticsServiceSetup) {
    this.analytics = analytics;
    this.analytics.registerEventType(streamsAttachmentCountEventType);
    this.analytics.registerEventType(streamsAttachmentClickEventType);
    this.analytics.registerEventType(streamsAttachmentLinkedEventType);
    this.analytics.registerEventType(streamsAttachmentUnlinkedEventType);
    this.analytics.registerEventType(streamsAttachmentFlyoutOpenedEventType);
    this.analytics.registerEventType(streamsAttachmentFlyoutActionEventType);
    this.analytics.registerEventType(streamsAIGrokSuggestionAcceptedEventType);
    this.analytics.registerEventType(streamsAIDissectSuggestionAcceptedEventType);
    this.analytics.registerEventType(streamsProcessingSavedEventType);
    this.analytics.registerEventType(streamsRetentionChangedEventType);
    this.analytics.registerEventType(streamsChildStreamCreatedEventType);
    this.analytics.registerEventType(streamsSchemaUpdatedEventType);
    this.analytics.registerEventType(streamsSignificantEventsSuggestionsGeneratedEventType);
    this.analytics.registerEventType(streamsSignificantEventsCreatedEventType);
    this.analytics.registerEventType(wiredStreamsStatusChangedEventType);
    this.analytics.registerEventType(streamsFeatureIdentificationSavedEventType);
    this.analytics.registerEventType(streamsFeatureIdentificationDeletedEventType);
    this.analytics.registerEventType(streamsTabVisitedEventType);
  }

  public getClient() {
    if (!this.analytics) {
      throw new Error('Analytics service is not available.');
    }

    return new StreamsTelemetryClient(this.analytics);
  }
}
