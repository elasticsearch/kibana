/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  PluginInitializerContext,
  Plugin,
  CoreSetup,
  CoreStart,
  Logger,
} from '@kbn/core/server';

import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  AGENT_BUILDER_BASH_SUPPORT_SETTING_ID,
} from '@kbn/management-settings-ids';
import { SECURITY_PROJECT_SETTINGS } from '@kbn/serverless-security-settings';
import { WORKFLOWS_UI_SETTING_ID } from '@kbn/workflows/common/constants';
import { ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING } from '@kbn/security-solution-navigation';
import { ProductTier } from '../common/product';
import { getEnabledProductFeatures } from '../common/pli/pli_features';

import type { ServerlessSecurityConfig } from './config';
import { createConfig } from './config';
import type {
  SecuritySolutionServerlessPluginSetup,
  SecuritySolutionServerlessPluginStart,
  SecuritySolutionServerlessPluginSetupDeps,
  SecuritySolutionServerlessPluginStartDeps,
} from './types';
import { SecurityUsageReportingTask } from './task_manager/usage_reporting_task';
import { cloudSecurityMetringTaskProperties } from './cloud_security/cloud_security_metering_task_config';
import { registerProductFeatures, getSecurityAiSocProductTier } from './product_features';
import { METERING_TASK as AI4SOC_METERING_TASK } from './ai4soc/constants/metering';
import { NLPCleanupTask } from './task_manager/nlp_cleanup_task/nlp_cleanup_task';
import { telemetryEvents } from './telemetry/event_based_telemetry';
import { UsageReportingService } from './common/services/usage_reporting_service';
import { ai4SocMeteringService } from './ai4soc/services';
import { USAGE_REPORTING_ENDPOINT } from './constants';

