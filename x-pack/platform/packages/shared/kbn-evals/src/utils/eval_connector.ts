/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getAvailableConnectors } from '@kbn/gen-ai-functional-testing';
import type { AvailableConnectorWithId } from '@kbn/gen-ai-functional-testing';
import type { InferenceEndpointDefinition } from './inference_endpoint_definition';

/** A connector owned by the Actions API (`.gen-ai`, `.bedrock`, `.inference`, ...). */
export interface StackConnectorDefinition extends AvailableConnectorWithId {
  type: 'stack_connector';
}

/**
 * The two shapes an eval run can be pointed at.
 */
export type EvalConnector = StackConnectorDefinition | InferenceEndpointDefinition;

/** Tags a connector read from `KIBANA_TESTING_AI_CONNECTORS` or `kibana.dev.yml`. */
export const toStackConnectorDefinition = (
  connector: AvailableConnectorWithId
): StackConnectorDefinition => ({ ...connector, type: 'stack_connector' });

/**
 * Stack connectors for Playwright eval projects.
 */
export const loadStackConnectors = (): StackConnectorDefinition[] => {
  if (process.env.CI && !process.env.KIBANA_TESTING_AI_CONNECTORS) {
    return [];
  }
  return getAvailableConnectors().map(toStackConnectorDefinition);
};

export const isInferenceEndpointDefinition = (
  connector: EvalConnector
): connector is InferenceEndpointDefinition => connector.type === 'inference_endpoint';

/** Actions `actionTypeId` to report for a connector; inference endpoints surface as `.inference`. */
export const getConnectorActionTypeId = (connector: EvalConnector): string =>
  isInferenceEndpointDefinition(connector) ? '.inference' : connector.actionTypeId;
