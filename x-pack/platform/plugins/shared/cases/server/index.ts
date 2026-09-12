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
    runWorkflows: {
      enabled: true,
    },
    attachments: {
      enabled: true,
    },
    chat: {
      enabled: true,
    },
  },
  deprecations: ({ renameFromRoot, unused }) => [
    renameFromRoot('xpack.case.enabled', 'xpack.cases.enabled', { level: 'critical' }),
    // The Cases UX redesign shipped as the only implementation in 9.6. These keys are still
    // accepted and ignored so that upgrading with them present logs a warning rather than
    // failing config validation. Removing the last leaf also drops the empty parent object.
    unused('casesRedesign.list', { level: 'warning' }),
    unused('casesRedesign.details', { level: 'warning' }),
    unused('casesRedesign.settings', { level: 'warning' }),
  ],
};
export const plugin = async (initializerContext: PluginInitializerContext) => {
  const { CasePlugin } = await import('./plugin');
  return new CasePlugin(initializerContext);
};

export type { CasesServerSetup, CasesServerStart, CloseReasonValidator } from './types';
export type {
  AttachmentWorkflowDefinition,
  UnifiedAttachmentTypeSetup,
  WorkflowAttachmentResolverContext,
  WorkflowAttachmentTarget,
  WorkflowAttachmentValidationContext,
} from './attachment_framework/types';
