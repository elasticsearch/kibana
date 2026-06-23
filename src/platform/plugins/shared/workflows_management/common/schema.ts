/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  BaseConnectorContract,
  ConnectorContractUnion,
  ConnectorTypeInfo,
  StepDeprecationInfo,
  StepPropertyHandler,
} from '@kbn/workflows';
import {
  builtInStepDefinitions,
  DEPRECATED_STEP_METADATA,
  generateLightweightYamlSchema,
  generateYamlSchemaFromConnectors,
  getElasticsearchConnectors,
  getKibanaConnectors,
  getStepPrefixDeprecationInfo,
  SystemConnectorsMap,
} from '@kbn/workflows';
import { z } from '@kbn/zod/v4';

// Import the singleton instance of StepSchemas
import { stepSchemas } from './step_schemas';

// Defers ~16 MB of zod-schema heap until the first workflow edit/execute call.
// connector_action_schema.ts eagerly builds Maps of Zod schemas from
// stack_connectors_schema/* and @kbn/connector-specs; keeping it behind a
// lazy require() avoids that cost at Kibana startup. See #264175.
let _connectorSchemas: typeof import('./connector_action_schema') | null = null;
function getConnectorSchemas(): typeof import('./connector_action_schema') {
  if (_connectorSchemas === null) {
    _connectorSchemas = require('./connector_action_schema');
  }
  return _connectorSchemas as typeof import('./connector_action_schema');
}

/**
 * Get parameter schema for a specific sub-action
 */
function getSubActionParamsSchema(actionTypeId: string, subActionName: string): z.ZodSchema {
  const { ConnectorInputSchemas, ConnectorActionInputSchemas, ConnectorSpecsInputSchemas } =
    getConnectorSchemas();

  const schema = ConnectorInputSchemas.get(actionTypeId);
  if (schema) {
    return schema;
  }

  const actionsSchema = ConnectorActionInputSchemas.get(actionTypeId);
  if (actionsSchema) {
    const actionSchema = actionsSchema[subActionName];
    if (actionSchema) {
      return actionSchema;
    }
  }

  const connectorSpec = ConnectorSpecsInputSchemas.get(actionTypeId);
  if (connectorSpec) {
    const inputSchema = connectorSpec[subActionName];
    if (inputSchema) {
      return inputSchema as z.ZodSchema;
    }
  }

  // Generic fallback for unknown sub-actions
  return z.object({}).passthrough().default({});
}

/**
 * Get output schema for a specific sub-action
 */
function getSubActionOutputSchema(actionTypeId: string, subActionName: string): z.ZodSchema {
  const { ConnectorOutputSchemas, ConnectorActionOutputSchemas } = getConnectorSchemas();

  const schema = ConnectorOutputSchemas.get(actionTypeId);
  if (schema) {
    return schema;
  }

  const actionsSchema = ConnectorActionOutputSchemas.get(actionTypeId);
  if (actionsSchema) {
    const actionSchema = actionsSchema[subActionName];
    if (actionSchema) {
      return actionSchema;
    }
  }

  // Generic fallback
  return z.any();
}

const getSubActionMetadata = (
  actionTypeId: string,
  subActionName: string
): Pick<BaseConnectorContract, 'description' | 'documentation' | 'examples'> | undefined => {
  if (actionTypeId !== '.xsoar') {
    return undefined;
  }

  if (subActionName === 'getPlaybooks') {
    return {
      description: 'Retrieve XSOAR playbooks visible to the connector.',
      examples: {
        snippet: `- name: get_xsoar_playbooks
  type: xsoar.getPlaybooks
  connector-id: <connector-id>`,
      },
    };
  }

  if (subActionName === 'run') {
    return {
      description: 'Create an XSOAR incident and optionally associate it with a playbook.',
      examples: {
        params: {
          name: 'Suspicious login detected',
          playbookId: '<xsoar-playbook-id>',
          body: '{"details":"Investigate suspicious login activity.","type":"Unclassified"}',
        },
        snippet: `- name: create_xsoar_incident
  type: xsoar.run
  connector-id: <connector-id>
  with:
    name: Suspicious login detected
    playbookId: <xsoar-playbook-id>
    createInvestigation: true
    severity: 2
    body: |
      {
        "details": "Investigate suspicious login activity.",
        "type": "Unclassified"
      }`,
      },
    };
  }

  return undefined;
};

/**
 * Get registered step definitions from workflowExtensions, converted to BaseConnectorContract
 */
