/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, DocLinksServiceSetup, IRouter } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import type { ConfigSchema } from '@kbn/kql/server/config';
import type { Observable } from 'rxjs';
import type { AlertingConfig } from '../config';
import type { GetAlertIndicesAlias, ILicenseState } from '../lib';
import type { AlertingRequestHandlerContext } from '../types';
import { createRuleRoute } from './rule/apis/create';
import { getRuleRoute } from './rule/apis/get/external/get_rule_route';
import { getInternalRuleRoute } from './rule/apis/get/internal/get_internal_rule_route';
import { updateRuleRoute } from './rule/apis/update/update_rule_route';
import { deleteRuleRoute, internalDeleteRuleRoute } from './rule/apis/delete/delete_rule_route';
import { aggregateRulesRoute } from './rule/apis/aggregate/aggregate_rules_route';
import { disableRuleRoute } from './rule/apis/disable/disable_rule_route';
import { enableRuleRoute } from './rule/apis/enable/enable_rule_route';
import { findRulesRoute } from './rule/apis/find/external/find_rules_route';
import { findInternalRulesRoute } from './rule/apis/find/internal/find_internal_rules_route';
import { findMutedAlertInstancesRoute } from './rule/apis/find_muted_alert_instances/find_muted_alert_instances_route';
import { getRuleAlertSummaryRoute } from './get_rule_alert_summary';
import { getRuleExecutionLogRoute } from './get_rule_execution_log';
import { getGlobalExecutionLogRoute } from './get_global_execution_logs';
import { getGlobalExecutionKPIRoute } from './get_global_execution_kpi';
import { getActionErrorLogRoute } from './get_action_error_log';
import { getRuleExecutionKPIRoute } from './get_rule_execution_kpi';
import { getRuleStateRoute } from './get_rule_state';
import { healthRoute } from './framework/apis/health';
import { resolveRuleRoute } from './rule/apis/resolve';
import { getRuleTypesRoute } from './rule/apis/list_types/external/get_rule_types_route';
import { getRuleTypesInternalRoute } from './rule/apis/list_types/internal/get_rule_types_internal_route';
import { muteAllRuleRoute } from './rule/apis/mute_all/mute_all_rule';
import { muteAlertRoute } from './rule/apis/mute_alert/mute_alert';
import { unmuteAllRuleRoute } from './rule/apis/unmute_all';
import { unmuteAlertRoute } from './rule/apis/unmute_alert/unmute_alert_route';
import { snoozeAlertRoute } from './rule/apis/snooze_alert/snooze_alert_route';
import { unsnoozeAlertRoute } from './rule/apis/unsnooze_alert/unsnooze_alert_route';
import { updateRuleApiKeyRoute } from './rule/apis/update_api_key/update_rule_api_key_route';
import { bulkEditInternalRulesRoute } from './rule/apis/bulk_edit/bulk_edit_rules_route';
import { snoozeRuleInternalRoute, snoozeRuleRoute } from './rule/apis/snooze';
import { unsnoozeRuleRoute, unsnoozeRuleInternalRoute } from './rule/apis/unsnooze';
import { runSoonRoute } from './rule/apis/run_soon';
import { bulkDeleteRulesRoute } from './rule/apis/bulk_delete/bulk_delete_rules_route';
import { bulkEnableRulesRoute } from './rule/apis/bulk_enable/bulk_enable_rules_route';
import { bulkDisableRulesRoute } from './rule/apis/bulk_disable/bulk_disable_rules_route';
import { cloneRuleRoute } from './rule/apis/clone/clone_rule_route';
import { getFlappingSettingsRoute } from './get_flapping_settings';
import { updateFlappingSettingsRoute } from './update_flapping_settings';
import { getRuleTagsRoute } from './rule/apis/tags/get_rule_tags';
import { getScheduleFrequencyRoute } from './rule/apis/get_schedule_frequency';
import { bulkUntrackAlertsRoute } from './rule/apis/bulk_untrack';
import { bulkUntrackAlertsByQueryRoute } from './rule/apis/bulk_untrack_by_query';

