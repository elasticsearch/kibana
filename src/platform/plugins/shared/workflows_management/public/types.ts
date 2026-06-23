/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { CloudStart } from '@kbn/cloud-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { KqlPluginStart } from '@kbn/kql/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';
import type { QueryClient } from '@kbn/react-query';
import type { ServerlessPluginStart } from '@kbn/serverless/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type {
  TriggersAndActionsUIPublicPluginSetup,
  TriggersAndActionsUIPublicPluginStart,
} from '@kbn/triggers-actions-ui-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { WorkflowsExtensionsPublicPluginStart } from '@kbn/workflows-extensions/public';
import type {
  AvailabilityService,
  ServerlessTierRequiredProducts,
} from './common/lib/availability';
import type { TelemetryServiceClient } from './common/lib/telemetry/types';
import type { WorkflowsBaseTelemetry } from './common/service/telemetry';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WorkflowsPublicPluginSetup {}

export interface WorkflowsPublicPluginSetupDependencies {
  triggersActionsUi: TriggersAndActionsUIPublicPluginSetup;
}

export interface WorkflowsPublicPluginStart {
  /**
   * Sets Workflows availability status to unavailable. Should only be called in serverless mode.
   *
   * The `requiredProducts` parameter is used to render the upselling message,
   * so the user is aware of which products to upgrade to in order to have Workflows available.
   * */
  setUnavailableInServerlessTier: (options: {
    requiredProducts: ServerlessTierRequiredProducts;
  }) => void;
  /**
   * Lazily resolves the shared workflow-domain telemetry singleton. Sibling
   * plugins that emit workflow-related EBT events should use this instance so
   * events are reported by a single owner. The factory is lazy so that the
   * heavy telemetry module stays out of the page-load bundle.
   */
  getTelemetry: () => Promise<WorkflowsBaseTelemetry>;
  /**
   * Lazily resolves the shared React Query client used by the workflows UI.
   * Sibling plugins that mutate workflows from outside the workflows app must
   * use this client so workflows_management's cached queries get invalidated.
   * The factory is lazy so that @kbn/react-query stays out of the page-load
   * bundle.
   */
  getQueryClient: () => Promise<QueryClient>;
}

export interface WorkflowsPublicPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
  serverless?: ServerlessPluginStart;
  dataViews: DataViewsPublicPluginStart;
  kql: KqlPluginStart;
  fieldFormats: FieldFormatsStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  data: DataPublicPluginStart;
  spaces: SpacesPluginStart;
  triggersActionsUi: TriggersAndActionsUIPublicPluginStart;
  workflowsExtensions: WorkflowsExtensionsPublicPluginStart;
  licensing: LicensingPluginStart;
  uiActions: UiActionsStart;
  cloud?: CloudStart;
}

export interface WorkflowsPublicPluginStartAdditionalServices {
  storage: Storage;
  workflowsManagement: {
    telemetry: TelemetryServiceClient;
    agentBuilder?: AgentBuilderPluginStart;
    availability: AvailabilityService;
    globalExecutionsView: {
      enabled: boolean;
    };
  };
}

export type WorkflowsServices = CoreStart &
  WorkflowsPublicPluginStartDependencies &
  WorkflowsPublicPluginStartAdditionalServices;