function getRegisteredStepDefinitions(): BaseConnectorContract[] {
  return stepSchemas
    .getAllRegisteredStepDefinitions()
    .map((stepDefinition): BaseConnectorContract => {
      const definition = {
        type: stepDefinition.id,
        paramsSchema: stepDefinition.inputSchema,
        outputSchema: stepDefinition.outputSchema,
        configSchema: stepDefinition.configSchema,
        deprecation: stepDefinition.deprecation,
        summary: null,
        description: null,
      };

      if (stepSchemas.isPublicStepDefinition(stepDefinition)) {
        // Only public step definitions have documentation and examples.
        // Match the convention used by every other connector source: summary
        // is the short label, description is the longer behavioral explanation.
        return {
          ...definition,
          summary: stepDefinition.label,
          description: stepDefinition.description ?? null,
          documentation: stepDefinition.documentation?.url,
          examples: stepDefinition.documentation?.examples
            ? { snippet: stepDefinition.documentation?.examples.join('\n') }
            : undefined,
          editorHandlers: stepDefinition.editorHandlers,
        };
      }
      return definition;
    });
}

/**
 * Convert dynamic connector data from actions client to ConnectorContract format
 * Internal implementation - use exported convertDynamicConnectorsToContracts() instead
 */
function convertDynamicConnectorsToContractsInternal(
  connectorTypes: Record<string, ConnectorTypeInfo>
): ConnectorContractUnion[] {
  const connectorContracts: ConnectorContractUnion[] = [];
  Object.values(connectorTypes).forEach((connectorType) => {
    if (connectorType.enabled === false) {
      return;
    }
    try {
      const connectorTypeName = connectorType.actionTypeId.replace(/^\./, '');

      // If the connector has a system connector associated, it can be executed without a connector-id
      const hasConnectorId = SystemConnectorsMap.has(connectorType.actionTypeId)
        ? 'optional'
        : 'required';

      // If the connector has sub-actions, create separate contracts for each sub-action
      if (connectorType.subActions && connectorType.subActions.length > 0) {
        connectorType.subActions.forEach((subAction) => {
          // Create type name: actionTypeId.subActionName (e.g., "inference.completion")
          const subActionType = `${connectorTypeName}.${subAction.name}`;

          const paramsSchema = getSubActionParamsSchema(connectorType.actionTypeId, subAction.name);
          const outputSchema = getSubActionOutputSchema(connectorType.actionTypeId, subAction.name);
          const metadata = getSubActionMetadata(connectorType.actionTypeId, subAction.name);

          connectorContracts.push({
            actionTypeId: connectorType.actionTypeId,
            displayName: connectorType.displayName,
            type: subActionType,
            summary: subAction.displayName,
            paramsSchema,
            hasConnectorId,
            outputSchema,
            description: `${connectorType.displayName} - ${subAction.displayName}`,
            instances: connectorType.instances,
            ...metadata,
          });
        });
      } else {
        // Fallback: create a generic connector contract if no sub-actions
        // Try to get the proper schema for this connector type
        const paramsSchema = getSubActionParamsSchema(connectorType.actionTypeId, '');
        const outputSchema = getSubActionOutputSchema(connectorType.actionTypeId, '');

        connectorContracts.push({
          actionTypeId: connectorType.actionTypeId,
          displayName: connectorType.displayName,
          type: connectorTypeName,
          summary: connectorType.displayName,
          paramsSchema,
          hasConnectorId,
          outputSchema,
          description: `${connectorType.displayName} connector`,
          instances: connectorType.instances,
        });
      }
    } catch (error) {
      // console.warn(`Error processing connector type ${connectorType.actionTypeId}:`, error);
      // Return a basic connector contract as fallback
      connectorContracts.push({
        actionTypeId: connectorType.actionTypeId,
        displayName: connectorType.displayName,
        type: connectorType.actionTypeId,
        summary: connectorType.displayName,
        paramsSchema: z.any(),
        outputSchema: z.any(),
        description: `${connectorType.displayName || connectorType.actionTypeId} connector`,
        instances: connectorType.instances,
      });
    }
  });

  return connectorContracts;
}

// Export types for schema results
export type WorkflowZodSchemaType = z.infer<ReturnType<typeof getWorkflowZodSchema>>;
export type WorkflowZodSchemaLooseType = z.infer<ReturnType<typeof getWorkflowZodSchemaLoose>>;

export interface WorkflowZodSchemaOptions {
  lightweight?: boolean;
}

