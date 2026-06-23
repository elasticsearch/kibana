/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { CustomRequestHandlerContext, KibanaRequest } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type {
  ManagedWorkflowsSystemApiProvider,
  PluginScopedManagedWorkflowsApi,
  WorkflowsApiRequestHandlerContext,
  WorkflowsClient,
  WorkflowsClientProvider,
} from '@kbn/workflows/server/types';
import type { z } from '@kbn/zod/v4';
import type { ServerStepDefinition } from './step_registry/types';
import type { CommonTriggerDefinition } from '../common';
import type { WorkflowsExtensionsStartContract } from '../common/types';

/** Server-side alias: same as CommonTriggerDefinition (used when registering on the server). */
export type ServerTriggerDefinition<EventSchema extends z.ZodType = z.ZodType> =
  CommonTriggerDefinition<EventSchema>;

/**
 * Server-side plugin setup contract.
 * Exposes methods for other plugins to register server-side custom workflow steps and triggers.
 */
export interface WorkflowsExtensionsServerPluginSetup {
  /**
   * Register server-side definition for a workflow step.
   * This should be called during the plugin's setup phase.
   *
   * @param definition - The step server-side definition
   * @throws Error if definition for the same step type ID is already registered
   */
  registerStepDefinition(definition: ServerStepDefinitionOrLoader): void;

  /**
   * Register a workflow trigger definition.
   * This should be called during the plugin's setup phase.
   *
   * @param definition - The trigger definition
   * @throws Error if trigger id is already registered, validation fails, or registration is attempted after setup
   */
  registerTriggerDefinition(definition: ServerTriggerDefinition): void;

  /**
   * Register the workflows client provider.
   *
   * @param provider - The workflows client provider
   * @throws Error if provider is already registered
   */
  registerWorkflowsClientProvider(provider: WorkflowsClientProvider): void;

  /**
   * Register a requestless managed workflows provider for startup/system operations.
   *
   * @param provider - The managed workflows system API provider
   * @throws Error if provider is already registered
   */
  registerManagedWorkflowsSystemApiProvider(provider: ManagedWorkflowsSystemApiProvider): void;

  /**
   * Register plugin id as a managed workflows owner during setup.
   */
  registerManagedWorkflowOwner(pluginId: string): void;
}

/**
 * Server-side plugin start contract.
 * Exposes step definitions (from common contract) and trigger definitions.
 */
export type WorkflowsExtensionsServerPluginStart =
  WorkflowsExtensionsStartContract<ServerStepDefinition> & {
    /**
     * Get all registered trigger definitions.
     * @returns Array of all registered trigger definitions
     */
    getAllTriggerDefinitions(): ServerTriggerDefinition[];

    /**
     * Get a registered trigger definition by id.
     * @returns The trigger definition, or undefined if not registered
     */
    getTriggerDefinition(triggerId: string): ServerTriggerDefinition | undefined;

    /**
     * Get the workflows client for the current request.
     * @returns The workflows client
     */
    getClient(request: KibanaRequest): Promise<WorkflowsClient>;

    /**
     * Initialize a plugin-scoped managed workflows client. The plugin id is bound once
     * and reused for install/uninstall/execute.
     */
    initManagedWorkflowsClient(pluginId: string): Promise<PluginScopedManagedWorkflowsApi>;

    /**
     * Returns all plugin ids registered as managed workflow owners during setup.
     */
    getManagedWorkflowPluginIds(): string[];
  };

/**
 * Dependencies for the server plugin setup phase.
 */
export type WorkflowsExtensionsServerPluginSetupDeps = Record<string, never>;

export type ServerStepDefinitionOrLoader<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject,
  State extends z.ZodObject = z.ZodObject
> =
  | ServerStepDefinition<Input, Output, Config, State>
  | (() => Promise<ServerStepDefinition<Input, Output, Config, State> | undefined>);

/**
 * Dependencies for the server plugin start phase.
 */
export interface WorkflowsExtensionsServerPluginStartDeps {
  actions: ActionsPluginStartContract;
  inference: InferenceServerStart;
  spaces?: SpacesPluginStart;
}

export type WorkflowsExtensionsRequestHandlerContext = CustomRequestHandlerContext<{
  workflows: WorkflowsApiRequestHandlerContext;
}>;
