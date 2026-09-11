/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { createExecuteConnectorSubActionTool } from './execute_connector_sub_action';
import { createListInferenceEndpointsTool } from './list_inference_endpoints';
import { createListConnectorsTool } from './list_connectors';
import { createGetConnectorTool } from './get_connector';
import type { ConnectorToolsOptions } from './types';

export type { ConnectorToolsOptions } from './types';

/**
 * All connector tool IDs.
 */
export const connectorToolIds = [
  platformCoreTools.executeConnectorSubAction,
  platformCoreTools.listInferenceEndpoints,
  platformCoreTools.listConnectors,
  platformCoreTools.getConnector,
] as const;

/**
 * Creates all connector tools with the given options.
 */
export const createConnectorTools = (
  options: ConnectorToolsOptions
): BuiltinToolDefinition<any>[] => {
  return [
    createExecuteConnectorSubActionTool(options),
    createListInferenceEndpointsTool(options),
    createListConnectorsTool(options),
    createGetConnectorTool(options),
  ];
};
