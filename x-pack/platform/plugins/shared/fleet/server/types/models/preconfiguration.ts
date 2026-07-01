/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import { schema } from '@kbn/config-schema';
import semverValid from 'semver/functions/valid';

import { PRECONFIGURATION_LATEST_KEYWORD } from '../../constants';
import { clientAuth, type PreconfiguredOutput } from '../../../common/types';

import {
  ElasticSearchSchema,
  KafkaSchema,
  LogstashSchema,
  RemoteElasticSearchSchema,
} from './output';

import { AgentPolicyNamespaceSchema, AgentPolicySchemaV3 } from './agent_policy';
import {
  PackagePolicyNamespaceSchema,
  SimplifiedPackagePolicyPreconfiguredSchema,
} from './package_policy';

const varsSchema = schema.maybe(
  schema.arrayOf(
    schema.object({
      name: schema.string(),
      type: schema.maybe(schema.string()),
      value: schema.maybe(schema.any()),
      frozen: schema.maybe(schema.boolean()),
    }),
    { maxSize: 1000 }
  )
);

const secretRefSchema = schema.oneOf([
  schema.object({
    id: schema.string(),
  }),
  schema.string(),
]);

export const PreconfiguredPackagesSchema = schema.arrayOf(
  schema.object({
    name: schema.string(),
    version: schema.string({
      validate: (value) => {
        if (value !== PRECONFIGURATION_LATEST_KEYWORD && !semverValid(value)) {
          return i18n.translate('xpack.fleet.config.invalidPackageVersionError', {
            defaultMessage: 'must be a valid semver, or the keyword `latest`',
          });
        }
      },
    }),
    prerelease: schema.maybe(schema.boolean()),
    skipDataStreamRollover: schema.maybe(schema.boolean()),
  }),
  {
    defaultValue: [],
    maxSize: 1000,
  }
);

function validatePreconfiguredOutputs(outputs: PreconfiguredOutput[]) {
  const acc = {
    names: new Set(),
    ids: new Set(),
    is_default_exists: false,
    is_default_monitoring_exists: false,
  };

  for (const output of outputs) {
    if (acc.names.has(output.name)) {
      return 'preconfigured outputs need to have unique names.';
    }
    if (acc.ids.has(output.id)) {
      return 'preconfigured outputs need to have unique ids.';
    }
    if (acc.is_default_exists && output.is_default) {
      return 'preconfigured outputs can only have one default output.';
    }
    if (acc.is_default_monitoring_exists && output.is_default_monitoring) {
      return 'preconfigured outputs can only have one default monitoring output.';
    }

    acc.ids.add(output.id);
    acc.names.add(output.name);
    acc.is_default_exists = acc.is_default_exists || output.is_default;
    acc.is_default_monitoring_exists = acc.is_default_exists || output.is_default_monitoring;
  }
}

const PreconfiguredOutputBaseSchema = {
  id: schema.string(),
  config: schema.maybe(schema.object({}, { unknowns: 'allow' })),
  config_yaml: schema.never(),
  allow_edit: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 1000 })),
};

export const PreconfiguredOutputsSchema = schema.arrayOf(
  schema.discriminatedUnion('type', [
    schema.object({ ...ElasticSearchSchema }).extends(PreconfiguredOutputBaseSchema, {
      meta: { id: 'preconfigured_output_elasticsearch' },
    }),
    schema
      .object({ ...LogstashSchema })
      .extends(PreconfiguredOutputBaseSchema, { meta: { id: 'preconfigured_output_logstash' } }),
    schema
      .object({ ...KafkaSchema })
      .extends(PreconfiguredOutputBaseSchema, { meta: { id: 'preconfigured_output_kafka' } }),
    schema.object({ ...RemoteElasticSearchSchema }).extends(PreconfiguredOutputBaseSchema, {
      meta: { id: 'preconfigured_output_remote_elasticsearch' },
    }),
  ]),
  { defaultValue: [], validate: validatePreconfiguredOutputs, maxSize: 100 }
);

