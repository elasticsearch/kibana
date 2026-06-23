/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getFileDataIndexName, getFileMetadataIndexName } from '../../common';

import { getESAssetMetadata } from '../services/epm/elasticsearch/meta';

const meta = getESAssetMetadata();

export const FLEET_INSTALL_FORMAT_VERSION = '1.5.0';

export const FLEET_AGENT_POLICIES_SCHEMA_VERSION = '1.1.1';

export const FLEET_FINAL_PIPELINE_ID = '.fleet_final_pipeline-1';

export const FLEET_EVENT_INGESTED_PIPELINE_ID = '.fleet_event_ingested_pipeline-1';

export const FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME = '.fleet_globals-1';

export const FLEET_GLOBALS_COMPONENT_TEMPLATE_CONTENT = {
  _meta: meta,
  template: {
    settings: {},
    mappings: {
      _meta: meta,
      // All the dynamic field mappings
      dynamic_templates: [
        // This makes sure all mappings are keywords by default
        {
          strings_as_keyword: {
            mapping: {
              ignore_above: 1024,
              type: 'keyword',
            },
            match_mapping_type: 'string',
          },
        },
      ],
      // As we define fields ahead, we don't need any automatic field detection
      // This makes sure all the fields are mapped to keyword by default to prevent mapping conflicts
      date_detection: false,
    },
  },
};
export const FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME = '.fleet_agent_id_verification-1';

export const INGESTED_MAPPING = {
  type: 'date',
  format: 'strict_date_time_no_millis||strict_date_optional_time||epoch_millis',
  ignore_malformed: false,
};

export const FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_CONTENT = {
  _meta: meta,
  template: {
    settings: {
      index: {
        final_pipeline: FLEET_FINAL_PIPELINE_ID,
      },
    },
    mappings: {
      properties: {
        event: {
          properties: {
            ingested: INGESTED_MAPPING,
            agent_id_status: {
              ignore_above: 1024,
              type: 'keyword',
            },
          },
        },
      },
    },
  },
};

export const FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_NAME = '.fleet_event_ingested-1';

export const FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_CONTENT = {
  _meta: meta,
  template: {
    settings: {
      index: {
        final_pipeline: FLEET_EVENT_INGESTED_PIPELINE_ID,
      },
    },
    mappings: {
      properties: {
        event: {
          properties: {
            ingested: INGESTED_MAPPING,
          },
        },
      },
    },
  },
};

export const FLEET_COMPONENT_TEMPLATES = [
  { name: FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME, body: FLEET_GLOBALS_COMPONENT_TEMPLATE_CONTENT },
  {
    name: FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
    body: FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_CONTENT,
  },
  {
    name: FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_NAME,
    body: FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_CONTENT,
  },
];

export const STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS = `logs@settings`;
export const STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS = `logs@mappings`;
export const STACK_COMPONENT_TEMPLATE_METRICS_SETTINGS = `metrics@settings`;
export const STACK_COMPONENT_TEMPLATE_METRICS_TSDB_SETTINGS = `metrics@tsdb-settings`;
export const STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS = 'ecs@mappings';
export const STACK_COMPONENT_TEMPLATE_TRACES_SETTINGS = `traces@settings`;
export const STACK_COMPONENT_TEMPLATE_TRACES_MAPPINGS = `traces@mappings`;

export const STACK_COMPONENT_TEMPLATES = [
  STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
  STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS,
  STACK_COMPONENT_TEMPLATE_METRICS_SETTINGS,
  STACK_COMPONENT_TEMPLATE_METRICS_TSDB_SETTINGS,
  STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS,
];

export const OTEL_COMPONENT_TEMPLATE_MAPPINGS = 'otel@mappings';
export const OTEL_COMPONENT_TEMPLATE_SETTINGS = 'otel@settings';

