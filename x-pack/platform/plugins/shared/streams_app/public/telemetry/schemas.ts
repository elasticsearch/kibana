/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RootSchema, SchemaObject } from '@elastic/ebt';
import type { AttachmentType } from '@kbn/streams-plugin/server/lib/streams/attachments/types';
import type {
  StreamsAIGrokSuggestionAcceptedProps,
  StreamsAIDissectSuggestionAcceptedProps,
  StreamsAttachmentClickEventProps,
  StreamsAttachmentCountProps,
  StreamsAttachmentLinkChangedProps,
  StreamsAttachmentFlyoutOpenedProps,
  StreamsAttachmentFlyoutActionProps,
  StreamsChildStreamCreatedProps,
  StreamsProcessingSavedProps,
  StreamsRetentionChangedProps,
  StreamsSchemaUpdatedProps,
  StreamsSignificantEventsCreatedProps,
  StreamsSignificantEventsSuggestionsGeneratedEventProps,
  WiredStreamsStatusChangedProps,
  StreamsFeatureIdentificationSavedProps,
  StreamsFeatureIdentificationDeletedProps,
  StreamsTabVisitedProps,
} from './types';

const attachmentTypeCountFields: Record<
  AttachmentType,
  { type: 'long'; _meta: { description: string } }
> = {
  dashboard: {
    type: 'long',
    _meta: {
      description: 'The count of dashboard attachments',
    },
  },
  slo: {
    type: 'long',
    _meta: {
      description: 'The count of SLO attachments',
    },
  },
  rule: {
    type: 'long',
    _meta: {
      description: 'The count of rule attachments',
    },
  },
};

const streamsAttachmentCountSchema: RootSchema<StreamsAttachmentCountProps> = {
  name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
  ...attachmentTypeCountFields,
};

const streamsAttachmentClickEventSchema: RootSchema<StreamsAttachmentClickEventProps> = {
  name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
  attachment_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of attachment: dashboard, slo, rule',
    },
  },
  attachment_id: {
    type: 'keyword',
    _meta: {
      description: 'The id of the attachment',
    },
  },
};

const attachmentCountByTypeSchema: SchemaObject<Record<AttachmentType, number>> = {
  _meta: {
    description: 'The count of attachments grouped by type',
  },
  properties: attachmentTypeCountFields,
};

const streamsAttachmentLinkChangedSchema: RootSchema<StreamsAttachmentLinkChangedProps> = {
  stream_name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
  attachment_count: {
    type: 'long',
    _meta: {
      description: 'The number of attachments linked or unlinked',
    },
  },
  count_by_type: attachmentCountByTypeSchema,
};

const streamsAttachmentFlyoutOpenedSchema: RootSchema<StreamsAttachmentFlyoutOpenedProps> = {
  stream_name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
  attachment_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of attachment: dashboard, slo, rule',
    },
  },
  attachment_id: {
    type: 'keyword',
    _meta: {
      description: 'The id of the attachment',
    },
  },
};

const streamsAttachmentFlyoutActionSchema: RootSchema<StreamsAttachmentFlyoutActionProps> = {
  stream_name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
  attachment_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of attachment: dashboard, slo, rule',
    },
  },
  attachment_id: {
    type: 'keyword',
    _meta: {
      description: 'The id of the attachment',
    },
  },
  action: {
    type: 'keyword',
    _meta: {
      description:
        'The action taken from the flyout: navigate_to_attachment, unlink, navigate_to_attached_stream',
    },
  },
};

const streamsAIGrokSuggestionAcceptedSchema: RootSchema<StreamsAIGrokSuggestionAcceptedProps> = {
  name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
  field: {
    type: 'keyword',
    _meta: {
      description: 'The name of the field used.',
    },
  },
  connector_id: {
    type: 'keyword',
    _meta: {
      description: 'The ID of the LLM connector',
    },
  },
  match_rate: {
    type: 'float',
    _meta: {
      description: 'The success rate of suggestion',
    },
  },
  detected_fields: {
    type: 'long',
    _meta: {
      description: 'The number of detected fields',
    },
  },
};

const streamsAIDissectSuggestionAcceptedSchema: RootSchema<StreamsAIDissectSuggestionAcceptedProps> =
  {
    name: {
      type: 'keyword',
      _meta: {
        description: 'The name of the Stream',
      },
    },
    field: {
      type: 'keyword',
      _meta: {
        description: 'The name of the field used.',
      },
    },
    connector_id: {
      type: 'keyword',
      _meta: {
        description: 'The ID of the LLM connector',
      },
    },
    match_rate: {
      type: 'float',
      _meta: {
        description: 'The success rate of suggestion',
      },
    },
    detected_fields: {
      type: 'long',
      _meta: {
        description: 'The number of detected fields',
      },
    },
  };

const wiredStreamsStatusChangedSchema: RootSchema<WiredStreamsStatusChangedProps> = {
  is_enabled: {
    type: 'boolean',
    _meta: {
      description: 'Whether wired streams was enabled or disabled',
    },
  },
};