import { registerRulesValueSuggestionsRoute } from './suggestions/values_suggestion_rules';
import { registerFieldsRoute } from './suggestions/fields_rules';
import { registerAlertsValueSuggestionsRoute } from './suggestions/values_suggestion_alerts';
import { getQueryDelaySettingsRoute } from './rules_settings/apis/get/get_query_delay_settings';
import { updateQueryDelaySettingsRoute } from './rules_settings/apis/update/update_query_delay_settings';
import { alertDeletePreviewRoute } from './alert_delete/apis/preview/get_alert_delete_preview_route';
import { alertDeleteScheduleRoute } from './alert_delete/apis/schedule/create_alert_delete_schedule_route';
import { alertDeleteLastRunRoute } from './alert_delete/apis/last_run/get_alert_delete_last_run_route';

// backfill API
import {
  scheduleBackfillRoute,
  scheduleBackfillPublicRoute,
} from './backfill/apis/schedule/schedule_backfill_route';
import { getBackfillRoute, getBackfillPublicRoute } from './backfill/apis/get/get_backfill_route';
import {
  findBackfillRoute,
  findBackfillPublicRoute,
} from './backfill/apis/find/find_backfill_route';
import {
  deleteBackfillRoute,
  deleteBackfillPublicRoute,
} from './backfill/apis/delete/delete_backfill_route';

// Gaps ApI
import { findGapsRoute } from './gaps/apis/find/find_gaps_route';
import { fillGapByIdRoute } from './gaps/apis/fill/fill_gap_by_id_route';
import { getRuleIdsWithGapsRoute } from './gaps/apis/get_rule_ids_with_gaps/get_rule_ids_with_gaps_route';
import { getGapsSummaryByRuleIdsRoute } from './gaps/apis/get_gaps_summary_by_rule_ids/get_gaps_summary_by_rule_ids_route';
import { createAutoFillSchedulerRoute } from './gaps/apis/gap_auto_fill_schedule/create/create_auto_fill_scheduler_route';
import { getAutoFillSchedulerRoute } from './gaps/apis/gap_auto_fill_schedule/get/get_auto_fill_scheduler_route';
import { updateAutoFillSchedulerRoute } from './gaps/apis/gap_auto_fill_schedule/update/update_auto_fill_scheduler_route';
import { deleteAutoFillSchedulerRoute } from './gaps/apis/gap_auto_fill_schedule/delete/delete_auto_fill_scheduler_route';
import { findAutoFillSchedulerLogsRoute } from './gaps/apis/gap_auto_fill_schedule/logs/find_auto_fill_scheduler_logs_route';
import { getGlobalExecutionSummaryRoute } from './get_global_execution_summary';
import type { AlertingPluginsStart } from '../plugin';
import { getInternalRuleTemplateRoute } from './rule_templates/apis/get/get_rule_template_route';
import { findInternalRuleTemplatesRoute } from './rule_templates/apis/find/find_rule_template_route';
import { bulkMuteAlertsRoute } from './rule/apis/bulk_mute_alerts/bulk_mute_alerts_route';
import { bulkUnmuteAlertsRoute } from './rule/apis/bulk_unmute_alerts/bulk_unmute_alerts_route';

export interface RouteOptions {
  router: IRouter<AlertingRequestHandlerContext>;
  licenseState: ILicenseState;
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
  getAlertIndicesAlias?: GetAlertIndicesAlias;
  usageCounter?: UsageCounter;
  config$?: Observable<ConfigSchema>;
  isServerless?: boolean;
  docLinks: DocLinksServiceSetup;
  alertingConfig: AlertingConfig;
  core: CoreSetup<AlertingPluginsStart, unknown>;
}

