/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ConfigType } from '../../../../config';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import { registerSiemRuleMigrationsCreateRoute } from './create';
import { registerSiemRuleMigrationsUpdateRulesRoute } from './rules/update';
import { registerSiemRuleMigrationsGetRoute } from './get';
import { registerSiemRuleMigrationsStartRoute } from './start';
import { registerSiemRuleMigrationsStatsRoute } from './stats';
import { registerSiemRuleMigrationsTranslationStatsRoute } from './translation_stats';
import { registerSiemRuleMigrationsStopRoute } from './stop';
import { registerSiemRuleMigrationsStatsAllRoute } from './stats_all';
import { registerSiemRuleMigrationsResourceUpsertRoute } from './resources/upsert';
import { registerSiemRuleMigrationsResourceGetRoute } from './resources/get';
import { registerSiemRuleMigrationsInstallRoute } from './install';
import { registerSiemRuleMigrationsResourceGetMissingRoute } from './resources/missing';
import { registerSiemRuleMigrationsPrebuiltRulesRoute } from './get_prebuilt_rules';
import { registerSiemRuleMigrationsIntegrationsRoute } from './get_integrations';
import { registerSiemRuleMigrationsGetMissingPrivilegesRoute } from './privileges/get_missing_privileges';
import { registerSiemRuleMigrationsEvaluateRoute } from './evaluation/evaluate';
import { registerSiemRuleMigrationsCreateRulesRoute } from './rules/create';
import { registerSiemRuleMigrationsGetRulesRoute } from './rules/get';
import { registerSiemRuleMigrationsEnhanceRoute } from './rules/enhance';
import { registerSiemRuleMigrationsCreateQRadarRulesRoute } from './rules/qradar/create';
import { registerSiemRuleMigrationsCreateSentinelRulesRoute } from './rules/sentinel/create';
import { registerSiemRuleMigrationsDeleteRoute } from './delete';
import { registerSiemRuleMigrationsIntegrationsStatsRoute } from './integrations_stats';
import { registerSiemRuleMigrationsUpdateRoute } from './update';
import { registerSiemRuleMigrationsUpdateIndexPatternRoute } from './update_index_pattern';
import { registerSiemRuleMigrationsInvokeRoute } from './invoke';

export const registerSiemRuleMigrationsRoutes = (
  router: SecuritySolutionPluginRouter,
  config: ConfigType,
  logger: Logger
) => {
  /** Rules Migrations */
  registerSiemRuleMigrationsCreateRoute(router, logger);
  registerSiemRuleMigrationsGetRoute(router, logger);
  registerSiemRuleMigrationsDeleteRoute(router, logger);
  registerSiemRuleMigrationsUpdateRoute(router, logger);
  /** *******/

  /** Rules */
  registerSiemRuleMigrationsCreateRulesRoute(router, logger);
  registerSiemRuleMigrationsGetRulesRoute(router, logger);
  registerSiemRuleMigrationsUpdateRulesRoute(router, logger);

  /** Qradar */
  if (config.experimentalFeatures.qradarRulesMigration) {
    registerSiemRuleMigrationsCreateQRadarRulesRoute(router, logger);
    registerSiemRuleMigrationsEnhanceRoute(router, logger);
  }

  /** Sentinel */
  if (config.experimentalFeatures.sentinelRulesMigration) {
    registerSiemRuleMigrationsCreateSentinelRulesRoute(router, logger);
  }
  /** *******/
  /** *******/

  /** Tasks **/
  registerSiemRuleMigrationsStatsAllRoute(router, logger);
  registerSiemRuleMigrationsPrebuiltRulesRoute(router, logger);
  registerSiemRuleMigrationsStartRoute(router, logger);
  registerSiemRuleMigrationsStatsRoute(router, logger);
  registerSiemRuleMigrationsTranslationStatsRoute(router, logger);
  registerSiemRuleMigrationsStopRoute(router, logger);
  registerSiemRuleMigrationsUpdateIndexPatternRoute(router, logger);
  /** *******/

  /** Install */
  registerSiemRuleMigrationsInstallRoute(router, logger);
  /** *******/

  /** Integrations */
  registerSiemRuleMigrationsIntegrationsRoute(router, logger);
  registerSiemRuleMigrationsIntegrationsStatsRoute(router, logger);
  /** *******/

  /** Resources */
  registerSiemRuleMigrationsResourceUpsertRoute(router, logger);
  registerSiemRuleMigrationsResourceGetRoute(router, logger);
  registerSiemRuleMigrationsResourceGetMissingRoute(router, logger);
  /** *******/

  registerSiemRuleMigrationsGetMissingPrivilegesRoute(router, logger);

  if (config.experimentalFeatures.assistantModelEvaluation) {
    // Use the same experimental feature flag as the assistant model evaluation.
    // This route is not intended to be used by the end user, but rather for internal purposes.
    registerSiemRuleMigrationsEvaluateRoute(router, logger);
  }

  if (config.experimentalFeatures.siemMigrationsEvalsInvokeEnabled) {
    registerSiemRuleMigrationsInvokeRoute(router, logger);
  }
};