const streamsProcessingSavedSchema: RootSchema<StreamsProcessingSavedProps> = {
  processors_count: {
    type: 'long',
    _meta: {
      description: 'The number of processors configured on the stream',
    },
  },
  stream_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of the stream: wired or classic',
    },
  },
  configuration_mode: {
    type: 'keyword',
    _meta: {
      description: 'The mode used to configure the processors: interactive or yaml',
    },
  },
};

const streamsRetentionChangedSchema: RootSchema<StreamsRetentionChangedProps> = {
  lifecycle_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of lifecycle: dsl, ilm, inherit',
    },
  },
  lifecycle_value: {
    type: 'keyword',
    _meta: {
      description: 'The lifecycle value, if applicable',
      optional: true,
    },
  },
  stream_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of the stream: wired or classic',
    },
  },
};

const streamsChildStreamCreatedSchema: RootSchema<StreamsChildStreamCreatedProps> = {
  name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the child stream',
    },
  },
};

const streamsSchemaUpdatedSchema: RootSchema<StreamsSchemaUpdatedProps> = {
  stream_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of the stream: wired or classic',
    },
  },
};

const streamsSignificantEventsSuggestionsGeneratedSchema: RootSchema<StreamsSignificantEventsSuggestionsGeneratedEventProps> =
  {
    duration_ms: {
      type: 'long',
      _meta: {
        description:
          'The time (in milliseconds) it took to generate significant events suggestions',
      },
    },
    input_tokens_used: {
      type: 'long',
      _meta: {
        description: 'The number of input tokens used for the generation request',
      },
    },
    output_tokens_used: {
      type: 'long',
      _meta: {
        description: 'The number of output tokens used for the generation request',
      },
    },
    count: {
      type: 'long',
      _meta: {
        description: 'The number of significant event queries generated',
      },
    },
    features_selected: {
      type: 'long',
      _meta: {
        description: 'The number of features selected for generation',
      },
    },
    features_total: {
      type: 'long',
      _meta: {
        description: 'The number of total features available for generation',
      },
    },
    stream_type: {
      type: 'keyword',
      _meta: {
        description: 'The type of the stream: wired or classic',
      },
    },
    stream_name: {
      type: 'keyword',
      _meta: {
        description: 'The name of the Stream',
      },
    },
  };

const streamsSignificantEventsCreatedSchema: RootSchema<StreamsSignificantEventsCreatedProps> = {
  count: {
    type: 'long',
    _meta: {
      description: 'The number of significant events created',
    },
  },
  stream_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of the stream: wired or classic',
    },
  },
  stream_name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
};

const streamsFeatureIdentificationSavedSchema: RootSchema<StreamsFeatureIdentificationSavedProps> =
  {
    count: {
      type: 'long',
      _meta: {
        description: 'The number of features saved',
      },
    },
    stream_type: {
      type: 'keyword',
      _meta: {
        description: 'The type of the stream: wired or classic',
      },
    },
    stream_name: {
      type: 'keyword',
      _meta: {
        description: 'The name of the Stream',
      },
    },
  };

const streamsFeatureIdentificationDeletedSchema: RootSchema<StreamsFeatureIdentificationDeletedProps> =
  {
    count: {
      type: 'long',
      _meta: {
        description: 'The number of features deleted',
      },
    },
    stream_type: {
      type: 'keyword',
      _meta: {
        description: 'The type of the stream: wired or classic',
      },
    },
    stream_name: {
      type: 'keyword',
      _meta: {
        description: 'The name of the Stream',
      },
    },
  };

const streamsTabVisitedSchema: RootSchema<StreamsTabVisitedProps> = {
  stream_name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the stream being visited',
    },
  },
  stream_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of the stream: wired, classic or unknown',
    },
  },
  tab_name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the tab being visited',
    },
  },
  privileges: {
    properties: {
      manage: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can manage/change the stream',
        },
      },
      monitor: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can monitor the stream',
        },
      },
      view_index_metadata: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can view stream metadata',
        },
      },
      lifecycle: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can change retention settings',
        },
      },
      simulate: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can simulate processing changes',
        },
      },
      text_structure: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can use text structure API',
        },
      },
      read_failure_store: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can read failure store',
        },
      },
      manage_failure_store: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can manage failure store',
        },
      },
      create_snapshot_repository: {
        type: 'boolean',
        _meta: {
          description: 'Whether the user can create snapshot repositories',
        },
      },
    },
  },
};

export {
  streamsAttachmentCountSchema,
  streamsAttachmentClickEventSchema,
  streamsAttachmentLinkChangedSchema,
  streamsAttachmentFlyoutOpenedSchema,
  streamsAttachmentFlyoutActionSchema,
  streamsAIGrokSuggestionAcceptedSchema,
  streamsAIDissectSuggestionAcceptedSchema,
  streamsRetentionChangedSchema,
  streamsProcessingSavedSchema,
  streamsChildStreamCreatedSchema,
  streamsSchemaUpdatedSchema,
  streamsSignificantEventsSuggestionsGeneratedSchema,
  streamsSignificantEventsCreatedSchema,
  wiredStreamsStatusChangedSchema,
  streamsFeatureIdentificationSavedSchema,
  streamsFeatureIdentificationDeletedSchema,
  streamsTabVisitedSchema,
};
