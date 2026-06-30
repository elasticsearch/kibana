/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginConfigDescriptor } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { sslSchema } from '@kbn/server-http-tools';

const serviceConfig = schema.object({
  username: schema.maybe(schema.string()),
  password: schema.maybe(schema.string()),
  manifestUrl: schema.maybe(schema.string()),
  hosts: schema.maybe(schema.arrayOf(schema.string())),
  syncInterval: schema.maybe(schema.string()),
  tls: schema.maybe(sslSchema),
  devUrl: schema.maybe(schema.string()),
  showExperimentalLocations: schema.maybe(schema.boolean()),
});

const uptimeConfig = schema.object({
  index: schema.maybe(schema.string()),
  service: schema.maybe(serviceConfig),
  enabled: schema.boolean({ defaultValue: true }),
});

export const config: PluginConfigDescriptor = {
  schema: uptimeConfig,
  deprecations: ({ unused }) => [unused('experimental.ccs.enabled', { level: 'warning' })],
};

export type UptimeConfig = TypeOf<typeof uptimeConfig>;
export type ServiceConfig = TypeOf<typeof serviceConfig>;
