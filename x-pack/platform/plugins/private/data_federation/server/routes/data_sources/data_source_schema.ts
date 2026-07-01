/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

const optionalString = schema.maybe(schema.string({ maxLength: 4096 }));

const s3SettingsWithSecretsSchema = schema.object({
  region: optionalString,
  endpoint: optionalString,
  auth: optionalString,
  access_key: optionalString,
  secret_key: optionalString,
  role_arn: optionalString,
  jwt_audience: optionalString,
  role_session_name: optionalString,
  sts_endpoint: optionalString,
  sts_region: optionalString,
});

const gcsSettingsWithSecretsSchema = schema.object({
  project_id: optionalString,
  endpoint: optionalString,
  token_uri: optionalString,
  auth: optionalString,
  credentials: optionalString,
  jwt_audience: optionalString,
  sts_audience: optionalString,
  service_account_impersonation_url: optionalString,
});

const azureSettingsWithSecretsSchema = schema.object({
  endpoint: optionalString,
  account: optionalString,
  auth: optionalString,
  connection_string: optionalString,
  key: optionalString,
  sas_token: optionalString,
  tenant_id: optionalString,
  client_id: optionalString,
  jwt_audience: optionalString,
});

/**
 * Request body for `PUT .../data_sources/{id}`: {@link DataSourceWithSecrets} without
 * top-level `id` (the path supplies the id).
 */
export const putDataSourceBodySchema = schema.oneOf([
  schema.object({
    type: schema.literal('s3'),
    description: schema.string({ maxLength: 1024 }),
    settings: s3SettingsWithSecretsSchema,
  }),
  schema.object({
    type: schema.literal('gcs'),
    description: schema.string({ maxLength: 1024 }),
    settings: gcsSettingsWithSecretsSchema,
  }),
  schema.object({
    type: schema.literal('azure'),
    description: schema.string({ maxLength: 1024 }),
    settings: azureSettingsWithSecretsSchema,
  }),
]);
