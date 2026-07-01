/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObject,
  SavedObjectsExportTransformContext,
  SavedObjectsServiceSetup,
  ISavedObjectsRepository,
} from '@kbn/core/server';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import { getOldestIdleActionTask } from '@kbn/task-manager-plugin/server';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import {
  actionMappings,
  actionTaskParamsMappings,
  connectorTokenMappings,
  oauthStateMappings,
  userConnectorTokenMappings,
} from './mappings';
import { getActionsMigrations } from './actions_migrations';
import { getActionTaskParamsMigrations } from './action_task_params_migrations';
import type { InMemoryConnector, RawAction } from '../types';
import {
  getImportWarnings,
  getPreconfiguredConflictWarnings,
  getInvalidConnectorIdWarnings,
  getConnectorsWithInvalidIds,
} from './get_import_warnings';
import { transformConnectorsForExport } from './transform_connectors_for_export';
import type { ActionTypeRegistry } from '../action_type_registry';
import {
  ACTION_SAVED_OBJECT_TYPE,
  ACTION_TASK_PARAMS_SAVED_OBJECT_TYPE,
  CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
  OAUTH_STATE_SAVED_OBJECT_TYPE,
  USER_CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
} from '../constants/saved_objects';
import {
  actionTaskParamsModelVersions,
  connectorTokenModelVersions,
  oauthStateModelVersions,
  userConnectorTokenModelVersions,
} from './model_versions';
import { connectorModelVersions } from './model_versions/connector_model_versions';
import { userConnectorTokenEncryptedRegistrationV2 } from './user_connector_token_encryption';

export function setupSavedObjects(
  savedObjects: SavedObjectsServiceSetup,
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup,
  actionTypeRegistry: ActionTypeRegistry,
  taskManagerIndex: string,
  inMemoryConnectors: InMemoryConnector[],
  getSoRepository: () =>
    | Promise<ISavedObjectsRepository | undefined>
    | ISavedObjectsRepository
    | undefined
) {
  savedObjects.registerType({
    name: ACTION_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'multiple-isolated',
    convertToMultiNamespaceTypeVersion: '8.0.0',
    mappings: actionMappings,
    migrations: getActionsMigrations(encryptedSavedObjects),
    management: {
      displayName: 'connector',
      defaultSearchField: 'name',
      importableAndExportable: true,
      getTitle(savedObject: SavedObject<RawAction>) {
        return `Connector: [${savedObject.attributes.name}]`;
      },
      onExport(
        context: SavedObjectsExportTransformContext,
        objects: Array<SavedObject<RawAction>>
      ) {
        return transformConnectorsForExport(objects, actionTypeRegistry);
      },
      async onImport(connectors) {
        const typedConnectors = connectors as Array<
          SavedObject<RawAction> & { destinationId?: string }
        >;

        const preconfiguredIds = new Set(
          inMemoryConnectors.filter((c) => c.isPreconfigured).map((c) => c.id)
        );

        const preconfiguredConflicts = typedConnectors.filter(
          (c) => preconfiguredIds.has(c.id) && !c.destinationId
        );
        const invalidIdConnectors = getConnectorsWithInvalidIds(typedConnectors);

        const toDelete = [
          ...preconfiguredConflicts,
          ...invalidIdConnectors.filter((c) => !preconfiguredConflicts.some((p) => p.id === c.id)),
        ];

        if (toDelete.length > 0) {
          // All connectors in a single import operation target the same space,
          // so using the namespace from the first connector applies correctly to
          // the entire batch. bulkDelete does not support per-object namespaces.
          const namespace = toDelete[0]?.namespaces?.[0];
          const repo = await getSoRepository();
          if (repo) {
            await repo.bulkDelete(
              toDelete.map((c) => ({ type: ACTION_SAVED_OBJECT_TYPE, id: c.id })),
              { namespace }
            );
          }
        }

        return {
          warnings: [
            ...getImportWarnings(typedConnectors),
            ...getPreconfiguredConflictWarnings(typedConnectors, inMemoryConnectors),
            ...getInvalidConnectorIdWarnings(typedConnectors),
          ],
        };
      },
    },
    modelVersions: connectorModelVersions,
  });

  // Encrypted attributes
  // - `secrets` properties will be encrypted
  // - `config` will be included in AAD
  // - everything else excluded from AAD
  encryptedSavedObjects.registerType({
    type: ACTION_SAVED_OBJECT_TYPE,
    attributesToEncrypt: new Set(['secrets']),
    attributesToIncludeInAAD: new Set(['actionTypeId', 'isMissingSecrets', 'config']),
    enforceRandomId: false,
  });

  savedObjects.registerType({
    name: ACTION_TASK_PARAMS_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'multiple-isolated',
    convertToMultiNamespaceTypeVersion: '8.0.0',
    mappings: actionTaskParamsMappings,
    migrations: getActionTaskParamsMigrations(encryptedSavedObjects, inMemoryConnectors),
    excludeOnUpgrade: async ({ readonlyEsClient }) => {
      const oldestIdleActionTask = await getOldestIdleActionTask(
        readonlyEsClient,
        taskManagerIndex
      );
      return {
        bool: {
          must: [
            { term: { type: 'action_task_params' } },
            { range: { updated_at: { lt: oldestIdleActionTask } } },
          ],
        },
      };
    },
    modelVersions: actionTaskParamsModelVersions,
  });
  encryptedSavedObjects.registerType({
    type: ACTION_TASK_PARAMS_SAVED_OBJECT_TYPE,
    attributesToEncrypt: new Set(['apiKey']),
    attributesToIncludeInAAD: new Set([
      'actionId',
      'consumer',
      'params',
      'executionId',
      'relatedSavedObjects',
      'source',
    ]),
  });

  savedObjects.registerType({
    name: CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'agnostic',
    mappings: connectorTokenMappings,
    management: {
      importableAndExportable: false,
    },
    modelVersions: connectorTokenModelVersions(encryptedSavedObjects),
  });

  encryptedSavedObjects.registerType({
    type: CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
    attributesToEncrypt: new Set(['token', 'refreshToken']),
    attributesToIncludeInAAD: new Set([
      'connectorId',
      'tokenType',
      'expiresAt',
      'createdAt',
      'updatedAt',
      'refreshTokenExpiresAt',
    ]),
  });

  savedObjects.registerType({
    name: USER_CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'agnostic',
    mappings: userConnectorTokenMappings,
    management: {
      importableAndExportable: false,
    },
    modelVersions: userConnectorTokenModelVersions(encryptedSavedObjects),
  });

  encryptedSavedObjects.registerType(userConnectorTokenEncryptedRegistrationV2);

  savedObjects.registerType({
    name: OAUTH_STATE_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'agnostic',
    mappings: oauthStateMappings,
    management: {
      importableAndExportable: false,
    },
    modelVersions: oauthStateModelVersions,
    excludeOnUpgrade: async () => {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      return {
        bool: {
          must: [{ term: { type: 'oauth_state' } }, { range: { expiresAt: { lt: oneHourAgo } } }],
        },
      };
    },
  });

  encryptedSavedObjects.registerType({
    type: OAUTH_STATE_SAVED_OBJECT_TYPE,
    attributesToEncrypt: new Set(['codeVerifier']),
    attributesToIncludeInAAD: new Set([
      'state',
      'connectorId',
      'spaceId',
      'expiresAt',
      'createdBy',
    ]),
  });
}
