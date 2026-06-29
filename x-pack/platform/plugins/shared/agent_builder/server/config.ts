/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginConfigDescriptor } from '@kbn/core/server';
import { schema, type TypeOf } from '@kbn/config-schema';

const scheduledDelay = schema.conditional(
  schema.contextRef('dev'),
  true,
  schema.number({ defaultValue: 1000, min: 50 }),
  schema.number({ defaultValue: 5000, min: 50 })
);

export const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  githubBaseUrl: schema.string({ defaultValue: 'https://github.com' }),
  topSnippets: schema.object({
    numSnippets: schema.number({ defaultValue: 2, min: 1, max: 10 }),
    numWords: schema.number({ defaultValue: 750, min: 1, max: 5000 }),
  }),
  tracing: schema.object({
    exporters: schema.arrayOf(
      schema.object({
        url: schema.uri({ scheme: ['http', 'https'] }),
        headers: schema.maybe(schema.recordOf(schema.string(), schema.string())),
      }),
      { defaultValue: [] }
    ),
    opik_distributed_tracing: schema.boolean({ defaultValue: false }),
    scheduledDelay,
  }),
});

export type AgentBuilderConfig = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<AgentBuilderConfig> = {
  schema: configSchema,
};
