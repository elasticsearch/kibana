/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core/public';
import { ObservabilityAgentBuilderPlugin } from './plugin';

export {
  OBSERVABILITY_AI_INSIGHT_ATTACHMENT_TYPE_ID,
  OBSERVABILITY_ALERT_ATTACHMENT_TYPE_ID,
  OBSERVABILITY_ERROR_ATTACHMENT_TYPE_ID,
  OBSERVABILITY_LOG_ATTACHMENT_TYPE_ID,
  OBSERVABILITY_SLO_ATTACHMENT_TYPE_ID,
  OBSERVABILITY_SERVICE_ATTACHMENT_TYPE_ID,
  OBSERVABILITY_HOST_ATTACHMENT_TYPE_ID,
  OBSERVABILITY_TRANSACTION_ATTACHMENT_TYPE_ID,
  OBSERVABILITY_MONITOR_ATTACHMENT_TYPE_ID,
} from '../common/constants';

export type {
  ObservabilityAgentBuilderPluginPublicSetup,
  ObservabilityAgentBuilderPluginPublicStart,
  ObservabilityAgentBuilderPluginSetupDependencies,
  ObservabilityAgentBuilderPluginStartDependencies,
} from './types';

export type { ErrorSampleAiInsightProps } from './components/insights';

export const plugin = (initializerContext: PluginInitializerContext) =>
  new ObservabilityAgentBuilderPlugin(initializerContext);