export const OTEL_COMPONENT_TEMPLATE_METRICS_MAPPINGS = 'metrics-otel@mappings';
export const OTEL_COMPONENT_TEMPLATE_METRICS_CUSTOM_MAPPINGS = 'metrics-otel@custom';
export const OTEL_COMPONENT_TEMPLATE_LOGS_MAPPINGS = 'logs-otel@mappings';
export const OTEL_COMPONENT_TEMPLATE_LOGS_CUSTOM_MAPPINGS = 'logs-otel@custom';
export const OTEL_COMPONENT_TEMPLATE_TRACES_MAPPINGS = 'traces-otel@mappings';
export const OTEL_COMPONENT_TEMPLATE_TRACES_CUSTOM_MAPPINGS = 'traces-otel@custom';
export const OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS = 'semconv-resource-to-ecs@mappings';

export const OTEL_METRICS_COMPONENT_TEMPLATES = [
  OTEL_COMPONENT_TEMPLATE_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_SETTINGS,
  OTEL_COMPONENT_TEMPLATE_METRICS_MAPPINGS,
  OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS,
];

export const OTEL_LOGS_COMPONENT_TEMPLATES = [
  OTEL_COMPONENT_TEMPLATE_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_SETTINGS,
  OTEL_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
  OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS,
];
export const OTEL_TRACES_COMPONENT_TEMPLATES = [
  OTEL_COMPONENT_TEMPLATE_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_SETTINGS,
  OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_TRACES_MAPPINGS,
];

export const OTEL_COMPONENT_TEMPLATES = [
  OTEL_COMPONENT_TEMPLATE_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_SETTINGS,
  OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_METRICS_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_TRACES_MAPPINGS,
  STACK_COMPONENT_TEMPLATE_TRACES_MAPPINGS,
  STACK_COMPONENT_TEMPLATE_TRACES_SETTINGS,
];

export const FLEET_EVENT_INGESTED_PIPELINE_VERSION = 1;

// If the content is updated you probably need to update the FLEET_EVENT_INGESTED_PIPELINE_VERSION too to allow upgrade of the pipeline
export const FLEET_EVENT_INGESTED_PIPELINE_CONTENT = `---
version: ${FLEET_EVENT_INGESTED_PIPELINE_VERSION}
_meta:
  managed_by: ${meta.managed_by}
  managed: ${meta.managed}
description: >
  Pipeline for processing all incoming Fleet Agent documents that adds event.ingested.
processors:
  - script:
      description: Add time when event was ingested (and remove sub-seconds to improve storage efficiency)
      tag: truncate-subseconds-event-ingested
      ignore_failure: true
      source: |-
        if (ctx?.event == null) {
          ctx.event = [:];
        }

        ctx.event.ingested = metadata().now.withNano(0).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
  - remove:
      description: Remove any pre-existing untrusted values.
      field:
        - event.agent_id_status
        - _security
      ignore_missing: true
  - remove:
      description: Remove event.original unless the preserve_original_event tag is set
      field: event.original
      if: "ctx?.tags == null || !(ctx.tags.contains('preserve_original_event'))"
      ignore_failure: true
      ignore_missing: true
  - set_security_user:
      field: _security
      properties:
        - authentication_type
        - username
        - realm
        - api_key
  - remove:
      field: _security
      ignore_missing: true
on_failure:
  - remove:
      field: _security
      ignore_missing: true
      ignore_failure: true
  - append:
      field: error.message
      value:
        - 'failed in Fleet agent event_ingested_pipeline: {{ _ingest.on_failure_message }}'`;

export const FLEET_FINAL_PIPELINE_VERSION = 5;