export function defineRoutes(opts: RouteOptions) {
  const {
    router,
    licenseState,
    encryptedSavedObjects,
    usageCounter,
    config$,
    getAlertIndicesAlias,
    alertingConfig,
    core,
  } = opts;

  createRuleRoute(opts);
  getRuleRoute(router, licenseState);
  getInternalRuleTemplateRoute(router, licenseState);
  findInternalRuleTemplatesRoute(router, licenseState);
  getInternalRuleRoute(router, licenseState);
  resolveRuleRoute(router, licenseState);
  updateRuleRoute(router, licenseState);
  deleteRuleRoute(router, licenseState);
  internalDeleteRuleRoute(router, licenseState);
  aggregateRulesRoute(router, licenseState);
  disableRuleRoute(router, licenseState);
  enableRuleRoute(router, licenseState);
  findRulesRoute(router, licenseState, usageCounter);
  findInternalRulesRoute(router, licenseState, usageCounter);
  findMutedAlertInstancesRoute(router, licenseState);
  getRuleAlertSummaryRoute(router, licenseState);
  getRuleExecutionLogRoute(router, licenseState);
  getRuleExecutionKPIRoute(router, licenseState);
  getRuleStateRoute(router, licenseState);
  getRuleTypesRoute(router, licenseState);
  getRuleTypesInternalRoute(router, licenseState);
  muteAllRuleRoute(router, licenseState, usageCounter);
  unmuteAllRuleRoute(router, licenseState);
  updateRuleApiKeyRoute(router, licenseState);
  bulkEditInternalRulesRoute(router, licenseState);
  bulkDeleteRulesRoute({ router, licenseState });
  bulkEnableRulesRoute({ router, licenseState });
  bulkDisableRulesRoute({ router, licenseState });
  snoozeRuleInternalRoute(router, licenseState);
  snoozeRuleRoute(router, licenseState);
  unsnoozeRuleRoute(router, licenseState);
  unsnoozeRuleInternalRoute(router, licenseState);
  cloneRuleRoute(router, licenseState);
  getRuleTagsRoute(router, licenseState);
  registerRulesValueSuggestionsRoute(router, licenseState, config$!);

  // Alert APIs
  registerAlertsValueSuggestionsRoute(router, licenseState, config$!, getAlertIndicesAlias);
  bulkUntrackAlertsRoute(router, licenseState);
  bulkUntrackAlertsByQueryRoute(router, licenseState);
  muteAlertRoute(router, licenseState);
  snoozeAlertRoute(router, licenseState);
  unmuteAlertRoute(router, licenseState);
  unsnoozeAlertRoute(router, licenseState);
  bulkMuteAlertsRoute(router, licenseState);
  bulkUnmuteAlertsRoute(router, licenseState);
  alertDeletePreviewRoute(router, licenseState);
  alertDeleteScheduleRoute(router, licenseState, core);
  alertDeleteLastRunRoute(router, licenseState);

  // backfill APIs (internal)
  scheduleBackfillRoute(router, licenseState);
  getBackfillRoute(router, licenseState);
  findBackfillRoute(router, licenseState);
  deleteBackfillRoute(router, licenseState);

  // backfill APIs (public)
  scheduleBackfillPublicRoute(router, licenseState);
  getBackfillPublicRoute(router, licenseState);
  findBackfillPublicRoute(router, licenseState);
  deleteBackfillPublicRoute(router, licenseState);

  // Gaps APIs
  findGapsRoute(router, licenseState);
  fillGapByIdRoute(router, licenseState);
  getRuleIdsWithGapsRoute(router, licenseState);
  getGapsSummaryByRuleIdsRoute(router, licenseState);

  createAutoFillSchedulerRoute(router, licenseState);
  getAutoFillSchedulerRoute(router, licenseState);
  updateAutoFillSchedulerRoute(router, licenseState);
  deleteAutoFillSchedulerRoute(router, licenseState);
  findAutoFillSchedulerLogsRoute(router, licenseState);

  // Rules Settings APIs
  if (alertingConfig.rulesSettings.enabled) {
    getQueryDelaySettingsRoute(router, licenseState);
    updateQueryDelaySettingsRoute(router, licenseState);
    getFlappingSettingsRoute(router, licenseState);
    updateFlappingSettingsRoute(router, licenseState);
  }
  // Other APIs
  registerFieldsRoute(router, licenseState);
  getScheduleFrequencyRoute(router, licenseState);
  getGlobalExecutionLogRoute(router, licenseState);
  getActionErrorLogRoute(router, licenseState);
  runSoonRoute(router, licenseState);
  healthRoute(router, licenseState, encryptedSavedObjects);
  getGlobalExecutionKPIRoute(router, licenseState);
  getGlobalExecutionSummaryRoute(router, licenseState);
}
