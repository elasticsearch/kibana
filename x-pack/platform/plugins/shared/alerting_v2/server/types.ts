/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';

import type { FeaturesPluginStart, FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { PluginStart as DataPluginStart } from '@kbn/data-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type {
  EncryptedSavedObjectsPluginSetup,
  EncryptedSavedObjectsPluginStart,
} from '@kbn/encrypted-saved-objects-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { IEventLogClientService, IEventLogService } from '@kbn/event-log-plugin/server';
import type {
  WorkflowsExtensionsServerPluginSetup,
  WorkflowsExtensionsServerPluginStart,
} from '@kbn/workflows-extensions/server';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import type { AgentBuilderSmlPluginSetup } from '@kbn/agent-builder-sml-plugin/server';
import type { SpaceId } from '@kbn/core-spaces-common';
import type { RulesClient } from './lib/rules_client';
import type { ActionPolicyClient } from './lib/action_policy_client';
import type { ArtifactTypeDefinition } from './lib/artifact_types';
import type { RegisteredBuilderType } from './lib/builder_types';
import type { AlertEventsClient } from './lib/alert_events_client';

export type RulesClientApi = PublicMethodsOf<RulesClient>;

export type ActionPolicyClientApi = PublicMethodsOf<ActionPolicyClient>;

export type AlertEventsClientApi = PublicMethodsOf<AlertEventsClient>;

export interface AlertingServerSetup {
  /**
   * Registers an artifact type owned by the calling plugin. Validation and
   * declarative SO references are applied for this type on rule create/update/read.
   * Unregistered types pass through unchanged.
   */
  registerArtifactType(definition: ArtifactTypeDefinition): void;
  registerBuilderType(definition: RegisteredBuilderType): void;
}

export interface AlertingServerStart {
  getRulesClientWithRequest(request: KibanaRequest): Promise<RulesClientApi>;
  getRulesClientWithRequestInSpace(
    request: KibanaRequest,
    spaceId: SpaceId
  ): Promise<RulesClientApi>;

  getActionPolicyClientWithRequest(request: KibanaRequest): Promise<ActionPolicyClientApi>;
  getActionPolicyClientWithRequestInSpace(
    request: KibanaRequest,
    spaceId: SpaceId
  ): Promise<ActionPolicyClientApi>;

  /**
   * Returns an AlertEventsClient scoped to the request's credentials.
   * NOTE: AlertEventsClient writes via the internal ES user, so callers are
   * responsible for enforcing write-privilege checks before calling mutating
   * methods. HTTP routes must check via their own authz; workflow steps must
   * check via PrivilegeChecker before invoking the client.
   */
  getAlertEventsClientWithRequest(request: KibanaRequest): Promise<AlertEventsClientApi>;
}

export interface AlertingServerSetupDependencies {
  taskManager: TaskManagerSetupContract;
  features: FeaturesPluginSetup;
  spaces: SpacesPluginSetup;
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
  workflowsManagement: WorkflowsServerPluginSetup;
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
  eventLog: IEventLogService;
  usageCollection?: UsageCollectionSetup;
  agentBuilder?: AgentBuilderPluginSetup;
  agentBuilderSml?: AgentBuilderSmlPluginSetup;
}

export interface AlertingServerStartDependencies {
  taskManager: TaskManagerStartContract;
  features: FeaturesPluginStart;
  spaces: SpacesPluginStart;
  data: DataPluginStart;
  security: SecurityPluginStart;
  encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
  eventLog: IEventLogClientService;
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
}
