/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ContainerModuleLoadOptions } from 'inversify';
import { DispatcherPipeline } from '../lib/dispatcher/execution_pipeline';
import { DispatcherExecutionStepsToken } from '../lib/dispatcher/steps/tokens';
import {
  CheckEngineEnabledStep,
  WaitForResourcesStep,
  FetchEpisodesStep,
  FetchSuppressionsStep,
  ApplySuppressionStep,
  FetchRulesStep,
  ApplyMaintenanceWindowStep,
  FetchPoliciesStep,
  EvaluateMatchersStep,
  BuildGroupsStep,
  ApplyThrottlingStep,
  DispatchStep,
  StoreActionsStep,
  StoreExecutionHistoryStep,
} from '../lib/dispatcher/steps';

export const bindDispatcherExecutionServices = ({ bind }: ContainerModuleLoadOptions) => {
  /**
   * Dispatcher execution steps via multi-injection.
   * Binding order defines execution order.
   */
  bind(DispatcherExecutionStepsToken).to(CheckEngineEnabledStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(WaitForResourcesStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(FetchEpisodesStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(FetchSuppressionsStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(ApplySuppressionStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(FetchRulesStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(ApplyMaintenanceWindowStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(FetchPoliciesStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(EvaluateMatchersStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(BuildGroupsStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(ApplyThrottlingStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(DispatchStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(StoreActionsStep).inSingletonScope();
  bind(DispatcherExecutionStepsToken).to(StoreExecutionHistoryStep).inSingletonScope();

  bind(DispatcherPipeline).toSelf().inSingletonScope();
};
