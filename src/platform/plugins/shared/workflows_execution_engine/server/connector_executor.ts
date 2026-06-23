/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionTypeExecutorResult } from '@kbn/actions-plugin/common';
import { asNotificationExecutionSource } from '@kbn/actions-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { ConnectorWithExtraFindData } from '@kbn/actions-plugin/server/application/connector/types';

const WORKFLOWS_NOTIFICATION_REQUESTER_ID = 'workflows';

function getWorkflowConnectorExecutionSource(actionTypeId: string, actionId: string) {
  if (actionTypeId.replace(/^\./, '') !== 'email') {
    return undefined;
  }

  return asNotificationExecutionSource({
    requesterId: WORKFLOWS_NOTIFICATION_REQUESTER_ID,
    connectorId: actionId,
  });
}

export class ConnectorExecutor {
  // The lifespan of this cache is one workflow execution, then it gets destroyed
  // the probability of connectors change is pretty low in this span so it should be acceptable
  private allConnectorsCache: Map<string, ConnectorWithExtraFindData> | undefined;

  constructor(private actionsClient: ActionsClient) {}

  // Execute a regular connector with a saved object. It will resolve the connector ID from saved objects.
  public async execute(params: {
    connectorType: string;
    connectorNameOrId: string;
    input: Record<string, unknown>;
    abortController: AbortController;
  }): Promise<ActionTypeExecutorResult<unknown>> {
    const { connectorType, connectorNameOrId, input, abortController } = params;
    if (!connectorType) {
      throw new Error('Connector type is required');
    }

    const actionId = await this.resolveConnectorId(connectorNameOrId);

    return this.runConnector({ actionTypeId: connectorType, actionId, input, abortController });
  }

  // Execute a system connector. It will use the provided connector ID directly.
  public async executeSystemConnector(params: {
    connectorType: string;
    input: Record<string, unknown>;
    abortController: AbortController;
  }): Promise<ActionTypeExecutorResult<unknown>> {
    const { connectorType, input, abortController } = params;
    if (!connectorType) {
      throw new Error('Connector type is required');
    }
    // The InMemoryConnector with prefixed "system-connector-" is created by the actions framework
    const actionId = `system-connector-${connectorType}`;

    return this.runConnector({ actionTypeId: connectorType, actionId, input, abortController });
  }

  // Execute a connector. It listens for the abort signal and rejects the promise if it is triggered.
  private async runConnector(params: {
    actionTypeId: string;
    actionId: string;
    input: Record<string, unknown>;
    abortController: AbortController;
  }): Promise<ActionTypeExecutorResult<unknown>> {
    const { actionTypeId, actionId, input, abortController } = params;
    const source = getWorkflowConnectorExecutionSource(actionTypeId, actionId);

    const executeActionPromise = this.actionsClient.execute({
      actionId,
      params: input,
      ...(source ? { source } : {}),
      signal: abortController.signal,
    });

    const abortPromise = new Promise<ActionTypeExecutorResult<unknown>>((_resolve, reject) => {
      abortController.signal.addEventListener(
        'abort',
        () => reject(this.createAbortError(actionTypeId, actionId)),
        { once: true }
      );
    });

    // If the abort signal is triggered, the abortPromise will reject first
    // Otherwise, the executeActionPromise will resolve first
    // This ensures that we handle cancellation properly.
    // In the future, if all connectors support cancellation, we can remove this logic.
    return Promise.race([abortPromise, executeActionPromise]);
  }

  private createAbortError(actionTypeId: string, actionId: string): Error {
    return new Error(`Action type "${actionTypeId}" with ID "${actionId}" execution was aborted`);
  }

  private async resolveConnectorId(connectorNameOrId: string): Promise<string> {
    if (this.allConnectorsCache) {
      const connector = this.allConnectorsCache.get(connectorNameOrId);
      if (connector) {
        return connector.id;
      }
    }

    // Prefer direct ID lookup: try to fetch by ID first, which is unambiguous
    try {
      const connector = await this.actionsClient.get({ id: connectorNameOrId });
      return connector.id;
    } catch {
      // Not found by ID -- fall through to name-based lookup
    }

    if (!this.allConnectorsCache) {
      const allConnectors = await this.actionsClient.getAll();
      this.allConnectorsCache = new Map(
        allConnectors.map((connector) => [connector.id, connector])
      );
    }
    const connectors = Array.from(this.allConnectorsCache.values()).filter(
      (c: ConnectorWithExtraFindData) => c.name === connectorNameOrId
    );

    if (connectors.length === 0) {
      throw new Error(`Connector ${connectorNameOrId} not found`);
    }
    // Do not throw if multiple connectors are found. We will use the first one.

    return connectors[0].id;
  }
}
