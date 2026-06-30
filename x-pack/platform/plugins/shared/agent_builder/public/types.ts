/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsPublicPluginSetup } from '@kbn/actions-plugin/public';
import type { LensPublicSetup, LensPublicStart } from '@kbn/lens-plugin/public';
import type { CloudStart } from '@kbn/cloud-plugin/public';
import type {
  DataViewsPublicPluginSetup,
  DataViewsPublicPluginStart,
} from '@kbn/data-views-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { ManagementSetup } from '@kbn/management-plugin/public';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';

import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { InferencePublicStart } from '@kbn/inference-plugin/public';
import type { UiActionsSetup, UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { LicenseManagementUIPluginSetup } from '@kbn/license-management-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';
import type { AIAssistantManagementSelectionPluginPublicStart } from '@kbn/ai-assistant-management-plugin/public';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-public';
import type { TriggersAndActionsUIPublicPluginStart } from '@kbn/triggers-actions-ui-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import type { EvalsPublicStart } from '@kbn/evals-plugin/public';

export type {
  AgentBuilderPluginSetup,
  AgentBuilderPluginStart,
  ConversationSidebarRef,
  OpenConversationSidebarReturn,
  PublicEmbeddableConversationProps,
  PublicEmbeddableConversationInputProps,
  EmbeddableConversationInputRef,
} from '@kbn/agent-builder-browser';

/* eslint-disable @typescript-eslint/no-empty-interface*/

export interface ConfigSchema {}

export interface AgentBuilderSetupDependencies {
  actions: ActionsPublicPluginSetup;
  lens: LensPublicSetup;
  dataViews: DataViewsPublicPluginSetup;
  licenseManagement?: LicenseManagementUIPluginSetup;
  management: ManagementSetup;
  share: SharePluginSetup;
  uiActions: UiActionsSetup;
  usageCollection?: UsageCollectionSetup;
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup;
}

export interface AgentBuilderStartDependencies {
  aiAssistantManagementSelection: AIAssistantManagementSelectionPluginPublicStart;
  evals?: EvalsPublicStart;
  inference: InferencePublicStart;
  lens: LensPublicStart;
  licensing: LicensingPluginStart;
  data: DataPublicPluginStart;
  dataViews: DataViewsPublicPluginStart;
  cloud: CloudStart;
  share: SharePluginStart;
  uiActions: UiActionsStart;
  spaces?: SpacesPluginStart;
  security?: SecurityPluginStart;
  triggersActionsUi: TriggersAndActionsUIPublicPluginStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
}
