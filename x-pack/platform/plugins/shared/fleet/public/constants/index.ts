/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { INGEST_SAVED_OBJECT_INDEX } from '../../common/constants';

export {
  PLUGIN_ID,
  INTEGRATIONS_PLUGIN_ID,
  EPM_API_ROUTES,
  AGENT_API_ROUTES,
  SO_SEARCH_LIMIT,
  AGENT_POLICY_SAVED_OBJECT_TYPE,
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
  AGENTS_PREFIX,
  AGENT_POLICY_VERSION_SEPARATOR,
  UNPRIVILEGED_AGENT_KUERY,
  PRIVILEGED_AGENT_KUERY,
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE as PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  FLEET_SERVER_PACKAGE,
  FLEET_CONNECTORS_PACKAGE,
  // Fleet Server index
  AGENTS_INDEX,
  ENROLLMENT_API_KEYS_INDEX,
  // Preconfiguration
  AUTO_UPDATE_PACKAGES,
  KEEP_POLICIES_UP_TO_DATE_PACKAGES,
  AUTO_UPGRADE_POLICIES_PACKAGES,
  LOCATORS_IDS,
  FLEET_ENROLLMENT_API_PREFIX,
  INGEST_SAVED_OBJECT_INDEX,
  AGENT_POLICY_MAPPINGS,
  AGENT_MAPPINGS,
  ENROLLMENT_API_KEY_MAPPINGS,
  CLOUD_CONNECTOR_API_ROUTES,
} from '../../common/constants';

export * from './page_paths';
export * from './page_sizes';

export const INDEX_NAME = INGEST_SAVED_OBJECT_INDEX;

export const CUSTOM_LOGS_INTEGRATION_NAME = 'log';

export const DURATION_APM_SETTINGS_VARS = {
  IDLE_TIMEOUT: 'idle_timeout',
  READ_TIMEOUT: 'read_timeout',
  SHUTDOWN_TIMEOUT: 'shutdown_timeout',
  TAIL_SAMPLING_INTERVAL: 'tail_sampling_interval',
  WRITE_TIMEOUT: 'write_timeout',
};

export const TOUR_STORAGE_KEYS = {
  AGENT_ACTIVITY: 'fleet.agentActivityTour',
  ADD_AGENT_POPOVER: 'fleet.addAgentPopoverTour',
  INACTIVE_AGENTS: 'fleet.inactiveAgentsTour',
  GRANULAR_PRIVILEGES: 'fleet.granularPrivileges',
  AGENT_EXPORT_CSV: 'fleet.agentExportCSVTour',
  AUTO_UPGRADE_AGENTS: 'fleet.autoUpgradeAgentsTour',
  EIS_COSTS: 'fleet.eisCostsTour',
};

export interface TourConfig {
  active: boolean;
}

export type TourKey = keyof typeof TOUR_STORAGE_KEYS;

export type TOUR_STORAGE_CONFIG = {
  [k in TourKey]: TourConfig;
};

export const MAX_FLYOUT_WIDTH = 800;
