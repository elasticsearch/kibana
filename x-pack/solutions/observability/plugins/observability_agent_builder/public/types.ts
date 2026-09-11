/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ComponentType } from 'react';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { DiscoverSharedPublicStart } from '@kbn/discover-shared-plugin/public';
import type { InferencePublicStart } from '@kbn/inference-plugin/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type {
  AlertAiInsightProps,
  AlertAskAiAgentButtonProps,
  ErrorSampleAiInsightProps,
  ServiceMapInvestigateButtonProps,
} from './components/insights';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilityAgentBuilderPluginPublicSetup {}

export interface ObservabilityAgentBuilderPluginPublicStart {
  getAlertAIInsight: () => ComponentType<AlertAiInsightProps>;
  getAlertAskAiAgentButton: () => ComponentType<AlertAskAiAgentButtonProps>;
  getErrorSampleAIInsight: () => ComponentType<ErrorSampleAiInsightProps>;
  getServiceMapInvestigateButton: () => ComponentType<ServiceMapInvestigateButtonProps>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilityAgentBuilderPluginSetupDependencies {}

export interface ObservabilityAgentBuilderPluginStartDependencies {
  discoverShared: DiscoverSharedPublicStart;
  agentBuilder: AgentBuilderPluginStart;
  inference: InferencePublicStart;
  licensing: LicensingPluginStart;
}
