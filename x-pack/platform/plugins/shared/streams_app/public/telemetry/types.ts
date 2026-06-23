/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentType } from '@kbn/streams-plugin/server/lib/streams/attachments/types';
import type { EnrichmentDataSource } from '../../common/url_schema';

type StreamType = 'wired' | 'classic' | 'query' | 'unknown';

type ConfigurationMode = 'interactive' | 'yaml';

type StreamsAttachmentCountProps = {
  name: string;
} & Record<AttachmentType, number>;

interface StreamsAttachmentClickEventProps {
  name: string;
  attachment_type: AttachmentType;
  attachment_id: string;
}

interface StreamsAttachmentLinkChangedProps {
  stream_name: string;
  attachment_count: number;
  count_by_type: Record<AttachmentType, number>;
}

interface StreamsAttachmentFlyoutOpenedProps {
  stream_name: string;
  attachment_type: AttachmentType;
  attachment_id: string;
}

type AttachmentFlyoutAction = 'navigate_to_attachment' | 'unlink' | 'navigate_to_attached_stream';

interface StreamsAttachmentFlyoutActionProps {
  stream_name: string;
  attachment_type: AttachmentType;
  attachment_id: string;
  action: AttachmentFlyoutAction;
}

interface StreamsAIGrokSuggestionLatencyProps {
  name: string;
  field: string;
  connector_id: string;
  suggestion_count: number;
  duration_ms: number;
  match_rate: number[];
}

interface StreamsAIGrokSuggestionAcceptedProps {
  name: string;
  field: string;
  connector_id: string;
  match_rate: number;
  detected_fields: number;
}

interface StreamsAIDissectSuggestionLatencyProps {
  name: string;
  field: string;
  connector_id: string;
  suggestion_count: number;
  duration_ms: number;
  match_rate: number[];
}

interface StreamsAIDissectSuggestionAcceptedProps {
  name: string;
  field: string;
  connector_id: string;
  match_rate: number;
  detected_fields: number;
}

interface WiredStreamsStatusChangedProps {
  is_enabled: boolean;
}

interface StreamsProcessingSavedProps {
  processors_count: number;
  stream_type: StreamType;
  configuration_mode: ConfigurationMode;
}

interface StreamsRetentionChangedProps {
  lifecycle_type: 'dsl' | 'ilm' | 'inherit';
  lifecycle_value?: string;
  stream_type: StreamType;
}

interface StreamsChildStreamCreatedProps {
  name: string;
}

interface StreamsSchemaUpdatedProps {
  stream_type: StreamType;
}

interface StreamsSignificantEventsSuggestionsGeneratedEventProps {
  duration_ms: number;
  input_tokens_used: number;
  output_tokens_used: number;
  count: number;
  features_selected: number;
  features_total: number;
  stream_name: string;
  stream_type: StreamType;
}

interface StreamsSignificantEventsCreatedProps {
  count: number;
  stream_name: string;
  stream_type: StreamType;
}

interface StreamsFeatureIdentificationSavedProps {
  count: number;
  stream_name: string;
  stream_type: StreamType;
}

interface StreamsFeatureIdentificationDeletedProps {
  count: number;
  stream_name: string;
  stream_type: StreamType;
}

interface StreamsProcessingSimulationSamplesFetchLatencyProps {
  stream_name: string;
  stream_type: StreamType;
  data_source_type: EnrichmentDataSource['type'];
  duration_ms: number;
}

interface StreamsPartitioningSamplesFetchLatencyProps {
  stream_name: string;
  stream_type: StreamType;
  duration_ms: number;
}

interface StreamsTabVisitedProps {
  stream_name: string;
  stream_type: StreamType;
  tab_name: string;
  privileges: {
    manage: boolean;
    monitor: boolean;
    view_index_metadata: boolean;
    lifecycle: boolean;
    simulate: boolean;
    text_structure: boolean;
    read_failure_store: boolean;
    manage_failure_store: boolean;
    create_snapshot_repository: boolean;
  };
}

export {
  type ConfigurationMode,
  type StreamsAttachmentCountProps,
  type StreamsAttachmentClickEventProps,
  type StreamsAttachmentLinkChangedProps,
  type StreamsAttachmentFlyoutOpenedProps,
  type StreamsAttachmentFlyoutActionProps,
  type AttachmentFlyoutAction,
  type StreamsAIGrokSuggestionLatencyProps,
  type StreamsAIGrokSuggestionAcceptedProps,
  type StreamsAIDissectSuggestionLatencyProps,
  type StreamsAIDissectSuggestionAcceptedProps,
  type StreamsRetentionChangedProps,
  type StreamsProcessingSavedProps,
  type StreamsChildStreamCreatedProps,
  type StreamsSchemaUpdatedProps,
  type StreamsSignificantEventsSuggestionsGeneratedEventProps,
  type StreamsSignificantEventsCreatedProps,
  type WiredStreamsStatusChangedProps,
  type StreamsFeatureIdentificationSavedProps,
  type StreamsFeatureIdentificationDeletedProps,
  type StreamsProcessingSimulationSamplesFetchLatencyProps,
  type StreamsPartitioningSamplesFetchLatencyProps,
  type StreamsTabVisitedProps,
};
