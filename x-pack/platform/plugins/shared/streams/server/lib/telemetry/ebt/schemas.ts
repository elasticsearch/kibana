/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RootSchema } from '@elastic/ebt/client';
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
  StreamsOnboardingScheduledProps,
} from './types';

const streamsEndpointLatencySchema: RootSchema<StreamEndpointLatencyProps> = {
  name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
  endpoint: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Streams endpoint',
    },
  },
  duration_ms: {
    type: 'long',
    _meta: {
      description: 'The duration of the endpoint in milliseconds',
    },
  },
};

const streamsStateErrorSchema: RootSchema<StreamsStateErrorProps> = {
  error: {
    properties: {
      name: {
        type: 'keyword',
        _meta: {
          description: 'The name of the error class',
        },
      },
      message: {
        type: 'text',
        _meta: {
          description: 'The error message',
        },
      },
      stack_trace: {
        type: 'text',
        _meta: {
          description: 'The error stack trace',
          optional: true,
        },
      },
    },
  },
  status_code: {
    type: 'long',
    _meta: {
      description: 'The HTTP status code associated with the error',
    },
  },
};

const streamsDescriptionGeneratedSchema: RootSchema<StreamsDescriptionGeneratedProps> = {
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

const streamsSignificantEventsQueriesGeneratedSchema: RootSchema<StreamsSignificantEventsQueriesGeneratedProps> =
  {
    count: {
      type: 'long',
      _meta: {
        description: 'The number of significant events queries generated',
      },
    },
    connector_id: {
      type: 'keyword',
      _meta: {
        description: 'The ID of the LLM connector used for the inference',
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
    cached_tokens_used: {
      type: 'long',
      _meta: {
        description: 'Cached tokens used for the generation request',
      },
    },
    duration_ms: {
      type: 'long',
      _meta: {
        description: 'Duration of the query generation operation in milliseconds',
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
    tool_usage: {
      properties: {
        get_stream_features: {
          properties: {
            calls: {
              type: 'long',
              _meta: {
                description: 'The number of calls to the get_stream_features tool',
              },
            },
            failures: {
              type: 'long',
              _meta: {
                description: 'The number of failures to the get_stream_features tool',
              },
            },
            latency_ms: {
              type: 'long',
              _meta: {
                description: 'The latency of the get_stream_features tool in milliseconds',
              },
            },
          },
        },
        add_queries: {
          properties: {
            calls: {
              type: 'long',
              _meta: {
                description: 'The number of calls to the add_queries tool',
              },
            },
            failures: {
              type: 'long',
              _meta: {
                description: 'The number of failures to the add_queries tool',
              },
            },
            latency_ms: {
              type: 'long',
              _meta: {
                description: 'The latency of the add_queries tool in milliseconds',
              },
            },
          },
        },
      },
    },
  };

const streamsProcessingPipelineSuggestedSchema: RootSchema<StreamsProcessingPipelineSuggestedProps> =
  {
    duration_ms: {
      type: 'long',
      _meta: {
        description: 'The duration of the pipeline suggestion generation in milliseconds',
      },
    },
    steps_used: {
      type: 'long',
      _meta: {
        description: 'The number of reasoning steps the LLM took to generate the suggestion',
      },
    },
    success: {
      type: 'boolean',
      _meta: {
        description: 'Whether the pipeline suggestion was generated successfully',
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

const streamsFeaturesIdentifiedSchema: RootSchema<StreamsFeaturesIdentifiedProps> = {
  run_id: {
    type: 'keyword',
    _meta: {
      description: 'UUID identifying the full identification run (shared across iterations)',
    },
  },
  connector_id: {
    type: 'keyword',
    _meta: {
      description: 'The ID of the LLM connector used for the inference',
    },
  },
  iteration: {
    type: 'long',
    _meta: {
      description: 'Iteration number (1-based); 0 for terminal failure/cancel events',
    },
  },
  docs_count: {
    type: 'long',
    _meta: {
      description: 'Number of documents used in this iteration',
    },
  },
  features_new: {
    type: 'long',
    _meta: {
      description: 'New features identified in this iteration',
    },
  },
  features_updated: {
    type: 'long',
    _meta: {
      description: 'Existing features updated in this iteration',
    },
  },
  input_tokens_used: {
    type: 'long',
    _meta: {
      description: 'Input tokens used in this iteration',
    },
  },
  output_tokens_used: {
    type: 'long',
    _meta: {
      description: 'Output tokens used in this iteration',
    },
  },
  total_tokens_used: {
    type: 'long',
    _meta: {
      description: 'Total tokens used in this iteration',
    },
  },
  excluded_features_count: {
    type: 'long',
    _meta: {
      description: 'The number of excluded features present at the time of identification',
    },
  },
  llm_ignored_count: {
    type: 'long',
    _meta: {
      description: 'The number of features the LLM reported as matching excluded features',
    },
  },
  code_ignored_count: {
    type: 'long',
    _meta: {
      description:
        'The number of inferred features dropped server-side because they matched excluded features',
    },
  },
  cached_tokens_used: {
    type: 'long',
    _meta: {
      description: 'Cached tokens used in this iteration',
    },
  },
  duration_ms: {
    type: 'long',
    _meta: {
      description: 'Duration of this iteration in milliseconds',
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
  state: {
    type: 'keyword',
    _meta: {
      description: 'The state of the features identification task (success, failure, or canceled)',
    },
  },
  filters_capped: {
    type: 'boolean',
    _meta: {
      description: 'Whether the filters were capped',
    },
  },
  total_filters: {
    type: 'long',
    _meta: {
      description: 'The total number of filters available in features',
    },
  },
  has_filtered_documents: {
    type: 'boolean',
    _meta: {
      description: 'Whether the sample query found documents after filters were applied',
    },
  },
};

const streamsAgentBuilderKnowledgeIndicatorCreatedSchema: RootSchema<StreamsAgentBuilderKnowledgeIndicatorCreatedProps> =
  {
    ki_kind: {
      type: 'keyword',
      _meta: {
        description: 'The kind of KI created by the agent builder tool: feature or query',
      },
    },
    tool_id: {
      type: 'keyword',
      _meta: {
        description: 'The tool that created the KI',
      },
    },
    success: {
      type: 'boolean',
      _meta: {
        description: 'Whether KI creation succeeded',
      },
    },
    stream_name: {
      type: 'keyword',
      _meta: {
        description: 'The name of the Stream',
      },
    },
    stream_type: {
      type: 'keyword',
      _meta: {
        description: 'The type of the stream: wired, classic, query, or unknown',
      },
    },
    error_message: {
      type: 'text',
      _meta: {
        description: 'Error message when KI creation fails',
        optional: true,
      },
    },
  };

const streamsAgentToolKiIdentificationStartedSchema: RootSchema<StreamsAgentToolKiIdentificationStartedProps> =
  {
    success: {
      type: 'boolean',
      _meta: {
        description: 'Whether starting KI identification succeeded',
      },
    },
    stream_name: {
      type: 'keyword',
      _meta: {
        description: 'The name of the Stream',
      },
    },
    error_message: {
      type: 'text',
      _meta: {
        description: 'Error message when KI identification start fails',
        optional: true,
      },
    },
  };

const streamsAgentToolEventCreateSchema: RootSchema<StreamsAgentToolEventCreateProps> = {
  success: {
    type: 'boolean',
    _meta: {
      description: 'Whether the event creation succeeded',
    },
  },
  stream_names: {
    type: 'array',
    items: {
      type: 'keyword',
      _meta: {
        description: 'A stream name',
      },
    },
    _meta: {
      description: 'The names of the Streams associated with the event',
    },
  },
  error_message: {
    type: 'text',
    _meta: {
      description: 'Error message when event creation fails',
      optional: true,
    },
  },
};

const streamsAgentToolEventStatusUpdateSchema: RootSchema<StreamsAgentToolEventStatusUpdateProps> =
  {
    success: {
      type: 'boolean',
      _meta: {
        description: 'Whether the event status update succeeded',
      },
    },
    event_id: {
      type: 'keyword',
      _meta: {
        description: 'The identifier of the updated significant event',
      },
    },
    status: {
      type: 'keyword',
      _meta: {
        description: 'The status value set on the significant event',
      },
    },
    error_message: {
      type: 'text',
      _meta: {
        description: 'Error message when event status update fails',
        optional: true,
      },
    },
  };

const streamsCodeAnalysisGroundingSchema: RootSchema<StreamsCodeAnalysisGroundingProps> = {
  stream_name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the Stream',
    },
  },
  stream_type: {
    type: 'keyword',
    _meta: {
      description: 'The type of the stream: wired or classic',
    },
  },
  status: {
    type: 'keyword',
    _meta: {
      description:
        'Outcome of code_analysis grounding: feature, no_match, no_candidates, no_strings, or unavailable',
    },
  },
  repository: {
    type: 'keyword',
    _meta: {
      description: 'The repository/index selected to ground the stream against',
      optional: true,
    },
  },
  candidate_count: {
    type: 'long',
    _meta: {
      description: 'The number of candidate code repositories considered',
    },
  },
  verified_count: {
    type: 'long',
    _meta: {
      description: 'The number of distinctive log strings verified against the selected code',
    },
  },
};

const streamsSignificantEventsDiscoveryTriggeredSchema = {
  execution_id: {
    type: 'keyword' as const,
    _meta: { description: 'The workflow execution ID returned by the orchestrator' },
  },
  space_id: {
    type: 'keyword' as const,
    _meta: { description: 'The Kibana space in which the pipeline was triggered' },
  },
};

const streamsOnboardingScheduledSchema: RootSchema<StreamsOnboardingScheduledProps> = {
  stream_name: {
    type: 'keyword',
    _meta: {
      description: 'The name of the stream being onboarded',
    },
  },
  execution_id: {
    type: 'keyword',
    _meta: {
      description:
        'The workflow execution ID for this onboarding run; join key to workflow_execution_completed/_failed/_cancelled engine events and to streams-features-identified / streams-significant-events-queries-generated events',
    },
  },
  workflow_id: {
    type: 'keyword',
    _meta: {
      description: 'The managed workflow ID that was triggered (system-streams-ki-onboarding)',
    },
  },
  space_id: {
    type: 'keyword',
    _meta: {
      description: 'The Kibana space in which the workflow execution was created',
    },
  },
  skip_features: {
    type: 'boolean',
    _meta: {
      description: 'Whether the features identification step was skipped for this run',
    },
  },
  skip_queries: {
    type: 'boolean',
    _meta: {
      description: 'Whether the queries generation step was skipped for this run',
    },
  },
};

const streamsAgentToolEventInvestigationAttachSchema: RootSchema<StreamsAgentToolEventInvestigationAttachProps> =
  {
    success: {
      type: 'boolean',
      _meta: {
        description: 'Whether the investigation attachment succeeded',
      },
    },
    event_id: {
      type: 'keyword',
      _meta: {
        description: 'The identifier of the significant event the investigation was attached to',
      },
    },
    workflow_execution_id: {
      type: 'keyword',
      _meta: {
        description: 'The investigation workflow execution id that was attached',
      },
    },
    error_message: {
      type: 'text',
      _meta: {
        description: 'Error message when investigation attachment fails',
        optional: true,
      },
    },
  };

export {
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
  streamsAgentToolEventInvestigationAttachSchema,
  streamsCodeAnalysisGroundingSchema,
  streamsSignificantEventsDiscoveryTriggeredSchema,
  streamsOnboardingScheduledSchema,
};
