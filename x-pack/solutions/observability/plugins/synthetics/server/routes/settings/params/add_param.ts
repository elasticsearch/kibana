/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { ALL_SPACES_ID } from '@kbn/security-plugin/common/constants';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { SavedObject, SavedObjectsBulkCreateObject } from '@kbn/core-saved-objects-api-server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import type { SyntheticsRestApiRouteFactory } from '../../types';
import type {
  SyntheticsParamRequest,
  SyntheticsParams,
  SyntheticsParamSOAttributes,
} from '../../../../common/runtime_types';
import { syntheticsParamType } from '../../../../common/types/saved_objects';
import { SYNTHETICS_API_URLS } from '../../../../common/constants';
import { asyncGlobalParamsPropagation } from '../../../tasks/sync_global_params_task';

const ParamsObjectSchema = schema.object({
  key: schema.string({
    minLength: 1,
  }),
  value: schema.string({
    minLength: 1,
  }),
  description: schema.maybe(schema.string()),
  tags: schema.maybe(schema.arrayOf(schema.string())),
  share_across_spaces: schema.maybe(schema.boolean()),
});

export const addSyntheticsParamsRoute: SyntheticsRestApiRouteFactory<
  SyntheticsParams | SyntheticsParams[]
> = () => ({
  method: 'POST',
  path: SYNTHETICS_API_URLS.PARAMS,
  validate: {},
  validation: {
    request: {
      body: schema.oneOf([ParamsObjectSchema, schema.arrayOf(ParamsObjectSchema)]),
    },
  },
  handler: async ({ request, response, server, savedObjectsClient }) => {
    try {
      const { id: spaceId } = (await server.spaces?.spacesService.getActiveSpace(request)) ?? {
        id: DEFAULT_SPACE_ID,
      };

      const savedObjectsData = parseParamBody(
        spaceId,
        request.body as SyntheticsParamRequest[] | SyntheticsParamRequest
      );

      const result = await savedObjectsClient.bulkCreate<Omit<SyntheticsParamSOAttributes, 'id'>>(
        savedObjectsData
      );

      const modifiedParamKeys = savedObjectsData.map((obj) => obj.attributes.key);

      await asyncGlobalParamsPropagation({
        server,
        paramsSpacesToSync: Array.from(
          new Set(
            savedObjectsData.reduce(
              (spacesToSync, obj) => spacesToSync.concat(obj.initialNamespaces || []),
              [] as string[]
            )
          )
        ),
        modifiedParamKeys,
      });

      if (savedObjectsData.length > 1) {
        return result.saved_objects
          .filter(
            (savedObject): savedObject is SavedObject<Omit<SyntheticsParamSOAttributes, 'id'>> =>
              !isSavedObjectErrorResult(savedObject)
          )
          .map((savedObject) => {
            return toClientResponse(savedObject);
          });
      } else {
        const [savedObject] = result.saved_objects;
        if (isSavedObjectErrorResult(savedObject)) {
          throw savedObject.error;
        }
        return toClientResponse(savedObject);
      }
    } catch (error) {
      if (error.output?.statusCode === 404) {
        const spaceId = server.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
        return response.notFound({
          body: { message: `Kibana space '${spaceId}' does not exist` },
        });
      }

      throw error;
    }
  },
});

const toClientResponse = (savedObject: SavedObject<Omit<SyntheticsParamSOAttributes, 'id'>>) => {
  const { id, attributes: data, namespaces } = savedObject;
  const { description, key, tags } = data;
  return {
    id,
    description,
    key,
    namespaces,
    tags,
    value: data.value,
  };
};

const parseParamBody = (
  spaceId: string,
  body: SyntheticsParamRequest[] | SyntheticsParamRequest
): Array<SavedObjectsBulkCreateObject<Omit<SyntheticsParamSOAttributes, 'id'>>> => {
  if (Array.isArray(body)) {
    const params = body as SyntheticsParamRequest[];
    return params.map((param) => {
      const { share_across_spaces: shareAcrossSpaces, ...data } = param;
      return {
        type: syntheticsParamType,
        attributes: data,
        initialNamespaces: shareAcrossSpaces ? [ALL_SPACES_ID] : [spaceId],
      };
    });
  }

  const { share_across_spaces: shareAcrossSpaces, ...data } = body;
  return [
    {
      type: syntheticsParamType,
      attributes: data,
      initialNamespaces: shareAcrossSpaces ? [ALL_SPACES_ID] : [spaceId],
    },
  ];
};