export const PreconfiguredFleetServerHostsSchema = schema.arrayOf(
  schema.object({
    id: schema.string(),
    name: schema.string(),
    is_default: schema.boolean({ defaultValue: false }),
    is_internal: schema.maybe(schema.boolean()),
    allow_edit: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
    host_urls: schema.arrayOf(schema.string(), { minSize: 1, maxSize: 10 }),
    proxy_id: schema.nullable(schema.string()),
    secrets: schema.maybe(
      schema.object({
        ssl: schema.maybe(
          schema.object({
            key: schema.maybe(secretRefSchema),
            es_key: schema.maybe(secretRefSchema),
            agent_key: schema.maybe(secretRefSchema),
          })
        ),
      })
    ),
    ssl: schema.maybe(
      schema.oneOf([
        schema.literal(null),
        schema.object({
          certificate_authorities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
          certificate: schema.maybe(schema.string()),
          key: schema.maybe(schema.string()),
          es_certificate_authorities: schema.maybe(
            schema.arrayOf(schema.string(), { maxSize: 10 })
          ),
          es_certificate: schema.maybe(schema.string()),
          es_key: schema.maybe(schema.string()),
          agent_certificate_authorities: schema.maybe(
            schema.arrayOf(schema.string(), { maxSize: 10 })
          ),
          agent_certificate: schema.maybe(schema.string()),
          agent_key: schema.maybe(schema.string()),
          client_auth: schema.maybe(
            schema.oneOf([
              schema.literal(clientAuth.Optional),
              schema.literal(clientAuth.Required),
              schema.literal(clientAuth.None),
            ])
          ),
        }),
      ])
    ),
  }),
  { defaultValue: [], maxSize: 100 }
);

export const PreconfiguredFleetProxiesSchema = schema.arrayOf(
  schema.object({
    id: schema.string(),
    name: schema.string(),
    url: schema.string(),
    proxy_headers: schema.maybe(
      schema.recordOf(
        schema.string(),
        schema.oneOf([schema.string(), schema.boolean(), schema.number()])
      )
    ),
    certificate_authorities: schema.maybe(schema.string()),
    certificate: schema.maybe(schema.string()),
    certificate_key: schema.maybe(schema.string()),
  }),
  { defaultValue: [], maxSize: 100 }
);

export const PreconfiguredAgentPoliciesSchema = schema.arrayOf(
  AgentPolicySchemaV3.extends({
    space_id: schema.maybe(schema.string()),
    namespace: schema.maybe(AgentPolicyNamespaceSchema),
    id: schema.maybe(schema.oneOf([schema.string(), schema.number()])),
    is_default: schema.maybe(schema.boolean()),
    is_default_fleet_server: schema.maybe(schema.boolean()),
    has_fleet_server: schema.maybe(schema.boolean()),
    data_output_id: schema.maybe(schema.string()),
    monitoring_output_id: schema.maybe(schema.string()),
    package_policies: schema.maybe(
      schema.arrayOf(
        schema.oneOf([
          schema.object({
            id: schema.maybe(schema.oneOf([schema.string(), schema.number()])),
            name: schema.string(),
            package: schema.object({
              name: schema.string({
                validate: (value) => {
                  if (value === 'synthetics') {
                    return i18n.translate('xpack.fleet.config.disableSynthetics', {
                      defaultMessage:
                        'Synthetics package is not supported via kibana.yml config. Please use Synthetics App to create monitors in private locations. https://www.elastic.co/guide/en/observability/current/synthetics-private-location.html',
                    });
                  }
                },
              }),
            }),
            description: schema.maybe(schema.string()),
            namespace: schema.maybe(PackagePolicyNamespaceSchema),
            output_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
            inputs: schema.maybe(
              schema.arrayOf(
                schema.object({
                  type: schema.string(),
                  enabled: schema.maybe(schema.boolean()),
                  keep_enabled: schema.maybe(schema.boolean()),
                  vars: varsSchema,
                  streams: schema.maybe(
                    schema.arrayOf(
                      schema.object({
                        data_stream: schema.object({
                          type: schema.maybe(schema.string()),
                          dataset: schema.string(),
                        }),
                        enabled: schema.maybe(schema.boolean()),
                        keep_enabled: schema.maybe(schema.boolean()),
                        vars: varsSchema,
                      }),
                      { maxSize: 1000 }
                    )
                  ),
                }),
                { maxSize: 1000 }
              )
            ),
          }),
          SimplifiedPackagePolicyPreconfiguredSchema,
        ]),
        { maxSize: 1000 }
      )
    ),
  }),
  {
    defaultValue: [],
    maxSize: 1000,
  }
);

export const PreconfiguredSpaceSettingsSchema = schema.arrayOf(
  schema.object({
    space_id: schema.string(),
    allowed_namespace_prefixes: schema.nullable(
      schema.arrayOf(
        schema.string({
          validate: (v) => {
            if (v.includes('-')) {
              return 'Must not contain -';
            }
          },
        }),
        { maxSize: 100 }
      )
    ),
  }),
  {
    defaultValue: [],
    maxSize: 100,
  }
);
