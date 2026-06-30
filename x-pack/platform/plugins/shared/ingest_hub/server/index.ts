/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core/server';

// Lazily import the plugin implementation to avoid loading it when the plugin is disabled.
export const plugin = async (initializerContext: PluginInitializerContext) => {
  const { IngestHubPlugin } = await import('./plugin');
  return new IngestHubPlugin(initializerContext);
};
