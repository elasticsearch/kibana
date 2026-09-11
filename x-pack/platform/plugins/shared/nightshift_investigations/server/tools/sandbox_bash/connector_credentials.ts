/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import type { SandboxCallContext } from './tool_utils';

/** Env var prefix under which connector material is exposed to a single sandbox command. */
export const CONNECTOR_ENV_PREFIX = 'CONNECTOR_';

/** Minimum length for a secret value to be redacted from command output. */
const MIN_REDACTABLE_SECRET_LENGTH = 6;

export interface ConnectorCredentialEnv {
  /** Environment variables to inject into the command. */
  env: Record<string, string>;
  /** Secret values that must be redacted from command output before it leaves Kibana. */
  secretValues: string[];
}

export type ConnectorCredentialResolution = ConnectorCredentialEnv | { errorMessage: string };

export interface ConnectorCredentialDeps {
  actions?: ActionsPluginStart;
}

export type ResolveConnectorCredentials = (
  connectorId: string,
  callContext: SandboxCallContext
) => Promise<ConnectorCredentialResolution>;

const toEnvKey = (segment: string): string =>
  segment
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const toEnvValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

/**
 * Builds the CONNECTOR_* environment for a connector. Config keys map to CONNECTOR_CONFIG_<KEY>,
 * secret keys to CONNECTOR_SECRET_<KEY>; nested values are JSON-encoded.
 */
export const buildConnectorEnv = ({
  connectorId,
  actionTypeId,
  config,
  secrets,
}: {
  connectorId: string;
  actionTypeId: string;
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
}): ConnectorCredentialEnv => {
  const env: Record<string, string> = {
    [`${CONNECTOR_ENV_PREFIX}ID`]: connectorId,
    [`${CONNECTOR_ENV_PREFIX}TYPE`]: actionTypeId,
  };
  const secretValues: string[] = [];

  for (const [key, value] of Object.entries(config)) {
    const envValue = toEnvValue(value);
    if (envValue !== undefined) env[`${CONNECTOR_ENV_PREFIX}CONFIG_${toEnvKey(key)}`] = envValue;
  }
  for (const [key, value] of Object.entries(secrets)) {
    const envValue = toEnvValue(value);
    if (envValue === undefined) continue;
    env[`${CONNECTOR_ENV_PREFIX}SECRET_${toEnvKey(key)}`] = envValue;
    if (envValue.length >= MIN_REDACTABLE_SECRET_LENGTH) secretValues.push(envValue);
  }

  return { env, secretValues };
};

/** Replaces every occurrence of an injected secret value in command output. */
export const redactSecrets = (text: string, secretValues: readonly string[]): string =>
  secretValues.reduce((acc, secret) => acc.split(secret).join('[REDACTED]'), text);

/**
 * Creates the resolver that turns a connector id into a one-command credential environment.
 * Deny by default: the connector must be on the agent allow-list and the current user must be
 * allowed to read and execute it in the current space. Only preconfigured (kibana.yml)
 * connectors are supported: their secrets are held in memory by the actions plugin.
 */
export const createConnectorCredentialResolver =
  ({
    getDeps,
    logger,
  }: {
    getDeps: () => ConnectorCredentialDeps;
    logger: Logger;
  }): ResolveConnectorCredentials =>
  async (connectorId, callContext) => {
    const { actions } = getDeps();

    if (!actions) {
      return { errorMessage: 'Connectors are not available in this deployment' };
    }

    if (!callContext.allowedConnectorIds.includes(connectorId)) {
      return {
        errorMessage:
          `Connector '${connectorId}' is not assigned to this agent. ` +
          `Assigned connectors: ${callContext.allowedConnectorIds.join(', ') || 'none'}. ` +
          `Check /workspace/connectors.md.`,
      };
    }

    const { request } = callContext;

    let connector: Awaited<
      ReturnType<Awaited<ReturnType<ActionsPluginStart['getActionsClientWithRequest']>>['get']>
    >;
    try {
      const actionsClient = await actions.getActionsClientWithRequest(request);
      connector = await actionsClient.get({ id: connectorId });
    } catch (err) {
      return { errorMessage: `Failed to resolve connector '${connectorId}': ${err}` };
    }

    if (connector.isSystemAction) {
      return {
        errorMessage: `Connector '${connectorId}' is a system connector and cannot be used`,
      };
    }

    try {
      await actions.getActionsAuthorizationWithRequest(request).ensureAuthorized({
        operation: 'execute',
        actionTypeId: connector.actionTypeId,
      });
    } catch (err) {
      return { errorMessage: `Not authorized to use connector '${connectorId}': ${err}` };
    }

    const inMemoryConnector = actions.inMemoryConnectors.find(({ id }) => id === connectorId);
    if (!inMemoryConnector) {
      return {
        errorMessage:
          `Connector '${connectorId}' is not a preconfigured connector. Only connectors defined ` +
          `in kibana.yml (xpack.actions.preconfigured) can be used from the sandbox.`,
      };
    }

    logger.debug(
      `Injecting credentials for connector ${connectorId} into a single sandbox command`
    );

    // Config comes from the in-memory connector, not from `get()`: the actions client omits
    // config for preconfigured connectors unless they opt in with `exposeConfig`, which would
    // also publish it over the HTTP API. Authorization above already gated this read.
    return buildConnectorEnv({
      connectorId,
      actionTypeId: connector.actionTypeId,
      config: inMemoryConnector.config ?? connector.config ?? {},
      secrets: inMemoryConnector.secrets ?? {},
    });
  };
