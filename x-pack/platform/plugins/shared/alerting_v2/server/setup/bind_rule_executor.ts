/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ContainerModuleLoadOptions } from 'inversify';
import { RuleExecutionPipeline } from '../lib/rule_executor/execution_pipeline';
import {
  RuleExecutionStepsToken,
  RuleExecutionMiddlewaresToken,
} from '../lib/rule_executor/tokens';
import {
  CheckEngineEnabledStep,
  WaitForResourcesStep,
  FetchRuleStep,
  ValidateRuleStep,
  ExecuteRuleQueryStep,
  CreateAlertEventsStep,
  CreateRecoveryEventsStep,
  CreateNoDataEventsStep,
} from '../lib/rule_executor/steps';
import {
  CancellationBoundaryMiddleware,
  ErrorHandlingMiddleware,
  ApmMiddleware,
} from '../lib/rule_executor/middleware';
import { DirectorStep } from '../lib/rule_executor/steps/director_step';
import { StoreAlertEventsStep } from '../lib/rule_executor/steps/store_alert_events';

export const bindRuleExecutionServices = ({ bind }: ContainerModuleLoadOptions) => {
  /**
   * Middlewares
   */
  bind(CancellationBoundaryMiddleware).toSelf().inSingletonScope();
  bind(ApmMiddleware).toSelf().inSingletonScope();
  bind(ErrorHandlingMiddleware).toSelf().inSingletonScope();

  /**
   * Middleware list via multi-injection.
   * Binding order defines execution order.
   */
  bind(RuleExecutionMiddlewaresToken).to(CancellationBoundaryMiddleware).inSingletonScope();
  bind(RuleExecutionMiddlewaresToken).to(ApmMiddleware).inSingletonScope();
  bind(RuleExecutionMiddlewaresToken).to(ErrorHandlingMiddleware).inSingletonScope();

  /**
   * Rule execution steps via multi-injection.
   * Binding order defines execution order.
   */
  bind(RuleExecutionStepsToken).to(CheckEngineEnabledStep).inSingletonScope();
  bind(RuleExecutionStepsToken).to(WaitForResourcesStep).inSingletonScope();
  bind(RuleExecutionStepsToken).to(FetchRuleStep).inRequestScope();
  bind(RuleExecutionStepsToken).to(ValidateRuleStep).inSingletonScope();
  bind(RuleExecutionStepsToken).to(ExecuteRuleQueryStep).inRequestScope();
  bind(RuleExecutionStepsToken).to(CreateAlertEventsStep).inSingletonScope();
  bind(RuleExecutionStepsToken).to(CreateRecoveryEventsStep).inRequestScope();
  bind(RuleExecutionStepsToken).to(CreateNoDataEventsStep).inRequestScope();
  bind(RuleExecutionStepsToken).to(DirectorStep).inSingletonScope();
  bind(RuleExecutionStepsToken).to(StoreAlertEventsStep).inSingletonScope();

  bind(RuleExecutionPipeline).toSelf().inRequestScope();
};
