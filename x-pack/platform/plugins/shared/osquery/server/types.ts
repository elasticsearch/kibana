/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TelemetryPluginSetup, TelemetryPluginStart } from '@kbn/telemetry-plugin/server';
import type { ActionsPlugin } from '@kbn/actions-plugin/server';
import type {
  PluginSetup as DataPluginSetup,
  PluginStart as DataPluginStart,
} from '@kbn/data-plugin/server';

import type { FleetStartContract } from '@kbn/fleet-plugin/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type {
  TaskManagerSetupContract as TaskManagerPluginSetup,
  TaskManagerStartContract as TaskManagerPluginStart,
} from '@kbn/task-manager-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { RuleRegistryPluginStartContract } from '@kbn/rule-registry-plugin/server';
import type { CasesServerSetup } from '@kbn/cases-plugin/server';
import type { LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import type { KibanaRequest } from '@kbn/core/server';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { CPSServerStart } from '@kbn/cps/server';
import type { createActionService } from './handlers/action/create_action_service';

export interface CheckResponseActionAuthzParams {
  saved_query_id?: string;
  pack_id?: string;
  query?: string;
  queries?: Array<{ query?: string }>;
  ecs_mapping?: Record<string, unknown>;
}

export interface OsqueryPluginSetup {
  createActionService: ReturnType<typeof createActionService>;
  /** Throws 403 if the request is not authorized for the given osquery response action. */
  checkResponseActionAuthz: (
    request: KibanaRequest,
    actionParams: CheckResponseActionAuthzParams
  ) => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OsqueryPluginStart {}

export interface SetupPlugins {
  actions: ActionsPlugin['setup'];
  cases?: CasesServerSetup;
  data: DataPluginSetup;
  features: FeaturesPluginSetup;
  security: SecurityPluginStart;
  taskManager?: TaskManagerPluginSetup;
  telemetry?: TelemetryPluginSetup;
  licensing: LicensingPluginSetup;
  spaces?: SpacesPluginSetup;
}

export interface StartPlugins {
  actions: ActionsPlugin['start'];
  data: DataPluginStart;
  dataViews: DataViewsPluginStart;
  fleet?: FleetStartContract;
  security: SecurityPluginStart;
  taskManager?: TaskManagerPluginStart;
  telemetry?: TelemetryPluginStart;
  ruleRegistry?: RuleRegistryPluginStartContract;
  spaces?: SpacesPluginStart;
  cps?: CPSServerStart;
}
