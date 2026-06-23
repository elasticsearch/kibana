/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  STREAMS_AI_GROK_SUGGESTION_ACCEPTED_EVENT_TYPE,
  STREAMS_AI_DISSECT_SUGGESTION_ACCEPTED_EVENT_TYPE,
  STREAMS_ATTACHMENT_CLICK_EVENT_TYPE,
  STREAMS_ATTACHMENT_COUNT_EVENT_TYPE,
  STREAMS_ATTACHMENT_LINKED_EVENT_TYPE,
  STREAMS_ATTACHMENT_UNLINKED_EVENT_TYPE,
  STREAMS_ATTACHMENT_FLYOUT_OPENED_EVENT_TYPE,
  STREAMS_ATTACHMENT_FLYOUT_ACTION_EVENT_TYPE,
  STREAMS_CHILD_STREAM_CREATED_EVENT_TYPE,
  STREAMS_PROCESSING_SAVED_EVENT_TYPE,
  STREAMS_RETENTION_CHANGED_EVENT_TYPE,
  STREAMS_SCHEMA_UPDATED_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_CREATED_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_SUGGESTIONS_GENERATED_EVENT_TYPE,
  STREAMS_WIRED_STREAMS_STATUS_CHANGED_EVENT_TYPE,
  STREAMS_FEATURE_IDENTIFICATION_SAVED_EVENT_TYPE,
  STREAMS_FEATURE_IDENTIFICATION_DELETED_EVENT_TYPE,
  STREAMS_TAB_VISITED_EVENT_TYPE,
} from './constants';
import {
  streamsAIGrokSuggestionAcceptedSchema,
  streamsAIDissectSuggestionAcceptedSchema,
  streamsAttachmentClickEventSchema,
  streamsAttachmentCountSchema,
  streamsAttachmentLinkChangedSchema,
  streamsAttachmentFlyoutOpenedSchema,
  streamsAttachmentFlyoutActionSchema,
  streamsChildStreamCreatedSchema,
  streamsProcessingSavedSchema,
  streamsRetentionChangedSchema,
  streamsSchemaUpdatedSchema,
  streamsSignificantEventsCreatedSchema,
  streamsSignificantEventsSuggestionsGeneratedSchema,
  wiredStreamsStatusChangedSchema,
  streamsFeatureIdentificationSavedSchema,
  streamsFeatureIdentificationDeletedSchema,
  streamsTabVisitedSchema,
} from './schemas';

const streamsAttachmentCountEventType = {
  eventType: STREAMS_ATTACHMENT_COUNT_EVENT_TYPE,
  schema: streamsAttachmentCountSchema,
};

const streamsAttachmentClickEventType = {
  eventType: STREAMS_ATTACHMENT_CLICK_EVENT_TYPE,
  schema: streamsAttachmentClickEventSchema,
};

const streamsAttachmentLinkedEventType = {
  eventType: STREAMS_ATTACHMENT_LINKED_EVENT_TYPE,
  schema: streamsAttachmentLinkChangedSchema,
};

const streamsAttachmentUnlinkedEventType = {
  eventType: STREAMS_ATTACHMENT_UNLINKED_EVENT_TYPE,
  schema: streamsAttachmentLinkChangedSchema,
};

const streamsAttachmentFlyoutOpenedEventType = {
  eventType: STREAMS_ATTACHMENT_FLYOUT_OPENED_EVENT_TYPE,
  schema: streamsAttachmentFlyoutOpenedSchema,
};

const streamsAttachmentFlyoutActionEventType = {
  eventType: STREAMS_ATTACHMENT_FLYOUT_ACTION_EVENT_TYPE,
  schema: streamsAttachmentFlyoutActionSchema,
};

const streamsAIGrokSuggestionAcceptedEventType = {
  eventType: STREAMS_AI_GROK_SUGGESTION_ACCEPTED_EVENT_TYPE,
  schema: streamsAIGrokSuggestionAcceptedSchema,
};

const streamsAIDissectSuggestionAcceptedEventType = {
  eventType: STREAMS_AI_DISSECT_SUGGESTION_ACCEPTED_EVENT_TYPE,
  schema: streamsAIDissectSuggestionAcceptedSchema,
};

const streamsProcessingSavedEventType = {
  eventType: STREAMS_PROCESSING_SAVED_EVENT_TYPE,
  schema: streamsProcessingSavedSchema,
};

const streamsRetentionChangedEventType = {
  eventType: STREAMS_RETENTION_CHANGED_EVENT_TYPE,
  schema: streamsRetentionChangedSchema,
};

const streamsChildStreamCreatedEventType = {
  eventType: STREAMS_CHILD_STREAM_CREATED_EVENT_TYPE,
  schema: streamsChildStreamCreatedSchema,
};

const streamsSchemaUpdatedEventType = {
  eventType: STREAMS_SCHEMA_UPDATED_EVENT_TYPE,
  schema: streamsSchemaUpdatedSchema,
};

const streamsSignificantEventsSuggestionsGeneratedEventType = {
  eventType: STREAMS_SIGNIFICANT_EVENTS_SUGGESTIONS_GENERATED_EVENT_TYPE,
  schema: streamsSignificantEventsSuggestionsGeneratedSchema,
};

const streamsSignificantEventsCreatedEventType = {
  eventType: STREAMS_SIGNIFICANT_EVENTS_CREATED_EVENT_TYPE,
  schema: streamsSignificantEventsCreatedSchema,
};

const streamsFeatureIdentificationSavedEventType = {
  eventType: STREAMS_FEATURE_IDENTIFICATION_SAVED_EVENT_TYPE,
  schema: streamsFeatureIdentificationSavedSchema,
};

const streamsFeatureIdentificationDeletedEventType = {
  eventType: STREAMS_FEATURE_IDENTIFICATION_DELETED_EVENT_TYPE,
  schema: streamsFeatureIdentificationDeletedSchema,
};

const wiredStreamsStatusChangedEventType = {
  eventType: STREAMS_WIRED_STREAMS_STATUS_CHANGED_EVENT_TYPE,
  schema: wiredStreamsStatusChangedSchema,
};

const streamsTabVisitedEventType = {
  eventType: STREAMS_TAB_VISITED_EVENT_TYPE,
  schema: streamsTabVisitedSchema,
};

export {
  streamsAttachmentCountEventType,
  streamsAttachmentClickEventType,
  streamsAttachmentLinkedEventType,
  streamsAttachmentUnlinkedEventType,
  streamsAttachmentFlyoutOpenedEventType,
  streamsAttachmentFlyoutActionEventType,
  streamsAIGrokSuggestionAcceptedEventType,
  streamsAIDissectSuggestionAcceptedEventType,
  streamsProcessingSavedEventType,
  streamsRetentionChangedEventType,
  streamsChildStreamCreatedEventType,
  streamsSchemaUpdatedEventType,
  streamsSignificantEventsSuggestionsGeneratedEventType,
  streamsSignificantEventsCreatedEventType,
  wiredStreamsStatusChangedEventType,
  streamsFeatureIdentificationSavedEventType,
  streamsFeatureIdentificationDeletedEventType,
  streamsTabVisitedEventType,
};
