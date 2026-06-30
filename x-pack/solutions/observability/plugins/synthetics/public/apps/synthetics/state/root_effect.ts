/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { all, fork } from 'redux-saga/effects';
import { getMaintenanceWindowsEffect } from './maintenance_windows';
import { getCertsListEffect } from './certs';
import {
  addGlobalParamEffect,
  deleteGlobalParamsEffect,
  editGlobalParamEffect,
  getGlobalParamEffect,
} from './global_params';
import { fetchManualTestRunsEffect } from './manual_test_runs/effects';
import {
  enableDefaultAlertingEffect,
  enableDefaultAlertingSilentlyEffect,
  getDefaultAlertingEffect,
  inspectStatusRuleEffect,
  inspectTLSRuleEffect,
  updateDefaultAlertingEffect,
} from './alert_rules/effects';
import { executeEsQueryEffect } from './elasticsearch';
import {
  fetchAlertConnectorsEffect,
  fetchDynamicSettingsEffect,
  fetchLocationMonitorsEffect,
  setDynamicSettingsEffect,
} from './settings/effects';
import { privateLocationsEffects } from './private_locations/effects';
import { fetchNetworkEventsEffect } from './network_events/effects';
import { fetchSyntheticsMonitorEffect } from './monitor_details';
import { fetchSyntheticsEnablementEffect } from './synthetics_enablement';
import {
  enableMonitorAlertEffect,
  fetchMonitorListEffect,
  upsertMonitorEffect,
  fetchMonitorFiltersEffect,
} from './monitor_list';

import { fetchServiceLocationsEffect } from './service_locations';
import { browserJourneyEffects, fetchJourneyStepsEffect } from './browser_journey';
import {
  augmentStaleStatusEffect,
  fetchOverviewStatusEffect,
  fetchStaleStatusEffect,
} from './overview_status';
import { fetchMonitorStatusHeatmap, quietFetchMonitorStatusHeatmap } from './status_heatmap';
import { fetchOverviewTrendStats, refreshOverviewTrendStats } from './overview/effects';
import { fetchAgentPoliciesEffect } from './agent_policies';
import { fetchMonitorHealthEffect } from './monitor_health';

export const rootEffect = function* root(): Generator {
  yield all([
    fork(fetchSyntheticsEnablementEffect),
    fork(upsertMonitorEffect),
    fork(fetchMonitorFiltersEffect),
    fork(fetchServiceLocationsEffect),
    fork(fetchMonitorListEffect),
    fork(fetchSyntheticsMonitorEffect),
    fork(browserJourneyEffects),
    fork(fetchOverviewStatusEffect),
    fork(fetchStaleStatusEffect),
    fork(augmentStaleStatusEffect),
    fork(fetchNetworkEventsEffect),
    fork(fetchAgentPoliciesEffect),
    fork(fetchDynamicSettingsEffect),
    fork(fetchLocationMonitorsEffect),
    fork(setDynamicSettingsEffect),
    fork(fetchAlertConnectorsEffect),
    fork(enableDefaultAlertingEffect),
    fork(enableMonitorAlertEffect),
    fork(updateDefaultAlertingEffect),
    fork(executeEsQueryEffect),
    fork(fetchJourneyStepsEffect),
    fork(fetchManualTestRunsEffect),
    fork(addGlobalParamEffect),
    fork(editGlobalParamEffect),
    fork(deleteGlobalParamsEffect),
    fork(getGlobalParamEffect),
    fork(getCertsListEffect),
    fork(getDefaultAlertingEffect),
    fork(enableDefaultAlertingSilentlyEffect),
    fork(fetchMonitorStatusHeatmap),
    fork(quietFetchMonitorStatusHeatmap),
    fork(fetchOverviewTrendStats),
    fork(refreshOverviewTrendStats),
    fork(inspectStatusRuleEffect),
    fork(inspectTLSRuleEffect),
    fork(getMaintenanceWindowsEffect),
    ...privateLocationsEffects.map((effect) => fork(effect)),
    fork(fetchMonitorHealthEffect),
  ]);
};
