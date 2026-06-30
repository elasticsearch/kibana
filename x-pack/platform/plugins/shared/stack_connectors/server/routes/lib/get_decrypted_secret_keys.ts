/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type {
  IRouter,
  RequestHandlerContext,
  KibanaRequest,
  IKibanaResponse,
  KibanaResponseFactory,
  StartServicesAccessor,
} from '@kbn/core/server';
import { ACTION_SAVED_OBJECT_TYPE } from '@kbn/actions-plugin/server';
import { CONNECTOR_ID_MAX_LENGTH } from '@kbn/actions-plugin/common';
import { isBoom } from '@hapi/boom';

import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { EncryptedSavedObjectsPluginStart } from '@kbn/encrypted-saved-objects-plugin/server';
import type { SpacesPluginSetup } from '@kbn/spaces-plugin/server';
import { INTERNAL_BASE_STACK_CONNECTORS_API_PATH } from '../../../common';

export interface ConnectorsPluginsStart {
  encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
  actions: ActionsPluginStartContract;
  spaces: SpacesPluginSetup;
}

interface ConnectorSecretAttributes {
  secrets?: Record<string, unknown>;
  actionTypeId: string;
}

interface RegisterSecretKeysRouteParams {
  router: IRouter;
  getStartServices: StartServicesAccessor<ConnectorsPluginsStart, unknown>;
  path: string;
  allowedConnectorTypes: string[];
  secretField: string;
}

export const registerSecretKeysRoute = ({
  router,
  getStartServices,
  path,
  allowedConnectorTypes,
  secretField,
}: RegisterSecretKeysRouteParams) => {
  router.get(
    {
      path: `${INTERNAL_BASE_STACK_CONNECTORS_API_PATH}/{id}/${path}`,
      security: {
        authz: {
          enabled: false,
          reason:
            'This route is opted out from authorization because it relies on the authorization model inside the actions client.',
        },
      },
      validate: {
        params: schema.object({
          id: schema.string({ maxLength: CONNECTOR_ID_MAX_LENGTH }),
        }),
      },
      options: {
        access: 'internal',
      },
    },
    async (
      ctx: RequestHandlerContext,
      req: KibanaRequest<{ id: string }, unknown, unknown>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse> => {
      try {
        const { id } = req.params;

        const [, { encryptedSavedObjects, actions, spaces }] = await getStartServices();

        const actionsClient = await actions.getActionsClientWithRequest(req);
        const connector = await actionsClient.get({ id });
        const spaceId = spaces.spacesService.getSpaceId(req);

        if (!allowedConnectorTypes.includes(connector.actionTypeId)) {
          return res.badRequest({
            body: {
              message: `Connector must be one of the following types: ${allowedConnectorTypes.join(
                ', '
              )}`,
            },
          });
        }

        const encryptedClient = encryptedSavedObjects.getClient({
          includedHiddenTypes: [ACTION_SAVED_OBJECT_TYPE],
        });
        const decryptedConnector =
          await encryptedClient.getDecryptedAsInternalUser<ConnectorSecretAttributes>(
            ACTION_SAVED_OBJECT_TYPE,
            id,
            { namespace: spaceId }
          );
        const secretData = decryptedConnector.attributes.secrets?.[secretField] || {};

        return res.ok({ body: Object.keys(secretData) });
      } catch (error) {
        if (isBoom(error)) {
          return res.customError({
            statusCode: error.output.statusCode,
            body: { message: error.output.payload.message },
          });
        }

        return res.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );
};
