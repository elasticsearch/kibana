/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsBulkCreateObject, SavedObjectsClientContract } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';

import type { ExceptionListSoSchema } from '../../../../schemas/saved_objects/exceptions_list_so_schema';
import type { ImportResponse } from '../../import_exception_list_and_items';

/**
 * Helper to bulk create exception list parent
 * containers
 * @param listsToCreate {array} - exception lists to be bulk created
 * @param savedObjectsClient {object}
 * @returns {array} returns array of success and error formatted responses
 */
export const bulkCreateImportedLists = async ({
  listsToCreate,
  savedObjectsClient,
}: {
  listsToCreate: Array<SavedObjectsBulkCreateObject<ExceptionListSoSchema>>;
  savedObjectsClient: SavedObjectsClientContract;
}): Promise<ImportResponse[]> => {
  if (!listsToCreate.length) {
    return [];
  }
  const bulkCreateResponse = await savedObjectsClient.bulkCreate(listsToCreate, {
    overwrite: false,
  });

  return bulkCreateResponse.saved_objects.map((so) => {
    if (isSavedObjectErrorResult(so)) {
      return {
        error: {
          message: so.error.message,
          status_code: so.error.statusCode ?? 400,
        },
        list_id: '(unknown list_id)',
      };
    } else {
      return {
        id: so.id,
        status_code: 200,
      };
    }
  });
};
