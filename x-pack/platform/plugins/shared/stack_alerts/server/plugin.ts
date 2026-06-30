/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Plugin, Logger, CoreSetup, PluginInitializerContext } from '@kbn/core/server';

import type { StackAlertsDeps, StackAlertsStartDeps } from './types';
import { registerBuiltInRuleTypes } from './rule_types';
import { BUILT_IN_ALERTS_FEATURE } from './feature';
import { STACK_ALERTS_ONLY_FEATURE } from './alerts_feature';

export class AlertingBuiltinsPlugin
  implements Plugin<void, void, StackAlertsDeps, StackAlertsStartDeps>
{
  private readonly logger: Logger;
  private readonly isServerless: boolean;

  constructor(ctx: PluginInitializerContext) {
    this.logger = ctx.logger.get();
    this.isServerless = ctx.env.packageInfo.buildFlavor === 'serverless';
  }

  public setup(core: CoreSetup<StackAlertsStartDeps>, { alerting, features }: StackAlertsDeps) {
    features.registerKibanaFeature(BUILT_IN_ALERTS_FEATURE);
    features.registerKibanaFeature(STACK_ALERTS_ONLY_FEATURE);
    registerBuiltInRuleTypes(
      {
        logger: this.logger,
        data: core
          .getStartServices()
          .then(async ([, { triggersActionsUi }]) => triggersActionsUi.data),
        alerting,
        core,
      },
      this.isServerless
    );
  }

  public start() {}
  public stop() {}
}