// If the content is updated you probably need to update the FLEET_FINAL_PIPELINE_VERSION too to allow upgrade of the pipeline
export const FLEET_FINAL_PIPELINE_CONTENT = `---
version: ${FLEET_FINAL_PIPELINE_VERSION}
_meta:
  managed_by: ${meta.managed_by}
  managed: ${meta.managed}
description: >
  Final pipeline for processing all incoming Fleet Agent documents.
processors:
  - script:
      description: Add time when event was ingested (and remove sub-seconds to improve storage efficiency)
      tag: truncate-subseconds-event-ingested
      ignore_failure: true
      source: |-
        if (ctx?.event == null) {
          ctx.event = [:];
        }

        ctx.event.ingested = metadata().now.withNano(0).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
  - remove:
      description: Remove any pre-existing untrusted values.
      field:
        - event.agent_id_status
        - _security
      ignore_missing: true
  - remove:
      description: Remove event.original unless the preserve_original_event tag is set
      field: event.original
      if: "ctx?.tags == null || !(ctx.tags.contains('preserve_original_event'))"
      ignore_failure: true
      ignore_missing: true
  - set_security_user:
      field: _security
      properties:
        - authentication_type
        - username
        - realm
        - api_key
  - script:
      description: >
        Add event.agent_id_status based on the API key metadata and the
        agent.id contained in the event.
      tag: agent-id-status
      source: |-
        boolean is_user_trusted(def ctx, def users) {
          if (ctx?._security?.username == null) {
            return false;
          }

          def user = null;
          for (def item : users) {
            if (item?.username == ctx._security.username) {
              user = item;
              break;
            }
          }

          if (user == null || user?.realm == null || ctx?._security?.realm?.name == null) {
            return false;
          }

          if (ctx._security.realm.name != user.realm) {
            return false;
          }

          return true;
        }

        String verified(def ctx, def params) {
          // No agent.id field to validate.
          if (ctx?.agent?.id == null) {
            return "missing";
          }

          // Some datasets are written by Kibana rather than agents.
          // Kibana is trusted to accurately report agent.id for these datasets.
          if (ctx?._security?.authentication_type != null
              && params?.kibana_user_allowed_datasets != null
              && params.kibana_user_allowed_datasets.contains(ctx?.data_stream?.dataset)
              && is_user_trusted(ctx, params.kibana_trusted_users)) {
            return "verified";
          }

          // Check auth metadata from API key.
          if (ctx?._security?.authentication_type == null
              // Agents only use API keys.
              || ctx._security.authentication_type != 'API_KEY'
              // Verify the API key owner before trusting any metadata it contains.
              || !is_user_trusted(ctx, params.trusted_users)
              // Verify the API key has metadata indicating the assigned agent ID.
              || ctx?._security?.api_key?.metadata?.agent_id == null) {
            return "auth_metadata_missing";
          }

          // The API key can only be used represent the agent.id it was issued to.
          if (ctx._security.api_key.metadata.agent_id != ctx.agent.id) {
            // Potential masquerade attempt.
            return "mismatch";
          }

          return "verified";
        }

        if (ctx?.event == null) {
          ctx.event = [:];
        }

        ctx.event.agent_id_status = verified(ctx, params);
      params:
        # List of users responsible for creating Fleet output API keys.
        trusted_users:
          - username: elastic/fleet-server
            realm: _service_account
          - username: cloud-internal-agent-server
            realm: found
          - username: elastic
            realm: reserved
        kibana_trusted_users:
          - username: elastic/kibana
            realm: _service_account
          - username: kibana_system
            realm: reserved
        # Datasets written by Kibana (elastic/kibana user) that are allowed to bypass API key verification.
        kibana_user_allowed_datasets:
          - elastic_agent.status_change
  - remove:
      field: _security
      ignore_missing: true
on_failure:
  - remove:
      field: _security
      ignore_missing: true
      ignore_failure: true
  - append:
      field: error.message
      value:
        - 'failed in Fleet agent final_pipeline: {{ _ingest.on_failure_message }}'`;

// Fleet Agent indexes for storing files
export const FILE_STORAGE_METADATA_AGENT_INDEX = getFileMetadataIndexName('agent');
export const FILE_STORAGE_DATA_AGENT_INDEX = getFileDataIndexName('agent');
