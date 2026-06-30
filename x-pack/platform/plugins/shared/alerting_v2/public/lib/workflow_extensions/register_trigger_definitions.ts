/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';

/**
 * Registers all alerting-v2 public workflow trigger definitions (UI metadata).
 * Call once during plugin setup with the `workflowsExtensions` setup contract.
 *
 * Each definition is registered as a loader so its module (and the EUI icon it
 * lazily imports) stays out of the plugin's page-load bundle and is only fetched
 * when the Workflows editor needs it.
 */
export function registerTriggerDefinitions(
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup
): void {
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_assigned').then((m) => m.episodeAssignedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_unassigned').then((m) => m.episodeUnassignedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_acked').then((m) => m.episodeAckedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_unacked').then((m) => m.episodeUnackedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_tagged').then((m) => m.episodeTaggedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_snoozed').then((m) => m.episodeSnoozedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_unsnoozed').then((m) => m.episodeUnsnoozedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_activated').then((m) => m.episodeActivatedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/episode_deactivated').then(
      (m) => m.episodeDeactivatedTriggerPublicDefinition
    )
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/rule_created').then((m) => m.ruleCreatedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/rule_updated').then((m) => m.ruleUpdatedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/rule_deleted').then((m) => m.ruleDeletedTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/rule_enabled').then((m) => m.ruleEnabledTriggerPublicDefinition)
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./triggers/rule_disabled').then((m) => m.ruleDisabledTriggerPublicDefinition)
  );
}