// NOTE: The former `WORKFLOW_ZOD_SCHEMA` / `WORKFLOW_ZOD_SCHEMA_LOOSE`
// module-level constants were removed in favour of `getWorkflowZodSchema()` /
// `getWorkflowZodSchemaLoose()`. They were unreferenced and their eager
// `generateYamlSchemaFromConnectors(...)` calls were a significant contributor
// to the startup heap described in https://github.com/elastic/kibana/issues/264175.

/**
 * Combine static connectors with dynamic Elasticsearch and Kibana connectors
 * Internal implementation - use exported getAllConnectors() instead
 */
export function getAllConnectorsInternal(): ConnectorContractUnion[] {
  // Return cached connectors if available
  const cached = stepSchemas.getAllConnectorsCache();
  if (cached !== null) {
    return cached;
  }

  // Get registered step definitions if workflowExtensions is initialized
  const registeredStepDefinitions = getRegisteredStepDefinitions();

  // Initialize cache with static and generated connectors
  const elasticsearchConnectors = getElasticsearchConnectors();
  const kibanaConnectors = getKibanaConnectors();
  const allConnectors = [
    ...getConnectorSchemas().staticConnectors,
    ...elasticsearchConnectors,
    ...kibanaConnectors,
    ...registeredStepDefinitions,
  ];

  // Update cache
  stepSchemas.setAllConnectorsCache(allConnectors);
  const mapCache = new Map(allConnectors.map((c) => [c.type, c]));
  stepSchemas.setAllConnectorsMapCache(mapCache);

  return allConnectors;
}

/**
 * Get all connectors including dynamic ones from actions client
 * Internal implementation - use exported getAllConnectorsWithDynamic() instead
 */
function getAllConnectorsWithDynamicInternal(
  dynamicConnectorTypes?: Record<string, ConnectorTypeInfo>
): ConnectorContractUnion[] {
  const stepDefinitions = getAllConnectorsInternal();

  // Graceful fallback if dynamic connectors are not available
  if (!dynamicConnectorTypes || Object.keys(dynamicConnectorTypes).length === 0) {
    return stepDefinitions;
  }

  try {
    const dynamicConnectors = convertDynamicConnectorsToContractsInternal(dynamicConnectorTypes);

    // Filter out any duplicates (dynamic connectors override static ones with same type)
    const staticConnectorTypes = new Set(stepDefinitions.map((c) => c.type));
    const uniqueDynamicConnectors = dynamicConnectors.filter(
      (c) => !staticConnectorTypes.has(c.type)
    );

    // Connectors added successfully without logging noise
    return [...stepDefinitions, ...uniqueDynamicConnectors];
  } catch (error) {
    return stepDefinitions;
  }
}

// Export convenience functions that use the singleton
// These maintain backward compatibility while using the singleton internally
export function convertDynamicConnectorsToContracts(
  connectorTypes: Record<string, ConnectorTypeInfo>
): ConnectorContractUnion[] {
  return convertDynamicConnectorsToContractsInternal(connectorTypes);
}

export function getCachedAllConnectorsMap(): Map<string, ConnectorContractUnion> | null {
  return stepSchemas.getAllConnectorsMapCache();
}

export function setCachedAllConnectorsMap(_allConnectors: ConnectorContractUnion[]): void {
  // This function is kept for backward compatibility but delegates to the singleton
  // Note: The singleton manages its own cache, so this may not be needed
  // We can't directly set the cache, but we can ensure connectors are loaded
  getAllConnectorsInternal();
}

