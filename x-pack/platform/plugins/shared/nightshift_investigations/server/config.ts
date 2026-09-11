/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { PluginConfigDescriptor } from '@kbn/core-plugins-server';

const sandboxConfigSchema = schema.object({
  // sandbox-api address — gRPC proxy that allocates sandboxes and proxies RPCs.
  sandbox_api_host: schema.string({ defaultValue: 'localhost' }),
  sandbox_api_port: schema.number({ defaultValue: 9090 }),
  // API key required by sandbox-api for authentication (ApiKey scheme).
  sandbox_api_key: schema.string(),
  // Optional PEM-encoded TLS CA cert for sandbox-api. Omit for insecure (dev).
  sandbox_api_server_cert: schema.maybe(schema.string()),
  // S3/MinIO workspace persistence — optional. When set, sandbox /workspace is
  // snapshotted to S3 after each write tool call and restored on reconnect.
  sandbox_workspace_bucket: schema.maybe(schema.string()),
  // Endpoint Kibana uses when issuing its own S3 requests (e.g. HEAD object-exists check).
  s3_endpoint: schema.maybe(schema.string()),
  // Endpoint embedded in presigned URLs that the sandbox containers will use for GET/PUT.
  // Required when Kibana and the sandbox run in different network namespaces (e.g. Docker
  // dev where 'localhost' in the container refers to the container, not the host).
  // Falls back to s3_endpoint when absent.
  s3_sandbox_endpoint: schema.maybe(schema.string()),
  s3_access_key_id: schema.maybe(schema.string()),
  s3_secret_access_key: schema.maybe(schema.string()),
  s3_region: schema.string({ defaultValue: 'us-east-1' }),
  // Id of the preconfigured connector holding the Elasticsearch URL and API key the
  // sandbox queries telemetry with. It is added to the investigator's connector
  // allow-list; credentials are injected per command, only when the agent asks for it.
  telemetry_connector_id: schema.maybe(schema.string()),
});

const cortexConfigSchema = schema.object({
  // Governs Cortex end to end: the hydrate/optimize hooks on the deductive agent, the
  // Cortex HTTP routes, and the Cortex tab in the significant events app, which reads
  // this flag through the routes below.
  enabled: schema.boolean({ defaultValue: false }),
});

const configSchema = schema.object({
  // Reserved: Core skips loading this plugin entirely when false.
  enabled: schema.boolean({ defaultValue: false }),
  sandbox: schema.maybe(sandboxConfigSchema),
  cortex: cortexConfigSchema,
});

export type NightshiftInvestigationsConfig = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<NightshiftInvestigationsConfig> = {
  schema: configSchema,
};