export class SecuritySolutionServerlessPlugin
  implements
    Plugin<
      SecuritySolutionServerlessPluginSetup,
      SecuritySolutionServerlessPluginStart,
      SecuritySolutionServerlessPluginSetupDeps,
      SecuritySolutionServerlessPluginStartDeps
    >
{
  private kibanaVersion: string;
  private config: ServerlessSecurityConfig;
  private cloudSecurityUsageReportingTask: SecurityUsageReportingTask | undefined;
  private ai4SocUsageReportingTask: SecurityUsageReportingTask | undefined;
  private nlpCleanupTask: NLPCleanupTask | undefined;
  private readonly logger: Logger;
  private usageReportingService?: UsageReportingService;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.kibanaVersion = initializerContext.env.packageInfo.version;
    this.config = this.initializerContext.config.get<ServerlessSecurityConfig>();
    this.logger = this.initializerContext.logger.get();

    const productTypesStr = JSON.stringify(this.config.productTypes, null, 2);
    this.logger.info(`Security Solution running with product types:\n${productTypesStr}`);
  }

  public setup(
    coreSetup: CoreSetup<SecuritySolutionServerlessPluginStartDeps>,
    pluginsSetup: SecuritySolutionServerlessPluginSetupDeps
  ) {
    this.config = createConfig(this.initializerContext, pluginsSetup.securitySolution);

    let usageApiConfig = pluginsSetup.usageApi?.config;
    // If no configuration can be retrieved from the usage api plugin, use the configuration from this plugin
    if (!usageApiConfig) {
      usageApiConfig = {
        ...this.config.usageApi,
        // This plugin adds the reporting endpoint to the url received from its config.
        // The usage api plugin will return the full URL.
        url: this.config.usageApi.url
          ? `${this.config.usageApi.url}${USAGE_REPORTING_ENDPOINT}`
          : undefined,
      };
    }

    this.usageReportingService = new UsageReportingService(usageApiConfig, this.kibanaVersion);
    // Register product features
    const enabledProductFeatures = getEnabledProductFeatures(this.config.productTypes);

    registerProductFeatures(pluginsSetup, enabledProductFeatures);

    // Register telemetry events
    telemetryEvents.forEach((eventConfig) => coreSetup.analytics.registerEventType(eventConfig));

    const projectSettings = [...SECURITY_PROJECT_SETTINGS];

    // This setting is only registered when `enableAlertsAndAttacksAlignment` is enabled
    if (this.config.experimentalFeatures.enableAlertsAndAttacksAlignment) {
      projectSettings.push(ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING);
    }

    // Workflows is enabled by default since 9.4.0. The setting is retained so admins can opt out.
    // It is only registered in complete and EASE tiers; adding it while in the essentials tier causes an error.
    if (
      this.config.productTypes.some(
        (productType) => productType.product_tier !== ProductTier.essentials
      )
    ) {
      projectSettings.push(WORKFLOWS_UI_SETTING_ID);
    }

    // Agent Builder is only enabled for Security projects in complete and EASE (search_ai_lake) tiers.
    // Allowlisting this setting for essentials causes a dev-mode startup failure because the setting is not registered.
    const aiTier = getSecurityAiSocProductTier(this.config, this.logger);
    if (aiTier === ProductTier.complete || aiTier === ProductTier.searchAiLake) {
      if (!projectSettings.includes(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID)) {
        projectSettings.push(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID);
      }
      if (!projectSettings.includes(AGENT_BUILDER_BASH_SUPPORT_SETTING_ID)) {
        projectSettings.push(AGENT_BUILDER_BASH_SUPPORT_SETTING_ID);
      }
    }

    // Setup project uiSettings whitelisting
    pluginsSetup.serverless.setupProjectSettings(projectSettings);

    // Tasks
    this.cloudSecurityUsageReportingTask = new SecurityUsageReportingTask({
      core: coreSetup,
      logFactory: this.initializerContext.logger,
      config: this.config,
      taskManager: pluginsSetup.taskManager,
      cloudSetup: pluginsSetup.cloud,
      taskType: cloudSecurityMetringTaskProperties.taskType,
      taskTitle: cloudSecurityMetringTaskProperties.taskTitle,
      version: cloudSecurityMetringTaskProperties.version,
      meteringCallback: cloudSecurityMetringTaskProperties.meteringCallback,
      usageReportingService: this.usageReportingService,
    });

    this.ai4SocUsageReportingTask = new SecurityUsageReportingTask({
      core: coreSetup,
      logFactory: this.initializerContext.logger,
      config: this.config,
      taskType: AI4SOC_METERING_TASK.TYPE,
      taskTitle: AI4SOC_METERING_TASK.TITLE,
      version: AI4SOC_METERING_TASK.VERSION,
      meteringCallback: ai4SocMeteringService.getUsageRecords,
      taskManager: pluginsSetup.taskManager,
      cloudSetup: pluginsSetup.cloud,
      usageReportingService: this.usageReportingService,
      backfillConfig: {
        enabled: true,
        maxRecords: AI4SOC_METERING_TASK.MAX_BACKFILL_RECORDS,
      },
    });

    this.nlpCleanupTask = new NLPCleanupTask({
      core: coreSetup,
      logFactory: this.initializerContext.logger,
      productTier: getSecurityAiSocProductTier(this.config, this.logger),
      taskManager: pluginsSetup.taskManager,
    });

    return {};
  }

  public start(coreStart: CoreStart, pluginsSetup: SecuritySolutionServerlessPluginStartDeps) {
    this.cloudSecurityUsageReportingTask
      ?.start({
        taskManager: pluginsSetup.taskManager,
        interval: this.config.cloudSecurityUsageReportingTaskInterval,
      })
      .catch(() => {});

    if (ai4SocMeteringService.shouldMeter(this.config)) {
      this.ai4SocUsageReportingTask
        ?.start({
          taskManager: pluginsSetup.taskManager,
          interval: this.config.ai4SocUsageReportingTaskInterval,
        })
        .catch(() => {});
    }

    this.nlpCleanupTask?.start({ taskManager: pluginsSetup.taskManager }).catch(() => {});

    return {};
  }

  public stop() {}
}
