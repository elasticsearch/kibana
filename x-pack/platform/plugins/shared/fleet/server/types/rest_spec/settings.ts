/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import { isDiffPathProtocol } from '../../../common/services';

const EnrollmentSettingsProxySchema = schema.object({
  id: schema.string(),
  name: schema.string(),
  url: schema.string(),
});

const EnrollmentSettingsFleetServerHostSchema = schema.object({
  id: schema.string(),
  name: schema.string(),
  host_urls: schema.arrayOf(schema.string(), { minSize: 1, maxSize: 10 }),
  is_default: schema.boolean({ defaultValue: false }),
  is_preconfigured: schema.boolean({ defaultValue: false }),
  is_internal: schema.maybe(schema.boolean()),
  allow_edit: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  proxy_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  ssl: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.object({
        certificate_authorities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
        certificate: schema.maybe(schema.string()),
        es_certificate_authorities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
        es_certificate: schema.maybe(schema.string()),
        agent_certificate_authorities: schema.maybe(
          schema.arrayOf(schema.string(), { maxSize: 10 })
        ),
        agent_certificate: schema.maybe(schema.string()),
        client_auth: schema.maybe(schema.string()),
      }),
    ])
  ),
});

const EnrollmentSettingsOutputSchema = schema.object({
  id: schema.string(),
  name: schema.string(),
  type: schema.literal('elasticsearch'),
  is_default: schema.boolean(),
  is_default_monitoring: schema.boolean(),
  is_internal: schema.maybe(schema.boolean()),
  is_preconfigured: schema.maybe(schema.boolean()),
  hosts: schema.maybe(schema.arrayOf(schema.string(), { minSize: 1, maxSize: 10 })),
  ca_sha256: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  ca_trusted_fingerprint: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  config_yaml: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  otel_exporter_config_yaml: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  otel_disable_beatsauth: schema.maybe(schema.oneOf([schema.literal(null), schema.boolean()])),
  proxy_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  allow_edit: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  preset: schema.maybe(
    schema.oneOf([
      schema.literal('custom'),
      schema.literal('balanced'),
      schema.literal('throughput'),
      schema.literal('scale'),
      schema.literal('latency'),
    ])
  ),
  write_to_logs_streams: schema.maybe(schema.oneOf([schema.literal(null), schema.boolean()])),
  ssl: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.object({
        certificate_authorities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
        certificate: schema.maybe(schema.string()),
        verification_mode: schema.maybe(schema.string()),
      }),
    ])
  ),
});

const EnrollmentSettingsDownloadSourceSchema = schema.maybe(
  schema.object({
    id: schema.string(),
    name: schema.string(),
    host: schema.uri({ scheme: ['http', 'https'] }),
    is_default: schema.boolean(),
    proxy_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
    ssl: schema.maybe(
      schema.object({
        certificate_authorities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
        certificate: schema.maybe(schema.string()),
      })
    ),
    auth: schema.maybe(
      schema.oneOf([
        schema.literal(null),
        schema.object({
          username: schema.maybe(schema.string()),
          headers: schema.maybe(
            schema.arrayOf(schema.object({ key: schema.string(), value: schema.string() }), {
              maxSize: 100,
            })
          ),
        }),
      ])
    ),
  })
);

export const GetSettingsRequestSchema = {};

export const PutSettingsRequestSchema = {
  body: schema.object({
    has_seen_add_data_notice: schema.maybe(
      schema.boolean({
        meta: {
          deprecated: true,
        },
      })
    ),
    additional_yaml_config: schema.maybe(
      schema.string({
        meta: {
          deprecated: true,
        },
      })
    ),
    // Deprecated not used
    kibana_urls: schema.maybe(
      schema.arrayOf(schema.uri({ scheme: ['http', 'https'] }), {
        validate: (value) => {
          if (isDiffPathProtocol(value)) {
            return 'Protocol and path must be the same for each URL';
          }
        },
        meta: {
          deprecated: true,
        },
        maxSize: 10,
      })
    ),
    kibana_ca_sha256: schema.maybe(
      schema.string({
        meta: {
          deprecated: true,
        },
      })
    ),
    prerelease_integrations_enabled: schema.maybe(schema.boolean()),
    delete_unenrolled_agents: schema.maybe(
      schema.object({
        enabled: schema.boolean(),
        is_preconfigured: schema.boolean(),
      })
    ),
    integration_knowledge_enabled: schema.maybe(schema.boolean()),
  }),
};

