/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginConfigDescriptor, PluginInitializerContext } from '@kbn/core/server';
export { CasesClient } from './client';
import type { ConfigType } from './config';
import { ConfigSchema } from './config';

export const config: PluginConfigDescriptor<ConfigType> = {
  schema: ConfigSchema,
  exposeToBrowser: {
    markdownPlugins: true,
    files: { maxSize: true, allowedMimeTypes: true },
    stack: { enabled: true },
    incrementalId: {
      enabled: true,
    },
    templates: {
      enabled: true,
    },
    // NOTE: these are visibility flags (expose to browser), not the feature flag values.
    casesRedesign: {
      list: true,
      details: true,
      settings: true,
    },
    attachments: {
      enabled: true,
    },
  },
  deprecations: ({ renameFromRoot }) => [
    renameFromRoot('xpack.case.enabled', 'xpack.cases.enabled', { level: 'critical' }),
  ],
};
export const plugin = async (initializerContext: PluginInitializerContext) => {
  const { CasePlugin } = await import('./plugin');
  return new CasePlugin(initializerContext);
};

export type { CasesServerSetup, CasesServerStart, CloseReasonValidator } from './types';
export type { UnifiedAttachmentTypeSetup } from './attachment_framework/types';
