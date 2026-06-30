/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { ACTION_TYPE_SOURCES } from '@kbn/actions-types';
import { i18n } from '@kbn/i18n';
import type { SavedObjectAttributes } from '@kbn/core/server';
import { isUndefined, omitBy } from 'lodash';
import type { Connector } from '../../types';
import type { ConnectorUpdateParams } from './types';
import { PreconfiguredActionDisabledModificationError } from '../../../../lib/errors/preconfigured_action_disabled_modification';
import { ConnectorAuditAction, connectorAuditEvent } from '../../../../lib/audit_events';
import { validateConfig, validateConnector, validateSecrets } from '../../../../lib';
import { ensureConfigAuthType } from '../../../../lib/ensure_config_auth_type';
import { inferAuthMode } from '../../../../lib/infer_auth_mode';
import { getAuthMode, isConnectorDeprecated } from '../../lib';
import type { RawAction, HookServices } from '../../../../types';
import { tryCatch } from '../../../../lib';

const getAuthTypeId = (
  secrets?: Record<string, unknown>,
  config?: Record<string, unknown>
): string | undefined =>
  (secrets as { authType?: string })?.authType ?? (config as { authType?: string })?.authType;

export async function update({ context, id, action }: ConnectorUpdateParams): Promise<Connector> {
  try {
    await context.authorization.ensureAuthorized({ operation: 'update' });

    const foundInMemoryConnector = context.inMemoryConnectors.find(
      (connector) => connector.id === id
    );

    if (foundInMemoryConnector?.isSystemAction) {
      throw Boom.badRequest(
        i18n.translate('xpack.actions.serverSideErrors.systemActionUpdateForbidden', {
          defaultMessage: 'System action {id} can not be updated.',
          values: {
            id,
          },
        })
      );
    }

    if (foundInMemoryConnector?.isPreconfigured) {
      throw new PreconfiguredActionDisabledModificationError(
        i18n.translate('xpack.actions.serverSideErrors.predefinedActionUpdateDisabled', {
          defaultMessage: 'Preconfigured action {id} can not be updated.',
          values: {
            id,
          },
        }),
        'update'
      );
    }
  } catch (error) {
    context.auditLogger?.log(
      connectorAuditEvent({
        action: ConnectorAuditAction.UPDATE,
        savedObject: { type: 'action', id },
        error,
      })
    );
    throw error;
  }
  const { attributes, references, version } =
    await context.unsecuredSavedObjectsClient.get<RawAction>('action', id);
  const { actionTypeId, authMode } = attributes;
  const { name, config, secrets } = action;

  const currentAuthMode = authMode ?? 'shared';
  const currentAuthTypeId = getAuthTypeId(attributes.secrets, attributes.config);
  const requestedAuthTypeId = getAuthTypeId(secrets, config);
  const requestedAuthMode = inferAuthMode({
    authTypeRegistry: context.authTypeRegistry,
    secrets,
    config,
  });

  if (currentAuthMode === 'per-user') {
    if (requestedAuthTypeId !== currentAuthTypeId) {
      throw Boom.badRequest(
        i18n.translate('xpack.actions.serverSideErrors.perUserConnectorAuthTypeChangeForbidden', {
          defaultMessage:
            'Authentication type cannot be changed for per-user connectors. Connector: {id}.',
          values: { id },
        })
      );
    }
  } else if (requestedAuthMode === 'per-user') {
    throw Boom.badRequest(
      i18n.translate('xpack.actions.serverSideErrors.sharedConnectorPerUserAuthTypeForbidden', {
        defaultMessage:
          'Authentication type cannot be changed to a per-user type for shared connectors. Connector: {id}.',
        values: { id },
      })
    );
  }

  const actionType = context.actionTypeRegistry.get(actionTypeId);
  const configurationUtilities = context.actionTypeRegistry.getUtils();
  const validatedActionTypeConfig = validateConfig(actionType, config, {
    configurationUtilities,
  });
  const validatedActionTypeSecrets = validateSecrets(actionType, secrets, {
    configurationUtilities,
  });
  if (actionType.validate?.connector) {
    validateConnector(actionType, { config, secrets });
  }

  context.actionTypeRegistry.ensureActionTypeEnabled(actionTypeId);

  const hookServices: HookServices = {
    scopedClusterClient: context.scopedClusterClient,
  };

  if (actionType.preSaveHook) {
    try {
      await actionType.preSaveHook({
        connectorId: id,
        config,
        secrets,
        logger: context.logger,
        request: context.request,
        services: hookServices,
        isUpdate: true,
      });
    } catch (error) {
      context.auditLogger?.log(
        connectorAuditEvent({
          action: ConnectorAuditAction.UPDATE,
          savedObject: { type: 'action', id },
          error,
        })
      );
      throw error;
    }
  }

  context.auditLogger?.log(
    connectorAuditEvent({
      action: ConnectorAuditAction.UPDATE,
      savedObject: { type: 'action', id },
      outcome: 'unknown',
    })
  );

  const configForSave =
    actionType.source === ACTION_TYPE_SOURCES.spec
      ? ensureConfigAuthType(
          validatedActionTypeConfig as Record<string, unknown>,
          validatedActionTypeSecrets as Record<string, unknown>
        )
      : validatedActionTypeConfig;

  const result = await tryCatch(
    async () =>
      await context.unsecuredSavedObjectsClient.create<RawAction>(
        'action',
        {
          ...attributes,
          actionTypeId,
          name,
          isMissingSecrets: false,
          config: configForSave as SavedObjectAttributes,
          secrets: validatedActionTypeSecrets as SavedObjectAttributes,
        },
        omitBy(
          {
            id,
            overwrite: true,
            references,
            version,
          },
          isUndefined
        )
      )
  );

  const wasSuccessful = !(result instanceof Error);
  const label = `connectorId: "${id}"; type: ${actionTypeId}`;
  const tags = ['post-save-hook', id];

  if (actionType.postSaveHook) {
    try {
      await actionType.postSaveHook({
        connectorId: id,
        config,
        secrets,
        logger: context.logger,
        request: context.request,
        services: hookServices,
        isUpdate: true,
        wasSuccessful,
      });
    } catch (err) {
      context.logger.error(`postSaveHook update error for ${label}: ${err.message}`, {
        tags,
      });
    }
  }

  if (!wasSuccessful) {
    throw result;
  }

  context.evictClientPool?.(id);

  try {
    await context.connectorTokenClient.deleteConnectorTokens({ connectorId: id, authMode });
  } catch (e) {
    context.logger.error(
      `Failed to delete auth tokens for connector "${id}" after update: ${e.message}`
    );
  }

  const resolvedAuthMode = getAuthMode(
    result.attributes.authMode as Connector['authMode'] | undefined
  );

  return {
    id,
    actionTypeId: result.attributes.actionTypeId as string,
    isMissingSecrets: result.attributes.isMissingSecrets as boolean,
    name: result.attributes.name as string,
    config: result.attributes.config as Record<string, unknown>,
    isPreconfigured: false,
    isSystemAction: false,
    isDeprecated: isConnectorDeprecated(result.attributes),
    isConnectorTypeDeprecated: context.actionTypeRegistry.isDeprecated(actionTypeId),
    authMode: resolvedAuthMode,
  };
}
