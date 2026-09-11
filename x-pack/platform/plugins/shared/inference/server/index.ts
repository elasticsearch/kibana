/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  PluginConfigDescriptor,
  PluginInitializer,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { InferenceConfig } from './config';
import { configSchema } from './config';
import type {
  InferenceServerSetup,
  InferenceServerStart,
  InferenceSetupDependencies,
  InferenceStartDependencies,
} from './types';

export type { InferenceServerSetup, InferenceServerStart };
export type { InferenceEndpoint } from './util/get_inference_endpoints';
export type { WorkflowAnonymizationProvider } from './workflow_anonymization_provider';
export {
  createPiiTokenizationCapabilityValue,
  resolvePiiTokenizationCapabilityValue,
  createInferenceProceedCapabilityValue,
  resolveInferenceProceedCapabilityValue,
  INFERENCE_PROCEED_CAPABILITY_ID,
  PII_TOKENIZATION_CAPABILITY_ID,
} from './workflow_anonymization_capabilities';

export {
  naturalLanguageToEsql,
  EsqlDocumentBase,
  runAndValidateEsqlQuery,
} from './tasks/nl_to_esql';

export const plugin: PluginInitializer<
  InferenceServerSetup,
  InferenceServerStart,
  InferenceSetupDependencies,
  InferenceStartDependencies
> = async (pluginInitializerContext: PluginInitializerContext<InferenceConfig>) => {
  const { InferencePlugin } = await import('./plugin');
  return new InferencePlugin(pluginInitializerContext);
};

export const config: PluginConfigDescriptor<InferenceConfig> = {
  schema: configSchema,
};
