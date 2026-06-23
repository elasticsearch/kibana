/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Logger, OnSetup, PluginSetup, PluginStart } from '@kbn/core-di';
import { CoreSetup } from '@kbn/core-di-server';
import type { ContainerModuleLoadOptions } from 'inversify';
import type { AlertingServerSetupDependencies, AlertingServerStartDependencies } from '../types';
import { registerFeaturePrivileges } from '../lib/security/privileges';
import { registerSavedObjects } from '../saved_objects';
import { EventLoggerToken } from '../lib/services/event_log_service/tokens';
import { registerStepDefinitions } from '../lib/workflow_extensions/register_step_definitions';
import { registerTriggerDefinitions } from '../lib/workflow_extensions/register_trigger_definitions';
import { registerAlertingV2UsageCollector } from '../lib/usage/usage_collector';
import {
  ACTION_POLICY_EVENT_ACTIONS,
  ACTION_POLICY_EVENT_PROVIDER,
} from '../lib/dispatcher/steps/constants';
import { alertingAdvancedSettings } from '../settings/advanced_settings';

/**
 * Core platform setup-phase registrations (feature privileges, saved objects,
 * capabilities, UI settings, the action policy event log, workflow extensions,
 * and usage collection).
 *
 * Larger / optional concerns live in their own setup modules: task definitions
 * in `bind_tasks` and Agent Builder in `bind_agent_builder`. `OnSetup` is a
 * multi-bound token, so each module contributes its own handler.
 */
export function bindOnSetup({ bind }: ContainerModuleLoadOptions) {
  bind(OnSetup).toConstantValue((container) => {
    const logger = container.get(Logger);

    registerFeaturePrivileges(container.get(PluginSetup('features')));

    registerSavedObjects({
      savedObjects: container.get(CoreSetup('savedObjects')),
      encryptedSavedObjects: container.get(
        PluginSetup<AlertingServerSetupDependencies['encryptedSavedObjects']>(
          'encryptedSavedObjects'
        )
      ),
      logger,
    });

    const uiSettingsSetup = container.get(CoreSetup('uiSettings'));

    uiSettingsSetup.registerGlobal(alertingAdvancedSettings);

    const eventLogService = container.get(
      PluginSetup<AlertingServerSetupDependencies['eventLog']>('eventLog')
    );
    eventLogService.registerProviderActions(
      ACTION_POLICY_EVENT_PROVIDER,
      Object.values(ACTION_POLICY_EVENT_ACTIONS)
    );
    const eventLogger = eventLogService.getLogger({
      event: { provider: ACTION_POLICY_EVENT_PROVIDER },
    });
    container.bind(EventLoggerToken).toConstantValue(eventLogger);

    const workflowsExtensionsSetup = container.get(
      PluginSetup<AlertingServerSetupDependencies['workflowsExtensions']>('workflowsExtensions')
    );
    registerTriggerDefinitions(workflowsExtensionsSetup);
    registerStepDefinitions(workflowsExtensionsSetup);

    // Usage collection is optional. The telemetry task that feeds this collector
    // is registered unconditionally via the `TaskDefinition` registry in
    // `bind_tasks`.
    const usageCollectionToken =
      PluginSetup<NonNullable<AlertingServerSetupDependencies['usageCollection']>>(
        'usageCollection'
      );
    if (container.isBound(usageCollectionToken)) {
      // The getter is called at task run (after start), so the start-only
      // taskManager binding exists by then.
      const getTaskManagerStart = () =>
        container.get(PluginStart<AlertingServerStartDependencies['taskManager']>('taskManager'));

      registerAlertingV2UsageCollector(getTaskManagerStart, container.get(usageCollectionToken));
    }
  });
}