export function addDynamicConnectorsToCache(
  dynamicConnectorTypes: Record<string, ConnectorTypeInfo>
): void {
  // Create a simple hash of the connector types to detect changes.
  // Include the `enabled` flag to avoid keeping stale (now-disabled) connector contracts in cache.
  const currentHash = JSON.stringify(
    Object.entries(dynamicConnectorTypes)
      .map(([key, value]) => [key, value.enabled !== false] as const)
      .sort(([a], [b]) => a.localeCompare(b))
  );

  // Skip processing if the connector types haven't changed
  const lastHash = stepSchemas.getLastProcessedConnectorTypesHash();
  const cachedDynamicTypes = stepSchemas.getDynamicConnectorTypesCache();
  if (lastHash === currentHash && cachedDynamicTypes !== null) {
    return;
  }

  // Store the raw dynamic connector types for completion provider access
  stepSchemas.setDynamicConnectorTypesCache(dynamicConnectorTypes);
  stepSchemas.setLastProcessedConnectorTypesHash(currentHash);

  // Rebuild the connector cache so we correctly handle additions, removals, and changes
  // in dynamic connector types (e.g. connector type becomes disabled/unavailable).
  const registeredStepDefinitions = getRegisteredStepDefinitions();
  const elasticsearchConnectors = getElasticsearchConnectors();
  const kibanaConnectors = getKibanaConnectors();
  const baseConnectors = [
    ...getConnectorSchemas().staticConnectors,
    ...elasticsearchConnectors,
    ...kibanaConnectors,
    ...registeredStepDefinitions,
  ];

  const dynamicConnectors = convertDynamicConnectorsToContractsInternal(dynamicConnectorTypes);
  const connectorByType = new Map<string, ConnectorContractUnion>(
    baseConnectors.map((c) => [c.type, c])
  );
  for (const connector of dynamicConnectors) {
    connectorByType.set(connector.type, connector);
  }

  const updatedCache = Array.from(connectorByType.values());
  stepSchemas.setAllConnectorsCache(updatedCache);
  stepSchemas.setAllConnectorsMapCache(connectorByType);
}

export function getCachedDynamicConnectorTypes(): Record<string, ConnectorTypeInfo> | null {
  return stepSchemas.getDynamicConnectorTypesCache();
}

export function getAllConnectors(): ConnectorContractUnion[] {
  return getAllConnectorsInternal();
}

export function getDeprecatedStepMetadataMap(): Readonly<Record<string, StepDeprecationInfo>> {
  const cached = stepSchemas.getDeprecatedStepMetadataCache();
  if (cached !== null) {
    return cached;
  }

  const deprecatedStepMetadata: Record<string, StepDeprecationInfo> = {
    ...DEPRECATED_STEP_METADATA,
  };

  for (const stepDefinition of builtInStepDefinitions) {
    if (stepDefinition.deprecation) {
      deprecatedStepMetadata[stepDefinition.id] = stepDefinition.deprecation;
    }
  }

  for (const connector of getAllConnectorsInternal()) {
    if (connector.deprecation) {
      deprecatedStepMetadata[connector.type] = connector.deprecation;
    } else {
      const prefixMatch = getStepPrefixDeprecationInfo(connector.type);
      if (prefixMatch) {
        deprecatedStepMetadata[connector.type] = prefixMatch;
      }
    }
  }

  const frozenDeprecatedStepMetadata = Object.freeze(deprecatedStepMetadata) as Readonly<
    Record<string, StepDeprecationInfo>
  >;

  stepSchemas.setDeprecatedStepMetadataCache(frozenDeprecatedStepMetadata);
  return frozenDeprecatedStepMetadata;
}

export function getDeprecatedStepMetadata(stepType: string): StepDeprecationInfo | undefined {
  return getDeprecatedStepMetadataMap()[stepType] ?? getStepPrefixDeprecationInfo(stepType);
}

export function isDeprecatedStepType(stepType: string): boolean {
  return getDeprecatedStepMetadata(stepType) !== undefined;
}

export function getAllConnectorsWithDynamic(
  dynamicConnectorTypes?: Record<string, ConnectorTypeInfo>
): ConnectorContractUnion[] {
  return getAllConnectorsWithDynamicInternal(dynamicConnectorTypes);
}

export const getWorkflowZodSchema = (
  dynamicConnectorTypes: Record<string, ConnectorTypeInfo>,
  registeredTriggerIds: string[] = [],
  options: WorkflowZodSchemaOptions = {}
): z.ZodType => {
  if (options.lightweight) {
    return generateLightweightYamlSchema(registeredTriggerIds);
  }

  const allConnectors = getAllConnectorsWithDynamicInternal(dynamicConnectorTypes);
  return generateYamlSchemaFromConnectors(allConnectors, registeredTriggerIds);
};

export const getWorkflowZodSchemaLoose = (
  dynamicConnectorTypes: Record<string, ConnectorTypeInfo> = {}
): z.ZodType => {
  const allConnectors = getAllConnectorsWithDynamicInternal(dynamicConnectorTypes);
  return generateYamlSchemaFromConnectors(allConnectors, [], true);
};

export const getPropertyHandler = (
  stepType: string,
  scope: 'config' | 'input',
  propertyKey: string
): StepPropertyHandler | null => {
  const connector = stepSchemas.getAllConnectorsMapCache()?.get(stepType);
  return connector?.editorHandlers?.[scope]?.[propertyKey] ?? null;
};