export const GetSpaceSettingsRequestSchema = {};

export const SpaceSettingsResponseSchema = schema.object({
  item: schema.object({
    managed_by: schema.maybe(schema.string()),
    allowed_namespace_prefixes: schema.arrayOf(schema.string(), { maxSize: 100 }),
  }),
});

export const SettingsSchemaV5 = schema.object({
  has_seen_add_data_notice: schema.maybe(schema.boolean()),
  prerelease_integrations_enabled: schema.maybe(schema.boolean()),
  id: schema.maybe(schema.string()),
  version: schema.maybe(schema.string()),
  preconfigured_fields: schema.maybe(
    schema.arrayOf(schema.literal('fleet_server_hosts'), { maxSize: 1 })
  ),
  secret_storage_requirements_met: schema.maybe(schema.boolean()),
  output_secret_storage_requirements_met: schema.maybe(schema.boolean()),
  action_secret_storage_requirements_met: schema.maybe(schema.boolean()),
  use_space_awareness_migration_status: schema.maybe(
    schema.oneOf([schema.literal('pending'), schema.literal('success'), schema.literal('error')])
  ),
  use_space_awareness_migration_started_at: schema.maybe(
    schema.oneOf([schema.literal(null), schema.string()])
  ),
  delete_unenrolled_agents: schema.maybe(
    schema.object({
      enabled: schema.boolean(),
      is_preconfigured: schema.boolean(),
    })
  ),
  ilm_migration_status: schema.maybe(
    schema.object({
      logs: schema.maybe(schema.oneOf([schema.literal('success'), schema.literal(null)])),
      metrics: schema.maybe(schema.oneOf([schema.literal('success'), schema.literal(null)])),
      synthetics: schema.maybe(schema.oneOf([schema.literal('success'), schema.literal(null)])),
    })
  ),
});

export const SettingsSchemaV6 = SettingsSchemaV5.extends({
  ssl_secret_storage_requirements_met: schema.maybe(schema.boolean()),
});

export const SettingsSchemaV7 = SettingsSchemaV6.extends({
  integration_knowledge_enabled: schema.maybe(schema.boolean()),
});

export const SettingsSchemaV8 = SettingsSchemaV7.extends({
  download_source_auth_secret_storage_requirements_met: schema.maybe(schema.boolean()),
});

export const SettingsResponseSchema = schema.object({
  item: SettingsSchemaV8,
});

export const PutSpaceSettingsRequestSchema = {
  body: schema.object({
    allowed_namespace_prefixes: schema.maybe(
      schema.arrayOf(
        schema.string({
          validate: (v) => {
            if (v.includes('-')) {
              return 'Must not contain -';
            }
          },
        }),
        { maxSize: 10 }
      )
    ),
  }),
};

export const GetEnrollmentSettingsRequestSchema = {
  query: schema.maybe(
    schema.object({
      agentPolicyId: schema.maybe(schema.string()),
    })
  ),
};

export const GetEnrollmentSettingsResponseSchema = schema.object({
  fleet_server: schema.object({
    policies: schema.arrayOf(
      schema.object({
        id: schema.string(),
        name: schema.string(),
        is_managed: schema.boolean(),
        is_default_fleet_server: schema.maybe(schema.boolean()),
        has_fleet_server: schema.maybe(schema.boolean()),
      }),
      { maxSize: 10000 }
    ),
    has_active: schema.boolean(),
    host: schema.maybe(EnrollmentSettingsFleetServerHostSchema),
    host_proxy: schema.maybe(EnrollmentSettingsProxySchema),
    es_output: schema.maybe(EnrollmentSettingsOutputSchema),
    es_output_proxy: schema.maybe(EnrollmentSettingsProxySchema),
  }),
  download_source: EnrollmentSettingsDownloadSourceSchema,
  download_source_proxy: schema.maybe(EnrollmentSettingsProxySchema),
});
